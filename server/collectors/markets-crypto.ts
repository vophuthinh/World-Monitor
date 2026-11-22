import type {
  CryptoQuote,
  FearGreedSnapshot,
  FredMacroMetric,
  MarketQuote,
  MarketSnapshot,
  VietnamLiveMacroPulse,
  Vn30StockQuote,
  VnGoldQuote,
} from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,tron,tether,usd-coin&order=market_cap_desc&sparkline=false&price_change_percentage=24h';
const COINPAPRIKA_FALLBACK_URL = 'https://api.coinpaprika.com/v1/tickers?quotes=USD';
const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const ER_API_USD_URL = 'https://open.er-api.com/v6/latest/USD';
const MIHONG_GOLD_URL = 'https://api.mihong.vn/v1/gold-prices?market=domestic';

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
  ['usdt-tether', 'tether'],
  ['usdc-usd-coin', 'usd-coin'],
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
    avgLoss <= 1e-9 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));

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

  const prev = Number(
    result.meta?.previousClose ??
      (closes.length >= 2 ? closes[closes.length - 2] : undefined) ??
      result.meta?.chartPreviousClose ??
      price,
  );
  const changePct =
    Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
  const tech = computeTechnicalIndicators(closes);

  return {
    symbol: displaySymbol,
    name,
    group,
    price: Number(price.toFixed(price >= 100 ? 2 : 3)),
    changePercent24h: Number(changePct.toFixed(2)),
    unit,
    sparkline: closes.length >= 2 ? closes.slice(-10).map((v) => Number(v.toFixed(2))) : undefined,
    ...tech,
    updatedAt: now,
    source: 'Yahoo Finance Chart v8',
  };
}

// 1 lượng (cây vàng Việt Nam) = 37.5 grams = 1.205653027 troy ounces
const TROY_OZ_PER_LUONG = 1.205653;

export function computeWorldGoldLuongMillionVnd(
  goldUsdPerOz?: number,
  usdVnd?: number,
): number | undefined {
  if (
    typeof goldUsdPerOz !== 'number' ||
    !Number.isFinite(goldUsdPerOz) ||
    goldUsdPerOz <= 0 ||
    typeof usdVnd !== 'number' ||
    !Number.isFinite(usdVnd) ||
    usdVnd <= 0
  ) {
    return undefined;
  }
  return Number(((goldUsdPerOz * TROY_OZ_PER_LUONG * usdVnd) / 1_000_000).toFixed(2));
}

export interface MihongGoldItem {
  code?: string;
  buyingPrice?: number;
  sellingPrice?: number;
  buyChangePercent?: number;
  sellChangePercent?: number;
  dateTime?: string;
}

const GOLD_CODE_LABELS: Record<string, string> = {
  SJC: 'Vàng miếng SJC 999.9',
  '999': 'Vàng nhẫn tròn 999.9',
  '985': 'Vàng nữ trang 98.5% (24K)',
  '750': 'Vàng tây 18K (750)',
};

export function normalizeMihongGoldPrices(
  items: MihongGoldItem[],
  goldUsdPerOz?: number,
  usdVnd?: number,
  now = Date.now(),
): VnGoldQuote[] {
  if (!Array.isArray(items)) return [];
  const worldParity = computeWorldGoldLuongMillionVnd(goldUsdPerOz, usdVnd);
  const out: VnGoldQuote[] = [];

  for (const row of items) {
    const code = String(row.code ?? '').trim().toUpperCase();
    if (!GOLD_CODE_LABELS[code]) continue;

    const rawBuy = Number(row.buyingPrice);
    const rawSell = Number(row.sellingPrice);
    if (!Number.isFinite(rawBuy) || rawBuy <= 0 || !Number.isFinite(rawSell) || rawSell <= 0) {
      continue;
    }

    // Mi Hồng quotes VND per chỉ (1 lượng = 10 chỉ); if an upstream ever quotes per lượng (> 50,000,000), normalize seamlessly
    const buyMillion = rawBuy >= 50_000_000 ? rawBuy / 1_000_000 : (rawBuy * 10) / 1_000_000;
    const sellMillion = rawSell >= 50_000_000 ? rawSell / 1_000_000 : (rawSell * 10) / 1_000_000;
    const isPure999 = code === 'SJC' || code === '999';

    out.push({
      code,
      name: GOLD_CODE_LABELS[code],
      buyPerLuongMillionVnd: Number(buyMillion.toFixed(2)),
      sellPerLuongMillionVnd: Number(sellMillion.toFixed(2)),
      spreadMillionVnd: Number((sellMillion - buyMillion).toFixed(2)),
      changeBuyPercent: Number((Number(row.buyChangePercent) || 0).toFixed(2)),
      changeSellPercent: Number((Number(row.sellChangePercent) || 0).toFixed(2)),
      worldParityPerLuongMillionVnd: isPure999 ? worldParity : undefined,
      premiumVsWorldMillionVnd:
        isPure999 && worldParity !== undefined
          ? Number((sellMillion - worldParity).toFixed(2))
          : undefined,
      updatedLabel: row.dateTime,
      updatedAt: now,
      source: 'Mi Hồng / SJC Live Domestic',
    });
  }

  return out;
}

