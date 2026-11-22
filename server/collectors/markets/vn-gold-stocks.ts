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

