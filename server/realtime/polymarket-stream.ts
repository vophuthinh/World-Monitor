import type { PredictionItem } from '@shared/types';
import type { SnapshotStore } from '../cache/snapshot-store';
import type { RealtimeHub } from './hub';

const POLYMARKET_CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export interface PolymarketLiveProbTick {
  assetId: string;
  yesPercent: number;
}

interface RawBookEntry {
  price?: string | number;
  size?: string | number;
}

function clampPercent(prob0to1: number): number | null {
  if (!Number.isFinite(prob0to1) || prob0to1 < 0 || prob0to1 > 1.0001) return null;
  return Math.max(0, Math.min(100, Math.round(prob0to1 * 100)));
}

export function parsePolymarketWsMessage(raw: string): PolymarketLiveProbTick[] {
  if (!raw || raw === 'PONG' || raw === 'PING') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const frames = Array.isArray(parsed) ? parsed : [parsed];
    const out: PolymarketLiveProbTick[] = [];

    for (const frame of frames) {
      if (!frame || typeof frame !== 'object') continue;
      const rec = frame as Record<string, any>;
      const eventType = String(rec.event_type ?? '');

      if (eventType === 'last_trade_price' || eventType === 'price_change') {
        if (Array.isArray(rec.price_changes)) {
          for (const ch of rec.price_changes) {
            const assetId = String(ch?.asset_id ?? '').trim();
            const bestBid = Number(ch?.best_bid);
            const bestAsk = Number(ch?.best_ask);
            const directPrice = Number(ch?.price);
            const prob =
              Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0
                ? (bestBid + bestAsk) / 2
                : directPrice;
            const pct = clampPercent(prob);
            if (assetId && pct !== null) {
              out.push({ assetId, yesPercent: pct });
            }
          }
        } else {
          const assetId = String(rec.asset_id ?? '').trim();
          const pct = clampPercent(Number(rec.price));
          if (assetId && pct !== null) {
            out.push({ assetId, yesPercent: pct });
          }
        }
      } else if (Array.isArray(rec.bids) || Array.isArray(rec.asks)) {
        const assetId = String(rec.asset_id ?? '').trim();
        if (!assetId) continue;

        const bids = (Array.isArray(rec.bids) ? rec.bids : []) as RawBookEntry[];
        const asks = (Array.isArray(rec.asks) ? rec.asks : []) as RawBookEntry[];

        let maxBid = -1;
        for (const b of bids) {
          const p = Number(b?.price);
          if (Number.isFinite(p) && p > maxBid) maxBid = p;
        }
        let minAsk = 2;
        for (const a of asks) {
          const p = Number(a?.price);
          if (Number.isFinite(p) && p < minAsk) minAsk = p;
        }

        let mid = Number.NaN;
        if (maxBid >= 0 && minAsk <= 1) {
          mid = (maxBid + minAsk) / 2;
        } else if (maxBid >= 0) {
          mid = maxBid;
        } else if (minAsk <= 1) {
          mid = minAsk;
        }

        const pct = clampPercent(mid);
        if (pct !== null) {
          out.push({ assetId, yesPercent: pct });
        }
      }
    }

    return out;
  } catch {
    return [];
  }
}

export class PolymarketRealtimeStream {
  private ws: WebSocket | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private backoffMs = 2_500;
  private subscribedTokenKey = '';
  private activeTokenIds: string[] = [];
  private readonly pendingTicks = new Map<string, number>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly store: SnapshotStore,
  ) {}

  start(): void {
    this.stopped = false;
    const warm = this.store.get<PredictionItem[]>('polymarket');
    if (warm && warm.length > 0) {
      this.syncTokens(warm);
    }

    this.flushTimer = setInterval(() => {
      this.flushTicks();
    }, 1_500);
    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }

    this.pingTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PING');
        }
      } catch {
        // Ignore ping errors
      }
    }, 20_000);
    if (typeof this.pingTimer.unref === 'function') {
      this.pingTimer.unref();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.flushTimer = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    try {
      this.ws?.close();
    } catch {
      // Ignore close error
    }
    this.ws = null;
  }

  syncTokens(predictions: PredictionItem[]): void {
    const tokens = [
      ...new Set(
        predictions
          .map((p) => p.clobTokenId?.trim())
          .filter((t): t is string => Boolean(t && t.length > 0)),
      ),
    ].slice(0, 30);

    if (tokens.length === 0) return;

    const nextKey = tokens.join(',');
    const changed = nextKey !== this.subscribedTokenKey;
    this.activeTokenIds = tokens;
    this.subscribedTokenKey = nextKey;

    if (this.stopped) return;

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
    } else if (changed && this.ws.readyState === WebSocket.OPEN) {
      // Reconnect cleanly with updated asset_ids subscription set
      try {
        this.ws.close();
      } catch {
        // Reconnect handled in onclose
      }
    }
  }

  private connect(): void {
    if (this.stopped || this.activeTokenIds.length === 0 || typeof globalThis.WebSocket !== 'function') {
      return;
    }

    try {
      const ws = new WebSocket(POLYMARKET_CLOB_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.backoffMs = 2_500;
        try {
          ws.send(
            JSON.stringify({
              assets_ids: this.activeTokenIds,
              type: 'market',
            }),
          );
        } catch {
          // Ignore send race
        }
      };

      ws.onmessage = async (event) => {
        let rawText = '';
        if (typeof event.data === 'string') {
          rawText = event.data;
        } else if (event.data instanceof Blob) {
          rawText = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          rawText = new TextDecoder().decode(event.data);
        }
        const ticks = parsePolymarketWsMessage(rawText);
        for (const t of ticks) {
          this.pendingTicks.set(t.assetId, t.yesPercent);
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
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs);
      }
    }
  }

  private flushTicks(): void {
    if (this.pendingTicks.size === 0) return;

    const updates = new Map(this.pendingTicks);
    this.pendingTicks.clear();
    const now = Date.now();

    const current = this.store.get<PredictionItem[]>('polymarket', now);
    if (!current || current.length === 0) return;

    const flashedIds: Record<string, 'up' | 'down'> = {};
    let mutated = false;

    for (const item of current) {
      if (!item.clobTokenId) continue;
      const nextPct = updates.get(item.clobTokenId);
      if (nextPct === undefined) continue;
      if (nextPct !== item.yesPercent) {
        flashedIds[item.id] = nextPct > item.yesPercent ? 'up' : 'down';
        item.yesPercent = nextPct;
        item.updatedAt = now;
        mutated = true;
      }
    }

    if (mutated) {
      this.hub.publish({
        type: 'polymarket_update',
        predictions: [...current],
        flashedIds,
        ts: now,
      });
    }
  }
}
