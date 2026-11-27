import type {
  EconomicRegime,
  FredMacroMetric,
  MacroQuadrant,
  MarketQuote,
  PredictionItem,
  SectorRotationRecommendation,
  Vn30StockQuote,
  VnGoldQuote,
} from '../types';
/** 0-100 score bands shared by the status label and the factor colours. */
export function scoreLevel(score: number): 'low' | 'medium' | 'high' {
  return score >= 65 ? 'high' : score >= 46 ? 'medium' : 'low';
}

/** Quốc hội CPI target, applies to full-year / YTD average CPI. */
export const VN_CPI_TARGET_PCT = 4.5;

export function isFreshMarketObservation(observedAt: number | undefined, now: number): boolean {
  return observedAt !== undefined && Number.isFinite(observedAt) && observedAt > 0 &&
    observedAt <= now && now - observedAt <= 6 * 3_600_000;
}

export function isFreshGoldComparison(
  domestic: VnGoldQuote,
  gold: MarketQuote | undefined,
  fx: MarketQuote | undefined,
  now: number,
): boolean {
  return !domestic.retained && domestic.worldParityRetained === false &&
    !gold?.retained && !fx?.retained &&
    isFreshMarketObservation(domestic.observedAt, now) &&
    isFreshMarketObservation(gold?.observedAt, now) &&
    isFreshMarketObservation(fx?.observedAt, now);
}

export function isFreshVietnamMonthlyPeriod(period: string | undefined, now: number): boolean {
  const monthPeriod = period?.match(/^T(1[0-2]|[1-9])\/(20\d{2})$/);
  const dayPeriod = period?.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
  if (!monthPeriod && !dayPeriod) return false;
  const month = Number(monthPeriod ? monthPeriod[1] : dayPeriod![2]);
  const year = Number(monthPeriod ? monthPeriod[2] : dayPeriod![3]);
  const vnNow = new Date(now + 7 * 3_600_000);
  if (dayPeriod) {
    const day = Number(dayPeriod[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
    if (date.getTime() > Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate())) return false;
  }
  const difference = vnNow.getUTCFullYear() * 12 + vnNow.getUTCMonth() + 1 - (year * 12 + month);
  return difference >= 0 && difference <= 3;
}

export function clampScore(value: number): number {
  return Math.max(10, Math.min(98, Math.round(value)));
}

/**
 * Continuous smooth factor scoring via hyperbolic tangent (MSCI Barra / AQR style).
 * Eliminates discontinuous step-function cliffs around arbitrary thresholds.
 */
/** Score of a value exactly at its centre; also the prior for pillars that have no data. */
export const NEUTRAL_SCORE = 52;

export function smoothFactorScore(
  value: number,
  center: number,
  scale: number,
  invert = false,
): number {
  const raw = (value - center) / Math.max(1e-6, scale);
  const signed = invert ? -raw : raw;
  return Math.round(NEUTRAL_SCORE + 44 * Math.tanh(signed * 0.85));
}

export function weightedMean(
  items: ReadonlyArray<{ score: number; weight: number }>,
  fallback = NEUTRAL_SCORE,
): number {
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (Number.isFinite(it.score) && it.weight > 0) {
      num += it.score * it.weight;
      den += it.weight;
    }
  }
  return den > 0 ? clampScore(num / den) : fallback;
}

/**
 * Bayesian shrinkage factor pillar aggregation: prevents sparse partial snapshots
 * from over-extrapolating a single sub-metric across an entire factor pillar.
 */
export function shrunkPillarScore(
  items: ReadonlyArray<{ score: number; weight: number }>,
  prior = 60,
): number {
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (Number.isFinite(it.score) && it.weight > 0) {
      num += it.score * it.weight;
      den += it.weight;
    }
  }
  if (den <= 0) return prior;
  const empirical = num / den;
  const coverage = Math.min(1, den / 0.55);
  return clampScore(empirical * coverage + prior * (1 - coverage));
}

