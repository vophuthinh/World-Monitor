import type {
  CryptoQuote,
  FredMacroMetric,
  MacroFieldMeta,
  MarketQuote,
  MarketSnapshot,
  VietnamLiveMacroPulse,
  VietnamMacroPulseFieldKey,
} from '@shared/types';
import { isFreshGoldComparison, isFreshMarketObservation } from '@shared/macro/core';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { FearGreedPayload, fetchCryptoQuotes, normalizeFearGreed } from './markets/crypto';
import { FRED_SERIES_TARGETS, fetchFredMacroMetrics } from './markets/fred';
import { ErApiPayload, YahooChartPayload, computeTechnicalIndicators, normalizeErApiFx, normalizeYahooChartQuote } from './markets/fx-yahoo';
import { dchartObservationTime, fetchVietnamDomesticGold, fetchVn30Leaders, type VndDchartPayload } from './markets/vn-gold-stocks';
import { fetchSimplizeVnIndexValuation, fetchVietnamAndGlobalMacroPulse } from './markets/vn-valuation-macro';

export * from './markets/crypto';
export * from './markets/fx-yahoo';
export * from './markets/vn-gold-stocks';
export * from './markets/vn-valuation-macro';
export * from './markets/fred';

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const ER_API_USD_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_OBSERVATION_MAX_AGE_MS = 2 * 86_400_000;
const MARKET_SESSION_MAX_AGE_MS = 7 * 86_400_000;

function isFreshFxObservation(observedAt: number | undefined, now: number): boolean {
  return observedAt !== undefined && Number.isFinite(observedAt) && observedAt > 0 &&
    observedAt <= now && now - observedAt <= FX_OBSERVATION_MAX_AGE_MS;
}

function isFreshMarketSession(observedAt: number | undefined, now: number): boolean {
  return observedAt !== undefined && Number.isFinite(observedAt) && observedAt > 0 &&
    observedAt <= now && now - observedAt <= MARKET_SESSION_MAX_AGE_MS;
}
interface YahooTarget {
  yahooSymbol: string;
  displaySymbol: string;
  name: string;
  group: 'index' | 'commodity' | 'fx';
  unit?: string;
}

const YAHOO_TARGETS: readonly YahooTarget[] = [
  { yahooSymbol: '^GSPC', displaySymbol: 'S&P 500', name: 'S&P 500 Index (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^IXIC', displaySymbol: 'NASDAQ', name: 'NASDAQ Composite (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^SOX', displaySymbol: 'SOX Semi', name: 'PHLX Semiconductor (Bán dẫn AI)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^VIX', displaySymbol: 'VIX', name: 'CBOE Volatility Index (VIX)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^VIX3M', displaySymbol: 'VIX 3M', name: 'CBOE 3M Volatility (Kỳ hạn VIX)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^N225', displaySymbol: 'Nikkei 225', name: 'Nikkei 225 (Nhật Bản)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^HSI', displaySymbol: 'Hang Seng', name: 'Hang Seng Index (HK)', group: 'index', unit: 'pts' },
  { yahooSymbol: 'GC=F', displaySymbol: 'Gold', name: 'Vàng thế giới (COMEX)', group: 'commodity', unit: 'USD/oz' },
  { yahooSymbol: 'HG=F', displaySymbol: 'Copper', name: 'Đồng công nghiệp (Dr. Copper)', group: 'commodity', unit: 'USD/lb' },
  { yahooSymbol: 'CL=F', displaySymbol: 'WTI Crude', name: 'Dầu thô WTI', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'BZ=F', displaySymbol: 'Brent Crude', name: 'Dầu thô Brent', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'SI=F', displaySymbol: 'Silver', name: 'Bạc thế giới', group: 'commodity', unit: 'USD/oz' },
  { yahooSymbol: 'AUDJPY=X', displaySymbol: 'AUD/JPY', name: 'Đô la Úc / Yên Nhật (Carry Trade)', group: 'fx' },
];

