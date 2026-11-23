import type {
  EconomyHealthReport,
  FredMacroMetric,
  MacroFieldMeta,
  MacroPillarGroup,
  MacroPillarMetric,
  PredictionItem,
} from '../types';
import { clampScore, classifyMacroQuadrant, classifyRegime, computeVietnamEquityRiskPremium, extractPolymarketMacroInsight, resolveNyFedSpreadAndProb, smoothFactorScore, weightedMean } from './core';
const DAILY_FRED_IDS = new Set([
  'DGS10',
  'DGS2',
  'T10Y2Y',
  'T10Y3M',
  'T10YIE',
  'T5YIFR',
  'VIXCLS',
  'DTWEXBGS',
]);

export function buildUsGlobalMacroHealth(
  fred: readonly FredMacroMetric[] | undefined,
  sp500PeRatio?: number,
  predictions?: readonly PredictionItem[],
  sp500PeMeta?: MacroFieldMeta,
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
        ? `3/12 quan sát ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%${zPart}`
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
      periodLabel: DAILY_FRED_IDS.has(m.id) ? m.date : m.date.slice(0, 7),
      sourceLabel: m.source ?? 'FRED',
      retained: Boolean(m.retained),
      fetchedAt: m.fetchedAt,
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
      periodLabel: us10y.date,
      sourceLabel: `${sp500PeMeta?.source ?? 'Multpl'} · FRED`,
      retained: Boolean(us10y.retained || sp500PeMeta?.retained),
      fetchedAt: sp500PeMeta?.fetchedAt ?? us10y.fetchedAt,
      status: usErp.erpPct >= 1.0 ? 'good' : usErp.erpPct >= 0 ? 'watch' : 'warn',
    });
  }

  const gdpVal = gdp?.value ?? 2.2;
  const retailVal = retail?.value ?? 3.5;
  const indVal = indpro?.value ?? 1.5;
  const orderVal = neworder?.value ?? 2.0;
  const ppiVal = ppi?.value ?? 2.5;
  const fwdVal = forwardInflMetric?.value ?? 2.3;
  const fedVal = fedfunds?.value ?? 3.25;
  const unrateVal = unrate?.value ?? 4.1;
  const curveVal = spread10y2y?.value ?? 0.25;
  const nyFed = resolveNyFedSpreadAndProb(byId);
  const recessionProb12m = nyFed.prob12m;

  // Blend structural target gap Z with actual rolling 12-period empirical Z-Score from FRED
  const blendZ = (structural: number, empirical?: number) =>
    empirical !== undefined ? structural * 0.6 + empirical * 0.4 : structural;

  // A missing series contributes 0 (neutral) to the z-scores, never a z derived from an invented value.
  const growthZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        (gdp ? blendZ((gdpVal - 2.1) / 1.0, gdp.zScore) * 0.4 : 0) +
        (retail ? blendZ((retailVal - 3.5) / 2.2, retail.zScore) * 0.25 : 0) +
        (indpro ? blendZ((indVal - 1.5) / 1.5, indpro.zScore) * 0.2 : 0) +
        (neworder ? blendZ((orderVal - 2.0) / 3.5, neworder.zScore) * 0.15 : 0),
      ),
    ).toFixed(2),
  );
  const inflationZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        (corePce ? blendZ((corePce.value - 2.2) / 0.6, corePce.zScore) * 0.42 : 0) +
        (cpi ? blendZ((cpi.value - 2.3) / 0.7, cpi.zScore) * 0.25 : 0) +
        (ppi ? blendZ((ppiVal - 2.5) / 1.2, ppi.zScore) * 0.18 : 0) +
        (forwardInflMetric ? blendZ((fwdVal - 2.25) / 0.35, forwardInflMetric.zScore) * 0.15 : 0),
      ),
    ).toFixed(2),
  );
  // Only score series that actually exist: a missing series must not be replaced by an invented value.
  const growthScore = weightedMean([
    ...(gdp ? [{ score: smoothFactorScore(gdpVal, 1.4, 1.5, false), weight: 0.38 }] : []),
    ...(retail ? [{ score: smoothFactorScore(retailVal, 2.2, 2.6, false), weight: 0.24 }] : []),
    ...(indpro ? [{ score: smoothFactorScore(indVal, 0.4, 1.8, false), weight: 0.22 }] : []),
    ...(neworder ? [{ score: smoothFactorScore(orderVal, 0.5, 4.5, false), weight: 0.16 }] : []),
  ]);

  const inflationScore = weightedMean([
    ...(corePce ? [{ score: smoothFactorScore(corePce.value, 2.8, 0.9, true), weight: 0.42 }] : []),
    ...(cpi ? [{ score: smoothFactorScore(cpi.value, 3.0, 1.0, true), weight: 0.26 }] : []),
    ...(ppi ? [{ score: smoothFactorScore(ppiVal, 3.4, 2.0, true), weight: 0.18 }] : []),
    ...(forwardInflMetric
      ? [{ score: smoothFactorScore(fwdVal, 2.45, 0.4, true), weight: 0.14 }]
      : []),
  ]);

  const monetaryScore = weightedMean([
    ...(fedfunds ? [{ score: smoothFactorScore(fedVal, 4.2, 1.3, true), weight: 0.3 }] : []),
    ...(unrate ? [{ score: smoothFactorScore(unrateVal, 4.6, 0.85, true), weight: 0.35 }] : []),
    ...(spread10y2y ? [{ score: smoothFactorScore(curveVal, 0.0, 0.5, false), weight: 0.35 }] : []),
  ]);

  const compositeScore = clampScore(
    growthScore * 0.4 + inflationScore * 0.32 + monetaryScore * 0.28,
  );

  // No data for a pillar means "unknown", never "good": require at least one real series.
  const hasGrowthData = Boolean(gdp || retail || indpro);
  const hasInflationData = Boolean(corePce || cpi || ppi);
  const quad =
    hasGrowthData && hasInflationData ? classifyMacroQuadrant(growthZ, inflationZ) : undefined;
  const growthBeat =
    hasGrowthData &&
    (!gdp || gdpVal >= 2.0) &&
    (!indpro || indVal >= 0) &&
    (!retail || retailVal >= 1.5);
  const inflationContained =
    hasInflationData &&
    (!corePce || corePce.value <= 2.8) &&
    (!cpi || cpi.value <= 2.9) &&
    (!ppi || ppiVal <= 3.8);
  const leadingWeakening =
    (neworder?.trendSlope !== undefined && neworder.trendSlope < -2.0 && orderVal < 0) ||
    (spread10y2y !== undefined && curveVal < 0);

  const classified =
    hasGrowthData && hasInflationData
      ? classifyRegime({ growthBeat, inflationContained, leadingWeakening })
      : undefined;

  const warningFlags: EconomyHealthReport['warningFlags'] = [];

  if (spread10y2y && curveVal < 0) {
    warningFlags.push({
      severity: 'critical',
      text: `Đường cong lợi suất 10Y–2Y đảo ngược (${curveVal.toFixed(2)}%): Tín hiệu lịch sử cảnh báo sớm suy thoái kinh tế Mỹ${recessionProb12m !== undefined ? ` (Xác suất suy thoái 12T NY Fed: ${recessionProb12m}%)` : ''
        }.`,
    });
  } else if (spread10y2y) {
    const probClause =
      recessionProb12m !== undefined
        ? recessionProb12m < 20
          ? ` · Xác suất suy thoái 12T (NY Fed 10Y–3M) ở mức thấp (${recessionProb12m}%)`
          : ` · Xác suất suy thoái 12T (NY Fed 10Y–3M): ${recessionProb12m}%`
        : ': Chưa xuất hiện tín hiệu đảo ngược suy thoái';
    warningFlags.push({
      severity: recessionProb12m !== undefined && recessionProb12m >= 35 ? 'warn' : 'good',
      text: `Đường cong lợi suất 10Y–2Y dương (+${curveVal.toFixed(2)}%)${probClause}.`,
    });
  }

  const polyMacro = extractPolymarketMacroInsight(predictions);
  if (polyMacro) {
    warningFlags.push({
      severity: polyMacro.bias === 'hawkish_hike' ? 'warn' : polyMacro.bias === 'dovish_cut' ? 'good' : 'good',
      text: `Kỳ vọng hàm ý thị trường Polymarket ($${(polyMacro.fedVolumeUsd / 1_000_000).toFixed(1)}M): ${polyMacro.fedActionLabel} (${polyMacro.fedContractTitle}).`,
    });
  }

  if (corePce && corePce.value > 2.6) {
    const anchoredNote =
      forwardInflMetric && forwardInflMetric.value <= 2.45
        ? ` (lạm phát hòa vốn trái phiếu neo ở ${forwardInflMetric.value.toFixed(2)}%)`
        : forwardInflMetric && forwardInflMetric.value >= 2.65
          ? ` kèm lạm phát hòa vốn trái phiếu dâng lên ${forwardInflMetric.value.toFixed(2)}%`
          : '';
    const fedStanceClause =
      polyMacro?.bias === 'hawkish_hike' ? 'Fed tiếp tục thắt chặt lãi suất' : 'Fed thận trọng lãi suất';
    warningFlags.push({
      severity: 'warn',
      text: `Thước đo FOMC Core PCE (+${corePce.value.toFixed(2)}%) cao hơn mục tiêu 2.0%${anchoredNote} — ${fedStanceClause}.`,
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
    { id: 'inflation', title: '2. CORE PCE · CPI & LẠM PHÁT HÒA VỐN TRÁI PHIẾU', score: inflationScore, metrics: inflationMetrics },
    { id: 'monetary', title: '3. LÃI SUẤT FED · VIỆC LÀM & ĐỊNH GIÁ ERP MỸ', score: monetaryScore, metrics: monetaryMetrics },
  ];

  return {
    id: 'US',
    title: 'Hoa Kỳ / Toàn cầu (US)',
    subtitle: 'St. Louis Fed (FRED) · Core PCE · Polymarket FOMC · Định giá ERP',
    compositeScore,
    ...(classified ? { regime: classified.regime } : {}),
    regimeLabel: classified?.label ?? 'CHƯA ĐỦ DỮ LIỆU',
    regimeSummary:
      classified?.summary ?? 'Cần có dữ liệu tăng trưởng và lạm phát để xác định chế độ kinh tế.',
    ...(quad ? { quadrant: quad.quadrant, quadrantLabel: quad.quadrantLabel } : {}),
    growthZ,
    inflationZ,
    ...(recessionProb12m !== undefined ? { recessionProb12m } : {}),
    pillars,
    warningFlags,
  };
}

