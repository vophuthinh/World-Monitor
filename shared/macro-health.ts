import type {
  CompassFactorPillar,
  EconomicRegime,
  EconomyHealthReport,
  FredMacroMetric,
  InvestmentCompassReport,
  InvestmentStance,
  LeadingCompassSignal,
  MacroCountryIndicator,
  MacroPillarGroup,
  MacroPillarMetric,
  MacroQuadrant,
  MarketQuote,
  MarketSnapshot,
  PortfolioAllocationSlice,
  PredictionItem,
  SectorRotationRecommendation,
  VietnamLiveMacroPulse,
  Vn30StockQuote,
} from './types';

function clampScore(value: number): number {
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

function weightedMean(items: ReadonlyArray<{ score: number; weight: number }>, fallback = 56): number {
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
function shrunkPillarScore(
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
 * Federal Reserve Bank of New York (Estrella & Mishkin) Probit 12-Month US Recession Probability
 * derived from the 10-Year minus 3-Month Treasury Yield Spread (in percentage points).
 */
export function computeNyFedRecessionProb12m(spread10y3mPct: number): number {
  const prob = normalCdf(-0.5333 - 0.633 * spread10y3mPct) * 100;
  return Number(Math.max(0.5, Math.min(99.5, prob)).toFixed(1));
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

function classifyRegime(params: {
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

export function buildVietnamMacroHealth(
  vn: MacroCountryIndicator | undefined,
  usdVndRate?: number,
  vniQuote?: MarketQuote,
  pulse?: VietnamLiveMacroPulse,
  us10yYield?: number,
): EconomyHealthReport | null {
  if (!vn || (vn.gdpGrowthPct === null && pulse?.quarterlyGdpPct === undefined)) return null;

  // Prefer live Quarterly GDP & Monthly CPI/PMI when available, falling back seamlessly to World Bank annual
  const gdp = pulse?.quarterlyGdpPct ?? vn.gdpGrowthPct ?? 6.8;
  const gdpPrev = pulse?.quarterlyGdpPrevPct ?? vn.gdpPrevPct ?? undefined;
  const gdpPeriod = pulse?.quarterlyGdpPct !== undefined ? 'Quý mới nhất' : vn.gdpGrowthYear ? `${vn.gdpGrowthYear}` : 'Mới nhất';
  const gdpBenchmark = 6.8;
  const gdpDelta = Number((gdp - gdpBenchmark).toFixed(2));
  const gdpTrend = gdpPrev !== null && gdpPrev !== undefined ? Number((gdp - gdpPrev).toFixed(2)) : undefined;

  const hasLivePmi = pulse?.manufacturingPmi !== undefined;
  const pmi = pulse?.manufacturingPmi;
  const manf = vn.manufacturingGrowthPct ?? gdp * 1.25;
  const manfBenchmark = 8.0;

  // CRITICAL ECONOMETRIC ALIGNMENT:
  // Quốc hội's 4.5% CPI target applies strictly to FULL-YEAR / YTD AVERAGE CPI (CPI bình quân),
  // NEVER to a single-month YoY print! Prefer official GSO YTD average CPI when available;
  // if only single-month YoY CPI exists without YTD average, label & benchmark it distinctly.
  const cpiCeiling = 4.5;
  const currentCalendarYear = new Date().getFullYear();
  const hasYtdAvgCpi = pulse?.ytdAvgCpiPct !== undefined;
  const hasMonthlySpotCpi = pulse?.monthlyCpiPct !== undefined;
  const isWbCpiCurrentYear = vn.cpiYear !== null && vn.cpiYear >= currentCalendarYear;
  const cpiForTargetComparison =
    pulse?.ytdAvgCpiPct ??
    (isWbCpiCurrentYear ? vn.cpiInflationPct : undefined) ??
    pulse?.monthlyCpiPct ??
    vn.cpiInflationPct ??
    3.4;
  const spotMonthlyCpi = pulse?.monthlyCpiPct;
  const coreCpi = pulse?.ytdCoreCpiPct;
  const cpiDelta = Number((cpiForTargetComparison - cpiCeiling).toFixed(2));
  const cpiTrend =
    !hasYtdAvgCpi && vn.cpiPrevPct !== null && vn.cpiPrevPct !== undefined
      ? Number((cpiForTargetComparison - vn.cpiPrevPct).toFixed(2))
      : undefined;

  const fdi = vn.fdiPctGdp ?? 4.0;
  const exportsGdp = vn.exportsPctGdp ?? 85.0;
  const unemp = vn.unemploymentPct ?? 2.0;
  const currentAccount = vn.currentAccountPctGdp;
  const cabYear = vn.currentAccountYear ?? vn.gdpGrowthYear ?? undefined;
  const isCabStalePriorYear =
    cabYear !== undefined &&
    cabYear < currentCalendarYear &&
    (pulse?.quarterlyGdpPct !== undefined || pulse?.tradeBalanceBillionUsd !== undefined);
  const creditPctGdp = vn.creditPctGdp;
  const vn10y = pulse?.vn10yYieldPct;
  const interbank = pulse?.interbankRatePct;
  const ytdTradeB = pulse?.ytdTradeBalanceBillionUsd;
  const vcbSell = pulse?.vcbSellUsdVnd;
  const erp = computeVietnamEquityRiskPremium(vniQuote?.peRatio, vn10y ?? 5.2);
  const yearLabel = vn.gdpGrowthYear ? `${vn.gdpGrowthYear}` : 'Mới nhất';

  const manfZ = hasLivePmi && pmi !== undefined ? (pmi - 50.0) / 2.2 : (manf - manfBenchmark) / 2.2;
  const growthZ = Number(
    Math.max(-3, Math.min(3, ((gdp - gdpBenchmark) / 1.2) * 0.6 + manfZ * 0.4)).toFixed(2),
  );
  const fxStressZ = usdVndRate && usdVndRate > 15_000 ? (usdVndRate - 25_550) / 450 : 0;
  const interbankStressZ = interbank !== undefined ? (interbank - 5.2) / 2.2 : 0;
  const effectiveCpiForZ = coreCpi !== undefined
    ? cpiForTargetComparison * 0.65 + coreCpi * 0.35
    : cpiForTargetComparison;
  const inflationZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        ((effectiveCpiForZ - 3.9) / 0.75) * 0.6 + fxStressZ * 0.25 + interbankStressZ * 0.15,
      ),
    ).toFixed(2),
  );
  const quad = classifyMacroQuadrant(growthZ, inflationZ);

  const growthMetrics: MacroPillarMetric[] = [
    {
      id: 'vn-gdp',
      name: pulse?.quarterlyGdpPct !== undefined ? 'Tăng trưởng GDP thực (Quý YoY)' : 'Tăng trưởng GDP thực',
      actual: gdp,
      unit: '%',
      benchmarkLabel: 'Mục tiêu QH/IMF',
      benchmarkValue: gdpBenchmark,
      deltaVsBenchmark: gdpDelta,
      zScore: Number(((gdp - gdpBenchmark) / 1.2).toFixed(2)),
      trendSlope: gdpTrend,
      trendLabel: gdpTrend !== undefined ? `${gdpTrend >= 0 ? '+' : ''}${gdpTrend}% vs kỳ trước` : undefined,
      periodLabel: gdpPeriod,
      status: gdp >= gdpBenchmark ? 'good' : gdp >= 5.5 ? 'watch' : 'warn',
    },
    hasLivePmi && pmi !== undefined
      ? {
        id: 'vn-pmi',
        name: 'Chỉ số PMI Sản xuất Việt Nam (Tháng)',
        actual: pmi,
        unit: 'pts',
        benchmarkLabel: 'Ngưỡng mở rộng',
        benchmarkValue: 50.0,
        deltaVsBenchmark: Number((pmi - 50.0).toFixed(1)),
        zScore: Number(manfZ.toFixed(2)),
        trendLabel:
          pulse?.manufacturingPmiPrev !== undefined
            ? `Kỳ trước: ${pulse.manufacturingPmiPrev.toFixed(1)} pts`
            : undefined,
        periodLabel: 'Live PMI',
        status: pmi >= 50.5 ? 'good' : pmi >= 48.5 ? 'watch' : 'warn',
      }
      : {
        id: 'vn-manf',
        name: 'CN Chế biến · Chế tạo (Proxy PMI)',
        actual: Number(manf.toFixed(2)),
        unit: '%',
        benchmarkLabel: 'Ngưỡng mở rộng',
        benchmarkValue: manfBenchmark,
        deltaVsBenchmark: Number((manf - manfBenchmark).toFixed(2)),
        zScore: Number(manfZ.toFixed(2)),
        periodLabel: yearLabel,
        status: manf >= manfBenchmark ? 'good' : manf >= 5.0 ? 'watch' : 'warn',
      },
    pulse?.tradeBalanceBillionUsd !== undefined
      ? {
          id: 'vn-trade',
          name: 'Cán cân Thương mại Tháng (Xuất/Nhập siêu)',
          actual: pulse.tradeBalanceBillionUsd,
          unit: 'B$',
          benchmarkLabel: 'Thặng dư tháng',
          benchmarkValue: 1.5,
          deltaVsBenchmark: Number((pulse.tradeBalanceBillionUsd - 1.5).toFixed(2)),
          trendLabel:
            ytdTradeB !== undefined
              ? `Lũy kế năm: ${ytdTradeB >= 0 ? '+' : ''}${ytdTradeB.toFixed(2)}B$ (${ytdTradeB < 0 ? 'nhập siêu máy móc/NL' : 'xuất siêu'})`
              : `Độ mở XK: ${exportsGdp.toFixed(0)}% GDP`,
          periodLabel: 'Tháng mới nhất',
          status:
            pulse.tradeBalanceBillionUsd >= 1.5 && (ytdTradeB === undefined || ytdTradeB >= -5)
              ? 'good'
              : pulse.tradeBalanceBillionUsd >= 0
                ? 'watch'
                : 'warn',
        }
      : {
        id: 'vn-exp',
        name: 'Độ mở Xuất khẩu / GDP',
        actual: Number(exportsGdp.toFixed(1)),
        unit: '% GDP',
        benchmarkLabel: 'Trung bình ASEAN',
        benchmarkValue: 75.0,
        deltaVsBenchmark: Number((exportsGdp - 75.0).toFixed(1)),
        periodLabel: yearLabel,
        status: exportsGdp >= 75 ? 'good' : 'watch',
      },
  ];

  const cpiMetricLabel = hasYtdAvgCpi
    ? `CPI Bình quân ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths}T` : 'Lũy kế'} (Chỉ tiêu QH)`
    : hasMonthlySpotCpi && vn.cpiInflationPct === null
      ? 'CPI Tháng so cùng kỳ (YoY đơn lẻ)'
      : 'Lạm phát CPI bình quân';

  const cpiSubParts: string[] = [];
  if (coreCpi !== undefined) cpiSubParts.push(`Lõi BQ ${coreCpi.toFixed(2)}%`);
  if (spotMonthlyCpi !== undefined && (hasYtdAvgCpi || cpiForTargetComparison !== spotMonthlyCpi)) {
    cpiSubParts.push(`Tháng YoY ${spotMonthlyCpi.toFixed(2)}%`);
  } else if (cpiTrend !== undefined) {
    cpiSubParts.push(`${cpiTrend >= 0 ? '+' : ''}${cpiTrend}% vs kỳ trước`);
  }

  const inflationMetrics: MacroPillarMetric[] = [
    {
      id: 'vn-cpi',
      name: cpiMetricLabel,
      actual: cpiForTargetComparison,
      unit: '%',
      benchmarkLabel: 'Trần BQ Quốc hội',
      benchmarkValue: cpiCeiling,
      deltaVsBenchmark: cpiDelta,
      zScore: Number(((cpiForTargetComparison - 3.9) / 0.75).toFixed(2)),
      trendSlope: cpiTrend,
      trendLabel: cpiSubParts.length > 0 ? cpiSubParts.join(' · ') : undefined,
      periodLabel: hasYtdAvgCpi
        ? `${pulse?.ytdCpiMonths ?? ''}T/${currentCalendarYear}`
        : vn.cpiYear
          ? `${vn.cpiYear}`
          : gdpPeriod,
      status:
        cpiForTargetComparison <= 4.2
          ? 'good'
          : cpiForTargetComparison <= 4.75
            ? 'watch'
            : 'warn',
    },
  ];

  if (usdVndRate && usdVndRate > 15_000) {
    const fxBenchmark = 25_500;
    const fxPctDiff = Number((((usdVndRate - fxBenchmark) / fxBenchmark) * 100).toFixed(2));
    inflationMetrics.push({
      id: 'vn-fx',
      name: 'Tỷ giá USD/VND (Liên NH & NHTM)',
      actual: Math.round(usdVndRate),
      unit: '₫',
      benchmarkLabel: 'Mốc tham chiếu',
      benchmarkValue: fxBenchmark,
      deltaVsBenchmark: fxPctDiff,
      trendLabel: vcbSell
        ? `VCB bán: ${vcbSell.toLocaleString('en-US')}₫ (${fxPctDiff >= 0 ? '+' : ''}${fxPctDiff}%)`
        : `${fxPctDiff >= 0 ? '+' : ''}${fxPctDiff}% biên độ`,
      periodLabel: 'Live FX',
      status: usdVndRate <= 25_650 ? 'good' : usdVndRate <= 26_100 ? 'watch' : 'warn',
    });
  }

  if (interbank !== undefined) {
    inflationMetrics.push({
      id: 'vn-interbank',
      name: 'Lãi suất Liên ngân hàng VN (Kỳ hạn ngắn)',
      actual: interbank,
      unit: '%',
      benchmarkLabel: 'Vùng cân bằng',
      benchmarkValue: 4.5,
      deltaVsBenchmark: Number((interbank - 4.5).toFixed(2)),
      trendLabel: vn10y !== undefined ? `TPCP 10Y: ${vn10y.toFixed(2)}% · Điều tiết OMO` : undefined,
      periodLabel: 'Live OMO',
      status: interbank <= 5.0 ? 'good' : interbank <= 6.8 ? 'watch' : 'warn',
    });
  }

  const monetaryMetrics: MacroPillarMetric[] = [];

  if (vn10y !== undefined) {
    const spreadVsUs = us10yYield !== undefined ? Number((vn10y - us10yYield).toFixed(2)) : undefined;
    monetaryMetrics.push({
      id: 'vn-10y',
      name: 'Lợi suất Trái phiếu CP Việt Nam 10Y',
      actual: vn10y,
      unit: '%',
      benchmarkLabel: us10yYield !== undefined ? 'TP Mỹ 10Y' : 'Lãi điều hành',
      benchmarkValue: us10yYield ?? 4.5,
      deltaVsBenchmark: spreadVsUs ?? Number((vn10y - 4.5).toFixed(2)),
      trendLabel:
        spreadVsUs !== undefined
          ? `Chênh VN−Mỹ: ${spreadVsUs >= 0 ? '+' : ''}${Math.round(spreadVsUs * 100)} bps`
          : undefined,
      periodLabel: 'Live Bond',
      status: spreadVsUs !== undefined && spreadVsUs < -1.0 ? 'warn' : vn10y <= 5.2 ? 'good' : 'watch',
    });
  }

  // Only display World Bank Current Account directly when it matches the active macro horizon,
  // OR explicitly stamp its lagged year + YTD trade narrowing warning so old 2025 data is NEVER misread as 2026!
  if (currentAccount !== null && currentAccount !== undefined) {
    if (isCabStalePriorYear) {
      monetaryMetrics.push({
        id: 'vn-cab',
        name: `Cán cân Vãng lai / GDP (Số chốt năm ${cabYear})`,
        actual: Number(currentAccount.toFixed(2)),
        unit: '% GDP',
        benchmarkLabel: 'Thặng dư an toàn',
        benchmarkValue: 2.0,
        deltaVsBenchmark: Number((currentAccount - 2.0).toFixed(2)),
        trendLabel:
          ytdTradeB !== undefined && ytdTradeB < 0
            ? `Năm ${currentCalendarYear} thu hẹp (~0.3% GDP do lũy kế nhập siêu)`
            : `Số liệu năm ${cabYear} (công bố trễ 1 năm)`,
        periodLabel: `Năm ${cabYear}`,
        status: ytdTradeB !== undefined && ytdTradeB < -5 ? 'watch' : 'good',
      });
    } else {
      monetaryMetrics.push({
        id: 'vn-cab',
        name: 'Cán cân Vãng lai / GDP (Đệm Ngoại hối)',
        actual: Number(currentAccount.toFixed(2)),
        unit: '% GDP',
        benchmarkLabel: 'Thặng dư an toàn',
        benchmarkValue: 2.0,
        deltaVsBenchmark: Number((currentAccount - 2.0).toFixed(2)),
        periodLabel: yearLabel,
        status: currentAccount >= 2.0 ? 'good' : currentAccount >= 0 ? 'watch' : 'warn',
      });
    }
  }

  monetaryMetrics.push({
    id: 'vn-fdi',
    name: 'Vốn FDI thực hiện ròng / GDP',
    actual: Number(fdi.toFixed(2)),
    unit: '% GDP',
    benchmarkLabel: 'Ngưỡng thu hút tốt',
    benchmarkValue: 3.5,
    deltaVsBenchmark: Number((fdi - 3.5).toFixed(2)),
    periodLabel: yearLabel,
    status: fdi >= 3.5 ? 'good' : fdi >= 2.2 ? 'watch' : 'warn',
  });

  if (creditPctGdp !== null && creditPctGdp !== undefined) {
    monetaryMetrics.push({
      id: 'vn-credit',
      name: 'Tín dụng Tư nhân / GDP (Đòn bẩy nền KT)',
      actual: Number(creditPctGdp.toFixed(1)),
      unit: '% GDP',
      benchmarkLabel: 'Ngưỡng nhạy lãi',
      benchmarkValue: 130.0,
      deltaVsBenchmark: Number((creditPctGdp - 130.0).toFixed(1)),
      periodLabel: yearLabel,
      status: creditPctGdp <= 125 ? 'good' : creditPctGdp <= 138 ? 'watch' : 'warn',
    });
  } else {
    monetaryMetrics.push({
      id: 'vn-uem',
      name: 'Tỷ lệ Thất nghiệp chung',
      actual: Number(unemp.toFixed(2)),
      unit: '%',
      benchmarkLabel: 'Trần ổn định',
      benchmarkValue: 2.5,
      deltaVsBenchmark: Number((unemp - 2.5).toFixed(2)),
      periodLabel: yearLabel,
      status: unemp <= 2.3 ? 'good' : unemp <= 3.0 ? 'watch' : 'warn',
    });
  }

  if (vniQuote?.peRatio && erp) {
    monetaryMetrics.push({
      id: 'vn-erp',
      name: `Phần bù Rủi ro Cổ phiếu ERP (P/E ${vniQuote.peRatio.toFixed(1)}x)`,
      actual: erp.erpPct,
      unit: '%',
      benchmarkLabel: vn10y !== undefined ? `Vs TPCP 10Y (${vn10y}%)` : 'Hấp dẫn vs Lãi TK',
      benchmarkValue: 2.5,
      deltaVsBenchmark: Number((erp.erpPct - 2.5).toFixed(2)),
      trendLabel: vniQuote.pbRatio ? `P/B ${vniQuote.pbRatio.toFixed(2)}x · E/P ${erp.earningsYieldPct}%` : undefined,
      periodLabel: 'HOSE Live',
      status: erp.erpPct >= 2.5 ? 'good' : erp.erpPct >= 1.0 ? 'watch' : 'warn',
    });
  }

  // Smooth continuous pillar scoring centered on true pass/fail economic inflection thresholds
  const growthScore = weightedMean([
    { score: smoothFactorScore(gdp, 5.0, 2.2, false), weight: 0.5 },
    {
      score:
        hasLivePmi && pmi !== undefined
          ? smoothFactorScore(pmi, 49.5, 2.6, false)
          : smoothFactorScore(manf, 5.8, 3.2, false),
      weight: 0.3,
    },
    {
      score:
        pulse?.tradeBalanceBillionUsd !== undefined
          ? smoothFactorScore(pulse.tradeBalanceBillionUsd, 0.2, 3.5, false)
          : smoothFactorScore(exportsGdp, 60, 22, false),
      weight: 0.2,
    },
  ]);

  const inflationScore = weightedMean([
    { score: smoothFactorScore(cpiForTargetComparison, cpiCeiling, 1.15, true), weight: 0.55 },
    ...(usdVndRate && usdVndRate > 15_000
      ? [{ score: smoothFactorScore(usdVndRate, 25_950, 500, true), weight: 0.25 }]
      : []),
    ...(interbank !== undefined
      ? [{ score: smoothFactorScore(interbank, 6.2, 2.2, true), weight: 0.2 }]
      : []),
  ]);

  // Do NOT let a lagged prior-year Current Account (+6.44% in 2025) overstate current-year external buffers when YTD trade is in deficit!
  const effectiveCabForScore =
    isCabStalePriorYear && ytdTradeB !== undefined && ytdTradeB < 0
      ? 0.3
      : currentAccount;

  const monetaryScore = weightedMean([
    { score: smoothFactorScore(fdi, 2.3, 1.4, false), weight: 0.3 },
    { score: smoothFactorScore(unemp, 2.8, 1.0, true), weight: 0.2 },
    ...(effectiveCabForScore !== null && effectiveCabForScore !== undefined
      ? [{ score: smoothFactorScore(effectiveCabForScore, 0.5, 3.2, false), weight: isCabStalePriorYear ? 0.15 : 0.25 }]
      : []),
    ...(erp ? [{ score: smoothFactorScore(erp.erpPct, 1.2, 2.2, false), weight: 0.35 }] : []),
  ]);

  const compositeScore = clampScore(
    growthScore * 0.42 + inflationScore * 0.3 + monetaryScore * 0.28,
  );

  const pmiHealthy = hasLivePmi && pmi !== undefined ? pmi >= 50.0 : manf >= 6.5;
  const classified = classifyRegime({
    growthBeat: gdp >= gdpBenchmark - 0.3 && pmiHealthy,
    inflationContained: cpiForTargetComparison <= cpiCeiling,
    leadingWeakening: hasLivePmi && pmi !== undefined ? pmi < 49.0 : manf < 5.0,
  });

  const warningFlags: EconomyHealthReport['warningFlags'] = [];
  if (gdp >= 7.0 && pmiHealthy) {
    const tradeContext =
      pulse?.tradeBalanceBillionUsd !== undefined
        ? ytdTradeB !== undefined && ytdTradeB < 0
          ? `, tháng gần nhất xuất siêu +$${pulse.tradeBalanceBillionUsd.toFixed(2)}B (nhưng lũy kế năm nhập siêu ${ytdTradeB.toFixed(2)}B$ do nhập máy móc/nguyên liệu)`
          : `, xuất siêu tháng +$${pulse.tradeBalanceBillionUsd.toFixed(2)}B`
        : '';
    warningFlags.push({
      severity: 'good',
      text: `Động lực sản xuất thực rất khỏe: GDP +${gdp.toFixed(2)}%${
        hasLivePmi && pmi !== undefined ? `, PMI Sản xuất đạt ${pmi.toFixed(1)} điểm` : `, Chế biến chế tạo +${manf.toFixed(1)}%`
      }${tradeContext}.`,
    });
  }

  if (cpiForTargetComparison <= cpiCeiling) {
    const spotNote =
      spotMonthlyCpi !== undefined && spotMonthlyCpi > cpiCeiling
        ? ` (dù CPI tháng đơn lẻ tăng ${spotMonthlyCpi.toFixed(2)}% YoY)`
        : '';
    warningFlags.push({
      severity: 'good',
      text: `Lạm phát kiểm soát tốt: CPI bình quân ${cpiForTargetComparison.toFixed(2)}% thấp hơn mục tiêu Quốc hội (${cpiCeiling}%)${spotNote}.`,
    });
  } else {
    const isMildOvershoot = cpiForTargetComparison - cpiCeiling <= 0.35;
    const detailParts: string[] = [];
    if (coreCpi !== undefined) {
      detailParts.push(`lạm phát cơ bản bình quân vẫn kiểm soát thấp hơn ở ${coreCpi.toFixed(2)}%`);
    }
    if (spotMonthlyCpi !== undefined && hasYtdAvgCpi) {
      detailParts.push(`riêng tháng gần nhất tăng ${spotMonthlyCpi.toFixed(2)}% YoY`);
    }
    warningFlags.push({
      severity: isMildOvershoot ? 'warn' : 'critical',
      text: hasYtdAvgCpi
        ? `Theo dõi lạm phát: CPI bình quân ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths} tháng ` : ''}(${cpiForTargetComparison.toFixed(2)}%) vượt ${isMildOvershoot ? 'nhẹ' : ''} mốc ${cpiCeiling}% cả năm của Quốc hội${
            detailParts.length > 0 ? ` (${detailParts.join('; ')})` : ''
          }.`
        : `Theo dõi lạm phát: CPI (${cpiForTargetComparison.toFixed(2)}%) cao hơn mốc tham chiếu ${cpiCeiling}% (lưu ý chỉ tiêu Quốc hội 4.5% tính trên bình quân cả năm).`,
    });
  }

  if (interbank !== undefined && interbank >= 6.5) {
    warningFlags.push({
      severity: 'warn',
      text: `Thanh khoản liên ngân hàng căng cục bộ (${interbank.toFixed(2)}%): Chi phí vốn ngắn hạn tăng làm thu hẹp dư địa giảm lãi vay margin, dù NHNN linh hoạt điều tiết qua kênh OMO.`,
    });
  }

  if (vniQuote?.peRatio && erp && vniQuote.peRatio <= 12.2) {
    warningFlags.push({
      severity: 'good',
      text: `Định giá VN-Index chiết khấu rẻ: P/E ${vniQuote.peRatio.toFixed(2)}x, Phần bù rủi ro ERP +${erp.erpPct.toFixed(2)}% so với TPCP 10Y (${erp.bondYieldUsed}%).`,
    });
  }

  // NEVER claim a stale prior-year Current Account (+6.44% in 2025) as a current-year shield!
  if (currentAccount !== null && currentAccount !== undefined) {
    if (isCabStalePriorYear && ytdTradeB !== undefined && ytdTradeB < 0) {
      warningFlags.push({
        severity: 'warn',
        text: `Đệm cán cân vãng lai thu hẹp trong ${currentCalendarYear}: Số chốt +${currentAccount.toFixed(2)}% GDP là của năm ${cabYear}; năm nay lũy kế nhập siêu (${ytdTradeB.toFixed(2)}B$) khiến thặng dư vãng lai thu hẹp về ~0.3% GDP.`,
      });
    } else if (!isCabStalePriorYear && currentAccount >= 3.0) {
      warningFlags.push({
        severity: 'good',
        text: `Lá chắn ngoại hối vững: Thặng dư Cán cân vãng lai +${currentAccount.toFixed(2)}% GDP hỗ trợ ổn định vĩ mô.`,
      });
    }
  }

  if (usdVndRate && usdVndRate >= 25_700) {
    const spreadTxt =
      vn10y !== undefined && us10yYield !== undefined
        ? ` (Chênh lợi suất VN10Y−US10Y: ${Math.round((vn10y - us10yYield) * 100)} bps)`
        : '';
    const vcbTxt = vcbSell ? `, giá bán NHTM ~${vcbSell.toLocaleString('en-US')}₫` : '';
    warningFlags.push({
      severity: 'warn',
      text: `Áp lực tỷ giá USD/VND (${Math.round(usdVndRate).toLocaleString('en-US')}₫${vcbTxt})${spreadTxt}: Dòng vốn ngoại nhạy cảm lãi suất, buộc NHNN điều tiết nhịp nhàng qua OMO / tín phiếu.`,
    });
  }

  const pillars: MacroPillarGroup[] = [
    { id: 'growth', title: '1. TĂNG TRƯỞNG GDP · PMI & XUẤT SIÊU', score: growthScore, metrics: growthMetrics },
    { id: 'inflation', title: '2. LẠM PHÁT CPI · TỶ GIÁ & LIÊN NGÂN HÀNG', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. TPCP 10Y · VÃNG LAI · FDI & ĐỊNH GIÁ ERP', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'VN',
    title: 'Việt Nam (VNM)',
    subtitle: 'PMI & CPI Tháng · TPCP VN 10Y · Định giá ERP · World Bank',
    compositeScore,
    regime: classified.regime,
    regimeLabel: classified.label,
    regimeSummary: classified.summary,
    quadrant: quad.quadrant,
    quadrantLabel: quad.quadrantLabel,
    growthZ,
    inflationZ,
    pillars,
    warningFlags,
  };
}