async function fetchVietnamIndexQuote(now: number): Promise<MarketQuote | null> {
  // Primary: VNDirect DChart daily feed for HOSE VNINDEX (~350d window -> >=220 bars for MA50/MA200/RSI14)
  try {
    const toSec = Math.floor(now / 1000);
    const fromSec = toSec - 350 * 86_400;
    const vndUrl = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=VNINDEX&from=${fromSec}&to=${toSec}`;
    const dchart = await fetchJsonWithTimeout<VndDchartPayload>(vndUrl, {
      timeoutMs: 7_500,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
      headers: { Accept: '*/*' },
    });
    const closes = (dchart?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 100);
    if (closes.length >= 1) {
      const close = closes[closes.length - 1];
      const prevClose = closes.length >= 2 ? closes[closes.length - 2] : undefined;
      const changePct = prevClose !== undefined ? ((close - prevClose) / prevClose) * 100 : null;
      const tech = computeTechnicalIndicators(closes);
      return {
        symbol: 'VN-Index',
        name: 'VN-Index (HOSE Việt Nam)',
        group: 'index',
        price: Number(close.toFixed(2)),
        changePercent24h: changePct === null ? null : Number(changePct.toFixed(2)),
        unit: 'pts',
        sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
        ...tech,
        observedAt: dchartObservationTime(dchart, 100, now),
        updatedAt: now,
        source: 'HOSE / VNDirect Feed',
      };
    }
  } catch {
    // Fall through to Stooq / Yahoo VNM ETF
  }

  // Secondary: Stooq daily historical CSV for ^VNI
  try {
    const { text } = await fetchTextWithTimeout('https://stooq.com/q/d/l/?s=%5Evni&i=d', {
      timeoutMs: 8_000,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    });
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter((line) => /^\d{4}-\d{2}-\d{2},/.test(line));
    if (lines.length >= 1) {
      const latestCols = lines[lines.length - 1].split(',');
      const observedAt = Date.parse(`${latestCols[0]}T00:00:00Z`);
      const prevCols = lines.length >= 2 ? lines[lines.length - 2].split(',') : undefined;
      const close = Number(latestCols[4]);
      const prevClose = Number(prevCols?.[4]);
      const allCloses = lines
        .slice(-260)
        .map((l) => Number(l.split(',')[4]))
        .filter((v) => Number.isFinite(v) && v > 100);
      const sparkline = allCloses.slice(-10);
      const tech = computeTechnicalIndicators(allCloses);
      if (Number.isFinite(close) && close > 100) {
        const changePct =
          Number.isFinite(prevClose) && prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : null;
        return {
          symbol: 'VN-Index',
          name: 'VN-Index (HOSE Việt Nam)',
          group: 'index',
          price: Number(close.toFixed(2)),
          changePercent24h: changePct === null ? null : Number(changePct.toFixed(2)),
          unit: 'pts',
          sparkline: sparkline.length >= 2 ? sparkline : undefined,
          ...tech,
          observedAt: Number.isFinite(observedAt) && observedAt <= now &&
            new Date(observedAt).toISOString().slice(0, 10) === latestCols[0] ? observedAt : undefined,
          updatedAt: now,
          source: 'HOSE / Stooq Feed',
        };
      }
    }
  } catch {
    // Fallback to VanEck Vietnam ETF (VNM) on Yahoo Finance
  }

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/VNM?interval=1d&range=1y';
    const payload = await fetchJsonWithTimeout<YahooChartPayload>(url, {
      timeoutMs: 8_000,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    });
    return normalizeYahooChartQuote('VNM ETF', 'VanEck Vietnam ETF', 'index', payload, 'USD', Date.now());
  } catch {
    return null;
  }
}

async function fetchIndicesAndCommodities(now: number): Promise<MarketQuote[]> {
  const quotes: MarketQuote[] = [];

  const vnQuote = await fetchVietnamIndexQuote(now);
  if (vnQuote) {
    quotes.push(vnQuote);
  }

  // Fetch in small staggered pairs across query1/query2 to avoid Yahoo burst 429s
  for (let i = 0; i < YAHOO_TARGETS.length; i += 2) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
    const pair = YAHOO_TARGETS.slice(i, i + 2);
    const pairResults = await Promise.allSettled(
      pair.map(async (target, idx) => {
        const host = idx % 2 === 0 ? 'query1.finance.yahoo.com' : 'query2.finance.yahoo.com';
        // 1y daily bars for MA50 / MA200 / RSI-14 (S&P 500, SOX) and the copper/gold MA50 ratio
        const range = ['^GSPC', '^SOX', 'HG=F', 'GC=F'].includes(target.yahooSymbol) ? '1y' : '7d';
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(target.yahooSymbol)}?interval=1d&range=${range}`;
        const payload = await fetchJsonWithTimeout<YahooChartPayload>(url, {
          timeoutMs: 9_000,
          retries: 1,
          userAgent: 'Mozilla/5.0',
        });
        return normalizeYahooChartQuote(
          target.displaySymbol,
          target.name,
          target.group,
          payload,
          target.unit,
          Date.now(),
        );
      }),
    );

    for (const res of pairResults) {
      if (res.status === 'fulfilled' && res.value) {
        quotes.push(res.value);
      }
    }
  }

  return quotes;
}

