import type {
  EconomicRegime,
  FredMacroMetric,
  MacroQuadrant,
  PredictionItem,
  SectorRotationRecommendation,
  Vn30StockQuote,
} from '../types';
/** Quốc hội CPI target, applies to full-year / YTD average CPI. */
export const VN_CPI_TARGET_PCT = 4.5;

export function clampScore(value: number): number {
  return Math.max(10, Math.min(98, Math.round(value)));
}

/**
 * Continuous smooth factor scoring via hyperbolic tangent (MSCI Barra / AQR style).
 * Eliminates discontinuous step-function cliffs around arbitrary thresholds.
 */
export function smoothFactorScore(
  value: number,
  center: number,
  scale: number,
  invert = false,
): number {
  const raw = (value - center) / Math.max(1e-6, scale);
  const signed = invert ? -raw : raw;
  return Math.round(52 + 44 * Math.tanh(signed * 0.85));
}

export function weightedMean(items: ReadonlyArray<{ score: number; weight: number }>, fallback = 56): number {
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
  isMonthlyOfficial: boolean;
} {
  const gs10 = byId.get('GS10');
  const tb3ms = byId.get('TB3MS');
  if (gs10 !== undefined && tb3ms !== undefined) {
    const spreadPct = computeNyFedBondEquivalentSpread(gs10.value, tb3ms.value);
    return {
      spreadPct,
      prob12m: computeNyFedRecessionProb12m(spreadPct),
      isMonthlyOfficial: true,
    };
  }
  const t10y3m = byId.get('T10Y3M');
  if (t10y3m !== undefined) {
    const spreadPct = t10y3m.avg3m ?? t10y3m.value;
    return {
      spreadPct,
      prob12m: computeNyFedRecessionProb12m(spreadPct),
      isMonthlyOfficial: false,
    };
  }
  const t10y2y = byId.get('T10Y2Y');
  if (t10y2y !== undefined) {
    return {
      spreadPct: t10y2y.value,
      prob12m: computeNyFedRecessionProb12m(t10y2y.value),
      isMonthlyOfficial: false,
    };
  }
  return { isMonthlyOfficial: false };
}

/**
 * Institutional Fed Net Liquidity Formula:
 * Net Liquidity ($B) = (WALCL_Millions - WTREGEN_Millions) / 1000 - RRPONTSYD_Billions
 */
export function computeFedNetLiquidity(params: {
  walclMillions?: number;
  wtregenMillions?: number;
  rrpBillions?: number;
  walclDelta4pMillions?: number;
  wtregenDelta4pMillions?: number;
  rrpDelta4pBillions?: number;
}): { netLiquidityBillions: number; delta4wBillions: number } | null {
  const { walclMillions, wtregenMillions, rrpBillions } = params;
  if (walclMillions === undefined || !Number.isFinite(walclMillions) || walclMillions < 500_000) {
    return null;
  }
  const tgaM = wtregenMillions ?? 0;
  const rrpB = rrpBillions ?? 0;
  const netLiquidityBillions = Number(((walclMillions - tgaM) / 1000 - rrpB).toFixed(1));
  const delta4wBillions = Number(
    (
      ((params.walclDelta4pMillions ?? 0) - (params.wtregenDelta4pMillions ?? 0)) / 1000 -
      (params.rrpDelta4pBillions ?? 0)
    ).toFixed(1),
  );
  return { netLiquidityBillions, delta4wBillions };
}

/**
 * Equity Risk Premium (Damodaran / Fed Model):
 * ERP (%) = Earnings Yield (100 / P/E) - Live 10Y Government Bond Yield (falls back to 5.2% only when live bond yield unavailable)
 */
export function computeVietnamEquityRiskPremium(
  peRatio: number | undefined,
  referenceYieldPct = 5.2,
): { earningsYieldPct: number; erpPct: number; bondYieldUsed: number } | null {
  if (peRatio === undefined || !Number.isFinite(peRatio) || peRatio <= 2 || peRatio >= 80) {
    return null;
  }
  const cleanRef = Number.isFinite(referenceYieldPct) && referenceYieldPct > 0 ? referenceYieldPct : 5.2;
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
  const withMa = vn30.filter((s) => s.ma50 !== undefined || s.ma200 !== undefined);
  if (withMa.length < 4) return null;

  const ma50Pool = withMa.filter((s) => s.ma50 !== undefined);
  const ma200Pool = withMa.filter((s) => s.ma200 !== undefined);

  const aboveMa50Pct =
    ma50Pool.length > 0
      ? Math.round((ma50Pool.filter((s) => s.priceThousandVnd >= (s.ma50 ?? 0)).length / ma50Pool.length) * 100)
      : 0;
  const aboveMa200Pct =
    ma200Pool.length > 0
      ? Math.round((ma200Pool.filter((s) => s.priceThousandVnd >= (s.ma200 ?? 0)).length / ma200Pool.length) * 100)
      : aboveMa50Pct;

  const rsis = vn30
    .map((s) => s.rsi14)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
    .sort((a, b) => a - b);
  const medianRsi14 =
    rsis.length > 0 ? Number(rsis[Math.floor(rsis.length / 2)].toFixed(0)) : undefined;

  return {
    sampleCount: withMa.length,
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
    bias = prob >= 65 ? 'hawkish_hike' : 'neutral_hold';
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
        'Tăng trưởng thực tế đạt/vượt dự báo trong khi lạm phát nằm trong vùng kiểm soát — chu kỳ mở rộng lành mạnh.',
    };
  }

  if (growthBeat && !inflationContained) {
    return {
      regime: 'overheating',
      label: 'TĂNG TRƯỞNG NÓNG · ÁP LỰC LẠM PHÁT',
      summary:
        'Sản xuất & cầu tiêu dùng tăng tốc vượt dự báo nhưng mặt bằng lạm phát / lãi suất liên ngân hàng dâng cao — chính sách tiền tệ ưu tiên kiểm soát giá cả & tỷ giá.',
    };
  }

  if (!growthBeat && !inflationContained) {
    return {
      regime: 'stagflation_risk',
      label: 'RỦI RO ĐÌNH LẠM (STAGFLATION)',
      summary:
        'Tăng trưởng hụt hơi dưới dự báo trong khi mặt bằng giá cả leo thang — rủi ro đình lạm cần phòng thủ danh mục.',
    };
  }

  return {
    regime: 'early_slowdown',
    label: 'GIẢM TỐC SỚM · CẦN THEO DÕI CẦU',
    summary:
      'Lạm phát hạ nhiệt nhưng đà tăng trưởng hoặc chỉ báo sản xuất dẫn dắt đang chậm lại so với kỳ vọng.',
  };
}

