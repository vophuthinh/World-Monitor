import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { HptCompanyIntelSnapshot } from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';

interface PersistedTelegramState {
  sentCount: number;
  baselineDone: boolean;
  lastSentAt?: number;
  lastError?: string;
  seenIds: string[];
}

type TelegramDeliveryResult = 'sent' | 'permanent_failure' | 'retryable_failure';

export interface TelegramCredentialsOverride {
  botToken?: string;
  chatId?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Headless 24/7 Telegram Alert Engine — reads credentials strictly from `.env`
 * (`TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`) and alerts exclusively on fresh,
 * non-recruitment HPT articles and forum discussions.
 */
export class TelegramAlertEngine {
  private readonly filePath: string;
  private readonly credentialsOverride?: TelegramCredentialsOverride;
  private state: PersistedTelegramState = {
    sentCount: 0,
    baselineDone: false,
    seenIds: [],
  };
  private evaluating = false;
  private pendingStore?: SnapshotStore;

  constructor(cacheDir: string, credentialsOverride?: TelegramCredentialsOverride) {
    this.filePath = resolve(cacheDir, 'telegram-alerts.json');
    this.credentialsOverride = credentialsOverride;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedTelegramState>;
      const seenIds = Array.isArray(parsed.seenIds) ? parsed.seenIds.slice(-300) : [];
      this.state = {
        sentCount: typeof parsed.sentCount === 'number' ? parsed.sentCount : 0,
        baselineDone:
          typeof parsed.baselineDone === 'boolean' ? parsed.baselineDone : seenIds.length > 0,
        ...(typeof parsed.lastSentAt === 'number' ? { lastSentAt: parsed.lastSentAt } : {}),
        ...(typeof parsed.lastError === 'string' ? { lastError: parsed.lastError } : {}),
        seenIds,
      };
    } catch {
      // Ignore corrupt cache file
    }
  }

  private saveToDisk(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Non-fatal
    }
  }

  private resolveCredentials(): { botToken?: string; chatId?: string } {
    const botToken = (this.credentialsOverride?.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const chatId = (this.credentialsOverride?.chatId ?? process.env.TELEGRAM_CHAT_ID ?? '').trim();
    return {
      ...(botToken ? { botToken } : {}),
      ...(chatId ? { chatId } : {}),
    };
  }

  private markSeen(id: string): boolean {
    if (this.state.seenIds.includes(id)) return false;
    this.state.seenIds.push(id);
    if (this.state.seenIds.length > 300) {
      this.state.seenIds = this.state.seenIds.slice(-300);
    }
    return true;
  }

  async sendMessageHtml(htmlText: string): Promise<TelegramDeliveryResult> {
    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) {
      return 'retryable_failure';
    }

    const now = Date.now();
    try {
      const resp = await fetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: creds.chatId,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await resp.json()) as { ok?: boolean; description?: string; error_code?: number };
      if (!resp.ok || !json.ok) {
        this.state.lastError = json.description || `HTTP ${resp.status}`;
        this.saveToDisk();
        const status = json.error_code ?? resp.status;
        return status >= 400 && status < 500 && status !== 429
          ? 'permanent_failure'
          : 'retryable_failure';
      }

      this.state.sentCount += 1;
      this.state.lastSentAt = now;
      this.state.lastError = undefined;
      this.saveToDisk();
      return 'sent';
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : 'Lỗi kết nối Telegram API';
      this.saveToDisk();
      return 'retryable_failure';
    }
  }

  async evaluateCollectorUpdate(collectorId: string, store: SnapshotStore): Promise<void> {
    if (collectorId !== 'hpt-intel') return;
    if (this.evaluating) {
      this.pendingStore = store;
      return;
    }

    this.evaluating = true;
    try {
      let nextStore: SnapshotStore | undefined = store;
      while (nextStore) {
        this.pendingStore = undefined;
        try {
          await this.evaluateHptUpdate(nextStore);
        } catch (err) {
          console.error('[telegram] HPT alert evaluation failed:', err);
        }
        nextStore = this.pendingStore;
      }
    } finally {
      this.pendingStore = undefined;
      this.evaluating = false;
    }
  }

  private async evaluateHptUpdate(store: SnapshotStore): Promise<void> {

    const now = Date.now();
    const hpt = store.get<HptCompanyIntelSnapshot>('hpt-intel', now);
    if (!hpt) return;

    // Seed baseline IDs on first HPT collector pass so server boot never re-sends existing items
    if (!this.state.baselineDone) {
      for (const it of hpt.items ?? []) {
        if (typeof it.id === 'string' && it.id !== '') {
          this.markSeen(`hpt:${it.id}`);
        }
      }
      this.state.baselineDone = true;
      this.saveToDisk();
      return;
    }

    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) return;

    const refNow = hpt.updatedAt || now;
    const maxAlertAgeMs = 72 * 3_600_000;
    const unseen: typeof hpt.items = [];

    for (const it of hpt.items ?? []) {
      if (
        typeof it.id !== 'string' ||
        it.id.trim() === '' ||
        typeof it.title !== 'string' ||
        it.title.trim() === '' ||
        typeof it.badge !== 'string' ||
        it.badge.trim() === '' ||
        typeof it.source !== 'string' ||
        it.source.trim() === '' ||
        !Number.isFinite(it.publishedAt) ||
        (it.aiSummary !== undefined && typeof it.aiSummary !== 'string')
      ) {
        console.warn('[telegram] skipping malformed HPT alert item');
        continue;
      }
      if (this.state.seenIds.includes(`hpt:${it.id}`)) continue;
      if (refNow - it.publishedAt > maxAlertAgeMs) {
        this.markSeen(`hpt:${it.id}`);
        continue;
      }
      unseen.push(it);
    }

    if (unseen.length === 0) {
      this.saveToDisk();
      return;
    }

    for (const item of unseen.slice(0, 4)) {
      const url = safeHttpUrl(item.url);
      const isNegative = item.sentiment === 'negative';
      const header = isNegative
        ? `🚨 <b>[CẢNH BÁO ĐỎ] TÍN HIỆU TIÊU CỰC VỀ HPT (${escapeHtml(item.badge)})</b>`
        : `🏢 <b>BÀI MỚI VỀ HPT (${escapeHtml(item.badge)})</b>`;
      const lines = [
        header,
        escapeHtml(item.title),
        item.aiSummary ? `🤖 <i>${escapeHtml(item.aiSummary)}</i>` : '',
        url
          ? `Nguồn: <b>${escapeHtml(item.source)}</b> · <a href="${escapeHtml(url)}">Xem bài gốc</a>`
          : `Nguồn: <b>${escapeHtml(item.source)}</b>`,
      ].filter(Boolean);

      const delivered = await this.sendMessageHtml(lines.join('\n'));
      if (delivered === 'sent' || delivered === 'permanent_failure') {
        this.markSeen(`hpt:${item.id}`);
        this.saveToDisk();
      }
    }
  }
}
