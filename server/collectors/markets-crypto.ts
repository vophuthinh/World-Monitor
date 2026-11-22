import type {
  CryptoQuote,
  FearGreedSnapshot,
  FredMacroMetric,
  MarketQuote,
  MarketSnapshot,
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
    sparkline: closes.length >= 2 ? closes.slice(-10).map((v) => Number(v.toFixed(2))) : undefined,
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

  return {
    symbol: target.symbol,
    name: target.name,
    sector: target.sector,
    priceThousandVnd: Number(latest.toFixed(2)),
    changePercent: Number(changePct.toFixed(2)),
    volume: Number.isFinite(latestVol) ? latestVol : 0,
    sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
    updatedAt: now,
  };
}

async function fetchVn30Leaders(now: number): Promise<Vn30StockQuote[]> {
  const toSec = Math.floor(now / 1000);
  const fromSec = toSec - 15 * 86_400;

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
    id: 'UNRATE',
    label: 'US Unemployment',
    subtitle: 'Tỷ lệ Thất nghiệp Mỹ',
    unit: '%',
    pillar: 'monetary',
    benchmarkLabel: 'Toàn dụng (NAIRU)',
    benchmarkValue: 4.2,
  },

  // Forward-Looking Leading Investment Indicators (3–9 Month Horizon)
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
    id: 'WALCL',
    label: 'Fed Assets YoY',
    subtitle: 'Bảng Cân đối Kế toán Fed (QE/QT)',
    unit: '%',
    unitsParam: 'pc1',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng mở rộng',
    benchmarkValue: 0.0,
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
  const change = Number((latest.num - prev.num).toFixed(2));
  const chronological = valid
    .slice(0, 10)
    .reverse()
    .map((x) => Number(x.num.toFixed(2)));

  const slice3 = valid.slice(0, Math.min(3, valid.length));
  const slice12 = valid.slice(0, Math.min(12, valid.length));
  const avg3m = Number((slice3.reduce((s, x) => s + x.num, 0) / slice3.length).toFixed(2));
  const avg12m = Number((slice12.reduce((s, x) => s + x.num, 0) / slice12.length).toFixed(2));
  const trendSlope = Number((avg3m - avg12m).toFixed(2));

  let alertBadge: string | undefined;
  if (target.id === 'T10Y2Y' && latest.num < 0) {
    alertBadge = 'ĐẢO NGƯỢC (CẢNH BÁO SUY THOÁI)';
  } else if (target.id === 'VIXCLS' && latest.num >= 25) {
    alertBadge = 'BIẾN ĐỘNG CAO';
  } else if (target.id === 'CPIAUCSL' && latest.num >= 3.5) {
    alertBadge = 'VƯỢT MỤC TIÊU FED 2%';
  } else if (target.id === 'PPIFIS' && latest.num >= 4.5) {
    alertBadge = 'CHI PHÍ ĐẦU VÀO TĂNG';
  }

  return {
    id: target.id,
    label: target.label,
    subtitle: target.subtitle,
    value: Number(latest.num.toFixed(2)),
    change,
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
  // Fetch in smooth batches of 7 to avoid upstream burst throttling
  for (let i = 0; i < FRED_SERIES_TARGETS.length; i += 7) {
    const batch = FRED_SERIES_TARGETS.slice(i, i + 7);
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
  group: 'index' | 'commodity';
  unit?: string;
}

const YAHOO_TARGETS: readonly YahooTarget[] = [
  { yahooSymbol: '^GSPC', displaySymbol: 'S&P 500', name: 'S&P 500 Index (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^IXIC', displaySymbol: 'NASDAQ', name: 'NASDAQ Composite (US)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^SOX', displaySymbol: 'SOX Semi', name: 'PHLX Semiconductor (Bán dẫn AI)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^N225', displaySymbol: 'Nikkei 225', name: 'Nikkei 225 (Nhật Bản)', group: 'index', unit: 'pts' },
  { yahooSymbol: '^HSI', displaySymbol: 'Hang Seng', name: 'Hang Seng Index (HK)', group: 'index', unit: 'pts' },
  { yahooSymbol: 'GC=F', displaySymbol: 'Gold', name: 'Vàng thế giới (COMEX)', group: 'commodity', unit: 'USD/oz' },
  { yahooSymbol: 'HG=F', displaySymbol: 'Copper', name: 'Đồng công nghiệp (Dr. Copper)', group: 'commodity', unit: 'USD/lb' },
  { yahooSymbol: 'CL=F', displaySymbol: 'WTI Crude', name: 'Dầu thô WTI', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'BZ=F', displaySymbol: 'Brent Crude', name: 'Dầu thô Brent', group: 'commodity', unit: 'USD/bbl' },
  { yahooSymbol: 'SI=F', displaySymbol: 'Silver', name: 'Bạc thế giới', group: 'commodity', unit: 'USD/oz' },
];

async function fetchVietnamIndexQuote(now: number): Promise<MarketQuote | null> {
  // Primary: VNDirect DChart daily feed for HOSE VNINDEX
  try {
    const toSec = Math.floor(now / 1000);
    const fromSec = toSec - 16 * 86_400;
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
        sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
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
      const sparkline = lines
        .slice(-10)
        .map((l) => Number(l.split(',')[4]))
        .filter((v) => Number.isFinite(v) && v > 100);
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
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(target.yahooSymbol)}?interval=1d&range=7d`;
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

  const [cryptoRes, fgRes, fxRes, marketQuotesRes, vn30Res, fredRes] = await Promise.allSettled([
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
    updatedAt: now,
  };
}