const VN_PULSE_DATA_KEYS: readonly VietnamMacroPulseFieldKey[] = [
  'vn10yYieldPct',
  'interbankRatePct',
  'sbvPolicyRatePct',
  'monthlyCpiPct',
  'ytdAvgCpiPct',
  'ytdCoreCpiPct',
  'manufacturingPmi',
  'quarterlyGdpPct',
  'tradeBalanceBillionUsd',
  'ytdTradeBalanceBillionUsd',
  'vcbSellUsdVnd',
  'sp500PeRatio',
];

const DEFAULT_VN_PULSE_SOURCE: Record<VietnamMacroPulseFieldKey, string> = {
  vn10yYieldPct: 'VBMA / TE',
  interbankRatePct: 'SBV / TE',
  sbvPolicyRatePct: 'NHNN / TE',
  monthlyCpiPct: 'GSO / TradingEconomics',
  ytdAvgCpiPct: 'Cục Thống kê (NSO)',
  ytdCoreCpiPct: 'Cục Thống kê (NSO)',
  manufacturingPmi: 'S&P Global / TE',
  quarterlyGdpPct: 'NSO / TE',
  tradeBalanceBillionUsd: 'Hải quan / TE',
  ytdTradeBalanceBillionUsd: 'Cục Thống kê (NSO)',
  vcbSellUsdVnd: 'Vietcombank',
  sp500PeRatio: 'Multpl (S&P 500)',
};

export function mergeFredWithPrevious(
  fresh: readonly FredMacroMetric[] | null | undefined,
  previous: readonly FredMacroMetric[] | undefined,
  now = Date.now(),
): FredMacroMetric[] {
  const freshById = new Map<string, FredMacroMetric>();
  for (const m of fresh ?? []) {
    freshById.set(m.id, {
      ...m,
      source: m.source ?? 'FRED',
      fetchedAt: now,
      retained: false,
    });
  }
  const prevById = new Map<string, FredMacroMetric>();
  for (const m of previous ?? []) {
    prevById.set(m.id, m);
  }

  const orderedIds = [
    ...FRED_SERIES_TARGETS.map((t) => t.id),
    ...[...freshById.keys(), ...prevById.keys()].filter(
      (id) => !FRED_SERIES_TARGETS.some((t) => t.id === id),
    ),
  ];
  const seen = new Set<string>();
  const out: FredMacroMetric[] = [];
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const freshItem = freshById.get(id);
    if (freshItem) {
      out.push(freshItem);
      continue;
    }
    const prevItem = prevById.get(id);
    if (prevItem) {
      out.push({
        ...prevItem,
        source: prevItem.source ?? 'FRED',
        retained: true,
      });
    }
  }
  return out;
}

