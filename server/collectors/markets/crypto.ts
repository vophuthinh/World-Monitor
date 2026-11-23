import type {
  CryptoQuote,
  FearGreedSnapshot,
} from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../../lib/http';

export const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,tron,tether,usd-coin&order=market_cap_desc&sparkline=false&price_change_percentage=24h';
export const COINPAPRIKA_FALLBACK_URL = 'https://api.coinpaprika.com/v1/tickers?quotes=USD';
export interface CoinGeckoItem {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number | null;
  price_change_percentage_24h?: number | null;
  market_cap?: number | null;
  total_volume?: number | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCoinGeckoMarkets(items: CoinGeckoItem[], now = Date.now()): CryptoQuote[] {
  if (!Array.isArray(items)) {
    throw new Error('Malformed CoinGecko markets array');
  }
  const out: CryptoQuote[] = [];
  for (const item of items) {
    const price = Number(item.current_price);
    if (!item.id || !Number.isFinite(price) || price <= 0) continue;
    const change = finiteNumber(item.price_change_percentage_24h);
    out.push({
      id: item.id,
      symbol: String(item.symbol ?? item.id).toUpperCase(),
      name: item.name || item.id,
      priceUsd: price,
      changePercent24h: change === null ? null : Number(change.toFixed(2)),
      marketCapUsd: finiteNumber(item.market_cap),
      volume24hUsd: finiteNumber(item.total_volume),
      updatedAt: now,
      marketDataFetchedAt: now,
    });
  }
  return out;
}

export const PAPRIKA_TARGETS = new Map<string, string>([
  ['btc-bitcoin', 'bitcoin'],
  ['eth-ethereum', 'ethereum'],
  ['sol-solana', 'solana'],
  ['bnb-binance-coin', 'binancecoin'],
  ['xrp-xrp', 'ripple'],
  ['doge-dogecoin', 'dogecoin'],
  ['ada-cardano', 'cardano'],
  ['trx-tron', 'tron'],
  ['usdt-tether', 'tether'],
  ['usdc-usd-coin', 'usd-coin'],
]);

export async function fetchCryptoQuotes(now: number): Promise<CryptoQuote[]> {
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
    const change = finiteNumber(usd?.percent_change_24h);
    out.push({
      id: PAPRIKA_TARGETS.get(row.id)!,
      symbol: String(row.symbol ?? '').toUpperCase(),
      name: row.name ?? row.id,
      priceUsd: price,
      changePercent24h: change === null ? null : Number(change.toFixed(2)),
      marketCapUsd: finiteNumber(usd?.market_cap),
      volume24hUsd: finiteNumber(usd?.volume_24h),
      updatedAt: now,
      marketDataFetchedAt: now,
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
  if (!Number.isFinite(rawTs) || rawTs <= 0 || rawTs * 1000 > now) return null;
  return {
    value: Math.round(val),
    classification: entry.value_classification || 'Neutral',
    updatedAt: rawTs * 1000,
  };
}

