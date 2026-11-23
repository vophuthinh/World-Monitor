import type { MarketSnapshot, VietnamMacroPulseFieldKey } from '../types';

const DAY = 86_400_000;
const FRED_DAILY = new Set(['DGS10', 'DGS2', 'T10Y2Y', 'VIXCLS', 'DTWEXBGS', 'T5YIFR', 'T10YIE', 'RRPONTSYD', 'BAMLH0A0HYM2', 'DFII10']);
const FRED_WEEKLY = new Set(['WALCL', 'WTREGEN', 'NFCI', 'STLFSI4', 'ICSA']);
const FRED_QUARTERLY = new Set(['A191RL1Q225SBEA', 'DRTSCILM']);
const FRED_MONTHLY = new Set(['FEDFUNDS', 'RSAFS', 'INDPRO', 'NEWORDER', 'PCEPILFE', 'CPIAUCSL', 'PPIFIS', 'UNRATE', 'M2SL', 'T10Y3M', 'GS10', 'TB3MS', 'SAHMREALTIME', 'PERMIT']);

const VN_FIELDS: Partial<Record<VietnamMacroPulseFieldKey, { label: string; days: number }>> = {
  quarterlyGdpPct: { label: 'GDP quý', days: 240 },
  manufacturingPmi: { label: 'PMI sản xuất', days: 120 },
  monthlyCpiPct: { label: 'CPI tháng', days: 120 },
  ytdAvgCpiPct: { label: 'CPI bình quân lũy kế', days: 120 },
  ytdCoreCpiPct: { label: 'CPI lõi lũy kế', days: 120 },
  tradeBalanceBillionUsd: { label: 'Cán cân thương mại tháng', days: 120 },
  ytdTradeBalanceBillionUsd: { label: 'Cán cân thương mại lũy kế', days: 120 },
  interbankRatePct: { label: 'Lãi suất liên ngân hàng', days: 30 },
  vn10yYieldPct: { label: 'Lợi suất TPCP 10 năm', days: 30 },
};

function vietnamPeriod(period: string | undefined): { start: number; end: number } | undefined {
  const date = period?.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (date) {
    const day = Number(date[1]);
    const month = Number(date[2]);
    const year = Number(date[3]);
    const ms = Date.UTC(year, month - 1, day);
    const result = new Date(ms);
    return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day
      ? { start: ms, end: ms } : undefined;
  }
  const month = period?.match(/^(?:T(\d{1,2})|(\d{1,2})T)\/(20\d{2})$/);
  if (month) {
    const m = Number(month[1] ?? month[2]);
    return m >= 1 && m <= 12
      ? { start: Date.UTC(Number(month[3]), m - 1, 1), end: Date.UTC(Number(month[3]), m, 0) }
      : undefined;
  }
  const quarter = period?.match(/^Q([1-4])\/(20\d{2})$/);
  return quarter
    ? { start: Date.UTC(Number(quarter[2]), (Number(quarter[1]) - 1) * 3, 1), end: Date.UTC(Number(quarter[2]), Number(quarter[1]) * 3, 0) }
    : undefined;
}

export function collectObservationWarnings(markets: MarketSnapshot, now = Date.now()): { vn: string[]; us: string[] } {
  const vn: string[] = [];
  const us: string[] = [];
  const pulse = markets.vnMacroPulse;
  if (pulse) {
    for (const [rawKey, info] of Object.entries(VN_FIELDS)) {
      const key = rawKey as VietnamMacroPulseFieldKey;
      if (!info || pulse[key] === undefined) continue;
      const period = pulse.fieldMeta?.[key]?.period;
      const bounds = vietnamPeriod(period);
      if (!bounds || bounds.start > now + DAY || now - bounds.end > info.days * DAY) {
        vn.push(`${info.label}: ${period ?? 'không rõ kỳ'}`);
      }
      const vnRow = markets.macro.find((row) => row.countryCode === 'VNM' || row.isVietnam);
      if (vnRow) {
        const annual: Array<[string, number | null | undefined, number | null | undefined]> = [
          ['GDP World Bank', vnRow.gdpGrowthPct, vnRow.gdpGrowthYear],
          ['CPI World Bank', vnRow.cpiInflationPct, vnRow.cpiYear],
          ['Tín dụng/GDP World Bank', vnRow.creditPctGdp, vnRow.creditYear],
          ['Xuất khẩu/GDP World Bank', vnRow.exportsPctGdp, vnRow.exportsYear],
          ['FDI/GDP World Bank', vnRow.fdiPctGdp, vnRow.fdiYear],
          ['Thất nghiệp World Bank', vnRow.unemploymentPct, vnRow.unemploymentYear],
          ['Cán cân vãng lai World Bank', vnRow.currentAccountPctGdp, vnRow.currentAccountYear],
          ['Sản xuất World Bank', vnRow.manufacturingGrowthPct, vnRow.manufacturingYear],
        ];
        const year = new Date(now + 7 * 3_600_000).getUTCFullYear();
        for (const [label, value, period] of annual) {
          if (value != null && (period == null || period > year || year - period > 3)) {
            vn.push(`${label}: ${period ?? 'không rõ kỳ'}`);
          }
        }
      }
    }
  }
  for (const metric of markets.fred ?? []) {
    const days = metric.frequency === 'monthly' || FRED_MONTHLY.has(metric.id) ? 120
      : FRED_DAILY.has(metric.id) ? 14
        : FRED_WEEKLY.has(metric.id) ? 30
          : FRED_QUARTERLY.has(metric.id) ? 240 : undefined;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(metric.date) ? Date.parse(`${metric.date}T00:00:00Z`) : NaN;
    if (days === undefined || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== metric.date || date > now + DAY || now - date > days * DAY) {
      us.push(`${metric.subtitle || metric.label}: ${metric.date || 'không rõ kỳ'}`);
    }
  }
  return { vn, us };
}
