import type {
  Vn30StockQuote,
  VnGoldQuote,
} from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout } from '../../lib/http';
import { computeTechnicalIndicators } from './fx-yahoo';

export const MIHONG_GOLD_URL = 'https://api.mihong.vn/v1/gold-prices?market=domestic';
export const TROY_OZ_PER_LUONG = 1.205653;

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

export const GOLD_CODE_LABELS: Record<string, string> = {
  SJC: 'Vàng miếng SJC 999.9',
  '999': 'Vàng nhẫn tròn 999.9',
  '985': 'Vàng nữ trang 98.5% (24K)',
  '750': 'Vàng tây 18K (750)',
};

function parseMihongDateTime(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const [, dayText, monthText, yearText, hourText, minuteText, secondText = '0'] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const localTime = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(localTime);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return undefined;
  return localTime - 7 * 3_600_000;
}

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
    const observedAt = parseMihongDateTime(row.dateTime);

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
      ...(observedAt !== undefined ? { observedAt } : {}),
      updatedAt: now,
      source: 'Mi Hồng / SJC Live Domestic',
    });
  }

  return out;
}

export async function fetchVietnamDomesticGold(
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

// ponytail: constituents checked against SSI iboard (group VN30) on 27/11/2026. HOSE reviews the basket
// twice a year; update this list then, or fetch it live if that proves too easy to forget.
export const VN30_LEADERS: readonly Vn30Target[] = [
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
  { symbol: 'ACB', name: 'ACB', sector: 'Ngân hàng' },
  { symbol: 'BSR', name: 'Lọc hóa dầu Bình Sơn', sector: 'Dầu khí · Năng lượng' },
  { symbol: 'CTG', name: 'VietinBank', sector: 'Ngân hàng' },
  { symbol: 'GVR', name: 'Tập đoàn Cao su VN', sector: 'Cao su · Công nghiệp' },
  { symbol: 'HDB', name: 'HDBank', sector: 'Ngân hàng' },
  { symbol: 'LPB', name: 'LPBank', sector: 'Ngân hàng' },
  { symbol: 'MCH', name: 'Masan Consumer', sector: 'Tiêu dùng' },
  { symbol: 'MSN', name: 'Tập đoàn Masan', sector: 'Tiêu dùng' },
  { symbol: 'SAB', name: 'Sabeco', sector: 'Tiêu dùng' },
  { symbol: 'SHB', name: 'SHB', sector: 'Ngân hàng' },
  { symbol: 'SSB', name: 'SeABank', sector: 'Ngân hàng' },
  { symbol: 'SSI', name: 'Chứng khoán SSI', sector: 'Chứng khoán' },
  { symbol: 'STB', name: 'Sacombank', sector: 'Ngân hàng' },
  { symbol: 'TCX', name: 'Chứng khoán Kỹ Thương', sector: 'Chứng khoán' },
  { symbol: 'VIB', name: 'VIB', sector: 'Ngân hàng' },
  { symbol: 'VJC', name: 'Vietjet Air', sector: 'Hàng không' },
  { symbol: 'VNM', name: 'Vinamilk', sector: 'Tiêu dùng' },
  { symbol: 'VPB', name: 'VPBank', sector: 'Ngân hàng' },
  { symbol: 'VPL', name: 'Vinpearl', sector: 'Du lịch · Nghỉ dưỡng' },
  { symbol: 'VRE', name: 'Vincom Retail', sector: 'Bất động sản' },
];

export interface VndDchartPayload {
  c?: number[];
  v?: number[];
  t?: number[];
  s?: string;
}

export function dchartObservationTime(payload: VndDchartPayload, minPrice: number, now: number): number | undefined {
  const index = (payload.c ?? []).reduce((last, value, i) =>
    typeof value === 'number' && Number.isFinite(value) && value > minPrice ? i : last, -1);
  const seconds = payload.t?.[index];
  const timestamp = typeof seconds === 'number' ? seconds * 1000 : NaN;
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now ? timestamp : undefined;
}

export function normalizeVn30DchartQuote(
  target: Vn30Target,
  payload: VndDchartPayload,
  now = Date.now(),
): Vn30StockQuote | null {
  const closes = (payload?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (closes.length === 0) return null;

  const latest = closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : undefined;
  const changePct = prev !== undefined ? ((latest - prev) / prev) * 100 : null;
  const latestIndex = (payload.c ?? []).findLastIndex((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const latestVol = payload.v?.[latestIndex];
  const tech = computeTechnicalIndicators(closes);

  return {
    symbol: target.symbol,
    name: target.name,
    sector: target.sector,
    priceThousandVnd: Number(latest.toFixed(2)),
    changePercent: changePct === null ? null : Number(changePct.toFixed(2)),
    volume: typeof latestVol === 'number' && Number.isFinite(latestVol) && latestVol >= 0 ? latestVol : null,
    sparkline: closes.slice(-10).map((c) => Number(c.toFixed(2))),
    ...tech,
    observedAt: dchartObservationTime(payload, 0, now),
    updatedAt: now,
  };
}

export async function fetchVn30Leaders(now: number): Promise<Vn30StockQuote[]> {
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