export function mergeVietnamMacroPulse(
  fresh: Partial<VietnamLiveMacroPulse> | undefined,
  previous: VietnamLiveMacroPulse | undefined,
  now = Date.now(),
): VietnamLiveMacroPulse | undefined {
  if (!fresh && !previous) return undefined;

  const out: VietnamLiveMacroPulse = { updatedAt: now };
  const fieldMeta: Partial<Record<VietnamMacroPulseFieldKey, MacroFieldMeta>> = {};

  for (const key of VN_PULSE_DATA_KEYS) {
    const freshVal = fresh?.[key];
    // A press-feed (RSS) number never replaces an official one for the same period while the
    // official one is still usable (7 days, the macro scoring retention limit).
    const kept = previous?.fieldMeta?.[key];
    const keepOfficial =
      fresh?.fieldMeta?.[key]?.source.includes('(RSS)') === true &&
      kept?.source.includes('(NSO)') === true &&
      kept.period === fresh.fieldMeta[key]?.period &&
      now - (kept.fetchedAt ?? 0) <= 7 * 86_400_000;
    if (freshVal !== undefined && !keepOfficial) {
      out[key] = freshVal;
      const fm = fresh?.fieldMeta?.[key];
      fieldMeta[key] = {
        source: fm?.source ?? DEFAULT_VN_PULSE_SOURCE[key],
        ...(fm?.period ? { period: fm.period } : {}),
        fetchedAt: now,
        retained: false,
      };
      continue;
    }

    const prevVal = previous?.[key];
    if (prevVal !== undefined) {
      out[key] = prevVal;
      const pm = previous?.fieldMeta?.[key];
      fieldMeta[key] = {
        source: pm?.source ?? DEFAULT_VN_PULSE_SOURCE[key],
        ...(pm?.period ? { period: pm.period } : {}),
        fetchedAt: pm?.fetchedAt ?? 0,
        retained: true,
      };
    }
  }

  if (fresh?.monthlyCpiPct !== undefined) {
    if (fresh.monthlyCpiPrevPct !== undefined) out.monthlyCpiPrevPct = fresh.monthlyCpiPrevPct;
  } else if (previous?.monthlyCpiPrevPct !== undefined) {
    out.monthlyCpiPrevPct = previous.monthlyCpiPrevPct;
  }

  if (fresh?.manufacturingPmi !== undefined) {
    if (fresh.manufacturingPmiPrev !== undefined) out.manufacturingPmiPrev = fresh.manufacturingPmiPrev;
  } else if (previous?.manufacturingPmiPrev !== undefined) {
    out.manufacturingPmiPrev = previous.manufacturingPmiPrev;
  }

  if (fresh?.quarterlyGdpPct !== undefined) {
    if (fresh.quarterlyGdpPrevPct !== undefined) out.quarterlyGdpPrevPct = fresh.quarterlyGdpPrevPct;
  } else if (previous?.quarterlyGdpPrevPct !== undefined) {
    out.quarterlyGdpPrevPct = previous.quarterlyGdpPrevPct;
  }

  if (fresh?.ytdAvgCpiPct !== undefined) {
    if (fresh.ytdCpiMonths !== undefined) out.ytdCpiMonths = fresh.ytdCpiMonths;
  } else if (previous?.ytdCpiMonths !== undefined) {
    out.ytdCpiMonths = previous.ytdCpiMonths;
  }

  if (Object.keys(fieldMeta).length > 0) {
    out.fieldMeta = fieldMeta;
  }

  const hasData = VN_PULSE_DATA_KEYS.some((k) => out[k] !== undefined);
  return hasData ? out : undefined;
}

export function markMarketSnapshotRetained(snapshot: MarketSnapshot, now = Date.now()): MarketSnapshot {
  return {
    ...snapshot,
    quotes: snapshot.quotes.map((quote) => ({
      ...quote,
      retained: true,
      ...(quote.peRatio !== undefined ? { valuationRetained: true } : {}),
    })),
    crypto: snapshot.crypto.map((coin) => ({ ...expireCryptoMarketData(coin, now), retained: true })),
    fearGreed: snapshot.fearGreed ? { ...snapshot.fearGreed, retained: true } : null,
    vnGold: snapshot.vnGold?.map((quote) => ({ ...quote, retained: true })),
    fred: mergeFredWithPrevious(undefined, snapshot.fred, now),
    vnMacroPulse: mergeVietnamMacroPulse(undefined, snapshot.vnMacroPulse, now),
    vn30: snapshot.vn30?.map((quote) => ({ ...quote, retained: true })),
  };
}

function expireCryptoMarketData(coin: CryptoQuote, now: number): CryptoQuote {
  const fetchedAt = coin.marketDataFetchedAt ?? coin.updatedAt;
  if (Number.isFinite(fetchedAt) && fetchedAt > 0 && fetchedAt <= now && now - fetchedAt <= 6 * 3_600_000) {
    return coin;
  }
  return { ...coin, marketCapUsd: null, volume24hUsd: null };
}