export function buildUsGlobalMacroHealth(
  fred: readonly FredMacroMetric[] | undefined,
  sp500PeRatio?: number,
  predictions?: readonly PredictionItem[],
): EconomyHealthReport | null {
  if (!fred || fred.length === 0) return null;

  const byId = new Map(fred.map((m) => [m.id, m]));
  const gdp = byId.get('A191RL1Q225SBEA');
  const retail = byId.get('RSAFS');
  const indpro = byId.get('INDPRO');
  const neworder = byId.get('NEWORDER');
  const corePce = byId.get('PCEPILFE');
  const cpi = byId.get('CPIAUCSL');
  const ppi = byId.get('PPIFIS');
  const fwdInfl5y5y = byId.get('T5YIFR');
  const breakeven10y = byId.get('T10YIE');
  const fedfunds = byId.get('FEDFUNDS');
  const us10y = byId.get('DGS10');
  const unrate = byId.get('UNRATE');
  const spread10y2y = byId.get('T10Y2Y');
  const spread10y3m = byId.get('T10Y3M');

  if (!fedfunds && !spread10y2y && !gdp && !cpi && !corePce) return null;

  const toMetric = (
    m: FredMacroMetric | undefined,
    fallbackBenchmarkLabel: string,
    fallbackBenchmark: number,
    invertGoodDirection = false,
  ): MacroPillarMetric | null => {
    if (!m) return null;
    const bench = m.benchmarkValue ?? fallbackBenchmark;
    const delta = Number((m.value - bench).toFixed(2));
    const slope = m.trendSlope ?? 0;
    const zPart =
      m.zScore !== undefined ? ` · Z ${m.zScore >= 0 ? '+' : ''}${m.zScore.toFixed(1)}σ` : '';
    const slopeStr =
      m.trendSlope !== undefined
        ? `3T/12T ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%${zPart}`
        : m.zScore !== undefined
          ? `Z ${m.zScore >= 0 ? '+' : ''}${m.zScore.toFixed(1)}σ`
          : undefined;

    let status: 'good' | 'watch' | 'warn' = 'good';
    if (invertGoodDirection) {
      if (m.value <= bench + 0.4) status = 'good';
      else if (m.value <= bench + 1.5) status = 'watch';
      else status = 'warn';
    } else {
      if (m.value >= bench) status = 'good';
      else if (m.value >= bench - 1.2) status = 'watch';
      else status = 'warn';
    }

    return {
      id: m.id,
      name: m.subtitle,
      actual: m.value,
      unit: m.unit,
      benchmarkLabel: m.benchmarkLabel ?? fallbackBenchmarkLabel,
      benchmarkValue: bench,
      deltaVsBenchmark: delta,
      zScore: m.zScore,
      trendSlope: m.trendSlope,
      trendLabel: slopeStr,
      periodLabel: m.date.slice(0, 7),
      status,
    };
  };

  const growthMetrics = [
    toMetric(gdp, 'Dự báo IMF/Fed', 2.1, false),
    toMetric(retail, 'Cầu tiêu dùng', 3.5, false),
    toMetric(indpro, 'TB mở rộng', 1.5, false),
    toMetric(neworder, 'Ngưỡng mở rộng', 2.0, false),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const forwardInflMetric = fwdInfl5y5y ?? breakeven10y;
  const inflationMetrics = [
    toMetric(corePce, 'Mục tiêu FOMC', 2.0, true),
    toMetric(cpi, 'Mục tiêu Fed', 2.0, true),
    toMetric(ppi, 'Ngưỡng ổn định', 2.5, true),
    toMetric(forwardInflMetric, 'Neo kỳ vọng Fed', 2.25, true),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const monetaryMetrics = [
    toMetric(fedfunds, 'Trung tính Fed', 3.25, true),
    toMetric(unrate, 'Toàn dụng NAIRU', 4.2, true),
    toMetric(spread10y2y, 'Ngưỡng suy thoái', 0.0, false),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const usErp =
    sp500PeRatio !== undefined && us10y !== undefined
      ? computeVietnamEquityRiskPremium(sp500PeRatio, us10y.value)
      : null;

  if (sp500PeRatio && usErp && us10y) {
    monetaryMetrics.push({
      id: 'us-erp',
      name: `Phần bù Rủi ro S&P 500 ERP (P/E ${sp500PeRatio.toFixed(1)}x)`,
      actual: usErp.erpPct,
      unit: '%',
      benchmarkLabel: `Vs US 10Y (${us10y.value.toFixed(2)}%)`,
      benchmarkValue: 1.0,
      deltaVsBenchmark: Number((usErp.erpPct - 1.0).toFixed(2)),
      trendLabel: `E/P ${usErp.earningsYieldPct}% − TP 10Y ${us10y.value.toFixed(2)}%`,
      periodLabel: 'S&P Live',
      status: usErp.erpPct >= 1.0 ? 'good' : usErp.erpPct >= 0 ? 'watch' : 'warn',
    });
  }

  const gdpVal = gdp?.value ?? 2.2;
  const retailVal = retail?.value ?? 3.5;
  const indVal = indpro?.value ?? 1.5;
  const orderVal = neworder?.value ?? 2.0;
  const pceVal = corePce?.value ?? cpi?.value ?? 2.5;
  const cpiVal = cpi?.value ?? pceVal;
  const ppiVal = ppi?.value ?? 2.5;
  const fwdVal = forwardInflMetric?.value ?? 2.3;
  const fedVal = fedfunds?.value ?? 3.25;
  const unrateVal = unrate?.value ?? 4.1;
  const curveVal = spread10y2y?.value ?? 0.25;
  const recessionProb12m =
    spread10y3m !== undefined
      ? computeNyFedRecessionProb12m(spread10y3m.value)
      : spread10y2y !== undefined
        ? computeNyFedRecessionProb12m(spread10y2y.value)
        : undefined;

  // Blend structural target gap Z with actual rolling 12-period empirical Z-Score from FRED
  const blendZ = (structural: number, empirical?: number) =>
    empirical !== undefined ? structural * 0.6 + empirical * 0.4 : structural;

  const growthZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        blendZ((gdpVal - 2.1) / 1.0, gdp?.zScore) * 0.4 +
        blendZ((retailVal - 3.5) / 2.2, retail?.zScore) * 0.25 +
        blendZ((indVal - 1.5) / 1.5, indpro?.zScore) * 0.2 +
        blendZ((orderVal - 2.0) / 3.5, neworder?.zScore) * 0.15,
      ),
    ).toFixed(2),
  );
  const inflationZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        blendZ((pceVal - 2.2) / 0.6, corePce?.zScore) * 0.42 +
        blendZ((cpiVal - 2.3) / 0.7, cpi?.zScore) * 0.25 +
        blendZ((ppiVal - 2.5) / 1.2, ppi?.zScore) * 0.18 +
        blendZ((fwdVal - 2.25) / 0.35, forwardInflMetric?.zScore) * 0.15,
      ),
    ).toFixed(2),
  );
  const quad = classifyMacroQuadrant(growthZ, inflationZ);

  const growthScore = weightedMean([
    { score: smoothFactorScore(gdpVal, 1.4, 1.5, false), weight: 0.38 },
    ...(retail ? [{ score: smoothFactorScore(retailVal, 2.2, 2.6, false), weight: 0.24 }] : []),
    { score: smoothFactorScore(indVal, 0.4, 1.8, false), weight: 0.22 },
    { score: smoothFactorScore(orderVal, 0.5, 4.5, false), weight: 0.16 },
  ]);

  const inflationScore = weightedMean([
    { score: smoothFactorScore(pceVal, 2.8, 0.9, true), weight: 0.42 },
    { score: smoothFactorScore(cpiVal, 3.0, 1.0, true), weight: 0.26 },
    { score: smoothFactorScore(ppiVal, 3.4, 2.0, true), weight: 0.18 },
    ...(forwardInflMetric
      ? [{ score: smoothFactorScore(fwdVal, 2.45, 0.4, true), weight: 0.14 }]
      : []),
  ]);

  const monetaryScore = weightedMean([
    { score: smoothFactorScore(fedVal, 4.2, 1.3, true), weight: 0.3 },
    { score: smoothFactorScore(unrateVal, 4.6, 0.85, true), weight: 0.35 },
    { score: smoothFactorScore(curveVal, 0.0, 0.5, false), weight: 0.35 },
  ]);

  const compositeScore = clampScore(
    growthScore * 0.4 + inflationScore * 0.32 + monetaryScore * 0.28,
  );

  const growthBeat = gdpVal >= 2.0 && indVal >= 0 && (!retail || retailVal >= 1.5);
  const inflationContained = pceVal <= 2.8 && cpiVal <= 2.9 && ppiVal <= 3.8;
  const leadingWeakening =
    (neworder?.trendSlope !== undefined && neworder.trendSlope < -2.0 && orderVal < 0) ||
    curveVal < 0;

  const classified = classifyRegime({
    growthBeat,
    inflationContained,
    leadingWeakening,
  });

  const warningFlags: EconomyHealthReport['warningFlags'] = [];

  if (curveVal < 0) {
    warningFlags.push({
      severity: 'critical',
      text: `Đường cong lợi suất 10Y–2Y đảo ngược (${curveVal.toFixed(2)}%): Tín hiệu lịch sử cảnh báo sớm suy thoái kinh tế Mỹ${recessionProb12m !== undefined ? ` (Xác suất suy thoái 12T NY Fed: ${recessionProb12m}%)` : ''
        }.`,
    });
  } else {
    warningFlags.push({
      severity: recessionProb12m !== undefined && recessionProb12m >= 35 ? 'warn' : 'good',
      text: `Đường cong lợi suất 10Y–2Y dương (+${curveVal.toFixed(2)}%)${recessionProb12m !== undefined
        ? ` · Xác suất suy thoái 12T (NY Fed 10Y–3M): ${recessionProb12m}%`
        : ': Chưa xuất hiện tín hiệu đảo ngược suy thoái'
        }.`,
    });
  }

  const polyMacro = extractPolymarketMacroInsight(predictions);
  if (polyMacro) {
    warningFlags.push({
      severity: polyMacro.bias === 'hawkish_hike' ? 'warn' : polyMacro.bias === 'dovish_cut' ? 'good' : 'good',
      text: `Thị trường dự đoán tiền thật Polymarket ($${(polyMacro.fedVolumeUsd / 1_000_000).toFixed(1)}M): ${polyMacro.fedActionLabel} (${polyMacro.fedContractTitle}).`,
    });
  }

  if (corePce && corePce.value > 2.6) {
    const anchoredNote =
      forwardInflMetric && forwardInflMetric.value <= 2.45
        ? ` (kỳ vọng trái phiếu ngày neo ở ${forwardInflMetric.value.toFixed(2)}%)`
        : forwardInflMetric && forwardInflMetric.value >= 2.65
          ? ` kèm kỳ vọng dài hạn dâng lên ${forwardInflMetric.value.toFixed(2)}%`
          : '';
    warningFlags.push({
      severity: 'warn',
      text: `Thước đo FOMC Core PCE (+${corePce.value.toFixed(2)}%) cao hơn mục tiêu 2.0%${anchoredNote} — Fed thận trọng lãi suất.`,
    });
  } else if (ppi && cpi && ppi.value - cpi.value >= 1.0) {
    warningFlags.push({
      severity: 'warn',
      text: `Áp lực chi phí đầu vào: PPI (+${ppi.value.toFixed(2)}%) vượt xa CPI (+${cpi.value.toFixed(2)}%), báo trước rủi ro lạm phát tiêu dùng neo cao.`,
    });
  } else if (cpi && cpi.value > 3.0) {
    warningFlags.push({
      severity: 'warn',
      text: `Lạm phát Mỹ (${cpi.value.toFixed(2)}%) cao hơn mục tiêu 2.0% của Fed (+${(cpi.value - 2.0).toFixed(2)}%).`,
    });
  }

  if (usErp && usErp.erpPct < 0) {
    warningFlags.push({
      severity: 'warn',
      text: `Định giá S&P 500 đắt so với trái phiếu: P/E ${sp500PeRatio?.toFixed(1)}x làm Phần bù rủi ro ERP Mỹ âm (${usErp.erpPct.toFixed(2)}%).`,
    });
  } else if (retail && retail.value >= 4.0) {
    warningFlags.push({
      severity: 'good',
      text: `Cầu tiêu dùng Mỹ vững: Doanh số bán lẻ (68% GDP) tăng +${retail.value.toFixed(1)}% YoY${neworder ? `, đơn hàng nhà máy ${neworder.value >= 0 ? '+' : ''}${neworder.value.toFixed(1)}%` : ''
        }.`,
    });
  } else if (neworder && neworder.value >= 3.0) {
    warningFlags.push({
      severity: 'good',
      text: `Chỉ báo dẫn dắt sản xuất khỏe: Đơn hàng nhà máy tăng +${neworder.value.toFixed(1)}% YoY, hỗ trợ GDP 1–2 quý tới.`,
    });
  }

  const pillars: MacroPillarGroup[] = [
    { id: 'growth', title: '1. TĂNG TRƯỞNG · BÁN LẺ & SẢN XUẤT', score: growthScore, metrics: growthMetrics },
    { id: 'inflation', title: '2. CORE PCE · CPI & KỲ VỌNG LẠM PHÁT NGÀY', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. LÃI SUẤT FED · VIỆC LÀM & ĐỊNH GIÁ ERP MỸ', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'US',
    title: 'Hoa Kỳ / Toàn cầu (US)',
    subtitle: 'St. Louis Fed (FRED) · Core PCE · Polymarket FOMC · Định giá ERP',
    compositeScore,
    regime: classified.regime,
    regimeLabel: classified.label,
    regimeSummary: classified.summary,
    quadrant: quad.quadrant,
    quadrantLabel: quad.quadrantLabel,
    growthZ,
    inflationZ,
    ...(recessionProb12m !== undefined ? { recessionProb12m } : {}),
    pillars,
    warningFlags,
  };
}