/**
 * Standard Normal CDF Φ(x) via Abramowitz & Stegun 7.1.26 rational approximation
 * (maximum absolute error < 1.5e-7).
 */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/**
 * Official New York Fed (`prob_rec.pdf` / Estrella & Trubin 2006) Bond-Equivalent 10Y–3M Spread:
 * Converts the 3-Month Secondary-Market T-Bill discount rate (`TB3MS`, 360-day basis) into a
 * 365-day Bond-Equivalent Yield `BEY_3M = (365 * r) / (360 - 0.91 * r)` before subtracting from
 * Monthly Average 10-Year Constant Maturity (`GS10`).
 * Example (Oct 2026): GS10 = 5.13%, TB3MS = 4.05% -> BEY_3M = 4.14872% -> Spread = +0.98128% -> Prob = 12.4%.
 */
export function computeNyFedBondEquivalentSpread(gs10Pct: number, tb3msDiscountPct: number): number {
  const denom = 360 - 0.91 * tb3msDiscountPct;
  const bey3m = denom > 0 ? (365 * tb3msDiscountPct) / denom : tb3msDiscountPct;
  return Number((gs10Pct - bey3m).toFixed(5));
}

/**
 * Federal Reserve Bank of New York (Estrella & Mishkin / Estrella & Trubin) Probit 12-Month US Recession Probability
 * derived from the Monthly-Average 10-Year minus Bond-Equivalent 3-Month Treasury Spread (α = -0.5333, β = -0.6330).
 */
export function computeNyFedRecessionProb12m(spread10y3mPct: number): number {
  const prob = normalCdf(-0.5333 - 0.633 * spread10y3mPct) * 100;
  return Number(Math.max(0.5, Math.min(99.5, prob)).toFixed(1));
}

export function resolveNyFedSpreadAndProb(byId: ReadonlyMap<string, FredMacroMetric>): {
  spreadPct?: number;
  prob12m?: number;
  isMonthlyAverage: boolean;
} {
  const gs10 = byId.get('GS10');
  const tb3ms = byId.get('TB3MS');
  if (
    gs10 !== undefined &&
    tb3ms !== undefined &&
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(gs10.date) &&
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(tb3ms.date) &&
    gs10.date.slice(0, 7) === tb3ms.date.slice(0, 7)
  ) {
    const spreadPct = computeNyFedBondEquivalentSpread(gs10.value, tb3ms.value);
    return {
      spreadPct,
      prob12m: computeNyFedRecessionProb12m(spreadPct),
      isMonthlyAverage: true,
    };
  }
  const t10y3m = byId.get('T10Y3M');
  if (t10y3m?.frequency === 'monthly') {
    const spreadPct = t10y3m.value;
    return {
      spreadPct,
      prob12m: computeNyFedRecessionProb12m(spreadPct),
      isMonthlyAverage: true,
    };
  }
  return { isMonthlyAverage: false };
}

/**
 * Institutional Fed Net Liquidity Formula:
 * Net Liquidity ($B) = (WALCL_Millions - WTREGEN_Millions) / 1000 - RRPONTSYD_Billions
 */
export function computeFedNetLiquidity(params: {
  walclMillions?: number;
  wtregenMillions?: number;
  rrpBillions?: number;
  walclDelta4wMillions?: number;
  wtregenDelta4wMillions?: number;
  rrpDelta4wBillions?: number;
}): { netLiquidityBillions: number; delta4wBillions?: number } | null {
  const { walclMillions, wtregenMillions, rrpBillions } = params;
  if (walclMillions === undefined || !Number.isFinite(walclMillions) || walclMillions < 500_000) {
    return null;
  }
  // A missing TGA or RRP would silently overstate liquidity (treating it as 0), so refuse to compute.
  if (
    wtregenMillions === undefined ||
    !Number.isFinite(wtregenMillions) ||
    rrpBillions === undefined ||
    !Number.isFinite(rrpBillions)
  ) {
    return null;
  }
  const tgaM = wtregenMillions;
  const rrpB = rrpBillions;
  const netLiquidityBillions = Number(((walclMillions - tgaM) / 1000 - rrpB).toFixed(1));
  const { walclDelta4wMillions, wtregenDelta4wMillions, rrpDelta4wBillions } = params;
  const delta4wBillions =
    typeof walclDelta4wMillions === 'number' &&
    Number.isFinite(walclDelta4wMillions) &&
    typeof wtregenDelta4wMillions === 'number' &&
    Number.isFinite(wtregenDelta4wMillions) &&
    typeof rrpDelta4wBillions === 'number' &&
    Number.isFinite(rrpDelta4wBillions)
      ? Number(
          (
            (walclDelta4wMillions - wtregenDelta4wMillions) / 1000 -
            rrpDelta4wBillions
          ).toFixed(1),
        )
      : undefined;
  return {
    netLiquidityBillions,
    ...(delta4wBillions !== undefined ? { delta4wBillions } : {}),
  };
}

