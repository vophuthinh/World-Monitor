import type { CryptoQuote, FearGreedSnapshot, MarketQuote, MarketSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,tron&order=market_cap_desc&sparkline=false&price_change_percentage=24h';
const COINPAPRIKA_FALLBACK_URL = 'https://api.coinpaprika.com/v1/tickers?quotes=USD';
const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const ER_API_USD_URL = 'https://open.er-api.com/v6/latest/USD';

export interface CoinGeckoItem {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number | null;
  price_change_percentage_24h?: number | null;
  market_cap?: number | null;
  total_volume?: number | null;
}

export function normalizeCoinGeckoMarkets(items: CoinGeckoItem[], now = Date.now()): CryptoQuote[] {
  if (!Array.isArray(items)) {
    throw new Error('Malformed CoinGecko markets array');
  }
  const out: CryptoQuote[] = [];
  for (const item of items) {
    const price = Number(item.current_price);
    if (!item.id || !Number.isFinite(price) || price <= 0) continue;
    out.push({
      id: item.id,
      symbol: String(item.symbol ?? item.id).toUpperCase(),
      name: item.name || item.id,
      priceUsd: price,
      changePercent24h: Number.isFinite(Number(item.price_change_percentage_24h))
        ? Number(Number(item.price_change_percentage_24h).toFixed(2))
        : 0,
      marketCapUsd: Number(item.market_cap ?? 0),
      volume24hUsd: Number(item.total_volume ?? 0),
      updatedAt: now,
    });
  }
  return out;
}

const PAPRIKA_TARGETS = new Map<string, string>([
  ['btc-bitcoin', 'bitcoin'],
  ['eth-ethereum', 'ethereum'],
  ['sol-solana', 'solana'],
  ['bnb-binance-coin', 'binancecoin'],
  ['xrp-xrp', 'ripple'],
  ['doge-dogecoin', 'dogecoin'],
  ['ada-cardano', 'cardano'],
  ['trx-tron', 'tron'],
]);

async function fetchCryptoQuotes(now: number): Promise<CryptoQuote[]> {
  try {
    const gecko = await fetchJsonWithTimeout<CoinGeckoItem[]>(COINGECKO_URL, {
      timeoutMs: 10_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    });
    const normalized = normalizeCoinGeckoMarkets(gecko, now);
    if (normalized.length > 0) return normalized;
  } catch {
    // Fallback to CoinPaprika when CoinGecko public IP rate-limit triggers
  }

  const paprika = await fetchJsonWithTimeout<
    Array<{
      id?: string;
      name?: string;
      symbol?: string;
      quotes?: {
        USD?: {
          price?: number;
          percent_change_24h?: number;
          market_cap?: number;
          volume_24h?: number;
        };
      };
    }>
  >(COINPAPRIKA_FALLBACK_URL, {
    timeoutMs: 12_000,
    retries: 0,
    userAgent: NAMED_APP_UA,
  });

  const out: CryptoQuote[] = [];
  for (const row of paprika) {
    if (!row.id || !PAPRIKA_TARGETS.has(row.id)) continue;
    const usd = row.quotes?.USD;
    const price = Number(usd?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      id: PAPRIKA_TARGETS.get(row.id)!,
      symbol: String(row.symbol ?? '').toUpperCase(),
      name: row.name ?? row.id,
      priceUsd: price,
      changePercent24h: Number((usd?.percent_change_24h ?? 0).toFixed(2)),
      marketCapUsd: Number(usd?.market_cap ?? 0),
      volume24hUsd: Number(usd?.volume_24h ?? 0),
      updatedAt: now,
    });
  }
  if (out.length === 0) throw new Error('All crypto quote providers failed');
  return out;
}

export interface FearGreedPayload {
  data?: Array<{
    value?: string | number;
    value_classification?: string;
    timestamp?: string | number;
  }>;
}

export function normalizeFearGreed(payload: FearGreedPayload, now = Date.now()): FearGreedSnapshot | null {
  const entry = payload?.data?.[0];
  if (!entry) return null;
  const val = Number(entry.value);
  if (!Number.isFinite(val) || val < 0 || val > 100) return null;
  const rawTs = Number(entry.timestamp);
  return {
    value: Math.round(val),
    classification: entry.value_classification || 'Neutral',
    updatedAt: Number.isFinite(rawTs) && rawTs > 0 ? rawTs * 1000 : now,
  };
}

export interface ErApiPayload {
  time_last_update_unix?: number;
  rates?: Record<string, number>;
}

export function normalizeErApiFx(payload: ErApiPayload, now = Date.now()): MarketQuote[] {
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') {
    throw new Error('Malformed open.er-api FX payload');
  }
  const updatedAt = payload.time_last_update_unix ? payload.time_last_update_unix * 1000 : now;
  const pairs: MarketQuote[] = [];

  const addDirectUsdBase = (code: string, symbol: string, name: string, decimals = 2) => {
    const val = Number(rates[code]);
    if (Number.isFinite(val) && val > 0) {
      pairs.push({
        symbol,
        name,
        group: 'fx',
        price: Number(val.toFixed(decimals)),
        changePercent24h: 0,
        updatedAt,
        source: 'ExchangeRate-API (open.er-api)',
      });
    }
  };

  const addInvertedUsdQuote = (code: string, symbol: string, name: string, decimals = 4) => {
    const val = Number(rates[code]);
    if (Number.isFinite(val) && val > 0) {
      pairs.push({
        symbol,
        name,
        group: 'fx',
        price: Number((1 / val).toFixed(decimals)),
        changePercent24h: 0,
        updatedAt,
        source: 'ExchangeRate-API (open.er-api)',
      });
    }
  };

  addDirectUsdBase('VND', 'USD/VND', 'Đô la Mỹ / Việt Nam Đồng', 0);
  addInvertedUsdQuote('EUR', 'EUR/USD', 'Euro / Đô la Mỹ', 4);
  addDirectUsdBase('JPY', 'USD/JPY', 'Đô la Mỹ / Yên Nhật', 2);
  addInvertedUsdQuote('GBP', 'GBP/USD', 'Bảng Anh / Đô la Mỹ', 4);
  addDirectUsdBase('CNY', 'USD/CNY', 'Đô la Mỹ / Nhân dân tệ', 4);
  addDirectUsdBase('SGD', 'USD/SGD', 'Đô la Mỹ / Đô la Singapore', 4);

  return pairs;
}