async function fetchVietnamDomesticGold(
  goldUsdPerOz?: number,
  usdVnd?: number,
  now = Date.now(),
): Promise<VnGoldQuote[]> {
  const rows = await fetchJsonWithTimeout<MihongGoldItem[]>(MIHONG_GOLD_URL, {
    timeoutMs: 7_500,
    retries: 1,
    userAgent: DEFAULT_BROWSER_UA,
    headers: { Accept: 'application/json' },
  });
  return normalizeMihongGoldPrices(rows, goldUsdPerOz, usdVnd, now);
}

export interface Vn30Target {
  symbol: string;
  name: string;
  sector: string;
}

const VN30_LEADERS: readonly Vn30Target[] = [
  { symbol: 'VCB', name: 'Vietcombank', sector: 'Ngân hàng' },
  { symbol: 'FPT', name: 'Tập đoàn FPT', sector: 'Công nghệ · AI' },
  { symbol: 'HPG', name: 'Thép Hòa Phát', sector: 'Thép · Công nghiệp' },
  { symbol: 'VHM', name: 'Vinhomes', sector: 'Bất động sản' },
  { symbol: 'VIC', name: 'Vingroup', sector: 'Đa ngành · Xe điện' },
  { symbol: 'BID', name: 'BIDV', sector: 'Ngân hàng' },
  { symbol: 'MBB', name: 'MBBank', sector: 'Ngân hàng' },
  { symbol: 'TCB', name: 'Techcombank', sector: 'Ngân hàng' },
  { symbol: 'MWG', name: 'Thế Giới Di Động', sector: 'Bán lẻ' },
  { symbol: 'GAS', name: 'PV GAS', sector: 'Dầu khí · Năng lượng' },
];

export interface VndDchartPayload {
  c?: number[];
  v?: number[];
  s?: string;
}