export function evaluateMacroHealth(
  markets: MarketSnapshot,
  predictions?: readonly PredictionItem[],
): {
  vn: EconomyHealthReport | null;
  us: EconomyHealthReport | null;
} {
  const vnRow = markets.macro.find((r) => r.countryCode === 'VNM' || r.isVietnam);
  const usdVnd = markets.quotes.find((q) => q.symbol === 'USD/VND')?.price;
  const vniQuote = markets.quotes.find((q) => q.symbol === 'VN-Index');
  const us10y = (markets.fred ?? []).find((m) => m.id === 'DGS10')?.value;

  return {
    vn: buildVietnamMacroHealth(vnRow, usdVnd, vniQuote, markets.vnMacroPulse, us10y),
    us: buildUsGlobalMacroHealth(markets.fred, markets.vnMacroPulse?.sp500PeRatio, predictions),
  };
}

function buildTrendSignal(
  quote: MarketQuote | undefined,
  id: string,
  label: string,
): { signal: LeadingCompassSignal; aboveMa200: boolean; pctVsMa200: number } | null {
  if (!quote || quote.ma200 === undefined || quote.ma200 <= 0) return null;

  const pctVsMa200 = Number((((quote.price - quote.ma200) / quote.ma200) * 100).toFixed(1));
  const aboveMa200 = quote.price >= quote.ma200;
  const aboveMa50 = quote.ma50 !== undefined ? quote.price >= quote.ma50 : aboveMa200;
  const rsiText = quote.rsi14 !== undefined ? ` · RSI ${quote.rsi14.toFixed(0)}` : '';

  let badge = 'TRÊN MA200 · UPTREND';
  let tone: LeadingCompassSignal['tone'] = 'bullish';

  if (!aboveMa200) {
    badge = quote.rsi14 !== undefined && quote.rsi14 <= 32 ? 'DƯỚI MA200 · QUÁ BÁN' : 'GÃY MA200 · PHÒNG THỦ';
    tone = 'bearish';
  } else if (!aboveMa50) {
    badge = 'CHỈNH NGẮN TRÊN MA200';
    tone = 'neutral';
  } else if (quote.rsi14 !== undefined && quote.rsi14 >= 74) {
    badge = 'TRÊN MA200 · QUÁ MUA';
    tone = 'neutral';
  }

  return {
    aboveMa200,
    pctVsMa200,
    signal: {
      id,
      label,
      category: 'market_trend',
      valueDisplay: `${Math.round(quote.price).toLocaleString('en-US')}`,
      subtext: `MA200: ${Math.round(quote.ma200).toLocaleString('en-US')} (${pctVsMa200 >= 0 ? '+' : ''}${pctVsMa200}%)${rsiText}`,
      signalBadge: badge,
      tone,
    },
  };
}

