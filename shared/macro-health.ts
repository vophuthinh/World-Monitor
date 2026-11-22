import type {
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
  Vn30StockQuote,
} from './types';

function clampScore(value: number): number {
  return Math.max(10, Math.min(98, Math.round(value)));
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
 * Formula: P(Recession_12m) = Φ(-0.5333 - 0.6330 * Spread_10Y_3M) * 100
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
 * Vietnam Equity Risk Premium (Damodaran / Fed Model):
 * ERP (%) = Earnings Yield (100 / P/E) - Reference Risk-Free / 12M Deposit Rate (default 5.2%)
 */
export function computeVietnamEquityRiskPremium(
  peRatio: number | undefined,
  referenceYieldPct = 5.2,
): { earningsYieldPct: number; erpPct: number } | null {
  if (peRatio === undefined || !Number.isFinite(peRatio) || peRatio <= 2 || peRatio >= 80) {
    return null;
  }
  const earningsYieldPct = Number((100 / peRatio).toFixed(2));
  const erpPct = Number((earningsYieldPct - referenceYieldPct).toFixed(2));
  return { earningsYieldPct, erpPct };
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
        'Sản xuất & cầu tiêu dùng duy trì cao hơn dự báo nhưng Core PCE / CPI / PPI vượt mục tiêu — chính sách tiền tệ khó hạ lãi suất nhanh.',
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
): EconomyHealthReport | null {
  if (!vn || vn.gdpGrowthPct === null) return null;

  const gdp = vn.gdpGrowthPct;
  const gdpBenchmark = 6.8;
  const gdpDelta = Number((gdp - gdpBenchmark).toFixed(2));
  const gdpTrend =
    vn.gdpPrevPct !== null && vn.gdpPrevPct !== undefined
      ? Number((gdp - vn.gdpPrevPct).toFixed(2))
      : undefined;

  const manf = vn.manufacturingGrowthPct ?? gdp * 1.25;
  const manfBenchmark = 8.0;

  const cpi = vn.cpiInflationPct ?? 3.4;
  const cpiCeiling = 4.5;
  const cpiDelta = Number((cpi - cpiCeiling).toFixed(2));
  const cpiTrend =
    vn.cpiPrevPct !== null && vn.cpiPrevPct !== undefined
      ? Number((cpi - vn.cpiPrevPct).toFixed(2))
      : undefined;

  const fdi = vn.fdiPctGdp ?? 4.0;
  const exportsGdp = vn.exportsPctGdp ?? 85.0;
  const unemp = vn.unemploymentPct ?? 2.0;
  const currentAccount = vn.currentAccountPctGdp;
  const creditPctGdp = vn.creditPctGdp;
  const erp = computeVietnamEquityRiskPremium(vniQuote?.peRatio);
  const yearLabel = vn.gdpGrowthYear ? `${vn.gdpGrowthYear}` : 'Mới nhất';

  const growthZ = Number(
    Math.max(-3, Math.min(3, ((gdp - gdpBenchmark) / 1.1) * 0.6 + ((manf - manfBenchmark) / 2.2) * 0.4)).toFixed(2),
  );
  const fxStressZ = usdVndRate && usdVndRate > 15_000 ? (usdVndRate - 25_550) / 450 : 0;
  const inflationZ = Number(
    Math.max(-3, Math.min(3, ((cpi - 3.8) / 0.8) * 0.7 + fxStressZ * 0.3)).toFixed(2),
  );
  const quad = classifyMacroQuadrant(growthZ, inflationZ);

  const growthMetrics: MacroPillarMetric[] = [
    {
      id: 'vn-gdp',
      name: 'Tăng trưởng GDP thực',
      actual: gdp,
      unit: '%',
      benchmarkLabel: 'Dự báo IMF/QH',
      benchmarkValue: gdpBenchmark,
      deltaVsBenchmark: gdpDelta,
      zScore: Number(((gdp - gdpBenchmark) / 1.1).toFixed(2)),
      trendSlope: gdpTrend,
      trendLabel: gdpTrend !== undefined ? `${gdpTrend >= 0 ? '+' : ''}${gdpTrend}% vs năm trước` : undefined,
      periodLabel: yearLabel,
      status: gdp >= gdpBenchmark ? 'good' : gdp >= 5.5 ? 'watch' : 'warn',
    },
    {
      id: 'vn-manf',
      name: 'CN Chế biến · Chế tạo (Proxy PMI)',
      actual: Number(manf.toFixed(2)),
      unit: '%',
      benchmarkLabel: 'Ngưỡng mở rộng',
      benchmarkValue: manfBenchmark,
      deltaVsBenchmark: Number((manf - manfBenchmark).toFixed(2)),
      zScore: Number(((manf - manfBenchmark) / 2.2).toFixed(2)),
      periodLabel: yearLabel,
      status: manf >= manfBenchmark ? 'good' : manf >= 5.0 ? 'watch' : 'warn',
    },
    {
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

  const inflationMetrics: MacroPillarMetric[] = [
    {
      id: 'vn-cpi',
      name: 'Lạm phát CPI bình quân',
      actual: cpi,
      unit: '%',
      benchmarkLabel: 'Trần Quốc hội',
      benchmarkValue: cpiCeiling,
      deltaVsBenchmark: cpiDelta,
      zScore: Number(((cpi - 3.8) / 0.8).toFixed(2)),
      trendSlope: cpiTrend,
      trendLabel: cpiTrend !== undefined ? `${cpiTrend >= 0 ? '+' : ''}${cpiTrend}% vs năm trước` : undefined,
      periodLabel: vn.cpiYear ? `${vn.cpiYear}` : yearLabel,
      status: cpi <= 4.0 ? 'good' : cpi <= cpiCeiling ? 'watch' : 'warn',
    },
  ];

  if (usdVndRate && usdVndRate > 15_000) {
    const fxBenchmark = 25_500;
    const fxPctDiff = Number((((usdVndRate - fxBenchmark) / fxBenchmark) * 100).toFixed(2));
    inflationMetrics.push({
      id: 'vn-fx',
      name: 'Tỷ giá USD/VND (Chi phí nhập khẩu)',
      actual: Math.round(usdVndRate),
      unit: '₫',
      benchmarkLabel: 'Mốc tham chiếu',
      benchmarkValue: fxBenchmark,
      deltaVsBenchmark: fxPctDiff,
      trendLabel: `${fxPctDiff >= 0 ? '+' : ''}${fxPctDiff}% biên độ`,
      periodLabel: 'Live FX',
      status: usdVndRate <= 25_650 ? 'good' : usdVndRate <= 26_100 ? 'watch' : 'warn',
    });
  }

  const monetaryMetrics: MacroPillarMetric[] = [];

  if (currentAccount !== null && currentAccount !== undefined) {
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

  monetaryMetrics.push(
    {
      id: 'vn-fdi',
      name: 'Vốn FDI thực hiện ròng / GDP',
      actual: Number(fdi.toFixed(2)),
      unit: '% GDP',
      benchmarkLabel: 'Ngưỡng thu hút tốt',
      benchmarkValue: 3.5,
      deltaVsBenchmark: Number((fdi - 3.5).toFixed(2)),
      periodLabel: yearLabel,
      status: fdi >= 3.5 ? 'good' : fdi >= 2.2 ? 'watch' : 'warn',
    },
    {
      id: 'vn-uem',
      name: 'Tỷ lệ Thất nghiệp chung',
      actual: Number(unemp.toFixed(2)),
      unit: '%',
      benchmarkLabel: 'Trần ổn định',
      benchmarkValue: 2.5,
      deltaVsBenchmark: Number((unemp - 2.5).toFixed(2)),
      periodLabel: yearLabel,
      status: unemp <= 2.3 ? 'good' : unemp <= 3.0 ? 'watch' : 'warn',
    },
  );

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
  }

  if (vniQuote?.peRatio && erp) {
    monetaryMetrics.push({
      id: 'vn-erp',
      name: `Phần bù Rủi ro Cổ phiếu ERP (P/E ${vniQuote.peRatio.toFixed(1)}x)`,
      actual: erp.erpPct,
      unit: '%',
      benchmarkLabel: 'Hấp dẫn vs Lãi TK',
      benchmarkValue: 2.5,
      deltaVsBenchmark: Number((erp.erpPct - 2.5).toFixed(2)),
      trendLabel: vniQuote.pbRatio ? `P/B ${vniQuote.pbRatio.toFixed(2)}x · E/P ${erp.earningsYieldPct}%` : undefined,
      periodLabel: 'HOSE Live',
      status: erp.erpPct >= 2.5 ? 'good' : erp.erpPct >= 1.0 ? 'watch' : 'warn',
    });
  }

  const cabBonus =
    currentAccount !== null && currentAccount !== undefined
      ? Math.max(-6, Math.min(8, currentAccount * 1.1))
      : 0;
  const erpBonus = erp ? Math.max(-4, Math.min(5, (erp.erpPct - 2.0) * 1.4)) : 0;

  const growthScore = clampScore(
    72 + (gdp - gdpBenchmark) * 9 + (manf - manfBenchmark) * 2.5,
  );
  const inflationScore = clampScore(
    80 + (cpiCeiling - cpi) * 9 - (usdVndRate && usdVndRate > 25_800 ? 6 : 0),
  );
  const monetaryScore = clampScore(
    74 + (fdi - 3.5) * 6.5 + (2.5 - unemp) * 6.5 + cabBonus + erpBonus,
  );

  const compositeScore = clampScore(
    growthScore * 0.42 + inflationScore * 0.3 + monetaryScore * 0.28,
  );

  const classified = classifyRegime({
    growthBeat: gdp >= gdpBenchmark - 0.3 && manf >= 6.5,
    inflationContained: cpi <= cpiCeiling,
    leadingWeakening: manf < 5.0,
  });

  const warningFlags: EconomyHealthReport['warningFlags'] = [];
  if (manf >= 8.5 && fdi >= 3.5) {
    warningFlags.push({
      severity: 'good',
      text: `Động lực sản xuất & FDI mạnh: Chế biến chế tạo +${manf.toFixed(1)}%, FDI ròng đạt ${fdi.toFixed(2)}% GDP.`,
    });
  }
  if (currentAccount !== null && currentAccount !== undefined && currentAccount >= 3.0) {
    warningFlags.push({
      severity: 'good',
      text: `Lá chắn ngoại hối vững: Thặng dư Cán cân vãng lai đạt +${currentAccount.toFixed(2)}% GDP, hỗ trợ NHNN điều hành tỷ giá.`,
    });
  }
  if (vniQuote?.peRatio && erp && vniQuote.peRatio <= 12.2) {
    warningFlags.push({
      severity: 'good',
      text: `Định giá VN-Index chiết khấu rẻ: P/E ${vniQuote.peRatio.toFixed(2)}x (Phần bù rủi ro ERP +${erp.erpPct.toFixed(2)}% vượt trội so với lãi tiết kiệm).`,
    });
  }
  if (cpi <= cpiCeiling) {
    warningFlags.push({
      severity: 'good',
      text: `Lạm phát kiểm soát tốt: CPI ${cpi.toFixed(2)}% thấp hơn trần Quốc hội (${cpiCeiling}%).`,
    });
  } else {
    warningFlags.push({
      severity: 'critical',
      text: `Cảnh báo lạm phát: CPI ${cpi.toFixed(2)}% vượt trần mục tiêu Quốc hội (${cpiCeiling}%).`,
    });
  }
  if (usdVndRate && usdVndRate >= 25_700) {
    warningFlags.push({
      severity: 'warn',
      text: `Áp lực tỷ giá USD/VND (${Math.round(usdVndRate).toLocaleString('en-US')}₫): Cần theo dõi chi phí nhập khẩu${
        creditPctGdp && creditPctGdp >= 120 ? ` & mặt bằng lãi suất (Tín dụng/GDP ${creditPctGdp.toFixed(0)}%)` : ''
      }.`,
    });
  }

  const pillars: MacroPillarGroup[] = [
    { id: 'growth', title: '1. TĂNG TRƯỞNG · SẢN XUẤT & XUẤT KHẨU', score: growthScore, metrics: growthMetrics },
    { id: 'inflation', title: '2. LẠM PHÁT CPI & TỶ GIÁ ĐẦU VÀO', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. CÁN CÂN VÃNG LAI · FDI · TÍN DỤNG & ĐỊNH GIÁ', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'VN',
    title: 'Việt Nam (VNM)',
    subtitle: 'World Bank · Cán cân Vãng lai · Định giá P/E & ERP · Live FX',
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

  const gdpVal = gdp?.value ?? 2.2;
  const retailVal = retail?.value ?? 3.5;
  const indVal = indpro?.value ?? 1.5;
  const orderVal = neworder?.value ?? 2.0;
  const pceVal = corePce?.value ?? cpi?.value ?? 2.5;
  const cpiVal = cpi?.value ?? pceVal;
  const ppiVal = ppi?.value ?? 2.5;
  const fwdVal = forwardInflMetric?.value ?? 2.3;
  const unrateVal = unrate?.value ?? 4.1;
  const curveVal = spread10y2y?.value ?? 0.25;
  const recessionProb12m =
    spread10y3m !== undefined
      ? computeNyFedRecessionProb12m(spread10y3m.value)
      : spread10y2y !== undefined
        ? computeNyFedRecessionProb12m(spread10y2y.value)
        : undefined;

  const growthZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        ((gdpVal - 2.1) / 1.0) * 0.4 +
          ((retailVal - 3.5) / 2.2) * 0.25 +
          ((indVal - 1.5) / 1.5) * 0.2 +
          ((orderVal - 2.0) / 3.5) * 0.15,
      ),
    ).toFixed(2),
  );
  const inflationZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        ((pceVal - 2.3) / 0.6) * 0.42 +
          ((cpiVal - 2.4) / 0.7) * 0.25 +
          ((ppiVal - 2.5) / 1.2) * 0.18 +
          ((fwdVal - 2.25) / 0.35) * 0.15,
      ),
    ).toFixed(2),
  );
  const quad = classifyMacroQuadrant(growthZ, inflationZ);

  const growthScore = clampScore(
    68 +
      (gdpVal - 2.1) * 7 +
      (retail ? (retailVal - 3.5) * 1.6 : 0) +
      (indVal - 1.5) * 2.8 +
      Math.min(9, Math.max(-11, (orderVal - 2.0) * 1.0)),
  );
  const inflationScore = clampScore(
    85 -
      Math.max(0, pceVal - 2.0) * 8.0 -
      Math.max(0, cpiVal - 2.0) * 6.0 -
      Math.max(0, ppiVal - 2.5) * 3.8 -
      Math.max(0, fwdVal - 2.35) * 6.0,
  );
  const monetaryScore = clampScore(
    75 - Math.max(0, unrateVal - 4.2) * 14 + (curveVal < 0 ? -18 : Math.min(8, curveVal * 10)),
  );

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
      text: `Đường cong lợi suất 10Y–2Y đảo ngược (${curveVal.toFixed(2)}%): Tín hiệu lịch sử cảnh báo sớm suy thoái kinh tế Mỹ${
        recessionProb12m !== undefined ? ` (Xác suất suy thoái 12T NY Fed: ${recessionProb12m}%)` : ''
      }.`,
    });
  } else {
    warningFlags.push({
      severity: recessionProb12m !== undefined && recessionProb12m >= 35 ? 'warn' : 'good',
      text: `Đường cong lợi suất 10Y–2Y dương (+${curveVal.toFixed(2)}%)${
        recessionProb12m !== undefined
          ? ` · Xác suất suy thoái 12T (NY Fed 10Y–3M): ${recessionProb12m}%`
          : ': Chưa xuất hiện tín hiệu đảo ngược suy thoái'
      }.`,
    });
  }

  if (corePce && corePce.value > 2.6) {
    const anchoredNote =
      forwardInflMetric && forwardInflMetric.value <= 2.45
        ? ` (nhưng kỳ vọng trái phiếu ngày vẫn neo ổn ở ${forwardInflMetric.value.toFixed(2)}%)`
        : forwardInflMetric && forwardInflMetric.value >= 2.65
          ? ` kèm kỳ vọng dài hạn dâng lên ${forwardInflMetric.value.toFixed(2)}%`
          : '';
    warningFlags.push({
      severity: 'warn',
      text: `Thước đo FOMC Core PCE (+${corePce.value.toFixed(2)}%) cao hơn mục tiêu 2.0%${anchoredNote} — Fed sẽ thận trọng tiến độ hạ lãi suất.`,
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

  if (unrate && unrate.trendSlope !== undefined && unrate.trendSlope >= 0.3) {
    warningFlags.push({
      severity: 'warn',
      text: `Thất nghiệp nhích tăng: TB 3 tháng cao hơn TB 12 tháng (+${unrate.trendSlope.toFixed(2)}%), thị trường lao động hạ nhiệt.`,
    });
  } else if (retail && retail.value >= 4.0) {
    warningFlags.push({
      severity: 'good',
      text: `Cầu tiêu dùng Mỹ vững: Doanh số bán lẻ (68% GDP) tăng +${retail.value.toFixed(1)}% YoY${
        neworder ? `, đơn hàng nhà máy ${neworder.value >= 0 ? '+' : ''}${neworder.value.toFixed(1)}%` : ''
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
    { id: 'monetary', title: '3. LÃI SUẤT FED · VIỆC LÀM & LỢI SUẤT', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'US',
    title: 'Hoa Kỳ / Toàn cầu (US)',
    subtitle: 'St. Louis Fed (FRED) · Core PCE · Kỳ vọng Lạm phát Ngày · Ma trận 4 Pha',
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

export function evaluateMacroHealth(markets: MarketSnapshot): {
  vn: EconomyHealthReport | null;
  us: EconomyHealthReport | null;
} {
  const vnRow = markets.macro.find((r) => r.countryCode === 'VNM' || r.isVietnam);
  const usdVnd = markets.quotes.find((q) => q.symbol === 'USD/VND')?.price;
  const vniQuote = markets.quotes.find((q) => q.symbol === 'VN-Index');

  return {
    vn: buildVietnamMacroHealth(vnRow, usdVnd, vniQuote),
    us: buildUsGlobalMacroHealth(markets.fred),
  };
}

function buildTrendSignal(
  quote: MarketQuote | undefined,
  id: string,
  label: string,
): { signal: LeadingCompassSignal; aboveMa200: boolean; scoreDelta: number } | null {
  if (!quote || quote.ma200 === undefined || quote.ma200 <= 0) return null;

  const pctVsMa200 = Number((((quote.price - quote.ma200) / quote.ma200) * 100).toFixed(1));
  const aboveMa200 = quote.price >= quote.ma200;
  const aboveMa50 = quote.ma50 !== undefined ? quote.price >= quote.ma50 : aboveMa200;
  const rsiText = quote.rsi14 !== undefined ? ` · RSI ${quote.rsi14.toFixed(0)}` : '';

  let badge = 'TRÊN MA200 · UPTREND';
  let tone: LeadingCompassSignal['tone'] = 'bullish';
  let scoreDelta = 4;

  if (!aboveMa200) {
    badge = quote.rsi14 !== undefined && quote.rsi14 <= 32 ? 'DƯỚI MA200 · QUÁ BÁN' : 'GÃY MA200 · PHÒNG THỦ';
    tone = 'bearish';
    scoreDelta = -6;
  } else if (!aboveMa50) {
    badge = 'CHỈNH NGẮN TRÊN MA200';
    tone = 'neutral';
    scoreDelta = 1;
  } else if (quote.rsi14 !== undefined && quote.rsi14 >= 74) {
    badge = 'TRÊN MA200 · QUÁ MUA';
    tone = 'neutral';
    scoreDelta = 2;
  }

  return {
    aboveMa200,
    scoreDelta,
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
    // selective_growth
    equities = 52;
    cashBonds = 28;
    gold = 14;
    crypto = 6;
  }

  // 1. Trend MA200 Discipline: keep tactical dry powder in cash/bonds while index is below MA200
  if (dualConfirmation === 'macro_bull_trend_weak') {
    const shift = capitulationSignal ? 6 : 10;
    equities -= shift;
    cashBonds += shift;
  } else if (dualConfirmation === 'confirmed_bull' && riskAppetiteScore >= 72) {
    equities += 6;
    cashBonds -= 6;
  }

  // 2. Valuation ERP Tilt: reward deep-value cheap market P/E, penalize expensive P/E
  if (vnErpPct !== undefined) {
    if (vnErpPct >= 3.5) {
      equities += 7;
      cashBonds -= 7;
    } else if (vnErpPct <= 0.8) {
      equities -= 8;
      cashBonds += 8;
    }
  }

  // 3. Inflation & Liquidity Overlays
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
  // Final exact 100% reconciliation
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
          : 'CNTT, Xuất khẩu, Ngân hàng',
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

export function evaluateInvestmentCompass(markets: MarketSnapshot): InvestmentCompassReport | null {
  const fredById = new Map((markets.fred ?? []).map((m) => [m.id, m]));
  const quoteBySym = new Map(markets.quotes.map((q) => [q.symbol, q]));

  const m2 = fredById.get('M2SL');
  const walcl = fredById.get('WALCL');
  const wtregen = fredById.get('WTREGEN');
  const rrp = fredById.get('RRPONTSYD');
  const nfci = fredById.get('NFCI');
  const stlfsi = fredById.get('STLFSI4');
  const hySpread = fredById.get('BAMLH0A0HYM2');
  const realYield = fredById.get('DFII10');
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

  let score = 58;
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
    const expanding = netLiq.delta4wBillions >= 0;
    if (netLiq.delta4wBillions >= 40) score += 6;
    else if (netLiq.delta4wBillions <= -80) score -= 7;
    else if (expanding) score += 2;

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
    if (val >= 3.5) score += 9;
    else if (val >= 0) score += 3;
    else score -= 12;

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
    if (val <= -0.2) score += 7;
    else if (val <= 0) score += 3;
    else score -= 11;

    if (stlfsi) {
      if (stlfsi.value >= 0.5) score -= 8;
      else if (stlfsi.value <= -0.3) score += 2;
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

  // 3. High-Yield Credit Spread + Bank Lending SLOOS
  if (hySpread) {
    const val = hySpread.value;
    if (val < 3.9) score += 8;
    else if (val > 4.8) score -= 15;

    if (sloos) {
      if (sloos.value >= 25) score -= 5;
      else if (sloos.value <= 8) score += 2;
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
    if (val >= 2.4) score -= 5;
    else if (val <= 1.4) score += 6;

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
    const copperUp = copper.changePercent24h >= gold.changePercent24h;
    if (copperUp) score += 3;

    signals.push({
      id: 'copper-gold',
      label: 'Tỷ lệ Đồng / Vàng',
      category: 'cycle_tech',
      valueDisplay: `${ratio.toFixed(2)}x`,
      subtext: `Đồng $${copper.price.toFixed(2)}/lb (${copper.changePercent24h >= 0 ? '+' : ''}${copper.changePercent24h.toFixed(1)}%)`,
      signalBadge: copperUp ? 'CẦU SẢN XUẤT TỐT' : 'THIÊN VỀ TRÚ ẨN',
      tone: copperUp ? 'bullish' : 'neutral',
    });
  }

  // 6. PHLX Semiconductor Index (^SOX)
  if (sox) {
    const up = sox.changePercent24h >= 0;
    const aboveSoxMa200 = sox.ma200 !== undefined ? sox.price >= sox.ma200 : up;
    if (aboveSoxMa200) score += 3;

    signals.push({
      id: 'sox',
      label: 'Chu kỳ Bán dẫn AI (SOX)',
      category: 'cycle_tech',
      valueDisplay: `${Math.round(sox.price).toLocaleString('en-US')}`,
      subtext:
        sox.ma200 !== undefined
          ? `MA200: ${Math.round(sox.ma200).toLocaleString('en-US')} · 24h ${up ? '+' : ''}${sox.changePercent24h.toFixed(1)}%`
          : `24h: ${up ? '+' : ''}${sox.changePercent24h.toFixed(2)}% · Dẫn dắt CNTT & ĐTử`,
      signalBadge: aboveSoxMa200 ? 'CHU KỲ AI MẠNH' : 'NHỊP ĐIỀU CHỈNH',
      tone: aboveSoxMa200 ? 'bullish' : 'neutral',
    });
  }

  // 7. NY Fed 12-Month Recession Probability (10Y-3M Probit)
  const recessionProb12m =
    t10y3m !== undefined ? computeNyFedRecessionProb12m(t10y3m.value) : undefined;
  if (t10y3m && recessionProb12m !== undefined) {
    if (recessionProb12m >= 45) score -= 12;
    else if (recessionProb12m <= 25) score += 3;

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
    if (val >= 0.5) score -= 22;
    else if (val < 0.3) score += 6;

    const claimsK = icsa ? Math.round(icsa.value / 1000) : null;
    if (claimsK !== null) {
      if (claimsK < 240) score += 4;
      else if (claimsK > 275) score -= 10;
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

  // 9. Building Permits YoY (Leading Real Estate 6–9m)
  if (permit) {
    const val = permit.value;
    if (val < -5) score -= 4;
    else if (val > 2) score += 4;

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

  // 10. VN-Index Valuation P/E & Equity Risk Premium (ERP)
  const vnErp = computeVietnamEquityRiskPremium(vni?.peRatio);
  if (vni?.peRatio && vnErp) {
    const pe = vni.peRatio;
    if (pe <= 12.0) score += 6;
    else if (pe <= 14.8) score += 2;
    else if (pe >= 17.0) score -= 7;

    signals.push({
      id: 'vn-pe-erp',
      label: 'Định giá VN-Index (P/E)',
      category: 'valuation_breadth',
      valueDisplay: `${pe.toFixed(2)}x`,
      subtext: `ERP ${vnErp.erpPct >= 0 ? '+' : ''}${vnErp.erpPct.toFixed(2)}%${
        vni.pbRatio ? ` · P/B ${vni.pbRatio.toFixed(2)}x` : ''
      }`,
      signalBadge:
        pe <= 12.0
          ? 'ĐỊNH GIÁ RẺ · TÍCH SẢN'
          : pe <= 15.2
            ? 'ĐỊNH GIÁ HỢP LÝ'
            : 'ĐỊNH GIÁ ĐẮT',
      tone: pe <= 12.5 ? 'bullish' : pe <= 15.8 ? 'neutral' : 'bearish',
    });
  }

  // 11. Internal VN30 Market Breadth (% > MA50 / MA200)
  const breadth = computeVn30MarketBreadth(markets.vn30);
  if (breadth) {
    if (breadth.aboveMa200Pct >= 60) score += 3;
    else if (breadth.aboveMa200Pct <= 20) score -= 3;

    signals.push({
      id: 'vn30-breadth',
      label: 'Độ rộng Nội tại VN30',
      category: 'valuation_breadth',
      valueDisplay: `${breadth.aboveMa50Pct}% >MA50`,
      subtext: `Trên MA200: ${breadth.aboveMa200Pct}%${
        breadth.medianRsi14 !== undefined ? ` · RSI vị ${breadth.medianRsi14}` : ''
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
            ? 'neutral'
            : 'neutral',
    });
  }

  // 12. Volatility Term Structure (VIX / VIX3M) & Capitulation Bottom Detector
  let vixTermRatio: number | undefined;
  let capitulationSignal = false;
  let capitulationLabel: string | undefined;

  if (vixSpot && vix3m && vix3m.price > 0) {
    vixTermRatio = Number((vixSpot.value / vix3m.price).toFixed(2));
    const macroNotRecession = (recessionProb12m ?? 22) < 35 && (!sahm || sahm.value < 0.45);
    const equityOversold =
      (spx?.rsi14 !== undefined && spx.rsi14 <= 32) ||
      (vni?.rsi14 !== undefined && vni.rsi14 <= 34);

    if (vixTermRatio >= 1.0 && macroNotRecession && equityOversold) {
      capitulationSignal = true;
      capitulationLabel = `TÍN HIỆU RŨ BỎ HOẢNG LOẠN (VIX/VIX3M = ${vixTermRatio.toFixed(2)}x + RSI QUÁ BÁN) · CANH NHỊP HỒI KỸ THUẬT`;
      score += 2;
    } else if (vixTermRatio >= 1.03) {
      score -= 6;
    } else if (vixTermRatio <= 0.9) {
      score += 3;
    }

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

  // 13. Global Carry Trade Unwind Canary (AUD/JPY)
  if (audJpy && audJpy.price > 0) {
    const chg = audJpy.changePercent24h;
    if (chg <= -1.4) score -= 5;
    else if (chg >= 0.4) score += 1;

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

  if (curve && curve.value < 0) {
    score -= 10;
  }

  // 14. Dual Confirmation Market Trend Filters (VN-Index & S&P 500 vs MA200 + RSI-14)
  const macroBaseScore = clampScore(score);
  const vniTrend = buildTrendSignal(vni, 'vni-ma200', 'Xu hướng VN-Index');
  const spxTrend = buildTrendSignal(spx, 'spx-ma200', 'Xu hướng S&P 500');

  if (vniTrend) {
    score += vniTrend.scoreDelta;
    signals.push(vniTrend.signal);
  }
  if (spxTrend) {
    score += spxTrend.scoreDelta;
    signals.push(spxTrend.signal);
  }

  let dualConfirmation: InvestmentCompassReport['dualConfirmation'];
  let dualConfirmationLabel: string | undefined;
  const hasTrendFilter = Boolean(vniTrend || spxTrend);
  const trendBullish =
    (!vniTrend || vniTrend.aboveMa200) && (!spxTrend || spxTrend.aboveMa200);

  if (hasTrendFilter) {
    const macroBullish = macroBaseScore >= 58;
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

  const riskAppetiteScore = clampScore(score);

  let stance: InvestmentStance = 'selective_growth';
  let stanceLabel = 'RISK-ON CHỌN LỌC · ƯU TIÊN CHẤT LƯỢNG';
  let summary =
    'Thanh khoản ròng Fed, M2 & tín dụng ủng hộ tài sản tăng trưởng, nhưng lãi suất thực còn neo cao — ưu tiên doanh nghiệp ít nợ vay, dòng tiền thật.';

  if (
    (sahm && sahm.value >= 0.5) ||
    (hySpread && hySpread.value >= 5.0) ||
    riskAppetiteScore < 42
  ) {
    stance = 'defensive_recession';
    stanceLabel = 'PHÒNG THỦ TỐI ĐA · RỦI RO SUY THOÁI';
    summary =
      'Chỉ báo lao động / tín dụng phát tín hiệu suy thoái sớm — ưu tiên bảo toàn vốn, tiền gửi, trái phiếu và tài sản trú ẩn.';
  } else if (riskAppetiteScore < 58 || dualConfirmation === 'confirmed_bear') {
    stance = 'cautious';
    stanceLabel = 'THẬN TRỌNG · GIỮ SỨC MUA & GIẢM ĐÒN BẨY';
    summary =
      'Các chỉ báo dẫn dắt hoặc xu hướng MA200 đang phân hóa — nên hạ margin, giải ngân từng phần khi thị trường chiết khấu và giữ tiền mặt dự phòng.';
  } else if (
    riskAppetiteScore >= 74 &&
    (!realYield || realYield.value < 2.2) &&
    dualConfirmation !== 'macro_bull_trend_weak'
  ) {
    stance = 'risk_on';
    stanceLabel = 'RISK-ON MẠNH · DÒNG TIỀN & XU HƯỚNG ĐỒNG THUẬN';
    summary =
      'Thanh khoản Fed / M2 mở rộng kết hợp tín dụng an toàn & chỉ số giữ vững trên MA200 — thuận lợi cho cổ phiếu tăng trưởng và tài sản rủi ro.';
  } else if (dualConfirmation === 'macro_bull_trend_weak') {
    stance = 'selective_growth';
    stanceLabel = 'TÍCH SẢN CHỌN LỌC · CHỜ GIÁ VƯỢT LẠI MA200';
    summary =
      vni?.peRatio && vnErp && vni.peRatio <= 12.2
        ? `Nền tảng vĩ mô ổn & định giá VN-Index đang rất rẻ (P/E ${vni.peRatio.toFixed(1)}x, ERP +${vnErp.erpPct.toFixed(1)}%), nhưng chỉ số dưới MA200 — chia nhỏ tiền mặt tích sản dần, không dùng margin bắt đáy.`
        : 'Nền tảng vĩ mô & thanh khoản vẫn tích cực nhưng chỉ số chứng khoán đang giao dịch dưới MA200 — giải ngân gom dần bằng tiền mặt, tuyệt đối không dùng margin bắt đáy.';
  }

  const highInflationPressure =
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

  const favoredAssets: string[] = [];
  const watchAssets: string[] = [];
  const avoidAssets: string[] = [];

  if (stance === 'defensive_recession' || stance === 'cautious') {
    favoredAssets.push('Tiền gửi kỳ hạn / Trái phiếu lãi suất thực cao để giữ sức mua');
    favoredAssets.push('Cổ phiếu phòng thủ ít nợ vay, cổ tức tiền mặt đều (Điện, Nước, Hạ tầng CNTT)');
    favoredAssets.push('Vàng nhẫn 9999 / Vàng quốc tế trong các nhịp điều chỉnh');

    watchAssets.push('Cổ phiếu đầu ngành VN30 chiết khấu sâu về vùng P/B thấp & xác nhận lấy lại MA200');
    avoidAssets.push('Sử dụng đòn bẩy margin cao hoặc bắt đáy cổ phiếu gãy xu hướng MA200');
  } else {
    favoredAssets.push(
      'Cổ phiếu CNTT · Tích hợp hệ thống · Bán dẫn & Xuất khẩu (hưởng lợi chu kỳ AI, FDI & đơn hàng mới)',
    );
    favoredAssets.push(
      `Doanh nghiệp P/E thấp, ít nợ vay, cổ tức tiền mặt đều${
        vni?.peRatio && vni.peRatio <= 12.2 ? ` (tận dụng vùng định giá rẻ P/E TT ${vni.peRatio.toFixed(1)}x)` : ' (miễn nhiễm với lãi suất thực cao)'
      }`,
    );
    favoredAssets.push(
      'Cổ phiếu Ngân hàng & KCN đầu ngành Việt Nam tích lũy bằng tiền mặt khi tỷ giá USD/VND ổn định',
    );

    watchAssets.push(
      `Bitcoin / Crypto vốn hóa lớn (theo sát Thanh khoản ròng Fed ${
        netLiq ? `$${(netLiq.netLiquidityBillions / 1000).toFixed(2)}T` : ''
      } & M2 ${m2 ? `+${m2.value.toFixed(1)}%` : 'tăng'}, không đòn bẩy)`,
    );
    watchAssets.push(
      'Vàng nhẫn 9999 (chờ nhịp hạ nhiệt của Lãi suất thực 10Y để tối ưu giá vốn)',
    );

    if (vniTrend && !vniTrend.aboveMa200) {
      avoidAssets.push('Bắt đáy bằng margin khi VN-Index chưa lấy lại đường trung bình dài hạn MA200');
    }
    if (realYield && realYield.value >= 2.2) {
      avoidAssets.push(
        `Doanh nghiệp Bất động sản vay nợ lớn (Giấy phép XD ${permit ? `${permit.value.toFixed(1)}%` : 'chững'}, lãi thực ${realYield.value.toFixed(2)}% còn cao)`,
      );
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
    ...(breadth
      ? {
          vnBreadthMa50Pct: breadth.aboveMa50Pct,
          vnBreadthMa200Pct: breadth.aboveMa200Pct,
        }
      : {}),
    ...(vixTermRatio !== undefined ? { vixTermRatio } : {}),
    ...(capitulationSignal ? { capitulationSignal, capitulationLabel } : {}),
    ...(dualConfirmation ? { dualConfirmation, dualConfirmationLabel } : {}),
    allocations,
    favoredAssets,
    watchAssets,
    avoidAssets,
    signals,
  };
}
