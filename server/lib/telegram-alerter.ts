import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '@shared/macro-health';
import type {
  BreakingAlertItem,
  HptCompanyIntelSnapshot,
  MacroCountryIndicator,
  MarketSnapshot,
  PolicyLegalSnapshot,
  PredictionItem,
  TelegramAlertConfigSummary,
  TelegramAlertPreferences,
  VietnamEnvSnapshot,
} from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';

interface PersistedTelegramRuntime {
  botToken?: string;
  chatId?: string;
  enabled: boolean;
  preferences: TelegramAlertPreferences;
  sentCount: number;
  lastSentAt?: number;
  lastError?: string;
  lastStance?: string;
  lastDualConfirmation?: string;
  lastCapitulation?: boolean;
  seenIds: string[];
}

// Per user instruction: exclusively alert on HPT articles/mentions by default (zero non-HPT noise)
const DEFAULT_PREFS: TelegramAlertPreferences = {
  macroCompass: false,
  hptIntel: true,
  policyLegal: false,
  eastSeaWeather: false,
};

function maskToken(token?: string): string | undefined {
  if (!token || token.length < 10) return undefined;
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramAlertEngine {
  private readonly filePath: string;
  private state: PersistedTelegramRuntime = {
    enabled: true,
    preferences: { ...DEFAULT_PREFS },
    sentCount: 0,
    seenIds: [],
  };
  private initializedBaseline = false;
  private lastSendMs = 0;

  constructor(cacheDir: string) {
    this.filePath = resolve(cacheDir, 'telegram-alerts.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedTelegramRuntime>;
      this.state = {
        ...this.state,
        ...parsed,
        preferences: {
          ...DEFAULT_PREFS,
          ...(parsed.preferences ?? {}),
        },
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

  private resolveCredentials(): {
    botToken?: string;
    chatId?: string;
    source: 'env' | 'runtime' | 'none';
  } {
    const runtimeToken = this.state.botToken?.trim();
    const runtimeChat = this.state.chatId?.trim();
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const envChat = process.env.TELEGRAM_CHAT_ID?.trim();

    if (runtimeToken && runtimeChat) {
      return { botToken: runtimeToken, chatId: runtimeChat, source: 'runtime' };
    }
    if (envToken && envChat) {
      return { botToken: envToken, chatId: envChat, source: 'env' };
    }
    if (runtimeToken || envToken) {
      return {
        botToken: runtimeToken || envToken,
        chatId: runtimeChat || envChat,
        source: runtimeToken ? 'runtime' : 'env',
      };
    }
    return { source: 'none' };
  }

  getSummary(): TelegramAlertConfigSummary {
    const creds = this.resolveCredentials();
    const configured = Boolean(creds.botToken && creds.chatId);
    return {
      configured,
      enabled: this.state.enabled,
      source: creds.source,
      ...(creds.botToken ? { maskedToken: maskToken(creds.botToken) } : {}),
      ...(creds.chatId ? { chatId: creds.chatId } : {}),
      preferences: { ...this.state.preferences },
      sentCount: this.state.sentCount,
      ...(this.state.lastSentAt ? { lastSentAt: this.state.lastSentAt } : {}),
      ...(this.state.lastError ? { lastError: this.state.lastError } : {}),
    };
  }

  updateConfig(input: {
    botToken?: string;
    chatId?: string;
    enabled?: boolean;
    preferences?: Partial<TelegramAlertPreferences>;
  }): TelegramAlertConfigSummary {
    if (input.botToken !== undefined) {
      const trimmed = input.botToken.trim();
      if (trimmed) this.state.botToken = trimmed;
    }
    if (input.chatId !== undefined) {
      const trimmed = input.chatId.trim();
      if (trimmed) this.state.chatId = trimmed;
    }
    if (typeof input.enabled === 'boolean') {
      this.state.enabled = input.enabled;
    }
    if (input.preferences) {
      this.state.preferences = {
        ...this.state.preferences,
        ...input.preferences,
      };
    }
    this.state.lastError = undefined;
    this.saveToDisk();
    return this.getSummary();
  }

  /**
   * Auto-detects the latest Chat ID after the user sends `/start` or any message to their Telegram Bot
   */
  async detectChatIdFromBot(overrideToken?: string): Promise<{ chatId: string; chatTitle: string }> {
    const token = overrideToken?.trim() || this.resolveCredentials().botToken;
    if (!token) {
      throw new Error('Vui lòng nhập Bot Token từ @BotFather trước khi dò Chat ID');
    }

    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`, {
      signal: AbortSignal.timeout(7_500),
    });
    const json = (await resp.json()) as {
      ok?: boolean;
      description?: string;
      result?: Array<{
        message?: { chat?: { id?: number | string; title?: string; username?: string; first_name?: string } };
        channel_post?: { chat?: { id?: number | string; title?: string; username?: string; first_name?: string } };
      }>;
    };

    if (!resp.ok || !json.ok) {
      throw new Error(json.description || `Telegram API trả về HTTP ${resp.status}`);
    }

    const updates = [...(json.result ?? [])].reverse();
    for (const u of updates) {
      const chat = u.message?.chat ?? u.channel_post?.chat;
      if (chat?.id !== undefined) {
        const chatId = String(chat.id);
        const chatTitle = chat.title || chat.username || chat.first_name || chatId;
        if (overrideToken?.trim()) this.state.botToken = overrideToken.trim();
        this.state.chatId = chatId;
        this.saveToDisk();
        return { chatId, chatTitle };
      }
    }

    throw new Error('Chưa thấy tin nhắn nào. Hãy mở Telegram nhắn "/start" vào Bot của bạn rồi bấm Dò lại!');
  }

  async sendMessageHtml(htmlText: string, bypassThrottle = false): Promise<boolean> {
    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) {
      return false;
    }
    if (!bypassThrottle && !this.state.enabled) {
      return false;
    }

    const now = Date.now();
    if (!bypassThrottle && now - this.lastSendMs < 15_000) {
      return false;
    }

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
        if (bypassThrottle) throw new Error(this.state.lastError);
        return false;
      }

      this.lastSendMs = now;
      this.state.sentCount += 1;
      this.state.lastSentAt = now;
      this.state.lastError = undefined;
      this.saveToDisk();
      return true;
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : 'Lỗi kết nối Telegram API';
      this.saveToDisk();
      if (bypassThrottle) throw err;
      return false;
    }
  }

  async sendLiveTestBriefing(store: SnapshotStore): Promise<TelegramAlertConfigSummary> {
    const creds = this.resolveCredentials();
    if (!creds.botToken || !creds.chatId) {
      throw new Error('Chưa cấu hình Bot Token và Chat ID cho Telegram');
    }

    const now = Date.now();
    const markets = store.get<MarketSnapshot>('markets-crypto', now);
    const macro = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? markets?.macro ?? [];
    const predictions = store.get<PredictionItem[]>('polymarket', now) ?? [];
    const hpt = store.get<HptCompanyIntelSnapshot>('hpt-intel', now);
    const prefs = this.state.preferences;
    const isHptExclusive =
      prefs.hptIntel && !prefs.macroCompass && !prefs.policyLegal && !prefs.eastSeaWeather;

    if (isHptExclusive) {
      const lines: string[] = [
        '🏢 <b>HPT MEDIA &amp; INTEL MONITOR · TRỰC CHIẾN 24/7</b>',
        '• <b>Chế độ lọc:</b> Chỉ báo khi có bài viết / thảo luận mới về HPT (đã loại bỏ hoàn toàn tin tuyển dụng &amp; tin ngoài lề)',
      ];
      if (hpt?.stock) {
        lines.push(
          `• <b>Cổ phiếu HPT (UPCoM):</b> ${(hpt.stock.priceThousandVnd * 1000).toLocaleString('en-US')}₫ (${
            hpt.stock.changePercent >= 0 ? '+' : ''
          }${hpt.stock.changePercent.toFixed(2)}%)`,
        );
      }
      if (hpt?.items && hpt.items.length > 0) {
        const latest = hpt.items[0];
        lines.push(
          `• <b>Bài gần nhất (${escapeHtml(latest.badge)}):</b> ${escapeHtml(latest.title)} (<a href="${escapeHtml(latest.url)}">${escapeHtml(latest.source)}</a>)`,
        );
      }
      lines.push('✅ <i>Bot Telegram đang canh 24/7 cho riêng từ khóa HPT!</i>');
      await this.sendMessageHtml(lines.join('\n'), true);
      return this.getSummary();
    }

    const lines: string[] = [
      '🛰️ <b>WORLD MONITOR · BẢN TIN KIỂM TRA 24/7</b>',
    ];

    if (markets) {
      const full = { ...markets, macro };
      const health = evaluateMacroHealth(full, predictions);
      const compass = evaluateInvestmentCompass(full, predictions);
      const vni = markets.quotes.find((q) => q.symbol === 'VN-Index');
      const fx = markets.quotes.find((q) => q.symbol === 'USD/VND');
      const sjc = markets.vnGold?.find((g) => g.code === 'SJC');

      if (health.vn) {
        lines.push(
          `🇻🇳 <b>Vĩ mô VN:</b> ${health.vn.compositeScore}/100 · ${escapeHtml(health.vn.regimeLabel)}`,
        );
      }
      if (compass) {
        const allocStr = compass.allocations.map((a) => `${a.label.split(' ')[0]} ${a.weightPct}%`).join(' | ');
        lines.push(
          `🧭 <b>La bàn Đầu tư:</b> ${compass.riskAppetiteScore}/100 · ${escapeHtml(compass.stanceLabel)}`,
          `📊 <b>Phân bổ:</b> ${escapeHtml(allocStr)}`,
        );
      }
      lines.push(
        `💹 <b>Thị trường:</b> VN-Index ${vni ? vni.price.toFixed(1) : '—'}${
          vni?.peRatio ? ` (P/E ${vni.peRatio}x)` : ''
        } · USD/VND ${fx ? fx.price.toLocaleString('en-US') : '—'}₫${
          sjc ? ` · SJC ${sjc.sellPerLuongMillionVnd.toFixed(1)}tr` : ''
        }`,
      );
    }

    if (hpt?.stock) {
      lines.push(
        `🏢 <b>HPT (UPCoM):</b> ${(hpt.stock.priceThousandVnd * 1000).toLocaleString('en-US')}₫ (${
          hpt.stock.changePercent >= 0 ? '+' : ''
        }${hpt.stock.changePercent.toFixed(2)}%)`,
      );
    }

    lines.push('✅ <i>Kết nối cảnh báo tự động 24/7 hoạt động ổn định!</i>');
    await this.sendMessageHtml(lines.join('\n'), true);
    return this.getSummary();
  }

  private markSeen(id: string): boolean {
    if (this.state.seenIds.includes(id)) return false;
    this.state.seenIds.push(id);
    if (this.state.seenIds.length > 300) {
      this.state.seenIds = this.state.seenIds.slice(-300);
    }
    return true;
  }

  /**
   * Evaluates newly refreshed collector snapshots and fires high-signal, zero-spam alerts
   */
  async evaluateCollectorUpdate(collectorId: string, store: SnapshotStore): Promise<void> {
    const creds = this.resolveCredentials();
    const now = Date.now();
    const markets = store.get<MarketSnapshot>('markets-crypto', now);
    const macro = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? markets?.macro ?? [];
    const predictions = store.get<PredictionItem[]>('polymarket', now) ?? [];
    const hpt = store.get<HptCompanyIntelSnapshot>('hpt-intel', now);
    const policy = store.get<PolicyLegalSnapshot>('policy-legal', now);
    const vnEnv = store.get<VietnamEnvSnapshot>('vietnam-env', now);

    // Seed initial baseline IDs on first collector pass so server boot never floods old items
    if (!this.initializedBaseline) {
      if (markets) {
        const c = evaluateInvestmentCompass({ ...markets, macro }, predictions);
        if (c) {
          this.state.lastStance = c.stance;
          this.state.lastDualConfirmation = c.dualConfirmation;
          this.state.lastCapitulation = Boolean(c.capitulationSignal);
        }
      }
      for (const it of hpt?.items ?? []) this.markSeen(`hpt:${it.id}`);
      for (const doc of policy?.items ?? []) this.markSeen(`pol:${doc.id}`);
      for (const al of vnEnv?.alerts ?? []) this.markSeen(`env:${al.id}`);
      this.initializedBaseline = true;
      this.saveToDisk();
      return;
    }

    if (!creds.botToken || !creds.chatId || !this.state.enabled) return;

    // 1. Macro & Investment Compass Regime Shift
    if (
      (collectorId === 'markets-crypto' || collectorId === 'macro-worldbank' || collectorId === 'polymarket') &&
      this.state.preferences.macroCompass &&
      markets
    ) {
      const compass = evaluateInvestmentCompass({ ...markets, macro }, predictions);
      if (compass) {
        const stanceChanged = this.state.lastStance && this.state.lastStance !== compass.stance;
        const dualChanged =
          this.state.lastDualConfirmation &&
          this.state.lastDualConfirmation !== compass.dualConfirmation;
        const capTriggered = !this.state.lastCapitulation && Boolean(compass.capitulationSignal);

        this.state.lastStance = compass.stance;
        this.state.lastDualConfirmation = compass.dualConfirmation;
        this.state.lastCapitulation = Boolean(compass.capitulationSignal);
        this.saveToDisk();

        if (stanceChanged || dualChanged || capTriggered) {
          const msg = [
            '🧭 <b>CẢNH BÁO ĐỔI PHA LA BÀN ĐẦU TƯ</b>',
            `• <b>Trạng thái mới:</b> ${escapeHtml(compass.stanceLabel)} (${compass.riskAppetiteScore}/100)`,
            compass.dualConfirmationLabel
              ? `• <b>Xu hướng MA200:</b> ${escapeHtml(compass.dualConfirmationLabel)}`
              : '',
            compass.capitulationLabel
              ? `• <b>Tín hiệu đáy:</b> ${escapeHtml(compass.capitulationLabel)}`
              : '',
            `• <b>Nhận định:</b> ${escapeHtml(compass.summary)}`,
          ]
            .filter(Boolean)
            .join('\n');
          await this.sendMessageHtml(msg);
          return;
        }
      }
    }

    // 2. HPT Brand, Media, Forum, Social, Bidding & Disclosure Monitor (All fresh non-recruitment HPT articles + RED negative flag)
    if (collectorId === 'hpt-intel' && this.state.preferences.hptIntel && hpt) {
      const refNow = hpt.updatedAt || now;
      const maxAlertAgeMs = 72 * 3_600_000;
      const unseen: typeof hpt.items = [];
      for (const it of hpt.items) {
        if (this.state.seenIds.includes(`hpt:${it.id}`)) continue;
        // Silently mark archival (>72h old) articles as seen so newly added feeds never backfill old posts
        if (refNow - it.publishedAt > maxAlertAgeMs) {
          this.markSeen(`hpt:${it.id}`);
          continue;
        }
        unseen.push(it);
      }
      if (unseen.length === 0) {
        this.saveToDisk();
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

        const delivered = await this.sendMessageHtml(lines.join('\n'), true);
        if (delivered) {
          this.markSeen(`hpt:${item.id}`);
          this.saveToDisk();
        }
      }
      if (unseen.length > 0) return;
    }

    // 3. Vietnam Policy Radar (Bộ tứ NQ / Bộ KH&CN)
    if (collectorId === 'policy-legal' && this.state.preferences.policyLegal && policy) {
      for (const doc of policy.items.slice(0, 6)) {
        const isCore = Boolean(doc.pillarResolution || doc.isMost);
        if (this.markSeen(`pol:${doc.id}`) && isCore) {
          this.saveToDisk();
          await this.sendMessageHtml(
            [
              `📜 <b>VĂN BẢN CHÍNH SÁCH MỚI (${escapeHtml(doc.typeBadge)})</b>`,
              escapeHtml(doc.title),
              `Cơ quan/Nguồn: ${escapeHtml(doc.source)} · <a href="${escapeHtml(doc.url)}">Toàn văn</a>`,
            ].join('\n'),
          );
          return;
        }
      }
    }

    // 4. Vietnam Storm / Flood NCHMF Critical Alert
    if (collectorId === 'vietnam-env' && this.state.preferences.eastSeaWeather && vnEnv?.alerts) {
      for (const al of vnEnv.alerts.slice(0, 4)) {
        if (this.markSeen(`env:${al.id}`) && al.severity === 'critical') {
          this.saveToDisk();
          await this.sendMessageHtml(
            [
              `⛈️ <b>CẢNH BÁO BÃO / THIÊN TAI BIỂN ĐÔNG (${escapeHtml(al.badge)})</b>`,
              escapeHtml(al.title),
              `<a href="${escapeHtml(al.url)}">Chi tiết NCHMF</a>`,
            ].join('\n'),
          );
          return;
        }
      }
    }
  }

  async forwardBreakingTacticalAlert(alert: BreakingAlertItem): Promise<void> {
    if (!this.state.preferences.eastSeaWeather || alert.severity !== 'critical') return;
    if (!this.markSeen(`brk:${alert.id}`)) return;
    this.saveToDisk();
    await this.sendMessageHtml(
      [
        `🚨 <b>CẢNH BÁO TÁC CHIẾN KHẨN (${escapeHtml(alert.badge)})</b>`,
        `<b>${escapeHtml(alert.title)}</b>`,
        escapeHtml(alert.subtitle),
      ].join('\n'),
    );
  }
}
