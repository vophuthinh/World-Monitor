import type { DataCrossCheck, DataCrossCheckSide, MarketQuote } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout } from '../../lib/http';

const STALE_REFERENCE_MS = 400 * 86_400_000;

/** Compares one displayed figure with an independent source. Never changes the figure or any score. */
export function compareSources(
  id: string,
  label: string,
  primary: DataCrossCheckSide,
  secondary: DataCrossCheckSide,
  tolerancePct: number,
  now = Date.now(),
): DataCrossCheck | null {
  if (![primary.value, secondary.value].every((v) => Number.isFinite(v) && v > 0)) return null;
  const diffPct = Number(((Math.abs(primary.value - secondary.value) / secondary.value) * 100).toFixed(1));
  const asOf = secondary.asOf ? Date.parse(secondary.asOf) : Number.NaN;
  const stale = Number.isFinite(asOf) && now - asOf > STALE_REFERENCE_MS;
  return { id, label, primary, secondary, diffPct, mismatch: stale || diffPct > tolerancePct, ...(stale ? { stale } : {}) };
}

interface VndRatioPayload {
  data?: Array<{ ratioCode?: string; reportDate?: string; value?: number }>;
}

export async function fetchVndRatios(code: string): Promise<Map<string, DataCrossCheckSide>> {
  const payload = await fetchJsonWithTimeout<VndRatioPayload>(
    `https://api-finfo.vndirect.com.vn/v4/ratios/latest?filter=ratioCode:PRICE_TO_EARNINGS,PRICE_TO_BOOK,MARKETCAP&where=code:${code}&order=reportDate`,
    { timeoutMs: 6_000, retries: 0, userAgent: DEFAULT_BROWSER_UA },
  );
  return new Map(
    (payload?.data ?? []).flatMap((row) =>
      row.ratioCode && typeof row.value === 'number'
        ? [[row.ratioCode, { value: row.value, source: 'VNDirect', asOf: row.reportDate }] as const]
        : [],
    ),
  );
}

const present = (checks: Array<DataCrossCheck | null>) => checks.filter((c): c is DataCrossCheck => c !== null);

export async function crossCheckMarketQuotes(
  quotes: readonly MarketQuote[],
  now = Date.now(),
  dailyUsdVnd?: MarketQuote,
): Promise<DataCrossCheck[]> {
  const vni = quotes.find((q) => q.symbol === 'VN-Index' && !q.retained);
  const fx = quotes.find((q) => q.symbol === 'USD/VND' && !q.retained);
  const [ratios, ssi] = await Promise.allSettled([
    fetchVndRatios('VNINDEX'),
    fetchJsonWithTimeout<{ data?: { indexValue?: number; time?: number } }>(
      'https://iboard-query.ssi.com.vn/exchange-index/VNINDEX',
      { timeoutMs: 6_000, retries: 0, userAgent: DEFAULT_BROWSER_UA, headers: { Referer: 'https://iboard.ssi.com.vn/' } },
    ),
  ]);
  const checks: Array<DataCrossCheck | null> = [];
  const pe = ratios.status === 'fulfilled' ? ratios.value.get('PRICE_TO_EARNINGS') : undefined;
  if (vni?.peRatio && pe) {
    checks.push(compareSources('vn-index-pe', 'P/E VN-Index', { value: vni.peRatio, source: vni.valuationSource ?? 'Simplize' }, pe, 10, now));
  }
  const index = ssi.status === 'fulfilled' ? ssi.value?.data : undefined;
  // Only the same trading session is comparable.
  const sameDay = (a?: number, b?: number) => Boolean(a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10));
  if (vni && index?.indexValue && sameDay(vni.observedAt, index.time)) {
    checks.push(compareSources('vn-index', 'Điểm VN-Index', { value: vni.price, source: 'VNDirect' }, { value: index.indexValue, source: 'SSI' }, 0.5, now));
  }
  // The displayed rate is intraday (Yahoo); the daily ER-API rate is the independent reference.
  if (fx && dailyUsdVnd && fx.source !== dailyUsdVnd.source) {
    checks.push(compareSources('usd-vnd', 'Tỷ giá USD/VND', { value: fx.price, source: 'Yahoo' },
      { value: dailyUsdVnd.price, source: 'ER-API' }, 1, now));
  }
  return present(checks);
}
