import type {
  MarketQuote,
  MarketSnapshot,
} from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { FearGreedPayload, fetchCryptoQuotes, normalizeFearGreed } from './markets/crypto';
import { fetchFredMacroMetrics } from './markets/fred';
import { ErApiPayload, YahooChartPayload, computeTechnicalIndicators, normalizeErApiFx, normalizeYahooChartQuote } from './markets/fx-yahoo';
import { fetchVietnamDomesticGold, fetchVn30Leaders } from './markets/vn-gold-stocks';
import { fetchSimplizeVnIndexValuation, fetchVietnamAndGlobalMacroPulse } from './markets/vn-valuation-macro';

export * from './markets/crypto';
export * from './markets/fx-yahoo';
export * from './markets/vn-gold-stocks';
export * from './markets/vn-valuation-macro';
export * from './markets/fred';

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const ER_API_USD_URL = 'https://open.er-api.com/v6/latest/USD';
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
    const dchart = await fetchJsonWithTimeout<{ c?: number[]; s?: string }>(vndUrl, {
      timeoutMs: 7_500,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
      headers: { Accept: '*/*' },
    });
    const closes = (dchart?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 100);
    if (closes.length >= 1) {
      const close = closes[closes.length - 1];
      const prevClose = closes.length >= 2 ? closes[closes.length - 2] : close;
      const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
      const tech = computeTechnicalIndicators(closes);
      return {
        symbol: 'VN-Index',
        name: 'VN-Index (HOSE Việt Nam)',
        group: 'index',
        price: Number(close.toFixed(2)),
        changePercent24h: Number(changePct.toFixed(2)),
        unit: 'pts',
        sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
        ...tech,
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
      const prevCols = lines.length >= 2 ? lines[lines.length - 2].split(',') : latestCols;
      const close = Number(latestCols[4]);
      const prevClose = Number(prevCols[4]);
      const allCloses = lines
        .slice(-260)
        .map((l) => Number(l.split(',')[4]))
        .filter((v) => Number.isFinite(v) && v > 100);
      const sparkline = allCloses.slice(-10);
      const tech = computeTechnicalIndicators(allCloses);
      if (Number.isFinite(close) && close > 100) {
        const changePct =
          Number.isFinite(prevClose) && prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
        return {
          symbol: 'VN-Index',
          name: 'VN-Index (HOSE Việt Nam)',
          group: 'index',
          price: Number(close.toFixed(2)),
          changePercent24h: Number(changePct.toFixed(2)),
          unit: 'pts',
          sparkline: sparkline.length >= 2 ? sparkline : undefined,
          ...tech,
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
    return normalizeYahooChartQuote('VNM ETF', 'VanEck Vietnam ETF', 'index', payload, 'USD', now);
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
        // Pull 1y daily bars for S&P 500 & SOX Semi to compute exact MA50 / MA200 / RSI-14
        const range =
          target.yahooSymbol === '^GSPC' || target.yahooSymbol === '^SOX' ? '1y' : '7d';
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
          now,
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

export async function fetchMarketsAndCrypto(previous?: MarketSnapshot | null): Promise<MarketSnapshot> {
  const now = Date.now();

  const [cryptoRes, fgRes, fxRes, marketQuotesRes, vnValRes, vnPulseRes, vn30Res, fredRes] = await Promise.allSettled([
    fetchCryptoQuotes(now),
    fetchJsonWithTimeout<FearGreedPayload>(FEAR_GREED_URL, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).then((d) => normalizeFearGreed(d, now)),
    fetchJsonWithTimeout<ErApiPayload>(ER_API_USD_URL, {
      timeoutMs: 9_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).then((d) => normalizeErApiFx(d, now)),
    fetchIndicesAndCommodities(now),
    fetchSimplizeVnIndexValuation(),
    fetchVietnamAndGlobalMacroPulse(now),
    fetchVn30Leaders(now),
    fetchFredMacroMetrics(),
  ]);

  const crypto =
    cryptoRes.status === 'fulfilled' && cryptoRes.value.length > 0
      ? cryptoRes.value
      : (previous?.crypto ?? []);

  const fearGreed =
    fgRes.status === 'fulfilled' && fgRes.value
      ? fgRes.value
      : (previous?.fearGreed ?? null);

  const prevFx = (previous?.quotes ?? []).filter((q) => q.group === 'fx');
  const prevNonFx = (previous?.quotes ?? []).filter((q) => q.group !== 'fx');

  const baseFxQuotes =
    fxRes.status === 'fulfilled' && fxRes.value.length > 0 ? fxRes.value : prevFx.filter((q) => q.symbol !== 'AUD/JPY');

  // Merge per-symbol so transient Yahoo throttling on one symbol never drops prior valid quotes
  const mergedNonFxMap = new Map<string, MarketQuote>();
  for (const oldQuote of prevNonFx) {
    mergedNonFxMap.set(oldQuote.symbol, oldQuote);
  }
  let audJpyQuote = prevFx.find((q) => q.symbol === 'AUD/JPY');
  if (marketQuotesRes.status === 'fulfilled') {
    for (const freshQuote of marketQuotesRes.value) {
      if (freshQuote.group === 'fx') {
        audJpyQuote = freshQuote;
      } else {
        mergedNonFxMap.set(freshQuote.symbol, freshQuote);
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
    });
  }

  const fxQuotes = audJpyQuote
    ? [...baseFxQuotes.filter((q) => q.symbol !== 'AUD/JPY'), audJpyQuote]
    : baseFxQuotes;

  const nonFxOrder = [
    'VN-Index',
    'VNM ETF',
    ...YAHOO_TARGETS.filter((t) => t.group !== 'fx').map((t) => t.displaySymbol),
  ];
  const indexCommodityQuotes = [
    ...nonFxOrder
      .map((sym) => mergedNonFxMap.get(sym))
      .filter((q): q is MarketQuote => Boolean(q)),
  ];

  const quotes = [...indexCommodityQuotes, ...fxQuotes];

  const goldUsd = quotes.find((q) => q.symbol === 'Gold')?.price;
  const usdVnd = fxQuotes.find((q) => q.symbol === 'USD/VND')?.price;

  let vnGold = previous?.vnGold ?? [];
  try {
    const freshGold = await fetchVietnamDomesticGold(goldUsd, usdVnd, now);
    if (freshGold.length > 0) {
      vnGold = freshGold;
    }
  } catch {
    // Retain previous vnGold snapshot
  }

  const vn30 =
    vn30Res.status === 'fulfilled' && vn30Res.value.length > 0
      ? vn30Res.value
      : (previous?.vn30 ?? []);

  const fred =
    fredRes.status === 'fulfilled' && fredRes.value.length > 0
      ? fredRes.value
      : (previous?.fred ?? []);

  const vnMacroPulse =
    vnPulseRes.status === 'fulfilled' && vnPulseRes.value
      ? { ...(previous?.vnMacroPulse ?? {}), ...vnPulseRes.value }
      : previous?.vnMacroPulse;

  if (quotes.length === 0 && crypto.length === 0) {
    throw new Error('All market, FX, and crypto upstream endpoints failed');
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

