import type {
  FredMacroMetric,
} from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../../lib/http';

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

export const FRED_SERIES_TARGETS: readonly FredSeriesTarget[] = [
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
    label: '5Y5Y Breakeven Fwd',
    subtitle: 'Lạm phát Hòa vốn Kỳ hạn 5Y5Y (Breakeven)',
    unit: '%',
    pillar: 'inflation',
    benchmarkLabel: 'Neo hòa vốn Fed',
    benchmarkValue: 2.25,
  },
  {
    id: 'T10YIE',
    label: '10Y Breakeven',
    subtitle: 'Lạm phát Hòa vốn Trái phiếu 10Y (Breakeven)',
    unit: '%',
    pillar: 'inflation',
    benchmarkLabel: 'Neo hòa vốn Fed',
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
    subtitle: 'Độ dốc 10Y–3M Giao ngay (Daily CMT)',
    unit: '%',
    pillar: 'leading',
    benchmarkLabel: 'Ngưỡng dương',
    benchmarkValue: 0.0,
  },
  {
    id: 'GS10',
    label: 'US 10Y Monthly Avg',
    subtitle: 'Lợi suất TP Mỹ 10Y Bình quân Tháng (NY Fed)',
    unit: '%',
    pillar: 'leading',
  },
  {
    id: 'TB3MS',
    label: 'US 3M T-Bill Monthly',
    subtitle: 'Tín phiếu Kho bạc Mỹ 3T Bình quân Tháng (NY Fed)',
    unit: '%',
    pillar: 'leading',
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

export async function fetchFredMacroMetrics(): Promise<FredMacroMetric[]> {
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

