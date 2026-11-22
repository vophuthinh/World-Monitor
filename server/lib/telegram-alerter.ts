import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { HptCompanyIntelSnapshot } from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';

interface PersistedTelegramState {
  sentCount: number;
  lastSentAt?: number;
  lastError?: string;
  seenIds: string[];
}

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
    seenIds: [],
  };
  private initializedBaseline = false;
  private evaluating = false;

  constructor(cacheDir: string, credentialsOverride?: TelegramCredentialsOverride) {
    this.filePath = resolve(cacheDir, 'telegram-alerts.json');
    this.credentialsOverride = credentialsOverride;
    this.loadFromDisk();
    // A persisted seen list means we already know what was announced: items published while the
    // server was down must alert. Only a first-ever run needs the silent baseline.
    this.initializedBaseline = this.state.seenIds.length > 0;
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedTelegramState>;
      this.state = {
        sentCount: typeof parsed.sentCount === 'number' ? parsed.sentCount : 0,
        ...(typeof parsed.lastSentAt === 'number' ? { lastSentAt: parsed.lastSentAt } : {}),
        ...(typeof parsed.lastError === 'string' ? { lastError: parsed.lastError } : {}),
        seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds.slice(-300) : [],
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

  async sendMessageHtml(htmlText: string): Promise<boolean> {
    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) {
      return false;
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
      const json = (await resp.json()) as { ok?: boolean; description?: string };
      if (!resp.ok || !json.ok) {
        this.state.lastError = json.description || `HTTP ${resp.status}`;
        this.saveToDisk();
        return false;
      }

      this.state.sentCount += 1;
      this.state.lastSentAt = now;
      this.state.lastError = undefined;
      this.saveToDisk();
      return true;
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : 'Lỗi kết nối Telegram API';
      this.saveToDisk();
      return false;
    }
  }

  async evaluateCollectorUpdate(collectorId: string, store: SnapshotStore): Promise<void> {
    if (collectorId !== 'hpt-intel') return;
    // Passes can overlap (manual refresh while a send is in flight); a second pass would
    // re-send items that the first one has not marked as seen yet.
    if (this.evaluating) return;
    this.evaluating = true;
    try {
      await this.evaluateHptUpdate(store);
    } finally {
      this.evaluating = false;
    }
  }

  private async evaluateHptUpdate(store: SnapshotStore): Promise<void> {

    const now = Date.now();
    const hpt = store.get<HptCompanyIntelSnapshot>('hpt-intel', now);
    if (!hpt) return;

    // Seed baseline IDs on first HPT collector pass so server boot never re-sends existing items
    if (!this.initializedBaseline) {
      for (const it of hpt.items) {
        this.markSeen(`hpt:${it.id}`);
      }
      this.initializedBaseline = true;
      this.saveToDisk();
      return;
    }

    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) return;

    const refNow = hpt.updatedAt || now;
    const maxAlertAgeMs = 72 * 3_600_000;
    const unseen: typeof hpt.items = [];

    for (const it of hpt.items) {
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
      const isNegative = item.sentiment === 'negative';
      const header = isNegative
        ? `🚨 <b>[CẢNH BÁO ĐỎ] TÍN HIỆU TIÊU CỰC VỀ HPT (${escapeHtml(item.badge)})</b>`
        : `🏢 <b>BÀI MỚI VỀ HPT (${escapeHtml(item.badge)})</b>`;
      const lines = [
        header,
        escapeHtml(item.title),
        item.aiSummary ? `🤖 <i>${escapeHtml(item.aiSummary)}</i>` : '',
        `Nguồn: <b>${escapeHtml(item.source)}</b> · <a href="${escapeHtml(item.url)}">Xem bài gốc</a>`,
      ].filter(Boolean);

      const delivered = await this.sendMessageHtml(lines.join('\n'));
      if (delivered) {
        this.markSeen(`hpt:${item.id}`);
        this.saveToDisk();
      }
    }
  }
}