/**
 * Dynamic Quantitative Tactical Asset Allocation Router (All-Weather × ERP × MA200 × Net Liquidity)
 * Guarantees exact integer weights summing strictly to 100%.
 */
export function computeDynamicPortfolioAllocation(params: {
  stance: InvestmentStance;
  riskAppetiteScore: number;
  vnErpPct?: number;
  dualConfirmation?: InvestmentCompassReport['dualConfirmation'];
  capitulationSignal?: boolean;
  highInflationPressure: boolean;
  liquidityExpanding: boolean;
}): PortfolioAllocationSlice[] {
  const {
    stance,
    riskAppetiteScore,
    vnErpPct,
    dualConfirmation,
    capitulationSignal,
    highInflationPressure,
    liquidityExpanding,
  } = params;

  let equities = 50;
  let cashBonds = 30;
  let gold = 15;
  let crypto = 5;

  if (stance === 'defensive_recession') {
    equities = 20;
    cashBonds = 55;
    gold = 23;
    crypto = 2;
  } else if (stance === 'cautious') {
    equities = 35;
    cashBonds = 43;
    gold = 18;
    crypto = 4;
  } else if (stance === 'risk_on') {
    equities = 66;
    cashBonds = 16;
    gold = 10;
    crypto = 8;
  } else {
    equities = 52;
    cashBonds = 28;
    gold = 14;
    crypto = 6;
  }

  if (dualConfirmation === 'macro_bull_trend_weak') {
    const shift = capitulationSignal ? 6 : 10;
    equities -= shift;
    cashBonds += shift;
  } else if (dualConfirmation === 'confirmed_bull' && riskAppetiteScore >= 72) {
    equities += 6;
    cashBonds -= 6;
  }

  if (vnErpPct !== undefined) {
    if (vnErpPct >= 3.5) {
      equities += 7;
      cashBonds -= 7;
    } else if (vnErpPct <= 0.8) {
      equities -= 8;
      cashBonds += 8;
    }
  }

  if (highInflationPressure) {
    gold += 3;
    cashBonds -= 3;
  }
  if (!liquidityExpanding && crypto > 3) {
    const cut = crypto - 3;
    crypto = 3;
    cashBonds += cut;
  }

  equities = Math.max(15, Math.min(78, Math.round(equities)));
  gold = Math.max(8, Math.min(28, Math.round(gold)));
  crypto = Math.max(0, Math.min(12, Math.round(crypto)));
  cashBonds = Math.max(10, 100 - equities - gold - crypto);
  const diff = 100 - (equities + cashBonds + gold + crypto);
  cashBonds += diff;

  return [
    {
      id: 'equities',
      label: 'Cổ phiếu chất lượng',
      weightPct: equities,
      note:
        dualConfirmation === 'macro_bull_trend_weak'
          ? vnErpPct && vnErpPct >= 3.2
            ? 'P/E rẻ — gom dần tiền mặt'
            : 'Chờ lấy lại MA200'
          : 'Tập trung ngành dẫn dắt pha vĩ mô',
      colorHex: '#10b981',
    },
    {
      id: 'cash_bonds',
      label: 'Tiền gửi · Trái phiếu',
      weightPct: cashBonds,
      note:
        dualConfirmation === 'macro_bull_trend_weak'
          ? 'Sức mua chờ vượt MA200'
          : 'Đệm thanh khoản & lãi thực',
      colorHex: '#38bdf8',
    },
    {
      id: 'gold',
      label: 'Vàng nhẫn 9999',
      weightPct: gold,
      note: highInflationPressure ? 'Phòng hộ lạm phát & tỷ giá' : 'Bảo hiểm rủi ro địa chính trị',
      colorHex: '#f59e0b',
    },
    {
      id: 'crypto',
      label: 'Tài sản số (BTC/ETH)',
      weightPct: crypto,
      note: liquidityExpanding ? 'Theo nhịp bơm tiền M2/Fed' : 'Tỷ trọng nhỏ không đòn bẩy',
      colorHex: '#a855f7',
    },
  ];
}