export function getRetainedMarketSnapshot(
  store: import('../cache/snapshot-store').SnapshotStore,
  now = Date.now(),
): MarketSnapshot | null {
  const snapshot = store.get<MarketSnapshot>('markets-crypto', now);
  if (!snapshot) return null;
  const resolved = store.getHealth('markets-crypto', now)?.status === 'stale'
    ? markMarketSnapshotRetained(snapshot, now)
    : snapshot;
  const gold = resolved.quotes.find((quote) => quote.symbol === 'Gold');
  const fx = resolved.quotes.find((quote) => quote.symbol === 'USD/VND');
  return {
    ...resolved,
    quotes: resolved.quotes.map((quote) => {
      if (quote.source === 'ExchangeRate-API (open.er-api)') {
        return { ...quote, retained: Boolean(quote.retained) || !isFreshFxObservation(quote.observedAt, now) };
      }
      if (quote.source === 'Yahoo Finance Chart v8' || quote.symbol === 'VN-Index') {
        return { ...quote, retained: Boolean(quote.retained) || !isFreshMarketSession(quote.observedAt, now) };
      }
      return quote;
    }),
    crypto: resolved.crypto.map((coin) => expireCryptoMarketData(coin, now)),
    fearGreed: resolved.fearGreed && resolved.fearGreed.updatedAt > 0 &&
      resolved.fearGreed.updatedAt <= now && now - resolved.fearGreed.updatedAt <= 7 * 86_400_000
      ? resolved.fearGreed : null,
    vnGold: resolved.vnGold?.map((quote) => ({
      ...quote,
      retained: Boolean(quote.retained) || !isFreshMarketObservation(quote.observedAt, now),
      ...(quote.worldParityPerLuongMillionVnd !== undefined
        ? { worldParityRetained: !isFreshGoldComparison(quote, gold, fx, now) } : {}),
    })),
  };
}

