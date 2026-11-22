import type { LivePriceTick, MarketSnapshot } from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';
import type { RealtimeHub } from './hub';

const BINANCE_COMBINED_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/bnbusdt@miniTicker/solusdt@miniTicker/xrpusdt@miniTicker/dogeusdt@miniTicker/adausdt@miniTicker/trxusdt@miniTicker/paxgusdt@miniTicker';

const PAIR_TO_DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  BNBUSDT: 'BNB',
  SOLUSDT: 'SOL',
  XRPUSDT: 'XRP',
  DOGEUSDT: 'DOGE',
  ADAUSDT: 'ADA',
  TRXUSDT: 'TRX',
  PAXGUSDT: 'Gold',
};

interface BinanceMiniTickerFrame {
  stream?: string;
  data?: {
    s?: string; // Symbol e.g. BTCUSDT
    c?: string; // Close/latest price
    o?: string; // Open price 24h ago
    q?: string; // 24h quote volume in USDT
  };
}

export function parseBinanceCombinedTick(rawJson: string): LivePriceTick | null {
  try {
    const parsed = JSON.parse(rawJson) as BinanceMiniTickerFrame;
    const rawSym = parsed?.data?.s?.toUpperCase() ?? '';
    const symbol = PAIR_TO_DISPLAY[rawSym];
    if (!symbol) return null;

    const close = Number(parsed.data?.c);
    const open = Number(parsed.data?.o);
    const quoteVol = Number(parsed.data?.q ?? 0);
    if (!Number.isFinite(close) || close <= 0) return null;

    const changePct =
      Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;

    return {
      symbol,
      price: Number(close.toFixed(close >= 100 ? 2 : close >= 1 ? 4 : 5)),
      changePercent24h: Number(changePct.toFixed(2)),
      ...(Number.isFinite(quoteVol) && quoteVol > 0 ? { volume24hUsd: Math.round(quoteVol) } : {}),
    };
  } catch {
    return null;
  }
}

export class BinanceRealtimeStream {
  private ws: WebSocket | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private backoffMs = 2_000;
  private readonly pendingTicks = new Map<string, LivePriceTick>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly store: SnapshotStore,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();

    // Coalesce high-frequency exchange ticks into smooth 1.5-second pushes
    this.flushTimer = setInterval(() => {
      this.flushTicks();
    }, 1_500);
    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.flushTimer = null;
    this.reconnectTimer = null;
    try {
      this.ws?.close();
    } catch {
      // Ignore close error
    }
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped || typeof globalThis.WebSocket !== 'function') return;

    try {
      const ws = new WebSocket(BINANCE_COMBINED_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.backoffMs = 2_000;
      };

      ws.onmessage = (event) => {
        const tick = parseBinanceCombinedTick(String(event.data));
        if (tick) {
          this.pendingTicks.set(tick.symbol, tick);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Handled in onclose
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.stopped) return;
        const delay = this.backoffMs;
        this.backoffMs = Math.min(30_000, this.backoffMs * 2);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        if (typeof this.reconnectTimer.unref === 'function') {
          this.reconnectTimer.unref();
        }
      };
    } catch {
      // Schedule retry if initial socket creation threw
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs);
      }
    }
  }

  private flushTicks(): void {
    if (this.pendingTicks.size === 0) return;

    const ticks = [...this.pendingTicks.values()];
    this.pendingTicks.clear();
    const now = Date.now();

    // Update warm RAM snapshot so new /api/bootstrap or /api/live-fast callers also get sub-second prices
    const currentSnap = this.store.get<MarketSnapshot>('markets-crypto', now);
    if (currentSnap) {
      const tickBySym = new Map(ticks.map((t) => [t.symbol, t]));
      for (const coin of currentSnap.crypto) {
        const live = tickBySym.get(coin.symbol);
        if (live) {
          coin.priceUsd = live.price;
          coin.changePercent24h = live.changePercent24h;
          coin.updatedAt = now;
        }
      }
      const goldTick = tickBySym.get('Gold');
      if (goldTick) {
        const existingGold = currentSnap.quotes.find((q) => q.symbol === 'Gold');
        if (existingGold) {
          existingGold.price = goldTick.price;
          existingGold.changePercent24h = goldTick.changePercent24h;
          existingGold.updatedAt = now;
        } else {
          currentSnap.quotes.push({
            symbol: 'Gold',
            name: 'Vàng giao ngay (PAXG/USD Realtime)',
            group: 'commodity',
            price: goldTick.price,
            changePercent24h: goldTick.changePercent24h,
            unit: 'USD/oz',
            updatedAt: now,
            source: 'Binance PAXG/USDT Realtime',
          });
        }
      }
      currentSnap.updatedAt = now;
    }

    this.hub.publish({
      type: 'price_tick',
      ticks,
      ts: now,
    });
  }
}