export function evaluateInvestmentCompass(
  markets: MarketSnapshot,
  predictions?: readonly PredictionItem[],
): InvestmentCompassReport | null {
  const fredById = new Map((markets.fred ?? []).map((m) => [m.id, m]));
  const quoteBySym = new Map(markets.quotes.map((q) => [q.symbol, q]));
  const pulse = markets.vnMacroPulse;

  const m2 = fredById.get('M2SL');
  const walcl = fredById.get('WALCL');
  const wtregen = fredById.get('WTREGEN');
  const rrp = fredById.get('RRPONTSYD');
  const nfci = fredById.get('NFCI');
  const stlfsi = fredById.get('STLFSI4');
  const hySpread = fredById.get('BAMLH0A0HYM2');
  const realYield = fredById.get('DFII10');
  const us10y = fredById.get('DGS10');
  const t10y3m = fredById.get('T10Y3M');
  const sahm = fredById.get('SAHMREALTIME');
  const icsa = fredById.get('ICSA');
  const permit = fredById.get('PERMIT');
  const sloos = fredById.get('DRTSCILM');
  const curve = fredById.get('T10Y2Y');
  const vixSpot = fredById.get('VIXCLS');
  const corePce = fredById.get('PCEPILFE');
  const fwdInfl = fredById.get('T5YIFR') ?? fredById.get('T10YIE');

  const copper = quoteBySym.get('Copper');
  const gold = quoteBySym.get('Gold');
  const sox = quoteBySym.get('SOX Semi');
  const spx = quoteBySym.get('S&P 500');
  const vix3m = quoteBySym.get('VIX 3M');
  const vni = quoteBySym.get('VN-Index');
  const usdVnd = quoteBySym.get('USD/VND');
  const audJpy = quoteBySym.get('AUD/JPY');
  const sjcGold = markets.vnGold?.find((g) => g.code === 'SJC');

  if (!m2 && !nfci && !hySpread && !realYield && !copper && !sox && !walcl && !vni) {
    return null;
  }

  // 5 Continuous Factor Sub-Score Accumulators (0..100 each)
  const f1Liquidity: Array<{ score: number; weight: number }> = [];
  const f2CreditRecession: Array<{ score: number; weight: number }> = [];
  const f3ValuationErp: Array<{ score: number; weight: number }> = [];
  const f4TrendBreadth: Array<{ score: number; weight: number }> = [];
  const f5FxVolatility: Array<{ score: number; weight: number }> = [];

  const signals: LeadingCompassSignal[] = [];

  // 0. Institutional Fed Net Liquidity: (WALCL - TGA) - RRP
  const netLiq = computeFedNetLiquidity({
    walclMillions: walcl?.value,
    wtregenMillions: wtregen?.value,
    rrpBillions: rrp?.value,
    walclDelta4pMillions: walcl?.delta4p,
    wtregenDelta4pMillions: wtregen?.delta4p,
    rrpDelta4pBillions: rrp?.delta4p,
  });

  if (netLiq) {
    f1Liquidity.push({
      score: smoothFactorScore(netLiq.delta4wBillions, 0, 75, false),
      weight: 0.28,
    });
    const trillions = (netLiq.netLiquidityBillions / 1000).toFixed(2);
    signals.push({
      id: 'fed-net-liq',
      label: 'Thanh khoản Ròng Fed',
      category: 'liquidity',
      valueDisplay: `$${trillions}T`,
      subtext: `4T: ${netLiq.delta4wBillions >= 0 ? '+' : ''}${netLiq.delta4wBillions.toFixed(0)}B$ (WALCL−TGA−RRP)`,
      signalBadge:
        netLiq.delta4wBillions >= 30
          ? 'BƠM RÒNG MẠNH'
          : netLiq.delta4wBillions <= -60
            ? 'HÚT THANH KHOẢN'
            : 'THANH KHOẢN ỔN ĐỊNH',
      tone:
        netLiq.delta4wBillions >= 20
          ? 'bullish'
          : netLiq.delta4wBillions <= -60
            ? 'bearish'
            : 'neutral',
    });
  }

  // 1. M2 Money Supply YoY
  if (m2) {
    const val = m2.value;
    f1Liquidity.push({ score: smoothFactorScore(val, 1.0, 2.8, false), weight: 0.36 });
    signals.push({
      id: 'm2',
      label: 'Cung tiền M2 (YoY)',
      category: 'liquidity',
      valueDisplay: `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`,
      subtext: val >= 0 ? 'Bơm thanh khoản vào hệ thống' : 'Thanh khoản thu hẹp',
      signalBadge: val >= 3.5 ? 'BƠM TIỀN MẠNH' : val >= 0 ? 'MỞ RỘNG NHẸ' : 'THẮT CHẶT',
      tone: val >= 3.5 ? 'bullish' : val >= 0 ? 'neutral' : 'bearish',
    });
  }

  // 2. Chicago Fed NFCI + St. Louis Fed Financial Stress (STLFSI4)
  if (nfci) {
    const val = nfci.value;
    f1Liquidity.push({ score: smoothFactorScore(val, 0.0, 0.32, true), weight: 0.3 });
    if (stlfsi) {
      f1Liquidity.push({ score: smoothFactorScore(stlfsi.value, 0.0, 0.65, true), weight: 0.14 });
    }

    signals.push({
      id: 'nfci',
      label: 'Điều kiện Tài chính (NFCI)',
      category: 'liquidity',
      valueDisplay: val.toFixed(2),
      subtext:
        stlfsi !== undefined
          ? `Stress STLFSI4: ${stlfsi.value >= 0 ? '+' : ''}${stlfsi.value.toFixed(2)} (<0 êm ả)`
          : walcl !== undefined && walcl.unit === '%'
            ? `Bảng CĐKT Fed: ${walcl.value >= 0 ? '+' : ''}${walcl.value.toFixed(1)}% YoY`
            : '< 0 là vốn dồi dào, dễ vay',
      signalBadge:
        val < 0 && (!stlfsi || stlfsi.value < 0.35) ? 'VỐN NỚI LỎNG' : 'CĂNG THANH KHOẢN',
      tone: val <= -0.15 && (!stlfsi || stlfsi.value < 0.25) ? 'bullish' : val <= 0.05 ? 'neutral' : 'bearish',
    });
  }

  // Polymarket Real-Money FOMC Expectations
  const polyMacro = extractPolymarketMacroInsight(predictions);
  if (polyMacro) {
    const polyScore =
      polyMacro.bias === 'dovish_cut'
        ? 65 + Math.min(25, (polyMacro.fedProbPct - 45) * 0.5)
        : polyMacro.bias === 'hawkish_hike'
          ? 42 - Math.min(24, (polyMacro.fedProbPct - 45) * 0.45)
          : 55;
    f1Liquidity.push({ score: polyScore, weight: 0.18 });

    signals.push({
      id: 'polymarket-fed',
      label: 'Kỳ vọng Fed (Polymarket)',
      category: 'liquidity',
      valueDisplay: polyMacro.fedActionLabel,
      subtext: `Vol $${(polyMacro.fedVolumeUsd / 1_000_000).toFixed(1)}M · Tiền thật cược FOMC`,
      signalBadge:
        polyMacro.bias === 'dovish_cut'
          ? 'CƯỢC HẠ LÃI · BỒ CÂU'
          : polyMacro.bias === 'hawkish_hike'
            ? 'CƯỢC TĂNG LÃI · DIỀU HÂU'
            : 'GIỮ NGUYÊN LÃI SUẤT',
      tone:
        polyMacro.bias === 'dovish_cut'
          ? 'bullish'
          : polyMacro.bias === 'hawkish_hike'
            ? 'bearish'
            : 'neutral',
    });
  }

  // 3. High-Yield Credit Spread + Bank Lending SLOOS
  if (hySpread) {
    const val = hySpread.value;
    f2CreditRecession.push({ score: smoothFactorScore(val, 4.5, 0.75, true), weight: 0.38 });
    if (sloos) {
      f2CreditRecession.push({ score: smoothFactorScore(sloos.value, 15.0, 15.0, true), weight: 0.15 });
    }

    signals.push({
      id: 'hy-spread',
      label: 'Chênh lệch Tín dụng HY',
      category: 'credit_rates',
      valueDisplay: `${val.toFixed(2)}%`,
      subtext:
        sloos !== undefined
          ? `NH siết vay DN (SLOOS): ${sloos.value >= 0 ? '+' : ''}${sloos.value.toFixed(1)}%`
          : 'Đo rủi ro vỡ nợ trái phiếu DN',
      signalBadge: val < 4.0 ? 'TÍN DỤNG AN TOÀN' : val < 4.8 ? 'THEO DÕI' : 'THÁO CHẠY RỦI RO',
      tone: val < 4.0 ? 'bullish' : val < 4.8 ? 'neutral' : 'bearish',
    });
  }

  // 4. 10Y Real TIPS Yield
  if (realYield) {
    const val = realYield.value;
    f3ValuationErp.push({ score: smoothFactorScore(val, 2.35, 0.95, true), weight: 0.22 });

    signals.push({
      id: 'real-yield',
      label: 'Lãi suất Thực 10Y (TIPS)',
      category: 'credit_rates',
      valueDisplay: `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`,
      subtext: val >= 2.3 ? 'Kìm P/E đắt & ngành nợ vay cao' : 'Hỗ trợ Vàng & Cổ phiếu Tech',
      signalBadge: val >= 2.3 ? 'LÃI THỰC CAO' : val <= 1.5 ? 'HỖ TRỢ ĐỊNH GIÁ' : 'TRUNG TÍNH',
      tone: val >= 2.4 ? 'bearish' : val <= 1.5 ? 'bullish' : 'neutral',
    });
  }

  // 5. Dr. Copper / Gold Ratio
  if (copper && gold && gold.price > 0) {
    const ratio = Number(((copper.price * 1000) / gold.price).toFixed(2));
    const copperExpanding =
      copper.changePercent24h >= 0 && copper.changePercent24h >= gold.changePercent24h;
    const broadCommoditySelloff =
      copper.changePercent24h <= -1.0 && gold.changePercent24h <= -1.0;

    f4TrendBreadth.push({
      score: copperExpanding ? 72 : broadCommoditySelloff ? 38 : 54,
      weight: 0.12,
    });

    signals.push({
      id: 'copper-gold',
      label: 'Tỷ lệ Đồng / Vàng',
      category: 'cycle_tech',
      valueDisplay: `${ratio.toFixed(2)}x`,
      subtext: `Đồng $${copper.price.toFixed(2)}/lb (${copper.changePercent24h >= 0 ? '+' : ''}${copper.changePercent24h.toFixed(1)}%)`,
      signalBadge: copperExpanding
        ? 'CẦU SẢN XUẤT TỐT'
        : broadCommoditySelloff
          ? 'ÁP LỰC BÁN HÀNG HÓA'
          : 'THIÊN VỀ TRÚ ẨN',
      tone: copperExpanding ? 'bullish' : broadCommoditySelloff ? 'bearish' : 'neutral',
    });
  }

  // 6. PHLX Semiconductor Index (^SOX)
  if (sox) {
    const up = sox.changePercent24h >= 0;
    const hasMa200 = sox.ma200 !== undefined && sox.ma200 > 0;
    const aboveSoxMa200 = hasMa200 ? sox.price >= sox.ma200! : up;
    const soxPctMa200 = hasMa200 ? ((sox.price - sox.ma200!) / sox.ma200!) * 100 : sox.changePercent24h * 2;

    f4TrendBreadth.push({
      score: smoothFactorScore(soxPctMa200, 0, 8.0, false),
      weight: 0.18,
    });

    signals.push({
      id: 'sox',
      label: 'Chu kỳ Bán dẫn AI (SOX)',
      category: 'cycle_tech',
      valueDisplay: `${Math.round(sox.price).toLocaleString('en-US')}`,
      subtext: hasMa200
        ? `MA200: ${Math.round(sox.ma200!).toLocaleString('en-US')} · 24h ${up ? '+' : ''}${sox.changePercent24h.toFixed(1)}%`
        : `24h: ${up ? '+' : ''}${sox.changePercent24h.toFixed(2)}% · Dẫn dắt CNTT & ĐTử`,
      signalBadge: aboveSoxMa200
        ? 'CHU KỲ AI MẠNH'
        : hasMa200
          ? 'DƯỚI MA200 · ĐIỀU CHỈNH'
          : 'NHỊP ĐIỀU CHỈNH',
      tone: aboveSoxMa200 ? 'bullish' : hasMa200 ? 'bearish' : 'neutral',
    });
  }

  // 7. NY Fed 12-Month Recession Probability (10Y-3M Probit)
  const recessionProb12m =
    t10y3m !== undefined ? computeNyFedRecessionProb12m(t10y3m.value) : undefined;
  if (t10y3m && recessionProb12m !== undefined) {
    f2CreditRecession.push({
      score: smoothFactorScore(recessionProb12m, 32.0, 14.0, true),
      weight: 0.22,
    });

    signals.push({
      id: 'nyfed-prob',
      label: 'Xác suất Suy thoái NY Fed',
      category: 'recession_watch',
      valueDisplay: `${recessionProb12m.toFixed(1)}%`,
      subtext: `Spread 10Y–3M: ${t10y3m.value >= 0 ? '+' : ''}${t10y3m.value.toFixed(2)}% (12T tới)`,
      signalBadge:
        recessionProb12m >= 45
          ? 'RỦI RO SUY THOÁI CAO'
          : recessionProb12m >= 30
            ? 'THEO DÕI CHẶT'
            : 'RỦI RO THẤP',
      tone: recessionProb12m >= 45 ? 'bearish' : recessionProb12m >= 30 ? 'neutral' : 'bullish',
    });
  }

  // 8. Sahm Rule + Weekly Jobless Claims
  if (sahm) {
    const val = sahm.value;
    f2CreditRecession.push({ score: smoothFactorScore(val, 0.42, 0.2, true), weight: 0.22 });

    const claimsK = icsa ? Math.round(icsa.value / 1000) : null;
    if (claimsK !== null) {
      f2CreditRecession.push({ score: smoothFactorScore(claimsK, 255, 32, true), weight: 0.14 });
    }

    signals.push({
      id: 'sahm-claims',
      label: 'Quy tắc Suy thoái Sahm',
      category: 'recession_watch',
      valueDisplay: `${val.toFixed(2)} / 0.50`,
      subtext: claimsK !== null ? `Trợ cấp thất nghiệp tuần: ${claimsK}k đơn` : 'Báo động đỏ khi ≥ 0.50',
      signalBadge: val >= 0.5 ? 'BÁO ĐỘNG SUY THOÁI' : val >= 0.35 ? 'CẢNH GIÁC' : 'CHƯA SUY THOÁI',
      tone: val >= 0.5 ? 'bearish' : val >= 0.35 ? 'neutral' : 'bullish',
    });
  }

  if (curve) {
    f2CreditRecession.push({ score: smoothFactorScore(curve.value, 0.05, 0.35, false), weight: 0.1 });
  }

  // 9. Building Permits YoY (Leading Real Estate 6–9m)
  if (permit) {
    const val = permit.value;
    f3ValuationErp.push({ score: smoothFactorScore(val, -1.0, 7.0, false), weight: 0.15 });

    signals.push({
      id: 'permits',
      label: 'Giấy phép Xây dựng (YoY)',
      category: 'recession_watch',
      valueDisplay: `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`,
      subtext: 'Đi trước chu kỳ Bất động sản 6–9 tháng',
      signalBadge: val >= 0 ? 'BĐS PHỤC HỒI' : 'BĐS CHỊU ÁP LỰC LÃI',
      tone: val >= 1 ? 'bullish' : val >= -4 ? 'neutral' : 'bearish',
    });
  }

  // 10. VN-Index Valuation P/E & Live Equity Risk Premium (using live VN 10Y Bond Yield!)
  const vnErp = computeVietnamEquityRiskPremium(vni?.peRatio, pulse?.vn10yYieldPct ?? 5.2);
  if (vni?.peRatio && vnErp) {
    const pe = vni.peRatio;
    f3ValuationErp.push({ score: smoothFactorScore(vnErp.erpPct, 2.2, 2.0, false), weight: 0.4 });

    signals.push({
      id: 'vn-pe-erp',
      label: 'Định giá VN-Index (ERP)',
      category: 'valuation_breadth',
      valueDisplay: `${pe.toFixed(2)}x`,
      subtext: `ERP ${vnErp.erpPct >= 0 ? '+' : ''}${vnErp.erpPct.toFixed(2)}% vs TP10Y (${vnErp.bondYieldUsed}%)`,
      signalBadge:
        pe <= 12.0
          ? 'ĐỊNH GIÁ RẺ · TÍCH SẢN'
          : pe <= 15.2
            ? 'ĐỊNH GIÁ HỢP LÝ'
            : 'ĐỊNH GIÁ ĐẮT',
      tone: pe <= 12.5 ? 'bullish' : pe <= 15.8 ? 'neutral' : 'bearish',
    });
  }

  // 10b. S&P 500 Valuation & US ERP (vs US 10Y Treasury Yield)
  const usErp =
    pulse?.sp500PeRatio !== undefined && us10y !== undefined
      ? computeVietnamEquityRiskPremium(pulse.sp500PeRatio, us10y.value)
      : null;
  if (pulse?.sp500PeRatio && usErp && us10y) {
    f3ValuationErp.push({ score: smoothFactorScore(usErp.erpPct, 0.8, 1.8, false), weight: 0.2 });

    signals.push({
      id: 'us-pe-erp',
      label: 'Định giá S&P 500 (ERP Mỹ)',
      category: 'valuation_breadth',
      valueDisplay: `${pulse.sp500PeRatio.toFixed(1)}x`,
      subtext: `ERP ${usErp.erpPct >= 0 ? '+' : ''}${usErp.erpPct.toFixed(2)}% vs US10Y (${us10y.value.toFixed(2)}%)`,
      signalBadge:
        usErp.erpPct >= 1.2
          ? 'PHỐ WALL HẤP DẪN'
          : usErp.erpPct >= 0
            ? 'ĐỊNH GIÁ TRUNG TÍNH'
            : 'ERP ÂM · ĐỊNH GIÁ ĐẮT',
      tone: usErp.erpPct >= 1.2 ? 'bullish' : usErp.erpPct >= 0 ? 'neutral' : 'bearish',
    });
  }

  // 11. Internal VN30 Market Breadth (% > MA50 / MA200)
  const breadth = computeVn30MarketBreadth(markets.vn30);
  if (breadth) {
    f4TrendBreadth.push({
      score: smoothFactorScore(breadth.aboveMa200Pct, 48, 26, false),
      weight: 0.22,
    });

    signals.push({
      id: 'vn30-breadth',
      label: 'Độ rộng Nội tại VN30',
      category: 'valuation_breadth',
      valueDisplay: `${breadth.aboveMa50Pct}% >MA50`,
      subtext: `Trên MA200: ${breadth.aboveMa200Pct}%${breadth.medianRsi14 !== undefined ? ` · RSI vị ${breadth.medianRsi14}` : ''
        }`,
      signalBadge:
        breadth.aboveMa200Pct >= 60
          ? 'DÒNG TIỀN LAN TỎA'
          : breadth.aboveMa50Pct <= 25
            ? 'QUÁ BÁN DIỆN RỘNG'
            : 'PHÂN HÓA CỔ PHIẾU',
      tone:
        breadth.aboveMa200Pct >= 60
          ? 'bullish'
          : breadth.aboveMa50Pct <= 25
            ? 'bearish'
            : 'neutral',
    });
  }

  // 12. Volatility Term Structure (VIX / VIX3M) & Spot VIX
  let vixTermRatio: number | undefined;
  let capitulationSignal = false;
  let capitulationLabel: string | undefined;

  if (vixSpot) {
    f5FxVolatility.push({ score: smoothFactorScore(vixSpot.value, 20.0, 6.5, true), weight: 0.35 });
  }

  if (vixSpot && vix3m && vix3m.price > 0) {
    vixTermRatio = Number((vixSpot.value / vix3m.price).toFixed(2));
    const macroNotRecession = (recessionProb12m ?? 22) < 35 && (!sahm || sahm.value < 0.45);
    const equityOversold =
      (spx?.rsi14 !== undefined && spx.rsi14 <= 32) ||
      (vni?.rsi14 !== undefined && vni.rsi14 <= 34);

    if (vixTermRatio >= 1.0 && macroNotRecession && equityOversold) {
      capitulationSignal = true;
      capitulationLabel = `TÍN HIỆU RŨ BỎ HOẢNG LOẠN (VIX/VIX3M = ${vixTermRatio.toFixed(2)}x + RSI QUÁ BÁN) · CANH NHỊP HỒI KỸ THUẬT`;
    }

    f5FxVolatility.push({
      score: smoothFactorScore(vixTermRatio, 0.94, 0.08, true),
      weight: 0.2,
    });

    signals.push({
      id: 'vix-term',
      label: 'Cấu trúc Kỳ hạn VIX',
      category: 'valuation_breadth',
      valueDisplay: `${vixTermRatio.toFixed(2)}x`,
      subtext: `VIX ${vixSpot.value.toFixed(1)} / VIX3M ${vix3m.price.toFixed(1)}`,
      signalBadge:
        vixTermRatio >= 1.0
          ? capitulationSignal
            ? 'HOẢNG LOẠN · VÙNG RŨ ĐÁY'
            : 'BACKWARDATION · BẤT ỔN'
          : vixTermRatio <= 0.91
            ? 'CONTANGO · ÊM Ả'
            : 'BÌNH THƯỜNG',
      tone:
        vixTermRatio <= 0.91
          ? 'bullish'
          : capitulationSignal
            ? 'neutral'
            : vixTermRatio >= 1.0
              ? 'bearish'
              : 'neutral',
    });
  }

  // 13. Global Carry Trade Unwind Canary (AUD/JPY) + VN–US Interest Rate Differential
  if (audJpy && audJpy.price > 0) {
    const chg = audJpy.changePercent24h;
    f5FxVolatility.push({ score: smoothFactorScore(chg, -0.3, 1.2, false), weight: 0.25 });

    signals.push({
      id: 'aud-jpy',
      label: 'Carry Trade Yên (AUD/JPY)',
      category: 'credit_rates',
      valueDisplay: audJpy.price.toFixed(2),
      subtext: `24h: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · Đo dòng vốn vay Yên`,
      signalBadge:
        chg <= -1.4 ? 'CẢNH BÁO XẢ CARRY' : chg <= -0.6 ? 'YÊN MẠNH LÊN' : 'CARRY ỔN ĐỊNH',
      tone: chg <= -1.4 ? 'bearish' : chg >= -0.3 ? 'bullish' : 'neutral',
    });
  }

  let vnUsYieldSpreadBps: number | undefined;
  if (pulse?.vn10yYieldPct !== undefined && us10y !== undefined) {
    vnUsYieldSpreadBps = Math.round((pulse.vn10yYieldPct - us10y.value) * 100);
    f5FxVolatility.push({
      score: smoothFactorScore(vnUsYieldSpreadBps, -30, 90, false),
      weight: 0.2,
    });
    if (pulse.interbankRatePct !== undefined) {
      f5FxVolatility.push({
        score: smoothFactorScore(pulse.interbankRatePct, 5.2, 2.0, true),
        weight: 0.15,
      });
    }

    signals.push({
      id: 'vn-us-yield',
      label: 'Chênh Lãi suất VN–Mỹ & LNH',
      category: 'credit_rates',
      valueDisplay: `${vnUsYieldSpreadBps >= 0 ? '+' : ''}${vnUsYieldSpreadBps} bps`,
      subtext: `VN10Y ${pulse.vn10yYieldPct.toFixed(2)}%${pulse.interbankRatePct !== undefined ? ` · Liên NH ${pulse.interbankRatePct.toFixed(2)}%` : ''
        }`,
      signalBadge:
        vnUsYieldSpreadBps <= -100 || (pulse.interbankRatePct !== undefined && pulse.interbankRatePct >= 6.8)
          ? 'ÁP LỰC HÚT VỐN / TỶ GIÁ'
          : vnUsYieldSpreadBps >= 0
            ? 'ĐỆM LÃI SUẤT THUẬN'
            : 'CHÊNH LỆCH HẸP',
      tone:
        vnUsYieldSpreadBps <= -100 || (pulse.interbankRatePct !== undefined && pulse.interbankRatePct >= 6.8)
          ? 'bearish'
          : vnUsYieldSpreadBps >= 0
            ? 'bullish'
            : 'neutral',
    });
  } else if (usdVnd) {
    f5FxVolatility.push({
      score: smoothFactorScore(usdVnd.price, 26_000, 450, true),
      weight: 0.2,
    });
  }

  // 14. Dual Confirmation Market Trend Filters (VN-Index & S&P 500 vs MA200 + RSI-14)
  const vniTrend = buildTrendSignal(vni, 'vni-ma200', 'Xu hướng VN-Index');
  const spxTrend = buildTrendSignal(spx, 'spx-ma200', 'Xu hướng S&P 500');

  if (vniTrend) {
    f4TrendBreadth.push({
      score: smoothFactorScore(vniTrend.pctVsMa200, 0, 5.5, false),
      weight: 0.26,
    });
    signals.push(vniTrend.signal);
  }
  if (spxTrend) {
    f4TrendBreadth.push({
      score: smoothFactorScore(spxTrend.pctVsMa200, 0, 5.5, false),
      weight: 0.22,
    });
    signals.push(spxTrend.signal);
  }

  // Compute the 5 Orthogonal Continuous Factor Pillars with Bayesian shrinkage (0..100 each)
  const liquidityScore = shrunkPillarScore(f1Liquidity, 62);
  const creditScore = shrunkPillarScore(f2CreditRecession, 64);
  const valuationScore = shrunkPillarScore(f3ValuationErp, 60);
  const trendScore = shrunkPillarScore(f4TrendBreadth, 62);
  const fxVolScore = shrunkPillarScore(f5FxVolatility, 60);

  const factorPillars: CompassFactorPillar[] = [
    { id: 'liquidity', label: 'Thanh khoản Fed & M2', weightPct: 25, score: liquidityScore },
    { id: 'credit_recession', label: 'Tín dụng & Suy thoái', weightPct: 20, score: creditScore },
    { id: 'valuation_erp', label: 'Định giá Đắt/Rẻ (ERP)', weightPct: 20, score: valuationScore },
    { id: 'trend_breadth', label: 'Xu hướng MA & Độ rộng', weightPct: 20, score: trendScore },
    { id: 'fx_volatility', label: 'Biến động VIX & Tỷ giá', weightPct: 15, score: fxVolScore },
  ];

  const macroCoreScore = clampScore(
    (liquidityScore * 0.25 + creditScore * 0.2 + valuationScore * 0.2) / 0.65,
  );
  const rawComposite = clampScore(
    liquidityScore * 0.25 +
    creditScore * 0.2 +
    valuationScore * 0.2 +
    trendScore * 0.2 +
    fxVolScore * 0.15,
  );

  let dualConfirmation: InvestmentCompassReport['dualConfirmation'];
  let dualConfirmationLabel: string | undefined;
  const hasTrendFilter = Boolean(vniTrend || spxTrend);
  const trendBullish =
    (!vniTrend || vniTrend.aboveMa200) && (!spxTrend || spxTrend.aboveMa200);

  if (hasTrendFilter) {
    const macroBullish = macroCoreScore >= 56;
    if (macroBullish && trendBullish) {
      dualConfirmation = 'confirmed_bull';
      dualConfirmationLabel = 'XÁC NHẬN KÉP: VĨ MÔ THUẬN + GIÁ TRÊN MA200';
    } else if (macroBullish && !trendBullish) {
      dualConfirmation = 'macro_bull_trend_weak';
      dualConfirmationLabel =
        vni?.peRatio && vni.peRatio <= 12.0
          ? `PHÂN KỲ TÍCH SẢN: VĨ MÔ ỔN & P/E RẺ (${vni.peRatio.toFixed(1)}x) NHƯNG DƯỚI MA200 · GOM TIỀN MẶT`
          : 'PHÂN KỲ: VĨ MÔ ỔN NHƯNG CHỈ SỐ DƯỚI MA200 · CHỜ XÁC NHẬN ĐÁY';
    } else if (!macroBullish && trendBullish) {
      dualConfirmation = 'macro_weak_trend_bull';
      dualConfirmationLabel = 'PHÂN KỲ: GIÁ TRÊN MA200 NHƯNG VĨ MÔ YẾU · SIẾT CHẶT QUẢN TRỊ RỦI RO';
    } else {
      dualConfirmation = 'confirmed_bear';
      dualConfirmationLabel = 'CẢNH BÁO KÉP: VĨ MÔ SUY YẾU + GÃY XU HƯỚNG MA200';
    }
  }

  const bothIndicesBroken =
    Boolean(vniTrend && !vniTrend.aboveMa200) && Boolean(spxTrend && !spxTrend.aboveMa200);
  const riskAppetiteScore = bothIndicesBroken
    ? Math.min(64, rawComposite)
    : hasTrendFilter && !trendBullish
      ? Math.min(68, rawComposite)
      : rawComposite;

  // Determine active Macro Quadrant for Sector Rotation
  const vnHealthRef = evaluateMacroHealth(markets, predictions);
  const activeQuad: MacroQuadrant =
    vnHealthRef.vn?.quadrant ??
    vnHealthRef.us?.quadrant ??
    (corePce && corePce.value > 2.6 ? 'Q2_REFLATION' : 'Q1_GOLDILOCKS');
  const sectorRotation = buildSectorRotation(activeQuad);

  let stance: InvestmentStance = 'selective_growth';
  let stanceLabel = 'RISK-ON CHỌN LỌC · ƯU TIÊN CHẤT LƯỢNG';
  let summary =
    'Thanh khoản & tín dụng đang nâng đỡ định giá, nhưng lãi suất thực còn neo cao — ưu tiên doanh nghiệp ít nợ vay, dòng tiền thật.';

  if (
    (sahm && sahm.value >= 0.5) ||
    (hySpread && hySpread.value >= 5.0) ||
    riskAppetiteScore < 42
  ) {
    stance = 'defensive_recession';
    stanceLabel = 'PHÒNG THỦ TỐI ĐA · RỦI RO SUY THOÁI';
    summary =
      'Chỉ báo lao động / tín dụng phát tín hiệu suy thoái sớm — ưu tiên bảo toàn vốn, tiền gửi, trái phiếu và tài sản trú ẩn.';
  } else if (riskAppetiteScore < 55 || dualConfirmation === 'confirmed_bear') {
    stance = 'cautious';
    stanceLabel = 'THẬN TRỌNG · GIỮ SỨC MUA & GIẢM ĐÒN BẨY';
    summary =
      'Đa nhân tố thanh khoản, biến động VIX hoặc xu hướng MA200 đang chịu áp lực — nên hạ margin, giữ tiền mặt dự phòng và giải ngân chậm theo định giá.';
  } else if (
    riskAppetiteScore >= 74 &&
    (!realYield || realYield.value < 2.2) &&
    dualConfirmation !== 'macro_bull_trend_weak'
  ) {
    stance = 'risk_on';
    stanceLabel = 'RISK-ON MẠNH · DÒNG TIỀN & XU HƯỚNG ĐỒNG THUẬN';
    summary =
      'Cả 5 nhân tố thanh khoản, tín dụng, định giá và xu hướng MA200 đồng thuận tích cực — thuận lợi gia tăng tỷ trọng cổ phiếu dẫn dắt.';
  } else if (dualConfirmation === 'macro_bull_trend_weak') {
    stance = 'selective_growth';
    stanceLabel = 'TÍCH SẢN CHỌN LỌC · CHỜ GIÁ VƯỢT LẠI MA200';
    summary =
      vni?.peRatio && vnErp && vni.peRatio <= 12.2
        ? `Định giá VN-Index đang chiết khấu rất rẻ (P/E ${vni.peRatio.toFixed(1)}x, ERP +${vnErp.erpPct.toFixed(1)}% vs TPCP 10Y), nhưng chỉ số còn dưới MA200${pulse?.interbankRatePct && pulse.interbankRatePct >= 6.5
          ? ` do lãi liên ngân hàng căng (${pulse.interbankRatePct.toFixed(1)}%)`
          : ''
        } — chia nhỏ tiền mặt gom tích sản, tuyệt đối không dùng margin.`
        : 'Nền tảng kinh tế thực vẫn khỏe nhưng chỉ số chứng khoán đang giao dịch dưới MA200 — giải ngân từng phần bằng tiền mặt, không dùng margin bắt đáy.';
  }

  const highInflationPressure =
    (pulse?.ytdAvgCpiPct !== undefined
      ? pulse.ytdAvgCpiPct >= 4.5
      : pulse?.monthlyCpiPct !== undefined && pulse.monthlyCpiPct >= 4.7) ||
    (corePce !== undefined && corePce.value >= 2.8) ||
    (fwdInfl !== undefined && fwdInfl.value >= 2.5);
  const liquidityExpanding =
    (m2 !== undefined && m2.value >= 2.0) &&
    (!netLiq || netLiq.delta4wBillions > -50);

  const allocations = computeDynamicPortfolioAllocation({
    stance,
    riskAppetiteScore,
    vnErpPct: vnErp?.erpPct,
    dualConfirmation,
    capitulationSignal,
    highInflationPressure,
    liquidityExpanding,
  });

  // Sector-rotation-aware actionable guidance
  const favoredAssets: string[] = [...sectorRotation.leadingSectors.slice(0, 2)];
  const watchAssets: string[] = [];
  const avoidAssets: string[] = [];

  if (stance === 'defensive_recession' || stance === 'cautious') {
    favoredAssets.unshift('Tiền gửi kỳ hạn / Trái phiếu lãi suất thực cao để giữ sức mua');
    watchAssets.push('Cổ phiếu đầu ngành VN30 định giá P/E rẻ xác nhận lấy lại MA200');
    avoidAssets.push('Sử dụng đòn bẩy margin hoặc bắt đáy sớm cổ phiếu gãy xu hướng MA200');
  } else {
    favoredAssets.push(
      `Doanh nghiệp P/E thấp, ít nợ vay, chia cổ tức tiền mặt đều${vni?.peRatio && vni.peRatio <= 12.2 ? ` (tận dụng vùng P/E TT rẻ ${vni.peRatio.toFixed(1)}x)` : ''
      }`,
    );
    watchAssets.push(
      `Bitcoin / Crypto vốn hóa lớn (theo sát Thanh khoản ròng Fed ${netLiq ? `$${(netLiq.netLiquidityBillions / 1000).toFixed(2)}T` : ''
      } & M2 ${m2 ? `+${m2.value.toFixed(1)}%` : 'tăng'}, không đòn bẩy)`,
    );
    watchAssets.push(
      'Vàng nhẫn 9999 (tích lũy phòng hộ lạm phát & tỷ giá ở các nhịp điều chỉnh)',
    );

    if (vniTrend && !vniTrend.aboveMa200) {
      avoidAssets.push('Bắt đáy bằng margin khi VN-Index chưa lấy lại đường trung bình dài hạn MA200');
    }
    for (const lag of sectorRotation.laggingSectors.slice(0, 1)) {
      avoidAssets.push(lag);
    }
    if (sjcGold?.premiumVsWorldMillionVnd && sjcGold.premiumVsWorldMillionVnd >= 15) {
      avoidAssets.push(
        `Mua đuổi Vàng miếng SJC ngắn hạn khi chênh lệch thế giới quá rộng (+${sjcGold.premiumVsWorldMillionVnd.toFixed(1)} tr/lượng)`,
      );
    } else if (usdVnd && usdVnd.price >= 25_750) {
      avoidAssets.push(
        `FOMO mua đuổi bằng margin cao khi tỷ giá USD/VND (${Math.round(usdVnd.price).toLocaleString('en-US')}₫) còn căng`,
      );
    }
  }

  return {
    riskAppetiteScore,
    stance,
    stanceLabel,
    summary,
    ...(netLiq
      ? {
        netLiquidityBillions: netLiq.netLiquidityBillions,
        netLiquidityDelta4wBillions: netLiq.delta4wBillions,
      }
      : {}),
    ...(recessionProb12m !== undefined ? { recessionProb12m } : {}),
    ...(vni?.peRatio !== undefined ? { vnIndexPe: vni.peRatio } : {}),
    ...(vnErp ? { vnErpPct: vnErp.erpPct } : {}),
    ...(usErp ? { usErpPct: usErp.erpPct } : {}),
    ...(vnUsYieldSpreadBps !== undefined ? { vnUsYieldSpreadBps } : {}),
    ...(polyMacro ? { polymarketFedSummary: `${polyMacro.fedActionLabel} (${polyMacro.fedContractTitle})` } : {}),
    ...(breadth
      ? {
        vnBreadthMa50Pct: breadth.aboveMa50Pct,
        vnBreadthMa200Pct: breadth.aboveMa200Pct,
      }
      : {}),
    ...(vixTermRatio !== undefined ? { vixTermRatio } : {}),
    ...(capitulationSignal ? { capitulationSignal, capitulationLabel } : {}),
    ...(dualConfirmation ? { dualConfirmation, dualConfirmationLabel } : {}),
    factorPillars,
    sectorRotation,
    allocations,
    favoredAssets,
    watchAssets,
    avoidAssets,
    signals,
  };
}
