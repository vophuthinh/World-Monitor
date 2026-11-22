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
  MarketSnapshot,
} from './types';

function clampScore(value: number): number {
  return Math.max(10, Math.min(98, Math.round(value)));
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
        'Sản xuất & tăng trưởng duy trì cao hơn dự báo nhưng CPI/PPI vượt mục tiêu — chính sách tiền tệ khó hạ lãi suất nhanh.',
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
): EconomyHealthReport | null {
  if (!vn || vn.gdpGrowthPct === null) return null;

  const gdp = vn.gdpGrowthPct;
  const gdpBenchmark = 6.8; // IMF WEO / Quốc hội baseline consensus
  const gdpDelta = Number((gdp - gdpBenchmark).toFixed(2));
  const gdpTrend =
    vn.gdpPrevPct !== null && vn.gdpPrevPct !== undefined
      ? Number((gdp - vn.gdpPrevPct).toFixed(2))
      : undefined;

  const manf = vn.manufacturingGrowthPct ?? gdp * 1.25;
  const manfBenchmark = 8.0;

  const cpi = vn.cpiInflationPct ?? 3.4;
  const cpiCeiling = 4.5; // Trần mục tiêu Quốc hội Việt Nam (4.0 - 4.5%)
  const cpiDelta = Number((cpi - cpiCeiling).toFixed(2));
  const cpiTrend =
    vn.cpiPrevPct !== null && vn.cpiPrevPct !== undefined
      ? Number((cpi - vn.cpiPrevPct).toFixed(2))
      : undefined;

  const fdi = vn.fdiPctGdp ?? 4.0;
  const exportsGdp = vn.exportsPctGdp ?? 85.0;
  const unemp = vn.unemploymentPct ?? 2.0;
  const yearLabel = vn.gdpGrowthYear ? `${vn.gdpGrowthYear}` : 'Mới nhất';

  const growthMetrics: MacroPillarMetric[] = [
    {
      id: 'vn-gdp',
      name: 'Tăng trưởng GDP thực',
      actual: gdp,
      unit: '%',
      benchmarkLabel: 'Dự báo IMF/QH',
      benchmarkValue: gdpBenchmark,
      deltaVsBenchmark: gdpDelta,
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

  const monetaryMetrics: MacroPillarMetric[] = [
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
  ];

  const growthScore = clampScore(
    72 + (gdp - gdpBenchmark) * 9 + (manf - manfBenchmark) * 2.5,
  );
  const inflationScore = clampScore(
    80 + (cpiCeiling - cpi) * 9 - (usdVndRate && usdVndRate > 25_800 ? 6 : 0),
  );
  const monetaryScore = clampScore(
    74 + (fdi - 3.5) * 8 + (2.5 - unemp) * 8,
  );

  const compositeScore = clampScore(
    growthScore * 0.42 + inflationScore * 0.32 + monetaryScore * 0.26,
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
      text: `Áp lực tỷ giá USD/VND (${Math.round(usdVndRate).toLocaleString('en-US')}₫): Cần theo dõi chi phí nhập khẩu nguyên liệu đầu vào.`,
    });
  }

  const pillars: MacroPillarGroup[] = [
    { id: 'growth', title: '1. TĂNG TRƯỞNG · SẢN XUẤT & XUẤT KHẨU', score: growthScore, metrics: growthMetrics },
    { id: 'inflation', title: '2. LẠM PHÁT CPI & TỶ GIÁ ĐẦU VÀO', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. DÒNG VỐN FDI & VIỆC LÀM', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'VN',
    title: 'Việt Nam (VNM)',
    subtitle: 'World Bank Open Data · Mục tiêu Quốc hội / IMF · Live FX',
    compositeScore,
    regime: classified.regime,
    regimeLabel: classified.label,
    regimeSummary: classified.summary,
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
  const indpro = byId.get('INDPRO');
  const neworder = byId.get('NEWORDER');
  const cpi = byId.get('CPIAUCSL');
  const ppi = byId.get('PPIFIS');
  const fedfunds = byId.get('FEDFUNDS');
  const unrate = byId.get('UNRATE');
  const spread10y2y = byId.get('T10Y2Y');

  // Need at least core FRED series to build the 3-pillar report
  if (!fedfunds && !spread10y2y && !gdp && !cpi) return null;

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
    const slopeStr =
      m.trendSlope !== undefined
        ? `3T vs 12T: ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%`
        : undefined;

    let status: 'good' | 'watch' | 'warn' = 'good';
    if (invertGoodDirection) {
      // Lower is better (CPI, PPI, Unemployment)
      if (m.value <= bench + 0.4) status = 'good';
      else if (m.value <= bench + 1.5) status = 'watch';
      else status = 'warn';
    } else {
      // Higher is better (GDP, Industrial Production, Factory Orders, 10Y-2Y)
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
      trendSlope: m.trendSlope,
      trendLabel: slopeStr,
      periodLabel: m.date.slice(0, 7),
      status,
    };
  };

  const growthMetrics = [
    toMetric(gdp, 'Dự báo IMF/Fed', 2.1, false),
    toMetric(indpro, 'TB mở rộng', 1.5, false),
    toMetric(neworder, 'Ngưỡng mở rộng', 2.0, false),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const inflationMetrics = [
    toMetric(cpi, 'Mục tiêu Fed', 2.0, true),
    toMetric(ppi, 'Ngưỡng ổn định', 2.5, true),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const monetaryMetrics = [
    toMetric(fedfunds, 'Trung tính Fed', 3.25, true),
    toMetric(unrate, 'Toàn dụng NAIRU', 4.2, true),
    toMetric(spread10y2y, 'Ngưỡng suy thoái', 0.0, false),
  ].filter((x): x is MacroPillarMetric => Boolean(x));

  const gdpVal = gdp?.value ?? 2.2;
  const indVal = indpro?.value ?? 1.5;
  const orderVal = neworder?.value ?? 2.0;
  const cpiVal = cpi?.value ?? 2.5;
  const ppiVal = ppi?.value ?? 2.5;
  const unrateVal = unrate?.value ?? 4.1;
  const curveVal = spread10y2y?.value ?? 0.25;

  const growthScore = clampScore(
    68 + (gdpVal - 2.1) * 8 + (indVal - 1.5) * 3 + Math.min(10, Math.max(-12, (orderVal - 2.0) * 1.1)),
  );
  const inflationScore = clampScore(
    84 - Math.max(0, cpiVal - 2.0) * 13 - Math.max(0, ppiVal - 2.5) * 4.5,
  );
  const monetaryScore = clampScore(
    75 - Math.max(0, unrateVal - 4.2) * 14 + (curveVal < 0 ? -18 : Math.min(8, curveVal * 10)),
  );

  const compositeScore = clampScore(
    growthScore * 0.4 + inflationScore * 0.32 + monetaryScore * 0.28,
  );

  const growthBeat = gdpVal >= 2.0 && indVal >= 0;
  const inflationContained = cpiVal <= 2.9 && ppiVal <= 3.8;
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
      text: `Đường cong lợi suất 10Y–2Y đảo ngược (${curveVal.toFixed(2)}%): Tín hiệu lịch sử cảnh báo sớm suy thoái kinh tế Mỹ.`,
    });
  } else {
    warningFlags.push({
      severity: 'good',
      text: `Đường cong lợi suất 10Y–2Y dương (+${curveVal.toFixed(2)}%): Chưa xuất hiện tín hiệu đảo ngược suy thoái trên thị trường trái phiếu.`,
    });
  }

  if (ppi && cpi && ppi.value - cpi.value >= 1.0) {
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
  } else if (neworder && neworder.value >= 3.0) {
    warningFlags.push({
      severity: 'good',
      text: `Chỉ báo dẫn dắt sản xuất khỏe: Đơn hàng nhà máy tăng +${neworder.value.toFixed(1)}% YoY, hỗ trợ GDP 1–2 quý tới.`,
    });
  }

  const pillars: MacroPillarGroup[] = [
    { id: 'growth', title: '1. TĂNG TRƯỞNG & SẢN XUẤT (LEADING)', score: growthScore, metrics: growthMetrics },
    { id: 'inflation', title: '2. LẠM PHÁT CPI & GIÁ SẢN XUẤT PPI', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. LÃI SUẤT FED · VIỆC LÀM & LỢI SUẤT', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'US',
    title: 'Hoa Kỳ / Toàn cầu (US)',
    subtitle: 'St. Louis Fed (FRED Live) · Độ dốc 3T/12T · Dự báo IMF/Fed',
    compositeScore,
    regime: classified.regime,
    regimeLabel: classified.label,
    regimeSummary: classified.summary,
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

  return {
    vn: buildVietnamMacroHealth(vnRow, usdVnd),
    us: buildUsGlobalMacroHealth(markets.fred),
  };
}

export function evaluateInvestmentCompass(markets: MarketSnapshot): InvestmentCompassReport | null {
  const fredById = new Map((markets.fred ?? []).map((m) => [m.id, m]));
  const quoteBySym = new Map(markets.quotes.map((q) => [q.symbol, q]));

  const m2 = fredById.get('M2SL');
  const walcl = fredById.get('WALCL');
  const nfci = fredById.get('NFCI');
  const hySpread = fredById.get('BAMLH0A0HYM2');
  const realYield = fredById.get('DFII10');
  const sahm = fredById.get('SAHMREALTIME');
  const icsa = fredById.get('ICSA');
  const permit = fredById.get('PERMIT');
  const curve = fredById.get('T10Y2Y');

  const copper = quoteBySym.get('Copper');
  const gold = quoteBySym.get('Gold');
  const sox = quoteBySym.get('SOX Semi');
  const usdVnd = quoteBySym.get('USD/VND');
  const sjcGold = markets.vnGold?.find((g) => g.code === 'SJC');

  if (!m2 && !nfci && !hySpread && !realYield && !copper && !sox) {
    return null;
  }

  let score = 58;
  const signals: LeadingCompassSignal[] = [];

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

  // 2. Chicago Fed NFCI + Fed Balance Sheet WALCL
  if (nfci) {
    const val = nfci.value;
    if (val <= -0.2) score += 7;
    else if (val <= 0) score += 3;
    else score -= 11;

    signals.push({
      id: 'nfci',
      label: 'Điều kiện Tài chính (NFCI)',
      category: 'liquidity',
      valueDisplay: val.toFixed(2),
      subtext:
        walcl !== undefined
          ? `Bảng CĐKT Fed: ${walcl.value >= 0 ? '+' : ''}${walcl.value.toFixed(1)}% YoY`
          : '< 0 là vốn dồi dào, dễ vay',
      signalBadge: val < 0 ? 'VỐN NỚI LỎNG' : 'CĂNG THANH KHOẢN',
      tone: val <= -0.15 ? 'bullish' : val <= 0.05 ? 'neutral' : 'bearish',
    });
  }

  // 3. High-Yield Credit Spread (Smart Money)
  if (hySpread) {
    const val = hySpread.value;
    if (val < 3.9) score += 8;
    else if (val > 4.8) score -= 15;

    signals.push({
      id: 'hy-spread',
      label: 'Chênh lệch Tín dụng HY',
      category: 'credit_rates',
      valueDisplay: `${val.toFixed(2)}%`,
      subtext: 'Đo rủi ro vỡ nợ trái phiếu DN',
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
    // Ratio expressed in lbs per 1,000 USD of Gold: (Copper $/lb * 1000) / Gold $/oz
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
    if (up) score += 3;

    signals.push({
      id: 'sox',
      label: 'Chu kỳ Bán dẫn AI (SOX)',
      category: 'cycle_tech',
      valueDisplay: `${Math.round(sox.price).toLocaleString('en-US')}`,
      subtext: `24h: ${up ? '+' : ''}${sox.changePercent24h.toFixed(2)}% · Dẫn dắt CNTT & ĐTử`,
      signalBadge: up ? ' CHU KỲ AI MẠNH' : 'NHỊP ĐIỀU CHỈNH',
      tone: up ? 'bullish' : 'neutral',
    });
  }

  // 7. Sahm Rule + Weekly Jobless Claims
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

  // 8. Building Permits YoY (Leading Real Estate 6–9m)
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

  if (curve && curve.value < 0) {
    score -= 10;
  }

  const riskAppetiteScore = clampScore(score);

  let stance: InvestmentStance = 'selective_growth';
  let stanceLabel = 'RISK-ON CHỌN LỌC · ƯU TIÊN CHẤT LƯỢNG';
  let summary =
    'Thanh khoản M2 & điều kiện tín dụng đang ủng hộ tài sản tăng trưởng, nhưng lãi suất thực còn cao — ưu tiên doanh nghiệp ít nợ vay, dòng tiền thật.';

  if ((sahm && sahm.value >= 0.5) || (hySpread && hySpread.value >= 5.0) || riskAppetiteScore < 42) {
    stance = 'defensive_recession';
    stanceLabel = 'PHÒNG THỦ TỐI ĐA · RỦI RO SUY THOÁI';
    summary =
      'Chỉ báo lao động / tín dụng phát tín hiệu suy thoái sớm — ưu tiên bảo toàn vốn, tiền gửi, trái phiếu và tài sản trú ẩn.';
  } else if (riskAppetiteScore < 58) {
    stance = 'cautious';
    stanceLabel = 'THẬN TRỌNG · GIỮ SỨC MUA & GIẢM ĐÒN BẨY';
    summary =
      'Các chỉ báo dẫn dắt phân hóa — nên hạ margin, giải ngân từng phần khi thị trường chiết khấu và giữ tỷ trọng tiền mặt dự phòng.';
  } else if (riskAppetiteScore >= 74 && (!realYield || realYield.value < 2.2)) {
    stance = 'risk_on';
    stanceLabel = 'RISK-ON MẠNH · DÒNG TIỀN MỞ RỘNG';
    summary =
      'Cung tiền M2 mở rộng kết hợp tín dụng an toàn & chu kỳ sản xuất phục hồi — thuận lợi cho cổ phiếu tăng trưởng và tài sản rủi ro.';
  }

  const favoredAssets: string[] = [];
  const watchAssets: string[] = [];
  const avoidAssets: string[] = [];

  if (stance === 'defensive_recession' || stance === 'cautious') {
    favoredAssets.push('Tiền gửi kỳ hạn / Trái phiếu lãi suất thực cao để giữ sức mua');
    favoredAssets.push('Cổ phiếu phòng thủ ít nợ vay, cổ tức tiền mặt đều (Điện, Nước, Hạ tầng CNTT)');
    favoredAssets.push('Vàng nhẫn 9999 / Vàng quốc tế trong các nhịp điều chỉnh');

    watchAssets.push('Cổ phiếu đầu ngành VN30 chiết khấu sâu về vùng P/B thấp');
    avoidAssets.push('Sử dụng đòn bẩy margin cao hoặc cổ phiếu đầu cơ P/E quá đắt');
  } else {
    favoredAssets.push(
      'Cổ phiếu CNTT · Tích hợp hệ thống · Bán dẫn & Xuất khẩu (hưởng lợi chu kỳ AI, FDI & đơn hàng mới)',
    );
    favoredAssets.push(
      'Doanh nghiệp P/E thấp, ít nợ vay, chia cổ tức tiền mặt đều (miễn nhiễm với lãi suất thực cao)',
    );
    favoredAssets.push(
      'Cổ phiếu Ngân hàng & KCN đầu ngành Việt Nam (tích lũy ở nhịp chỉnh khi tỷ giá USD/VND ổn định)',
    );

    watchAssets.push(
      `Bitcoin / Crypto vốn hóa lớn (hưởng lợi thanh khoản M2 ${m2 ? `+${m2.value.toFixed(1)}%` : 'tăng'}, giải ngân từng phần không đòn bẩy)`,
    );
    watchAssets.push(
      'Vàng nhẫn 9999 (chờ nhịp hạ nhiệt của Lãi suất thực 10Y để tối ưu giá vốn)',
    );

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
    favoredAssets,
    watchAssets,
    avoidAssets,
    signals,
  };
}