/**
 * Equity Risk Premium (Damodaran / Fed Model):
 * ERP (%) = Earnings Yield (100 / P/E) - Live 10Y Government Bond Yield.
 */
export function computeVietnamEquityRiskPremium(
  peRatio: number | undefined,
  referenceYieldPct: number,
): { earningsYieldPct: number; erpPct: number; bondYieldUsed: number } | null {
  if (peRatio === undefined || !Number.isFinite(peRatio) || peRatio <= 2 || peRatio >= 80) {
    return null;
  }
  if (!Number.isFinite(referenceYieldPct)) return null;
  const cleanRef = referenceYieldPct;
  const earningsYieldPct = Number((100 / peRatio).toFixed(2));
  const erpPct = Number((earningsYieldPct - cleanRef).toFixed(2));
  return { earningsYieldPct, erpPct, bondYieldUsed: Number(cleanRef.toFixed(2)) };
}

/**
 * Internal Market Breadth across VN30 Leaders (Stan Weinstein / Zweig Breadth discipline)
 */
export function computeVn30MarketBreadth(vn30: readonly Vn30StockQuote[] | undefined): {
  sampleCount: number;
  aboveMa50Pct: number;
  aboveMa200Pct: number;
  medianRsi14?: number;
} | null {
  if (!vn30 || vn30.length === 0) return null;
  const ma50Pool = vn30.filter((s) => s.ma50 !== undefined);
  const ma200Pool = vn30.filter((s) => s.ma200 !== undefined);
  // Both averages need a real sample: never report 0% for "no data" or reuse MA50 as MA200.
  if (ma50Pool.length < 4 || ma200Pool.length < 4) return null;

  const aboveMa50Pct = Math.round(
    (ma50Pool.filter((s) => s.priceThousandVnd >= (s.ma50 ?? 0)).length / ma50Pool.length) * 100,
  );
  const aboveMa200Pct = Math.round(
    (ma200Pool.filter((s) => s.priceThousandVnd >= (s.ma200 ?? 0)).length / ma200Pool.length) * 100,
  );

  const rsis = vn30
    .map((s) => s.rsi14)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
    .sort((a, b) => a - b);
  const medianRsi14 =
    rsis.length > 0 ? Number(rsis[Math.floor(rsis.length / 2)].toFixed(0)) : undefined;

  return {
    sampleCount: Math.min(ma50Pool.length, ma200Pool.length),
    aboveMa50Pct,
    aboveMa200Pct,
    ...(medianRsi14 !== undefined ? { medianRsi14 } : {}),
  };
}

/**
 * Extracts real-money FOMC rate decision & US recession probabilities from Polymarket Gamma contracts
 */
export interface PolymarketMacroSignal {
  fedContractTitle: string;
  fedActionLabel: string;
  fedProbPct: number;
  fedVolumeUsd: number;
  bias: 'dovish_cut' | 'neutral_hold' | 'hawkish_hike';
  recessionProbPct?: number;
}

