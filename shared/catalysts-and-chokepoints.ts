import type {
  ChokepointMarketImpact,
  GeoPointFeature,
  MarketCatalystEvent,
  MarketQuote,
  PredictionItem,
} from './types';

// Official Federal Reserve FOMC rate decision dates (2026–2027)
const FOMC_DECISION_DATES = [
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-17',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-16',
  '2027-01-27',
  '2027-03-17',
  '2027-05-05',
  '2027-06-16',
  '2027-07-28',
  '2027-09-15',
  '2027-11-03',
  '2027-12-15',
] as const;

function toUtcDateStartMs(year: number, month0: number, day: number): number {
  return Date.UTC(year, month0, day, 0, 0, 0, 0);
}

function formatIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDayMonth(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * Computes the Nth weekday of a given UTC year & month0 (0 = Sunday .. 4 = Thursday, 5 = Friday)
 */
export function getNthWeekdayOfMonthUtc(
  year: number,
  month0: number,
  weekday: number,
  nth: number,
): number {
  const firstMs = toUtcDateStartMs(year, month0, 1);
  const firstDow = new Date(firstMs).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return toUtcDateStartMs(year, month0, day);
}

function nextMonthlyDayUtc(todayStartMs: number, dayOfMonth: number): number {
  const d = new Date(todayStartMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const candidate = toUtcDateStartMs(y, m, dayOfMonth);
  if (candidate >= todayStartMs) return candidate;
  const nextMonth = m + 1;
  return toUtcDateStartMs(y + Math.floor(nextMonth / 12), nextMonth % 12, dayOfMonth);
}

function nextVn30DerivativesExpiryUtc(todayStartMs: number): number {
  const d = new Date(todayStartMs);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  // Statutory rule on HNX/HOSE: 3rd Thursday (weekday = 4) of every month
  const cur = getNthWeekdayOfMonthUtc(y, m, 4, 3);
  if (cur >= todayStartMs) return cur;
  m += 1;
  if (m >= 12) {
    m = 0;
    y += 1;
  }
  return getNthWeekdayOfMonthUtc(y, m, 4, 3);
}

function nextQuarterlyEtfRebalanceUtc(todayStartMs: number): number {
  const d = new Date(todayStartMs);
  const startYear = d.getUTCFullYear();
  const quarterMonths = [2, 5, 8, 11]; // March, June, September, December (3rd Friday = weekday 5)
  for (let y = startYear; y <= startYear + 1; y++) {
    for (const m of quarterMonths) {
      const candidate = getNthWeekdayOfMonthUtc(y, m, 5, 3);
      if (candidate >= todayStartMs) return candidate;
    }
  }
  return getNthWeekdayOfMonthUtc(startYear + 1, 2, 5, 3);
}

function nextFomcMeetingUtc(todayStartMs: number): number {
  for (const iso of FOMC_DECISION_DATES) {
    const [y, m, day] = iso.split('-').map(Number);
    const ms = toUtcDateStartMs(y, m - 1, day);
    if (ms >= todayStartMs) return ms;
  }
  // Fallback ~42-day cycle beyond 2027
  return todayStartMs + 35 * 86_400_000;
}

/**
 * Builds upcoming Macro & Market Catalyst countdown schedule sorted chronologically
 */
export function buildMarketCatalystCalendar(
  nowMs = Date.now(),
  polymarketFedSummary?: string,
): MarketCatalystEvent[] {
  // Align today to Vietnam local calendar date (UTC+7)
  const vnNow = new Date(nowMs + 7 * 3_600_000);
  const todayStartMs = toUtcDateStartMs(
    vnNow.getUTCFullYear(),
    vnNow.getUTCMonth(),
    vnNow.getUTCDate(),
  );

  const daysTo = (targetMs: number) =>
    Math.max(0, Math.round((targetMs - todayStartMs) / 86_400_000));
  const urgencyOf = (days: number): MarketCatalystEvent['urgency'] =>
    days <= 3 ? 'imminent' : days <= 8 ? 'soon' : 'scheduled';

  const vn30ExpMs = nextVn30DerivativesExpiryUtc(todayStartMs);
  const vn30Days = daysTo(vn30ExpMs);

  const fomcMs = nextFomcMeetingUtc(todayStartMs);
  const fomcDays = daysTo(fomcMs);

  // Under Decree 94/2022/NĐ-CP, GSO Vietnam publishes monthly CPI/IIP/Trade on the 6th of every month
  const gsoMs = nextMonthlyDayUtc(todayStartMs, 6);
  const gsoDays = daysTo(gsoMs);

  // US BLS CPI release ~12th of each month
  const usCpiMs = nextMonthlyDayUtc(todayStartMs, 12);
  const usCpiDays = daysTo(usCpiMs);

  // US BEA Core PCE release ~28th of each month
  const usPceMs = nextMonthlyDayUtc(todayStartMs, 28);
  const usPceDays = daysTo(usPceMs);

  // FTSE / VNM ETF quarterly rebalance on HOSE (3rd Friday of Mar/Jun/Sep/Dec)
  const etfMs = nextQuarterlyEtfRebalanceUtc(todayStartMs);
  const etfDays = daysTo(etfMs);

  const events: MarketCatalystEvent[] = [
    {
      id: 'vn30-deriv',
      title: 'Đáo hạn Phái sinh VN30F1M',
      region: 'VN',
      category: 'derivatives_etf',
      dateIso: formatIsoDate(vn30ExpMs),
      dateLabel: formatDayMonth(vn30ExpMs),
      daysUntil: vn30Days,
      impactNote: 'Biến động mạnh phiên ATC nhóm trụ VN30 — hạn chế mua đuổi ngắn hạn',
      urgency: urgencyOf(vn30Days),
    },
    {
      id: 'fomc-rate',
      title: 'Họp Lãi suất FOMC (Fed Mỹ)',
      region: 'US',
      category: 'fomc',
      dateIso: formatIsoDate(fomcMs),
      dateLabel: formatDayMonth(fomcMs),
      daysUntil: fomcDays,
      impactNote: polymarketFedSummary
        ? `Polymarket: ${polymarketFedSummary.split('(')[0].trim()}`
        : 'Quyết định lãi suất USD, tác động trực tiếp DXY, Vàng & tỷ giá USD/VND',
      urgency: urgencyOf(fomcDays),
    },
    {
      id: 'vn-gso-cpi',
      title: 'Công bố CPI & Vĩ mô Tháng VN (GSO)',
      region: 'VN',
      category: 'inflation_gdp',
      dateIso: formatIsoDate(gsoMs),
      dateLabel: formatDayMonth(gsoMs),
      daysUntil: gsoDays,
      impactNote: 'Cập nhật CPI, Sản xuất công nghiệp & Xuất siêu tháng của Tổng cục Thống kê',
      urgency: urgencyOf(gsoDays),
    },
    {
      id: 'us-cpi',
      title: 'Công bố Lạm phát CPI Mỹ (BLS)',
      region: 'US',
      category: 'inflation_gdp',
      dateIso: formatIsoDate(usCpiMs),
      dateLabel: formatDayMonth(usCpiMs),
      daysUntil: usCpiDays,
      impactNote: 'Dữ liệu lạm phát tiêu dùng Mỹ dẫn dắt lợi suất TP 10Y & chứng khoán toàn cầu',
      urgency: urgencyOf(usCpiDays),
    },
    {
      id: 'us-pce',
      title: 'Công bố Core PCE Mỹ (Thước đo Fed)',
      region: 'US',
      category: 'inflation_gdp',
      dateIso: formatIsoDate(usPceMs),
      dateLabel: formatDayMonth(usPceMs),
      daysUntil: usPceDays,
      impactNote: 'Chỉ số lạm phát lõi mục tiêu 2.0% quan trọng nhất của FOMC',
      urgency: urgencyOf(usPceDays),
    },
    {
      id: 'vn-etf-rebal',
      title: 'Cơ cấu Danh mục Quỹ ETF Ngoại',
      region: 'VN',
      category: 'derivatives_etf',
      dateIso: formatIsoDate(etfMs),
      dateLabel: formatDayMonth(etfMs),
      daysUntil: etfDays,
      impactNote: 'FTSE Vietnam & VanEck VNM ETF tái cơ cấu danh mục quý (thanh khoản đột biến ATC)',
      urgency: urgencyOf(etfDays),
    },
  ];

  return events.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 5);
}

interface ChokepointCorridorSpec {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  boxHalfLat: number;
  boxHalfLon: number;
  polyRegex: RegExp;
  polyInvertNormal?: boolean;
  commodityImpact: string;
  vnStockImpact: string;
}

const STRATEGIC_MARKET_CORRIDORS: readonly ChokepointCorridorSpec[] = [
  {
    id: 'hormuz',
    name: 'Eo biển Hormuz (Vịnh Ba Tư)',
    lat: 26.5,
    lon: 56.5,
    zoom: 5.6,
    boxHalfLat: 4.5,
    boxHalfLon: 5.5,
    polyRegex: /\b(hormuz|iran\b.*(strait|blockade|attack|israel|us\b))\b/i,
    commodityImpact: '20% Dầu mỏ & LNG thế giới → Giá Brent/WTI, Khí đốt & Urê tăng vọt khi nghẽn',
    vnStockImpact: 'Hưởng lợi: GAS, PVD, PVS, BSR, DPM, DCM · Chịu chi phí: Hàng không, Nhựa',
  },
  {
    id: 'east-sea',
    name: 'Biển Đông (Hoàng Sa – Trường Sa)',
    lat: 14.5,
    lon: 112.0,
    zoom: 5.3,
    boxHalfLat: 7.0,
    boxHalfLon: 6.5,
    polyRegex: /\b(south china sea|biển đông|spratly|paracel|philippines.*china)\b/i,
    commodityImpact: 'Trục xuất nhập khẩu số 1 Việt Nam & ASEAN → Cước biển nội Á & rủi ro tỷ giá',
    vnStockImpact: 'Theo dõi sát: GMD, HAH, PVT, PVS · Ưu tiên phòng thủ tiền mặt nếu leo thang',
  },
  {
    id: 'red-sea',
    name: 'Biển Đỏ · Bab el-Mandeb & Suez',
    lat: 14.5,
    lon: 42.5,
    zoom: 5.2,
    boxHalfLat: 6.5,
    boxHalfLon: 5.0,
    polyRegex: /\b(red sea|houthi|suez|bab el-mandeb|yemen)\b/i,
    commodityImpact: '12% Thương mại Á–Âu → Vòng qua Mũi Hảo Vọng đội cước container +10–14 ngày',
    vnStockImpact: 'Hưởng lợi giá cước tàu: HAH, VOS, PVT, GMD · Tăng chi phí XK Dệt may/Thủy sản',
  },
  {
    id: 'taiwan',
    name: 'Eo biển Đài Loan (Chuỗi Bán dẫn)',
    lat: 24.0,
    lon: 119.5,
    zoom: 5.8,
    boxHalfLat: 3.5,
    boxHalfLon: 3.5,
    polyRegex: /\b(taiwan|tsmc|china.*invade|china.*blockade)\b/i,
    commodityImpact: '90% Chip tiên tiến & 48% tàu container lớn → Rủi ro đứt gãy phần cứng AI toàn cầu',
    vnStockImpact: 'Dịch chuyển FDI & Gia công phần mềm: FPT, HPT, KBC, IDC · Nhạy cảm: Bán lẻ ICT',
  },
  {
    id: 'malacca',
    name: 'Eo biển Malacca (Cửa ngõ ASEAN)',
    lat: 2.5,
    lon: 101.5,
    zoom: 5.8,
    boxHalfLat: 3.5,
    boxHalfLon: 4.0,
    polyRegex: /\b(malacca|singapore strait)\b/i,
    commodityImpact: '25% Hàng hải toàn cầu & Dầu thô về Đông Á → Chi phí xăng dầu & logistics khu vực',
    vnStockImpact: 'Liên quan trực tiếp: PLX, PVT, GMD, HAH',
  },
];

function inBox(
  pt: { lat: number; lon: number },
  centerLat: number,
  centerLon: number,
  halfLat: number,
  halfLon: number,
): boolean {
  return Math.abs(pt.lat - centerLat) <= halfLat && Math.abs(pt.lon - centerLon) <= halfLon;
}

/**
 * Cross-Domain Geopolitical Chokepoint -> Commodity & HOSE Sector Impact Engine
 */
export function evaluateChokepointMarketImpacts(params: {
  military: readonly GeoPointFeature[];
  vessels: readonly GeoPointFeature[];
  geopolitics: readonly GeoPointFeature[];
  predictions?: readonly PredictionItem[];
  quotes?: readonly MarketQuote[];
}): ChokepointMarketImpact[] {
  const { military, vessels, geopolitics, predictions = [], quotes = [] } = params;
  const brent = quotes.find((q) => q.symbol === 'Brent Crude');

  const results = STRATEGIC_MARKET_CORRIDORS.map((spec): ChokepointMarketImpact => {
    const airCount = military.filter((m) =>
      inBox(m, spec.lat, spec.lon, spec.boxHalfLat, spec.boxHalfLon),
    ).length;
    const seaCount = vessels.filter((v) =>
      inBox(v, spec.lat, spec.lon, spec.boxHalfLat, spec.boxHalfLon),
    ).length;
    const navalCount = vessels.filter(
      (v) =>
        inBox(v, spec.lat, spec.lon, spec.boxHalfLat, spec.boxHalfLon) &&
        (v.severity === 'critical' || v.severity === 'high' || /military|naval|coast guard/i.test(v.category)),
    ).length;
    const conflictEvents = geopolitics.filter((g) =>
      inBox(g, spec.lat, spec.lon, spec.boxHalfLat + 1.5, spec.boxHalfLon + 1.5),
    );
    const criticalGeo = conflictEvents.filter((g) => g.severity === 'critical' || g.severity === 'high').length;

    // Check real-money Polymarket disruption odds on this corridor
    let polyRiskBoost = 0;
    let polymarketNote: string | undefined;
    const matchingPoly = predictions
      .filter((p) => spec.polyRegex.test(`${p.title} ${p.outcomeLabel ?? ''}`))
      .sort((a, b) => b.volumeUsd - a.volumeUsd)[0];

    if (matchingPoly) {
      // Handle inverted phrasing like "Strait of Hormuz traffic returns to normal ...? 3% YES" -> 97% disrupted!
      const isReturnToNormal = /\breturns?\s+to\s+normal|reopen|ceasefire\b/i.test(matchingPoly.title);
      const disruptionProb = isReturnToNormal
        ? 100 - matchingPoly.yesPercent
        : matchingPoly.yesPercent;

      if (disruptionProb >= 65) {
        polyRiskBoost = 38;
        polymarketNote = `Polymarket: ${disruptionProb}% rủi ro gián đoạn`;
      } else if (disruptionProb >= 30) {
        polyRiskBoost = 18;
        polymarketNote = `Polymarket: ${disruptionProb}% định giá rủi ro`;
      } else {
        polymarketNote = `Polymarket: ${disruptionProb}% rủi ro`;
      }
    }

    const oilSpikeBoost =
      spec.id === 'hormuz' && brent && brent.price >= 88 ? 10 : 0;

    const rawScore =
      18 +
      Math.min(24, airCount * 3.5) +
      Math.min(18, navalCount * 5 + Math.min(6, seaCount * 0.25)) +
      Math.min(26, conflictEvents.length * 4 + criticalGeo * 5) +
      polyRiskBoost +
      oilSpikeBoost;

    const disruptionScore = Math.max(12, Math.min(98, Math.round(rawScore)));
    const status: ChokepointMarketImpact['status'] =
      disruptionScore >= 68 ? 'critical' : disruptionScore >= 42 ? 'elevated' : 'normal';
    const statusLabel =
      status === 'critical'
        ? 'GIÁN ĐOẠN CAO'
        : status === 'elevated'
          ? 'CĂNG THẲNG'
          : 'LƯU THÔNG ỔN';

    return {
      id: spec.id,
      name: spec.name,
      lat: spec.lat,
      lon: spec.lon,
      zoom: spec.zoom,
      disruptionScore,
      status,
      statusLabel,
      airCount,
      seaCount,
      conflictCount: conflictEvents.length,
      ...(polymarketNote ? { polymarketNote } : {}),
      commodityImpact: spec.commodityImpact,
      vnStockImpact: spec.vnStockImpact,
    };
  });

  return results.sort((a, b) => b.disruptionScore - a.disruptionScore);
}