export interface YahooChartPayload {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

export function normalizeYahooChartQuote(
  displaySymbol: string,
  name: string,
  group: 'index' | 'commodity' | 'fx',
  payload: YahooChartPayload,
  unit?: string,
  now = Date.now(),
): MarketQuote | null {
  const result = payload?.chart?.result?.[0];
  if (!result) return null;

  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
    (c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0,
  );
  const price = Number(result.meta?.regularMarketPrice ?? closes[closes.length - 1]);
  if (!Number.isFinite(price) || price <= 0) return null;

  const prev = Number(
    result.meta?.previousClose ??
      (closes.length >= 2 ? closes[closes.length - 2] : undefined) ??
      result.meta?.chartPreviousClose ??
      price,
  );
  const changePct =
    Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;

  return {
    symbol: displaySymbol,
    name,
    group,
    price: Number(price.toFixed(price >= 100 ? 2 : 3)),
    changePercent24h: Number(changePct.toFixed(2)),
    unit,
    updatedAt: now,
    source: 'Yahoo Finance Chart v8',
  };
}

interface YahooTarget {
  yahooSymbol: string;
  displaySymbol: string;
  name: string;
  group: 'index' | 'commodity';
  unit?: string;
}

const YAHOO_TARGETS: readonly YahooTarget[] = [
  { yahooSymbol: '^GSPC', displaySymbol: 'S&P 500', name: 'S&P 500 Index (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^IXIC', displaySymbol: 'NASDAQ', name: 'NASDAQ Composite (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^N225', displaySymbol: 'Nikkei 225', name: 'Nikkei 225 (Nhật Bản)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^HSI', displaySymbol: 'Hang Seng', name: 'Hang Seng Index (HK)', group: 'index', unit: 'pts' },
  { yahooSymbol: 'GC=F', displaySymbol: 'Gold', name: 'Vàng thế giới (COMEX)', group: 'commodity', unit: 'USD/oz' },
  { yahooSymbol: 'CL=F', displaySymbol: 'WTI Crude', name: 'Dầu thô WTI', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'BZ=F', displaySymbol: 'Brent Crude', name: 'Dầu thô Brent', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'SI=F', displaySymbol: 'Silver', name: 'Bạc thế giới', group: 'commodity', unit: 'USD/oz' },
];

async function fetchVietnamIndexQuote(now: number): Promise<MarketQuote | null> {
  // Primary: VNDirect DChart daily feed for HOSE VNINDEX
  try {
    const toSec = Math.floor(now / 1000);
    const fromSec = toSec - 12 * 86_400;
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
      return {
        symbol: 'VN-Index',
        name: 'VN-Index (HOSE Việt Nam)',
        group: 'index',
        price: Number(close.toFixed(2)),
        changePercent24h: Number(changePct.toFixed(2)),
        unit: 'pts',
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
          updatedAt: now,
          source: 'HOSE / Stooq Feed',
        };
      }
    }
  } catch {
    // Fallback to VanEck Vietnam ETF (VNM) on Yahoo Finance
  }

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/VNM?interval=1d&range=5d';
    const payload = await fetchJsonWithTimeout<YahooChartPayload>(url, {
      timeoutMs: 8_000,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
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
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(target.yahooSymbol)}?interval=1d&range=5d`;
        const payload = await fetchJsonWithTimeout<YahooChartPayload>(url, {
          timeoutMs: 9_000,
          retries: 1,
          userAgent: DEFAULT_BROWSER_UA,
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

  const [cryptoRes, fgRes, fxRes, marketQuotesRes] = await Promise.allSettled([
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

  const fxQuotes =
    fxRes.status === 'fulfilled' && fxRes.value.length > 0 ? fxRes.value : prevFx;

  // Merge per-symbol so transient Yahoo throttling on one symbol never drops prior valid quotes
  const mergedNonFxMap = new Map<string, MarketQuote>();
  for (const oldQuote of prevNonFx) {
    mergedNonFxMap.set(oldQuote.symbol, oldQuote);
  }
  if (marketQuotesRes.status === 'fulfilled') {
    for (const freshQuote of marketQuotesRes.value) {
      mergedNonFxMap.set(freshQuote.symbol, freshQuote);
    }
  }
  const orderedOrder = ['VN-Index', 'VNM ETF', ...YAHOO_TARGETS.map((t) => t.displaySymbol)];
  const indexCommodityQuotes = [
    ...orderedOrder
      .map((sym) => mergedNonFxMap.get(sym))
      .filter((q): q is MarketQuote => Boolean(q)),
  ];

  const quotes = [...indexCommodityQuotes, ...fxQuotes];

  if (quotes.length === 0 && crypto.length === 0) {
    throw new Error('All market, FX, and crypto upstream endpoints failed');
  }

  return {
    quotes,
    crypto,
    fearGreed,
    macro: previous?.macro ?? [],
    updatedAt: now,
  };
}
