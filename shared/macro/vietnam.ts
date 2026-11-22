import type {
  EconomyHealthReport,
  MacroCountryIndicator,
  MacroPillarGroup,
  MacroPillarMetric,
  MarketQuote,
  VietnamLiveMacroPulse,
} from '../types';
import { VN_CPI_TARGET_PCT, clampScore, classifyMacroQuadrant, classifyRegime, computeVietnamEquityRiskPremium, smoothFactorScore, weightedMean } from './core';
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
  const manf = vn.manufacturingGrowthPct ?? undefined;
  const manfBenchmark = 8.0;

  // CRITICAL ECONOMETRIC ALIGNMENT:
  // Quốc hội's 4.5% CPI target applies strictly to FULL-YEAR / YTD AVERAGE CPI (CPI bình quân),
  // NEVER to a single-month YoY print! Prefer official GSO YTD average CPI when available;
  // if only single-month YoY CPI exists without YTD average, label & benchmark it distinctly.
  const cpiCeiling = VN_CPI_TARGET_PCT;
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

  // World Bank gaps stay undefined: a missing indicator is omitted, never replaced by an invented value.
  const fdi = vn.fdiPctGdp ?? undefined;
  const exportsGdp = vn.exportsPctGdp ?? undefined;
  const unemp = vn.unemploymentPct ?? undefined;
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

  const manfZ =
    hasLivePmi && pmi !== undefined
      ? (pmi - 50.0) / 2.2
      : manf !== undefined
        ? (manf - manfBenchmark) / 2.2
        : 0;
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

  const growthMetricsRaw: Array<MacroPillarMetric | null> = [
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
      : manf === undefined
        ? null
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
            ? `Lũy kế ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths}T` : 'năm'}: ${ytdTradeB >= 0 ? '+' : ''}${ytdTradeB.toFixed(2)}B$ (${ytdTradeB < 0 ? 'nhập siêu máy móc/NL' : 'xuất siêu'})`
            : exportsGdp !== undefined
              ? `Độ mở XK: ${exportsGdp.toFixed(0)}% GDP`
              : undefined,
        periodLabel: 'Tháng mới nhất',
        status:
          pulse.tradeBalanceBillionUsd >= 1.5 && (ytdTradeB === undefined || ytdTradeB >= -5)
            ? 'good'
            : pulse.tradeBalanceBillionUsd >= 0
              ? 'watch'
              : 'warn',
      }
      : exportsGdp === undefined
        ? null
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
  const growthMetrics = growthMetricsRaw.filter((m): m is MacroPillarMetric => m !== null);

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

  if (fdi !== undefined) {
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
  }

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
  } else if (unemp !== undefined) {
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
    ...(hasLivePmi && pmi !== undefined
      ? [{ score: smoothFactorScore(pmi, 49.5, 2.6, false), weight: 0.3 }]
      : manf !== undefined
        ? [{ score: smoothFactorScore(manf, 5.8, 3.2, false), weight: 0.3 }]
        : []),
    ...(pulse?.tradeBalanceBillionUsd !== undefined
      ? [{ score: smoothFactorScore(pulse.tradeBalanceBillionUsd, 0.2, 3.5, false), weight: 0.2 }]
      : exportsGdp !== undefined
        ? [{ score: smoothFactorScore(exportsGdp, 60, 22, false), weight: 0.2 }]
        : []),
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
    ...(fdi !== undefined ? [{ score: smoothFactorScore(fdi, 2.3, 1.4, false), weight: 0.3 }] : []),
    ...(unemp !== undefined ? [{ score: smoothFactorScore(unemp, 2.8, 1.0, true), weight: 0.2 }] : []),
    ...(effectiveCabForScore !== null && effectiveCabForScore !== undefined
      ? [{ score: smoothFactorScore(effectiveCabForScore, 0.5, 3.2, false), weight: isCabStalePriorYear ? 0.15 : 0.25 }]
      : []),
    ...(erp ? [{ score: smoothFactorScore(erp.erpPct, 1.2, 2.2, false), weight: 0.35 }] : []),
  ]);

  const compositeScore = clampScore(
    growthScore * 0.42 + inflationScore * 0.3 + monetaryScore * 0.28,
  );

  // Unknown manufacturing data is neutral (growthBeat is then decided by GDP alone).
  const pmiHealthy =
    hasLivePmi && pmi !== undefined ? pmi >= 50.0 : manf !== undefined ? manf >= 6.5 : true;
  const classified = classifyRegime({
    growthBeat: gdp >= gdpBenchmark - 0.3 && pmiHealthy,
    inflationContained: cpiForTargetComparison <= cpiCeiling,
    leadingWeakening:
      hasLivePmi && pmi !== undefined ? pmi < 49.0 : manf !== undefined ? manf < 5.0 : gdp < 4.0,
  });

  const warningFlags: EconomyHealthReport['warningFlags'] = [];
  if (gdp >= 7.0 && pmiHealthy) {
    const tradePeriodLabel = pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths} tháng ` : 'năm ';
    const tradeContext =
      pulse?.tradeBalanceBillionUsd !== undefined
        ? ytdTradeB !== undefined && ytdTradeB < 0
          ? `, tháng gần nhất xuất siêu +$${pulse.tradeBalanceBillionUsd.toFixed(2)}B (nhưng lũy kế ${tradePeriodLabel}nhập siêu ${ytdTradeB.toFixed(2)}B$ do nhập máy móc/nguyên liệu)`
          : `, xuất siêu tháng +$${pulse.tradeBalanceBillionUsd.toFixed(2)}B`
        : '';
    warningFlags.push({
      severity: 'good',
      text: `Động lực sản xuất thực rất khỏe: GDP +${gdp.toFixed(2)}%${hasLivePmi && pmi !== undefined ? `, PMI Sản xuất đạt ${pmi.toFixed(1)} điểm` : manf !== undefined ? `, Chế biến chế tạo +${manf.toFixed(1)}%` : ''
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
        ? `Theo dõi lạm phát: CPI bình quân ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths} tháng ` : ''}(${cpiForTargetComparison.toFixed(2)}%) vượt ${isMildOvershoot ? 'nhẹ' : ''} mốc ${cpiCeiling}% cả năm của Quốc hội${detailParts.length > 0 ? ` (${detailParts.join('; ')})` : ''
        }.`
        : `Theo dõi lạm phát: CPI (${cpiForTargetComparison.toFixed(2)}%) cao hơn mốc tham chiếu ${cpiCeiling}% (lưu ý chỉ tiêu Quốc hội ${cpiCeiling}% tính trên bình quân cả năm).`,
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
      const ytdMonthsTxt = pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths} tháng ` : '';
      warningFlags.push({
        severity: 'warn',
        text: `Đệm cán cân vãng lai thu hẹp trong ${currentCalendarYear}: Số chốt +${currentAccount.toFixed(2)}% GDP là của năm ${cabYear}; năm nay lũy kế ${ytdMonthsTxt}nhập siêu (${ytdTradeB.toFixed(2)}B$) khiến thặng dư vãng lai thu hẹp về ~0.3% GDP.`,
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

