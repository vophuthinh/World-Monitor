import type {
  MarketQuote,
} from '@shared/types';

export interface ErApiPayload {
  time_last_update_unix?: number;
  rates?: Record<string, number>;
}

export function normalizeErApiFx(payload: ErApiPayload, now = Date.now()): MarketQuote[] {
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') {
    throw new Error('Malformed open.er-api FX payload');
  }
  const sourceTime = typeof payload.time_last_update_unix === 'number' ? payload.time_last_update_unix * 1000 : NaN;
  const observedAt = Number.isFinite(sourceTime) && sourceTime > 0 && sourceTime <= now ? sourceTime : undefined;
  const pairs: MarketQuote[] = [];

  const addDirectUsdBase = (code: string, symbol: string, name: string, decimals = 2) => {
    const val = Number(rates[code]);
    if (Number.isFinite(val) && val > 0) {
      pairs.push({
        symbol,
        name,
        group: 'fx',
        price: Number(val.toFixed(decimals)),
        changePercent24h: null,
        ...(observedAt !== undefined ? { observedAt } : {}),
        updatedAt: now,
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
        changePercent24h: null,
        ...(observedAt !== undefined ? { observedAt } : {}),
        updatedAt: now,
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
        gmtoffset?: number;
        regularMarketTime?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: Array<number | null>;
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

export function computeTechnicalIndicators(closes: readonly number[]): {
  ma50?: number;
  ma200?: number;
  rsi14?: number;
} {
  const clean = closes.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (clean.length < 15) return {};

  const ma50 =
    clean.length >= 50
      ? Number((clean.slice(-50).reduce((s, v) => s + v, 0) / 50).toFixed(2))
      : undefined;
  const ma200 =
    clean.length >= 200
      ? Number((clean.slice(-200).reduce((s, v) => s + v, 0) / 200).toFixed(2))
      : undefined;

  let avgGain = 0;
  let avgLoss = 0;
  const start = Math.max(1, clean.length - 60);
  const firstEnd = Math.min(clean.length, start + 14);
  const initPeriod = Math.max(1, firstEnd - start);

  for (let i = start; i < firstEnd; i++) {
    const diff = clean[i] - clean[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= initPeriod;
  avgLoss /= initPeriod;

  for (let i = firstEnd; i < clean.length; i++) {
    const diff = clean[i] - clean[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }

  const rsi14 =
    avgLoss <= 1e-9 ? (avgGain <= 1e-9 ? 50 : 100) : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));

  return {
    ...(ma50 !== undefined ? { ma50 } : {}),
    ...(ma200 !== undefined ? { ma200 } : {}),
    rsi14,
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

  const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
  const lastCloseIndex = rawCloses.findLastIndex((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  // While today's daily bar is still empty (seen on Nikkei / Hang Seng), the latest close IS the
  // previous session; stepping back one more would report a two-day move as today's.
  const exchangeDay = (t: number | undefined) =>
    t === undefined ? undefined : Math.floor((t + (result.meta?.gmtoffset ?? 0)) / 86_400);
  const lastBarDay = exchangeDay(result.timestamp?.[lastCloseIndex] ?? undefined);
  const quoteDay = exchangeDay(result.meta?.regularMarketPrice != null ? (result.meta.regularMarketTime ?? undefined) : undefined);
  const latestBarIsEarlier = lastBarDay !== undefined && quoteDay !== undefined && lastBarDay < quoteDay;
  const prev = Number(
    result.meta?.previousClose ??
      (latestBarIsEarlier ? closes[closes.length - 1] : closes.length >= 2 ? closes[closes.length - 2] : undefined) ??
      result.meta?.chartPreviousClose,
  );
  const changePct =
    Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null;
  const tech = computeTechnicalIndicators(closes);
  const marketTime = result.meta?.regularMarketPrice != null
    ? result.meta.regularMarketTime
    : result.timestamp?.[lastCloseIndex];
  const observedAt = typeof marketTime === 'number' && Number.isFinite(marketTime) &&
    marketTime > 0 && marketTime * 1000 <= now ? marketTime * 1000 : undefined;

  return {
    symbol: displaySymbol,
    name,
    group,
    price: Number(price.toFixed(price >= 100 ? 2 : 3)),
    changePercent24h: changePct === null ? null : Number(changePct.toFixed(2)),
    unit,
    sparkline: closes.length >= 2 ? closes.slice(-10).map((v) => Number(v.toFixed(2))) : undefined,
    ...tech,
    ...(observedAt !== undefined ? { observedAt } : {}),
    updatedAt: now,
    source: 'Yahoo Finance Chart v8',
  };
}

// 1 lượng (cây vàng Việt Nam) = 37.5 grams = 1.205653027 troy ounces