export function extractPolymarketMacroInsight(
  predictions: readonly PredictionItem[] | undefined,
): PolymarketMacroSignal | null {
  if (!predictions || predictions.length === 0) return null;

  const fedCandidates = predictions
    .filter((p) => /\b(fed decision|fed rate|interest rates?|fomc)\b/i.test(p.title))
    .sort((a, b) => {
      const aNextMeeting = /\bfed decision in\b/i.test(a.title);
      const bNextMeeting = /\bfed decision in\b/i.test(b.title);
      if (aNextMeeting !== bNextMeeting) return aNextMeeting ? -1 : 1;
      return b.volumeUsd - a.volumeUsd;
    });

  const recMarket = predictions
    .filter((p) => /\b(recession)\b/i.test(p.title))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)[0];

  const topFed = fedCandidates[0];
  if (!topFed) return null;

  const rawOutcome = (topFed.outcomeLabel ?? topFed.title).trim();
  const prob = topFed.yesPercent;
  let bias: PolymarketMacroSignal['bias'] = 'neutral_hold';
  let fedActionLabel = `${prob}% Giữ lãi suất`;

  if (/\b(increase|hike)\b/i.test(rawOutcome)) {
    if (prob >= 45) {
      bias = 'hawkish_hike';
      const bpsMatch = rawOutcome.match(/(\d+\+?)\s*bps/i);
      fedActionLabel = bpsMatch ? `${prob}% Tăng +${bpsMatch[1]}bps` : `${prob}% Tăng lãi suất`;
    } else {
      bias = 'neutral_hold';
      fedActionLabel = `${100 - prob}% Không tăng lãi`;
    }
  } else if (/\b(decrease|cut)\b/i.test(rawOutcome) && !/\bno\s+fed\s+rate\s+cuts?\b/i.test(topFed.title)) {
    if (prob >= 45) {
      bias = 'dovish_cut';
      const bpsMatch = rawOutcome.match(/(\d+\+?)\s*bps/i);
      fedActionLabel = bpsMatch ? `${prob}% Hạ -${bpsMatch[1]}bps` : `${prob}% Hạ lãi suất`;
    } else {
      fedActionLabel = `Chỉ ${prob}% cược hạ lãi`;
    }
  } else if (/\b(no\s+fed\s+rate\s+cuts?|0\s*\(0\s*bps\))\b/i.test(`${topFed.title} ${rawOutcome}`)) {
    // "No cuts" means rates stay put (higher for longer), not that the Fed hikes.
    bias = 'neutral_hold';
    fedActionLabel = `${prob}% Không hạ lãi`;
  } else if (/\b(no change|unchanged|pause)\b/i.test(rawOutcome)) {
    bias = 'neutral_hold';
    fedActionLabel = `${prob}% Giữ nguyên lãi`;
  }

  return {
    fedContractTitle: topFed.titleVi ?? topFed.title,
    fedActionLabel,
    fedProbPct: prob,
    fedVolumeUsd: topFed.volumeUsd,
    bias,
    ...(recMarket ? { recessionProbPct: recMarket.yesPercent } : {}),
  };
}

/**
 * GIP / All-Weather 4-Quadrant Growth × Inflation Matrix
 */
export function classifyMacroQuadrant(
  growthZ: number,
  inflationZ: number,
): { quadrant: MacroQuadrant; quadrantLabel: string } {
  if (growthZ >= 0 && inflationZ <= 0) {
    return {
      quadrant: 'Q1_GOLDILOCKS',
      quadrantLabel: 'Q1 GOLDILOCKS · Tăng trưởng ↑ Lạm phát ↓',
    };
  }
  if (growthZ >= 0 && inflationZ > 0) {
    return {
      quadrant: 'Q2_REFLATION',
      quadrantLabel: 'Q2 REFLATION / QUÁ NHIỆT · Tăng trưởng ↑ Lạm phát ↑',
    };
  }
  if (growthZ < 0 && inflationZ > 0) {
    return {
      quadrant: 'Q3_STAGFLATION',
      quadrantLabel: 'Q3 STAGFLATION / ĐÌNH LẠM · Tăng trưởng ↓ Lạm phát ↑',
    };
  }
  return {
    quadrant: 'Q4_DEFLATION',
    quadrantLabel: 'Q4 GIẢM TỐC / DISINFLATION · Tăng trưởng ↓ Lạm phát ↓',
  };
}

/**
 * Fidelity / Stovall 4-Quadrant Business Cycle Sector Rotation localized for Vietnam HOSE & Global Markets
 */