export function normalizeVn30DchartQuote(
  target: Vn30Target,
  payload: VndDchartPayload,
  now = Date.now(),
): Vn30StockQuote | null {
  const closes = (payload?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (closes.length === 0) return null;

  const latest = closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : latest;
  const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
  const volumes = payload?.v ?? [];
  const latestVol = Number(volumes[volumes.length - 1] ?? 0);
  const tech = computeTechnicalIndicators(closes);

  return {
    symbol: target.symbol,
    name: target.name,
    sector: target.sector,
    priceThousandVnd: Number(latest.toFixed(2)),
    changePercent: Number(changePct.toFixed(2)),
    volume: Number.isFinite(latestVol) ? latestVol : 0,
    sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
    ...tech,
    updatedAt: now,
  };
}

async function fetchVn30Leaders(now: number): Promise<Vn30StockQuote[]> {
  const toSec = Math.floor(now / 1000);
  const fromSec = toSec - 350 * 86_400;

  const results = await Promise.allSettled(
    VN30_LEADERS.map(async (target) => {
      const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${encodeURIComponent(target.symbol)}&from=${fromSec}&to=${toSec}`;
      const dchart = await fetchJsonWithTimeout<VndDchartPayload>(url, {
        timeoutMs: 6_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Accept: '*/*' },
      });
      return normalizeVn30DchartQuote(target, dchart, now);
    }),
  );

  const out: Vn30StockQuote[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      out.push(r.value);
    }
  }
  return out;
}

export interface SimplizeIndexValuation {
  peRatio?: number;
  pbRatio?: number;
  close52wLow?: number;
  close52wHigh?: number;
  volumeVs90dRatio?: number;
}

export function parseSimplizeIndexValuationHtml(html: string): SimplizeIndexValuation | null {
  if (!html) return null;
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) return null;

  try {
    const parsed = JSON.parse(nextMatch[1]) as {
      props?: {
        pageProps?: {
          summary?: {
            peRatio?: number;
            pbRatio?: number;
            close52wLow?: number;
            close52wHigh?: number;
            volume?: number;
            volAvg90d?: number;
          };
        };
      };
    };
    const s = parsed?.props?.pageProps?.summary;
    if (!s) return null;

    const pe = Number(s.peRatio);
    const pb = Number(s.pbRatio);
    const low52 = Number(s.close52wLow);
    const high52 = Number(s.close52wHigh);
    const vol = Number(s.volume);
    const vol90 = Number(s.volAvg90d);

    const out: SimplizeIndexValuation = {};
    if (Number.isFinite(pe) && pe > 2 && pe < 80) out.peRatio = Number(pe.toFixed(2));
    if (Number.isFinite(pb) && pb > 0.2 && pb < 20) out.pbRatio = Number(pb.toFixed(2));
    if (Number.isFinite(low52) && low52 > 100) out.close52wLow = Number(low52.toFixed(2));
    if (Number.isFinite(high52) && high52 > 100) out.close52wHigh = Number(high52.toFixed(2));
    if (Number.isFinite(vol) && Number.isFinite(vol90) && vol > 0 && vol90 > 0) {
      out.volumeVs90dRatio = Number((vol / vol90).toFixed(2));
    }

    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function fetchSimplizeVnIndexValuation(): Promise<SimplizeIndexValuation | null> {
  try {
    const { text } = await fetchTextWithTimeout('https://simplize.vn/chi-so/VNINDEX', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    });
    return parseSimplizeIndexValuationHtml(text);
  } catch {
    return null;
  }
}

export function parseTradingEconomicsVietnamHtml(
  indicatorsHtml: string,
  bondHtml = '',
): Partial<VietnamLiveMacroPulse> {
  const out: Partial<VietnamLiveMacroPulse> = {};

  if (bondHtml) {
    const bondMeta = bondHtml.match(
      /Vietnam\s+10Y?\s+(?:Government\s+)?Bond\s+Yield[\s\S]{0,120}?at\s+([0-9]+\.[0-9]+)\s*%/i,
    );
    if (bondMeta) {
      const y = Number(bondMeta[1]);
      if (Number.isFinite(y) && y > 0.5 && y < 20) out.vn10yYieldPct = Number(y.toFixed(2));
    }
  }

  if (indicatorsHtml) {
    const rowRe =
      /href=['"]\/vietnam\/([^'"]+)['"][^>]*>\s*([^<]+?)\s*<\/a>\s*<\/td>\s*<td[^>]*>\s*([-0-9.,]+)\s*<\/td>\s*<td[^>]*>\s*([-0-9.,]+)\s*<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(indicatorsHtml)) !== null) {
      const slug = m[1].toLowerCase().trim();
      const latest = Number(m[3].replace(/,/g, ''));
      const prev = Number(m[4].replace(/,/g, ''));
      if (!Number.isFinite(latest)) continue;

      if (slug === 'inflation-cpi' && latest > -10 && latest < 40) {
        out.monthlyCpiPct = Number(latest.toFixed(2));
        if (Number.isFinite(prev)) out.monthlyCpiPrevPct = Number(prev.toFixed(2));
      } else if (slug === 'manufacturing-pmi' && latest > 20 && latest < 85) {
        out.manufacturingPmi = Number(latest.toFixed(1));
        if (Number.isFinite(prev)) out.manufacturingPmiPrev = Number(prev.toFixed(1));
      } else if (slug === 'interbank-rate' && latest >= 0 && latest < 30) {
        out.interbankRatePct = Number(latest.toFixed(2));
      } else if (slug === 'interest-rate' && latest >= 0 && latest < 25) {
        out.sbvPolicyRatePct = Number(latest.toFixed(2));
      } else if (slug === 'gdp-growth-annual' && latest > -15 && latest < 25) {
        out.quarterlyGdpPct = Number(latest.toFixed(2));
        if (Number.isFinite(prev)) out.quarterlyGdpPrevPct = Number(prev.toFixed(2));
      } else if (slug === 'balance-of-trade' && Math.abs(latest) < 100) {
        out.tradeBalanceBillionUsd = Number(latest.toFixed(2));
      } else if (slug === 'government-bond-yield' && out.vn10yYieldPct === undefined && latest > 0.5 && latest < 20) {
        out.vn10yYieldPct = Number(latest.toFixed(2));
      }
    }
  }

  return out;
}

export function parseMultplSp500PeHtml(html: string): number | undefined {
  if (!html) return undefined;
  const match =
    html.match(/Current\s+S(?:&amp;|&)P\s+500\s+PE\s+Ratio[\s\S]{0,180}?([0-9]+\.[0-9]+)/i) ??
    html.match(/id=["']current["'][\s\S]{0,220}?([0-9]+\.[0-9]+)/i);
  if (!match) return undefined;
  const val = Number(match[1]);
  return Number.isFinite(val) && val > 5 && val < 90 ? Number(val.toFixed(2)) : undefined;
}

const VN_WORD_MONTHS: Record<string, number> = {
  một: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  năm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
  mười: 10,
  'mười một': 11,
  'mười hai': 12,
};

function extractRssItems(xml: string): Array<{ title: string; pubYear?: number }> {
  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (itemBlocks.length > 0) {
    const out: Array<{ title: string; pubYear?: number }> = [];
    for (const block of itemBlocks) {
      const inner = block[1];
      const titleMatch = inner.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      if (!titleMatch) continue;
      const pubMatch = inner.match(/<pubDate>([^<]+)<\/pubDate>/i);
      let pubYear: number | undefined;
      if (pubMatch) {
        const parsedTs = Date.parse(pubMatch[1].trim());
        if (Number.isFinite(parsedTs)) {
          pubYear = new Date(parsedTs + 7 * 3_600_000).getUTCFullYear();
        }
      }
      out.push({ title: titleMatch[1].trim(), pubYear });
    }
    return out;
  }
  return [...xml.matchAll(/<title>([^<]+)<\/title>/gi)].map((m) => ({ title: m[1].trim() }));
}

/**
 * Extracts official GSO cumulative YTD Average CPI (to compare apples-to-apples with the
 * National Assembly's full-year average CPI target), Core CPI, cumulative YTD Trade Balance,
 * and Vietcombank commercial USD sell rate — strictly guarded by statistical year & GSO release calendar
 * so prior-year (e.g. 11M 2025) headlines never leak into current-year (e.g. 10M 2026) metrics.
 */
export function parseVietnamOfficialYtdContext(params: {
  cpiRssXml?: string;
  tradeRssXml?: string;
  vcbFxXml?: string;
  now?: number;
}): Partial<VietnamLiveMacroPulse> {
  const out: Partial<VietnamLiveMacroPulse> = {};
  const vnNow = new Date((params.now ?? Date.now()) + 7 * 3_600_000);
  const currentYear = vnNow.getUTCFullYear();
  const currentMonth = vnNow.getUTCMonth() + 1;
  const dayOfMonth = vnNow.getUTCDate();

  // GSO releases cumulative M-month CPI around the 6th day of month M+1.
  // Before Feb 5 of a new year, multi-month YTD belongs to the prior year (12M); otherwise cap to published months of currentYear.
  const isEarlyNewYear = currentMonth === 1 || (currentMonth === 2 && dayOfMonth < 5);
  const targetStatYear = isEarlyNewYear ? currentYear - 1 : currentYear;
  const maxPublishedMonths = isEarlyNewYear
    ? 12
    : Math.max(2, currentMonth - (dayOfMonth < 5 ? 2 : 1));

  if (params.vcbFxXml) {
    const vcbMatch = params.vcbFxXml.match(/CurrencyCode=["']USD["'][^>]*Sell=["']([0-9,.]+)["']/i);
    if (vcbMatch) {
      const num = Number(vcbMatch[1].replace(/,/g, ''));
      if (Number.isFinite(num) && num > 18_000 && num < 40_000) {
        out.vcbSellUsdVnd = Math.round(num);
      }
    }
  }

  const isStaleItemYear = (rawTitle: string, pubYear?: number): boolean => {
    if (pubYear !== undefined && pubYear < targetStatYear) return true;
    const boundYearMatch = rawTitle.match(/(?:tháng(?:\s+đầu)?(?:\s+năm)?|năm|\/)\s*(20\d{2})\b/i);
    if (boundYearMatch && Number(boundYearMatch[1]) !== targetStatYear) return true;
    const allYears = [...rawTitle.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    if (allYears.length > 0 && !allYears.includes(targetStatYear)) return true;
    return false;
  };

  if (params.cpiRssXml) {
    const items = extractRssItems(params.cpiRssXml);
    let bestScore = -1;
    for (const { title: rawTitle, pubYear } of items) {
      if (isStaleItemYear(rawTitle, pubYear)) continue;
      const t = rawTitle.toLowerCase();
      let months = 0;
      const numMonthMatch = t.match(/\b(1[0-2]|[2-9])\s*tháng\b/);
      if (numMonthMatch) {
        months = Number(numMonthMatch[1]);
      } else {
        for (const [word, mVal] of Object.entries(VN_WORD_MONTHS)) {
          if (t.includes(`${word} tháng`)) {
            months = Math.max(months, mVal);
          }
        }
      }
      if (months < 2 || months > maxPublishedMonths) continue;

      const cpiMatch = rawTitle.match(/CPI[^0-9]{0,40}?tăng\s+([0-9]+[.,][0-9]+)\s*%/i);
      const coreMatch = rawTitle.match(/lạm\s+phát\s+cơ\s+bản[^0-9]{0,40}?([0-9]+[.,][0-9]+)\s*%/i);
      if (!cpiMatch) continue;

      const avgCpi = Number(cpiMatch[1].replace(',', '.'));
      if (!Number.isFinite(avgCpi) || avgCpi <= 0 || avgCpi >= 25) continue;

      const hasExplicitTargetYear = rawTitle.includes(String(targetStatYear));
      const candidateScore = months * 10 + (hasExplicitTargetYear ? 4 : 0) + (coreMatch ? 2 : 0);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        out.ytdCpiMonths = months;
        out.ytdAvgCpiPct = Number(avgCpi.toFixed(2));
        if (coreMatch) {
          const coreVal = Number(coreMatch[1].replace(',', '.'));
          if (Number.isFinite(coreVal) && coreVal > 0 && coreVal < 25) {
            out.ytdCoreCpiPct = Number(coreVal.toFixed(2));
          }
        } else {
          delete out.ytdCoreCpiPct;
        }
      }
    }
  }

  if (params.tradeRssXml) {
    const items = extractRssItems(params.tradeRssXml);
    for (const { title: rawTitle, pubYear } of items) {
      if (isStaleItemYear(rawTitle, pubYear)) continue;
      // Skip single-month headlines ("trong tháng 10/2026" or "Tháng 10/2026, xuất siêu...") so we only capture cumulative YTD balance
      if (/\btrong\s+tháng\s+\d+/i.test(rawTitle) || /^\s*tháng\s+\d+\b/i.test(rawTitle)) continue;
      const deficitMatch = rawTitle.match(/nhập\s+siêu[^0-9]{0,25}?([0-9]+[.,][0-9]+)\s*tỷ\s*USD/i);
      const surplusMatch = rawTitle.match(/xuất\s+siêu[^0-9]{0,25}?([0-9]+[.,][0-9]+)\s*tỷ\s*USD/i);
      if (deficitMatch) {
        const val = Number(deficitMatch[1].replace(',', '.'));
        if (Number.isFinite(val) && val > 0 && val < 100) {
          out.ytdTradeBalanceBillionUsd = -Number(val.toFixed(2));
          break;
        }
      } else if (surplusMatch && /\b\d+\s*tháng|cả\s+năm|đầu\s+năm\b/i.test(rawTitle)) {
        const val = Number(surplusMatch[1].replace(',', '.'));
        if (Number.isFinite(val) && val > 0 && val < 100) {
          out.ytdTradeBalanceBillionUsd = Number(val.toFixed(2));
          break;
        }
      }
    }
  }

  return out;
}

async function fetchVietnamAndGlobalMacroPulse(now: number): Promise<VietnamLiveMacroPulse | undefined> {
  const currentYear = new Date(now + 7 * 3_600_000).getUTCFullYear();
  const cpiRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `"tháng" "CPI tăng" "lạm phát cơ bản" ${currentYear}`,
  )}&hl=vi&gl=VN&ceid=VN:vi`;
  const tradeRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `("nhập siêu" OR "xuất siêu") "tỷ USD" "xuất nhập khẩu" ${currentYear} Việt Nam`,
  )}&hl=vi&gl=VN&ceid=VN:vi`;

  const [teIndRes, teBondRes, multplRes, cpiRssRes, tradeRssRes, vcbRes] = await Promise.allSettled([
    fetchTextWithTimeout('https://tradingeconomics.com/vietnam/indicators', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://tradingeconomics.com/vietnam/government-bond-yield', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://www.multpl.com/s-p-500-pe-ratio', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout(cpiRssUrl, {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout(tradeRssUrl, {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx', {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
  ]);

  const indHtml = teIndRes.status === 'fulfilled' ? teIndRes.value.text : '';
  const bondHtml = teBondRes.status === 'fulfilled' ? teBondRes.value.text : '';
  const multplHtml = multplRes.status === 'fulfilled' ? multplRes.value.text : '';
  const ytdContext = parseVietnamOfficialYtdContext({
    cpiRssXml: cpiRssRes.status === 'fulfilled' ? cpiRssRes.value.text : undefined,
    tradeRssXml: tradeRssRes.status === 'fulfilled' ? tradeRssRes.value.text : undefined,
    vcbFxXml: vcbRes.status === 'fulfilled' ? vcbRes.value.text : undefined,
    now,
  });

  const vnParsed = parseTradingEconomicsVietnamHtml(indHtml, bondHtml);
  const sp500PeRatio = parseMultplSp500PeHtml(multplHtml);

  const combined: VietnamLiveMacroPulse = {
    ...vnParsed,
    ...ytdContext,
    ...(sp500PeRatio !== undefined ? { sp500PeRatio } : {}),
    updatedAt: now,
  };

  return Object.keys(combined).length > 1 ? combined : undefined;
}

export interface FredSeriesTarget {
  id: string;
  label: string;
  subtitle: string;
  unit: string;
  unitsParam?: 'pc1';
  pillar: 'growth' | 'inflation' | 'monetary' | 'market' | 'leading';
  benchmarkLabel?: string;
  benchmarkValue?: number;
}

const FRED_SERIES_TARGETS: readonly FredSeriesTarget[] = [
  // Market Rates, Yield Curve & Volatility (displayed in quick FRED grid + used in Macro Health)
  {
    id: 'FEDFUNDS',
    label: 'Fed Funds Rate',
    subtitle: 'Lãi suất Điều hành Fed',
    unit: '%',
    pillar: 'monetary',
    benchmarkLabel: 'Trung tính Fed',
    benchmarkValue: 3.25,
  },
  { id: 'DGS10', label: 'US 10Y Yield', subtitle: 'Lợi suất Trái phiếu Mỹ 10 năm', unit: '%', pillar: 'market' },
  { id: 'DGS2', label: 'US 2Y Yield', subtitle: 'Lợi suất Trái phiếu Mỹ 2 năm', unit: '%', pillar: 'market' },
  {
    id: 'T10Y2Y',
    label: '10Y–2Y Spread',
    subtitle: 'Độ dốc Đường cong Lợi suất',
    unit: '%',
    pillar: 'monetary',
    benchmarkLabel: 'Ngưỡng dương',
    benchmarkValue: 0.0,
  },
  { id: 'VIXCLS', label: 'CBOE VIX', subtitle: 'Chỉ số Biến động Phố Wall', unit: 'pts', pillar: 'market' },
  { id: 'DTWEXBGS', label: 'Broad USD (DXY)', subtitle: 'Chỉ số Sức mạnh Đồng USD', unit: 'idx', pillar: 'market' },

  // 3 Core Macroeconomic Health Pillars (Growth/Production · Inflation/Costs · Labor)
  {
    id: 'A191RL1Q225SBEA',
    label: 'US Real GDP',
    subtitle: 'Tăng trưởng GDP thực (Quý SAAR)',
    unit: '%',
    pillar: 'growth',
    benchmarkLabel: 'Dự báo IMF/Fed',
    benchmarkValue: 2.1,
  },
  {
    id: 'RSAFS',
    label: 'Retail Sales YoY',
    subtitle: 'Doanh số Bán lẻ Mỹ (68% GDP · YoY)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'growth',
    benchmarkLabel: 'Cầu tiêu dùng',
    benchmarkValue: 3.5,
  },
  {
    id: 'INDPRO',
    label: 'Industrial Prod YoY',
    subtitle: 'Sản xuất Công nghiệp (YoY)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'growth',
    benchmarkLabel: 'TB mở rộng',
    benchmarkValue: 1.5,
  },
  {
    id: 'NEWORDER',
    label: 'Factory Orders YoY',
    subtitle: 'Đơn hàng Mới Nhà máy (Leading PMI)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'growth',
    benchmarkLabel: 'Ngưỡng mở rộng',
    benchmarkValue: 2.0,
  },
  {
    id: 'PCEPILFE',
    label: 'Core PCE YoY',
    subtitle: 'Lạm phát Lõi Core PCE (Thước đo FOMC)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'inflation',
    benchmarkLabel: 'Mục tiêu FOMC',
    benchmarkValue: 2.0,
  },
  {
    id: 'CPIAUCSL',
    label: 'US CPI YoY',
    subtitle: 'Lạm phát Tiêu dùng CPI (YoY)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'inflation',
    benchmarkLabel: 'Mục tiêu Fed',
    benchmarkValue: 2.0,
  },
  {
    id: 'PPIFIS',
    label: 'US PPI YoY',
    subtitle: 'Chỉ số Giá Sản xuất PPI (YoY)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'inflation',
    benchmarkLabel: 'Ngưỡng ổn định',
    benchmarkValue: 2.5,
  },
  {
    id: 'T5YIFR',
    label: '5Y5Y Forward Infl',
    subtitle: 'Kỳ vọng Lạm phát Dài hạn 5Y5Y (Ngày)',
    unit: '%',
    pillar: 'inflation',
    benchmarkLabel: 'Neo kỳ vọng Fed',
    benchmarkValue: 2.25,
  },
  {
    id: 'T10YIE',
    label: '10Y Breakeven',
    subtitle: 'Kỳ vọng Lạm phát Hòa vốn 10Y (Ngày)',
    unit: '%',
    pillar: 'inflation',
    benchmarkLabel: 'Neo trái phiếu',
    benchmarkValue: 2.25,
  },
  {
    id: 'UNRATE',
    label: 'US Unemployment',
    subtitle: 'Tỷ lệ Thất nghiệp Mỹ',
    unit: '%',
    pillar: 'monetary',
    benchmarkLabel: 'Toàn dụng (NAIRU)',
    benchmarkValue: 4.2,
  },

  // Forward-Looking Quant v2.0 Indicators (Net Liquidity · NY Fed Probit · Stress · Credit)
  {
    id: 'WALCL',
    label: 'Fed Total Assets',
    subtitle: 'Tổng Tài sản Fed (WALCL · Triệu USD)',
    unit: 'M$',
    pillar: 'leading',
  },
  {
    id: 'WTREGEN',
    label: 'Treasury TGA',
    subtitle: 'Tài khoản Kho bạc Mỹ TGA (Triệu USD)',
    unit: 'M$',
    pillar: 'leading',
  },
  {
    id: 'RRPONTSYD',
    label: 'Overnight RRP',
    subtitle: 'Reverse Repo Qua đêm Fed (Tỷ USD)',
    unit: 'B$',
    pillar: 'leading',
  },
  {
    id: 'M2SL',
    label: 'US M2 Money YoY',
    subtitle: 'Tăng trưởng Cung tiền M2 (YoY)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng bơm tiền',
    benchmarkValue: 4.0,
  },
  {
    id: 'NFCI',
    label: 'Chicago Fed NFCI',
    subtitle: 'Chỉ số Điều kiện Tài chính (<0 Nới lỏng)',
    unit: 'idx',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng thắt chặt',
    benchmarkValue: 0.0,
  },
  {
    id: 'STLFSI4',
    label: 'St. Louis Stress',
    subtitle: 'Chỉ số Căng thẳng Tài chính (18 biến)',
    unit: 'idx',
    pillar: 'leading',
    benchmarkLabel: 'Mức trung bình',
    benchmarkValue: 0.0,
  },
  {
    id: 'BAMLH0A0HYM2',
    label: 'HY Credit Spread',
    subtitle: 'Chênh lệch Tín dụng Rủi ro cao',
    unit: '%',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng cảnh báo',
    benchmarkValue: 4.5,
  },
  {
    id: 'DFII10',
    label: '10Y Real Yield',
    subtitle: 'Lãi suất Thực Mỹ 10 năm (TIPS)',
    unit: '%',
    pillar: 'leading',
    benchmarkLabel: 'Trung tính thực',
    benchmarkValue: 1.8,
  },
  {
    id: 'T10Y3M',
    label: '10Y–3M Spread',
    subtitle: 'Độ dốc 10Y–3M (Mô hình Suy thoái NY Fed)',
    unit: '%',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng dương',
    benchmarkValue: 0.0,
  },
  {
    id: 'SAHMREALTIME',
    label: 'Sahm Recession Rule',
    subtitle: 'Quy tắc Báo động Suy thoái Sahm',
    unit: 'pts',
    pillar: 'leading',
    benchmarkLabel: 'Báo động suy thoái',
    benchmarkValue: 0.5,
  },
  {
    id: 'ICSA',
    label: 'Jobless Claims',
    subtitle: 'Đơn Trợ cấp Thất nghiệp Tuần',
    unit: 'đơn',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng an toàn',
    benchmarkValue: 250000,
  },
  {
    id: 'PERMIT',
    label: 'Building Permits YoY',
    subtitle: 'Giấy phép Xây dựng Nhà mới (Leading BĐS)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'leading',
    benchmarkLabel: 'Mở rộng BĐS',
    benchmarkValue: 0.0,
  },
  {
    id: 'DRTSCILM',
    label: 'Bank Loan Tightening',
    subtitle: 'Ngân hàng Siết Chuẩn Tín dụng DN (SLOOS)',
    unit: '%',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng siết vốn',
    benchmarkValue: 15.0,
  },
];

export interface FredObservationsPayload {
  observations?: Array<{
    date?: string;
    value?: string;
  }>;
}

export function normalizeFredObservationSeries(
  target: FredSeriesTarget,
  payload: FredObservationsPayload,
): FredMacroMetric | null {
  const valid = (payload?.observations ?? [])
    .map((o) => ({
      date: String(o.date ?? ''),
      num: Number(o.value),
    }))
    .filter((o) => o.date && Number.isFinite(o.num));

  if (valid.length === 0) return null;

  // FRED sort_order=desc returns newest first
  const latest = valid[0];
  const prev = valid.length >= 2 ? valid[1] : latest;
  const prev4 = valid.length >= 5 ? valid[4] : valid[valid.length - 1];
  const change = Number((latest.num - prev.num).toFixed(2));
  const delta4p = prev4 ? Number((latest.num - prev4.num).toFixed(2)) : 0;
  const chronological = valid
    .slice(0, 10)
    .reverse()
    .map((x) => Number(x.num.toFixed(2)));

  const slice3 = valid.slice(0, Math.min(3, valid.length));
  const slice12 = valid.slice(0, Math.min(12, valid.length));
  const mean12Raw = slice12.reduce((s, x) => s + x.num, 0) / slice12.length;
  const avg3m = Number((slice3.reduce((s, x) => s + x.num, 0) / slice3.length).toFixed(2));
  const avg12m = Number(mean12Raw.toFixed(2));
  const trendSlope = Number((avg3m - avg12m).toFixed(2));

  const variance12 =
    slice12.length >= 4
      ? slice12.reduce((acc, x) => acc + (x.num - mean12Raw) ** 2, 0) / slice12.length
      : 0;
  const std12 = Math.sqrt(variance12);
  const zScore =
    slice12.length >= 4 && std12 > 1e-6
      ? Number(Math.max(-3.5, Math.min(3.5, (latest.num - mean12Raw) / std12)).toFixed(2))
      : undefined;

  let alertBadge: string | undefined;
  if ((target.id === 'T10Y2Y' || target.id === 'T10Y3M') && latest.num < 0) {
    alertBadge = 'ĐẢO NGƯỢC (CẢNH BÁO SUY THOÁI)';
  } else if (target.id === 'VIXCLS' && latest.num >= 25) {
    alertBadge = 'BIẾN ĐỘNG CAO';
  } else if (target.id === 'PCEPILFE' && latest.num >= 2.8) {
    alertBadge = 'VƯỢT MỤC TIÊU FOMC 2%';
  } else if (target.id === 'CPIAUCSL' && latest.num >= 3.5) {
    alertBadge = 'VƯỢT MỤC TIÊU FED 2%';
  } else if (target.id === 'PPIFIS' && latest.num >= 4.5) {
    alertBadge = 'CHI PHÍ ĐẦU VÀO TĂNG';
  } else if (target.id === 'STLFSI4' && latest.num >= 0.5) {
    alertBadge = 'STRESS TÀI CHÍNH CAO';
  }

  return {
    id: target.id,
    label: target.label,
    subtitle: target.subtitle,
    value: Number(latest.num.toFixed(2)),
    change,
    delta4p,
    ...(zScore !== undefined ? { zScore } : {}),
    unit: target.unit,
    date: latest.date,
    pillar: target.pillar,
    ...(target.benchmarkLabel ? { benchmarkLabel: target.benchmarkLabel } : {}),
    ...(target.benchmarkValue !== undefined ? { benchmarkValue: target.benchmarkValue } : {}),
    avg3m,
    avg12m,
    trendSlope,
    alertBadge,
    sparkline: chronological,
  };
}

async function fetchFredMacroMetrics(): Promise<FredMacroMetric[]> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) return [];

  const out: FredMacroMetric[] = [];
  // Fetch in smooth batches of 9 to avoid upstream burst throttling
  for (let i = 0; i < FRED_SERIES_TARGETS.length; i += 9) {
    const batch = FRED_SERIES_TARGETS.slice(i, i + 9);
    const results = await Promise.allSettled(
      batch.map(async (target) => {
        const unitsPart = target.unitsParam ? `&units=${target.unitsParam}` : '';
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(target.id)}&api_key=${encodeURIComponent(apiKey)}${unitsPart}&file_type=json&sort_order=desc&limit=16`;
        const payload = await fetchJsonWithTimeout<FredObservationsPayload>(url, {
          timeoutMs: 8_000,
          retries: 1,
          userAgent: NAMED_APP_UA,
        });
        return normalizeFredObservationSeries(target, payload);
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        out.push(r.value);
      }
    }
  }
  return out;
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