export async function fetchMarketsAndCrypto(previous?: MarketSnapshot | null): Promise<MarketSnapshot> {
  const now = Date.now();
  const recent = (updatedAt: number, maxAgeMs: number) => {
    const checkedAt = Date.now();
    return Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= checkedAt && checkedAt - updatedAt <= maxAgeMs;
  };
  const quoteRetentionMs = 6 * 3_600_000;

  const [cryptoRes, fgRes, fxRes, marketQuotesRes, vnValRes, vnPulseRes, vn30Res, fredRes] = await Promise.allSettled([
    fetchCryptoQuotes(now),
    fetchJsonWithTimeout<FearGreedPayload>(FEAR_GREED_URL, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).then((d) => normalizeFearGreed(d, Date.now())),
    fetchJsonWithTimeout<ErApiPayload>(ER_API_USD_URL, {
      timeoutMs: 9_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).then((d) => normalizeErApiFx(d, Date.now())),
    fetchIndicesAndCommodities(now),
    fetchSimplizeVnIndexValuation(),
    fetchVietnamAndGlobalMacroPulse(now),
    fetchVn30Leaders(now),
    fetchFredMacroMetrics(now),
  ]);

  const crypto = cryptoRes.status === 'fulfilled'
    ? cryptoRes.value.map((coin) => ({ ...coin, retained: false }))
    : [];
  for (const coin of previous?.crypto ?? []) {
    if (recent(coin.updatedAt, quoteRetentionMs) && !crypto.some((fresh) => fresh.symbol === coin.symbol)) {
      crypto.push({ ...expireCryptoMarketData(coin, Date.now()), retained: true });
    }
  }

  const fearGreed =
    fgRes.status === 'fulfilled' && fgRes.value && recent(fgRes.value.updatedAt, 7 * 86_400_000)
      ? { ...fgRes.value, retained: false }
      : previous?.fearGreed && recent(previous.fearGreed.updatedAt, 7 * 86_400_000)
        ? { ...previous.fearGreed, retained: true } : null;

  const prevFx = (previous?.quotes ?? []).filter((q) => q.group === 'fx' && recent(q.updatedAt, quoteRetentionMs));
  const prevNonFx = (previous?.quotes ?? []).filter((q) => q.group !== 'fx' && recent(q.updatedAt, quoteRetentionMs));

  const baseFxMap = new Map(prevFx.filter((q) => q.symbol !== 'AUD/JPY')
    .map((q) => [q.symbol, { ...q, retained: true }]));
  if (fxRes.status === 'fulfilled') {
    for (const quote of fxRes.value) {
      const old = baseFxMap.get(quote.symbol);
      if (old?.observedAt && (!quote.observedAt || quote.observedAt < old.observedAt)) continue;
      baseFxMap.set(quote.symbol, {
        ...quote,
        retained: !isFreshFxObservation(quote.observedAt, Date.now()),
      });
    }
  }
  const baseFxQuotes = [...baseFxMap.values()];

  // Merge per-symbol so transient Yahoo throttling on one symbol never drops prior valid quotes,
  // while explicitly flagging retained quotes when an upstream call failed.
  const mergedNonFxMap = new Map<string, MarketQuote>();
  for (const oldQuote of prevNonFx) {
    mergedNonFxMap.set(oldQuote.symbol, { ...oldQuote, retained: true });
  }
  const prevVni = prevNonFx.find((q) => q.symbol === 'VN-Index');
  const prevAudJpy = prevFx.find((q) => q.symbol === 'AUD/JPY');
  let audJpyQuote: MarketQuote | undefined = prevAudJpy ? { ...prevAudJpy, retained: true } : undefined;
  if (marketQuotesRes.status === 'fulfilled') {
    for (const freshQuote of marketQuotesRes.value) {
      if (freshQuote.group === 'fx') {
        if (audJpyQuote?.observedAt && (!freshQuote.observedAt || freshQuote.observedAt < audJpyQuote.observedAt)) continue;
        audJpyQuote = { ...freshQuote, retained: !isFreshMarketSession(freshQuote.observedAt, Date.now()) };
      } else {
        const oldQuote = mergedNonFxMap.get(freshQuote.symbol);
        if (oldQuote?.observedAt && (!freshQuote.observedAt || freshQuote.observedAt < oldQuote.observedAt)) continue;
        mergedNonFxMap.set(freshQuote.symbol, {
          ...freshQuote, retained: !isFreshMarketSession(freshQuote.observedAt, Date.now()),
        });
      }
    }
  }

  // Enrich VN-Index with live Market P/E, P/B, 52W range & liquidity ratio from Simplize
  const vniCurrent = mergedNonFxMap.get('VN-Index');
  const freshValuation = vnValRes.status === 'fulfilled' ? vnValRes.value : null;
  if (vniCurrent && freshValuation) {
    mergedNonFxMap.set('VN-Index', {
      ...vniCurrent,
      ...freshValuation,
      valuationSource: 'Simplize',
      valuationRetained: false,
      valuationFetchedAt: now,
    });
  } else if (vniCurrent && prevVni?.peRatio !== undefined) {
    mergedNonFxMap.set('VN-Index', {
      ...vniCurrent,
      peRatio: prevVni.peRatio,
      ...(prevVni.pbRatio !== undefined ? { pbRatio: prevVni.pbRatio } : {}),
      ...(prevVni.close52wLow !== undefined ? { close52wLow: prevVni.close52wLow } : {}),
      ...(prevVni.close52wHigh !== undefined ? { close52wHigh: prevVni.close52wHigh } : {}),
      ...(prevVni.volumeVs90dRatio !== undefined ? { volumeVs90dRatio: prevVni.volumeVs90dRatio } : {}),
      valuationSource: prevVni.valuationSource ?? 'Simplize',
      valuationRetained: true,
      valuationFetchedAt: prevVni.valuationFetchedAt,
    });
  }

  const fxQuotes = audJpyQuote
    ? [...baseFxQuotes.filter((q) => q.symbol !== 'AUD/JPY'), audJpyQuote]
    : baseFxQuotes;

  const nonFxOrder = [
    'VN-Index',
    'VNM ETF',
    'PAXG',
    ...YAHOO_TARGETS.filter((t) => t.group !== 'fx').map((t) => t.displaySymbol),
  ];
  const indexCommodityQuotes = [
    ...nonFxOrder
      .map((sym) => mergedNonFxMap.get(sym))
      .filter((q): q is MarketQuote => Boolean(q)),
  ];

  const quotes = [...indexCommodityQuotes, ...fxQuotes];

  const goldQuote = quotes.find((q) => q.symbol === 'Gold');
  const fxQuote = fxQuotes.find((q) => q.symbol === 'USD/VND');
  const goldUsd = goldQuote?.price;
  const usdVnd = fxQuote?.price;

  const vnGoldByCode = new Map((previous?.vnGold ?? [])
    .filter((quote) => recent(quote.updatedAt, quoteRetentionMs))
    .map((quote) => [quote.code, { ...quote, retained: true, worldParityRetained: true }]));
  let hasFreshGold = false;
  try {
    const freshGold = await fetchVietnamDomesticGold(goldUsd, usdVnd, now);
    if (freshGold.length > 0) {
      const checkedAt = Date.now();
      const worldParityRetained = !goldQuote || !fxQuote || Boolean(goldQuote.retained || fxQuote.retained) ||
        !goldQuote.observedAt || goldQuote.observedAt > checkedAt || checkedAt - goldQuote.observedAt > quoteRetentionMs ||
        !fxQuote.observedAt || fxQuote.observedAt > checkedAt || checkedAt - fxQuote.observedAt > quoteRetentionMs;
      for (const quote of freshGold) {
        const old = vnGoldByCode.get(quote.code);
        if (old?.observedAt && (!quote.observedAt || quote.observedAt < old.observedAt)) continue;
        const retained = !isFreshMarketObservation(quote.observedAt, checkedAt);
        vnGoldByCode.set(quote.code, {
          ...quote,
          retained,
          worldParityRetained: worldParityRetained || retained,
        });
        if (!retained) hasFreshGold = true;
      }
    }
  } catch {
    // Retain previous vnGold snapshot
  }

  const vn30 = vn30Res.status === 'fulfilled'
    ? vn30Res.value.map((quote) => ({
        ...quote,
        retained: !quote.observedAt || !recent(quote.observedAt, 7 * 86_400_000),
      }))
    : [];
  for (const quote of previous?.vn30 ?? []) {
    if (!recent(quote.updatedAt, quoteRetentionMs)) continue;
    const index = vn30.findIndex((fresh) => fresh.symbol === quote.symbol);
    if (index < 0) vn30.push({ ...quote, retained: true });
    else if (quote.observedAt && (!vn30[index].observedAt || vn30[index].observedAt! < quote.observedAt)) {
      vn30[index] = { ...quote, retained: true };
    }
  }

  const fred = mergeFredWithPrevious(
    fredRes.status === 'fulfilled' ? fredRes.value : null,
    previous?.fred,
    now,
  );

  const vnMacroPulse = mergeVietnamMacroPulse(
    vnPulseRes.status === 'fulfilled' ? vnPulseRes.value : undefined,
    previous?.vnMacroPulse,
    now,
  );

  const vnGold = [...vnGoldByCode.values()];
  const hasFreshData = (cryptoRes.status === 'fulfilled' && cryptoRes.value.length > 0) ||
    baseFxQuotes.some((quote) => !quote.retained) ||
    indexCommodityQuotes.some((quote) => !quote.retained) ||
    Boolean(audJpyQuote && !audJpyQuote.retained) ||
    (fgRes.status === 'fulfilled' && fgRes.value !== null && recent(fgRes.value.updatedAt, 7 * 86_400_000)) ||
    vn30.some((quote) => !quote.retained) ||
    (fredRes.status === 'fulfilled' && fredRes.value.length > 0) ||
    (vnPulseRes.status === 'fulfilled' && VN_PULSE_DATA_KEYS.some((key) => vnPulseRes.value?.[key] !== undefined)) ||
    hasFreshGold;
  if (!hasFreshData) {
    throw new Error('All market and macro upstream endpoints failed or returned stale data');
  }

  for (const live of previous?.crypto ?? []) {
    if (live.updatedAt <= now || !recent(live.updatedAt, quoteRetentionMs)) continue;
    const index = crypto.findIndex((coin) => coin.symbol === live.symbol);
    if (index >= 0) {
      crypto[index] = {
        ...crypto[index],
        priceUsd: live.priceUsd,
        changePercent24h: live.changePercent24h,
        updatedAt: live.updatedAt,
        retained: false,
      };
    } else {
      crypto.push({ ...expireCryptoMarketData(live, Date.now()), retained: false });
    }
  }
  const livePaxg = previous?.quotes.find((quote) => quote.symbol === 'PAXG');
  if (livePaxg && livePaxg.updatedAt > now && recent(livePaxg.updatedAt, quoteRetentionMs)) {
    const index = quotes.findIndex((quote) => quote.symbol === 'PAXG');
    if (index >= 0) quotes[index] = { ...livePaxg };
    else quotes.push({ ...livePaxg });
  }

  return {
    quotes,
    crypto,
    fearGreed,
    macro: previous?.macro ?? [],
    vnGold,
    vn30,
    fred,
    ...(vnMacroPulse ? { vnMacroPulse } : {}),
    updatedAt: now,
  };
}