export function buildSectorRotation(quadrant: MacroQuadrant): SectorRotationRecommendation {
  switch (quadrant) {
    case 'Q1_GOLDILOCKS':
      return {
        quadrant,
        phaseTitle: 'Pha Q1 Goldilocks (Tăng trưởng mở rộng · Lạm phát êm)',
        leadingSectors: [
          'CNTT · Phần mềm · Bán dẫn AI (FPT, HPT)',
          'Ngân hàng thương mại CASA cao & Bán lẻ hiện đại',
          'Bất động sản Khu công nghiệp đón sóng FDI',
        ],
        laggingSectors: [
          'Nhóm phòng thủ tăng trưởng thấp khi dòng tiền chuộng cổ phiếu chu kỳ',
          'Mua đuổi vàng SJC chênh lệch cao',
        ],
      };
    case 'Q2_REFLATION':
      return {
        quadrant,
        phaseTitle: 'Pha Q2 Reflation / Quá nhiệt (Tăng trưởng mạnh · Lạm phát & Lãi suất nóng)',
        leadingSectors: [
          'Dầu khí · Khí đốt & Dịch vụ thượng nguồn (GAS, PVS, PVD)',
          'Doanh nghiệp Xuất khẩu · Cảng biển · Hóa chất hưởng lợi USD & giá hàng hóa',
          'CNTT tích hợp hệ thống ít nợ vay & Bảo hiểm (hưởng lợi lãi tiền gửi tăng)',
        ],
        laggingSectors: [
          'Bất động sản dân cư vay nợ lớn nhạy cảm lãi suất liên ngân hàng',
          'Cổ phiếu công nghệ định giá P/E quá đắt (ERP âm)',
        ],
      };
    case 'Q3_STAGFLATION':
      return {
        quadrant,
        phaseTitle: 'Pha Q3 Đình lạm (Tăng trưởng suy yếu · Lạm phát cao)',
        leadingSectors: [
          'Điện · Nước · Hạ tầng thiết yếu chia cổ tức tiền mặt cao',
          'Dược phẩm · Y tế & Bảo hiểm tiền mặt ròng lớn',
          'Vàng nhẫn 9999 & Tiền gửi kỳ hạn ngắn lãi thực dương',
        ],
        laggingSectors: [
          'Bán lẻ không thiết yếu, Hàng không & Tiêu dùng xa xỉ',
          'Bất động sản, Chứng khoán & nhóm đòn bẩy tài chính cao',
        ],
      };
    case 'Q4_DEFLATION':
      return {
        quadrant,
        phaseTitle: 'Pha Q4 Giảm tốc / Hạ nhiệt (Tăng trưởng chậm · Lạm phát giảm)',
        leadingSectors: [
          'Trái phiếu Chính phủ & Tiền gửi kỳ hạn dài khóa lãi suất cao',
          'Hạ tầng Đầu tư công (kích cầu tài khóa) & CNTT hợp đồng dài hạn',
          'Cổ phiếu đầu ngành P/E thấp tích sản đón chu kỳ hạ lãi suất',
        ],
        laggingSectors: [
          'Thép · Xi măng · Hàng hóa cơ bản chịu áp lực cầu suy giảm',
          'Dầu khí & Vận tải biển giá cước chu kỳ giảm',
        ],
      };
  }
}

export function classifyRegime(params: {
  growthBeat: boolean;
  inflationContained: boolean;
  leadingWeakening: boolean;
}): { regime: EconomicRegime; label: string; summary: string } {
  const { growthBeat, inflationContained, leadingWeakening } = params;

  if (growthBeat && inflationContained && !leadingWeakening) {
    return {
      regime: 'soft_landing',
      label: 'HẠ CÁNH MỀM · MỞ RỘNG KHỎE',
      summary:
        'Tăng trưởng đạt ngưỡng tham chiếu trong khi lạm phát nằm trong vùng kiểm soát — chu kỳ mở rộng lành mạnh.',
    };
  }

  if (growthBeat && !inflationContained) {
    return {
      regime: 'overheating',
      label: 'TĂNG TRƯỞNG NÓNG · ÁP LỰC LẠM PHÁT',
      summary:
        'Tăng trưởng đạt ngưỡng tham chiếu nhưng lạm phát cao hơn ngưỡng — tạo áp lực lên điều hành tiền tệ.',
    };
  }

  if (!growthBeat && !inflationContained) {
    return {
      regime: 'stagflation_risk',
      label: 'RỦI RO ĐÌNH LẠM (STAGFLATION)',
      summary:
        'Tăng trưởng dưới ngưỡng tham chiếu trong khi lạm phát cao hơn ngưỡng — rủi ro đình lạm cần phòng thủ danh mục.',
    };
  }

  return {
    regime: 'early_slowdown',
    label: 'GIẢM TỐC SỚM · CẦN THEO DÕI CẦU',
    summary:
      'Lạm phát hạ nhiệt nhưng đà tăng trưởng hoặc chỉ báo sản xuất dẫn dắt đang chậm lại so với ngưỡng tham chiếu.',
  };
}

