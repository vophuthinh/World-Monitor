import type { HptCompanyIntelSnapshot, MarketSnapshot, VnLiveStockTick, VnLiveTick } from '@shared/types';
import { applyVnTick } from '@shared/vn-live';
import type { SnapshotStore } from '../cache/snapshot-store';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout } from '../lib/http';
import type { RealtimeHub } from './hub';

const SSI = 'https://iboard-query.ssi.com.vn';
const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const IDLE_CHECK_MS = 60_000;

interface SsiStock {
  stockSymbol?: string;
  matchedPrice?: number | null;
  priceChangePercent?: number | null;
  nmTotalTradedQty?: number | null;
  tradingDate?: string;
}
interface SsiIndex {
  data?: { indexValue?: number; changePercent?: number; time?: number };
}
type SsiFetcher = <T>(path: string) => Promise<T>;

const vnClock = (now: number) => new Date(now + 7 * 3_600_000);

/** HOSE / UPCoM sessions run 09:00-15:00 on weekdays; holidays are filtered by the tick's own date. */
export function isVnTradingWindow(now: number): boolean {
  const t = vnClock(now);
  const minutes = t.getUTCHours() * 60 + t.getUTCMinutes();
  return t.getUTCDay() >= 1 && t.getUTCDay() <= 5 && minutes >= 8 * 60 + 55 && minutes <= 15 * 60 + 10;
}

export function parseSsiVnTick(
  index: SsiIndex | null,
  basket: { data?: SsiStock[] } | null,
  hpt: { data?: SsiStock } | null,
  now: number,
): VnLiveTick | null {
  const sessionDate = vnClock(now).toISOString().slice(0, 10);
  const compact = sessionDate.replaceAll('-', '');
  const toTick = (s: SsiStock | undefined): VnLiveStockTick | null =>
    s?.stockSymbol && s.tradingDate === compact && typeof s.matchedPrice === 'number' && s.matchedPrice > 0 &&
    typeof s.priceChangePercent === 'number'
      ? { symbol: s.stockSymbol, priceThousandVnd: s.matchedPrice / 1_000, changePercent: s.priceChangePercent,
          volume: s.nmTotalTradedQty ?? null }
      : null;
  const i = index?.data;
  const liveIndex = i?.indexValue && i.indexValue > 0 && typeof i.changePercent === 'number' && i.time &&
    vnClock(i.time).toISOString().slice(0, 10) === sessionDate
    ? { price: i.indexValue, changePercent: i.changePercent }
    : undefined;
  const stocks = (basket?.data ?? []).map(toTick).filter((s): s is VnLiveStockTick => s !== null);
  const hptTick = toTick(hpt?.data) ?? undefined;
  if (!liveIndex && stocks.length === 0 && !hptTick) return null;
  return { ts: now, sessionDate, stocks, ...(liveIndex ? { index: liveIndex } : {}), ...(hptTick ? { hpt: hptTick } : {}) };
}

const fetchSsi: SsiFetcher = <T>(path: string) =>
  fetchJsonWithTimeout<T>(`${SSI}${path}`, {
    timeoutMs: 4_000, retries: 0, userAgent: DEFAULT_BROWSER_UA, headers: { Referer: 'https://iboard.ssi.com.vn/' },
  });

/** Polls SSI's public board during Vietnamese trading hours and pushes prices to open browsers. */
export class VnLiveStream {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private delayMs = POLL_MS;

  constructor(
    private readonly hub: RealtimeHub,
    private readonly store: SnapshotStore,
    private readonly fetcher: SsiFetcher = fetchSsi,
  ) {}

  start(): void {
    this.stopped = false;
    this.schedule(POLL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.poll(Date.now()).finally(() => this.schedule(isVnTradingWindow(Date.now()) ? this.delayMs : IDLE_CHECK_MS));
    }, ms);
    this.timer.unref?.();
  }

  async poll(now: number): Promise<void> {
    if (!isVnTradingWindow(now)) return;
    const [index, basket, hpt] = await Promise.allSettled([
      this.fetcher<SsiIndex>('/exchange-index/VNINDEX'),
      this.fetcher<{ data?: SsiStock[] }>('/stock/group/VN30'),
      this.fetcher<{ data?: SsiStock }>('/stock/HPT'),
    ]);
    const value = <T>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
    if ([index, basket, hpt].every((r) => r.status === 'rejected')) {
      this.delayMs = Math.min(MAX_BACKOFF_MS, this.delayMs * 2);
      return;
    }
    this.delayMs = POLL_MS;
    const tick = parseSsiVnTick(value(index), value(basket), value(hpt), now);
    if (!tick) return;
    // Patch the RAM snapshots too, so page loads between collector runs also get live prices.
    const markets = this.store.get<MarketSnapshot>('markets-crypto', now);
    if (markets) Object.assign(markets, applyVnTick(markets, tick));
    const stock = this.store.get<HptCompanyIntelSnapshot>('hpt-intel', now)?.stock;
    if (stock && tick.hpt) {
      Object.assign(stock, { priceThousandVnd: tick.hpt.priceThousandVnd, changePercent: tick.hpt.changePercent,
        volume: tick.hpt.volume ?? stock.volume, priceKind: 'trade', updatedAt: now });
    }
    this.hub.publish({ type: 'vn_tick', tick, ts: now });
  }
}
