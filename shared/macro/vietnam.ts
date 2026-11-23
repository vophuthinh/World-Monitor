import type {
  EconomyHealthReport,
  MacroCountryIndicator,
  MacroPillarGroup,
  MacroPillarMetric,
  MarketQuote,
  VietnamLiveMacroPulse,
} from '../types';
import { VN_CPI_TARGET_PCT, clampScore, classifyMacroQuadrant, classifyRegime, computeVietnamEquityRiskPremium, isFreshVietnamMonthlyPeriod, smoothFactorScore, weightedMean } from './core';
export function buildVietnamMacroHealth(
  vn: MacroCountryIndicator | undefined,
  usdVndRate?: number,
  vniQuote?: MarketQuote,
  pulse?: VietnamLiveMacroPulse,
  us10yYield?: number,
  provenance?: {
    fxQuote?: MarketQuote;
    us10yRetained?: boolean;
  },
  now = Date.now(),
): EconomyHealthReport | null {
  if (vn?.gdpGrowthPct == null && pulse?.quarterlyGdpPct === undefined) return null;
  const worldBankMissing = !vn;
  vn ??= {
    countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'Việt Nam', isVietnam: true,
    gdpGrowthPct: null, gdpGrowthYear: null, gdpCurrentUsd: null, gdpCurrentYear: null,
    cpiInflationPct: null, cpiYear: null,
  };

  const fm = pulse?.fieldMeta;
  const wbRetained = Boolean(vn.retained);
  const formatWbYear = (yr?: number | null) => (yr ? `Năm ${yr}` : 'Kỳ chưa rõ');

  // Prefer live Quarterly GDP & Monthly CPI/PMI when available, falling back seamlessly to World Bank annual
  const hasLiveQuarterlyGdp = pulse?.quarterlyGdpPct !== undefined;
  const gdp = pulse?.quarterlyGdpPct ?? vn.gdpGrowthPct ?? 6.8;
  const gdpPrev = pulse?.quarterlyGdpPrevPct ?? vn.gdpPrevPct ?? undefined;
  const gdpMeta = fm?.quarterlyGdpPct;
  const gdpPeriod = hasLiveQuarterlyGdp
    ? gdpMeta?.period ?? 'Quý mới nhất'
    : formatWbYear(vn.gdpGrowthYear);
  const gdpSource = hasLiveQuarterlyGdp ? gdpMeta?.source ?? 'NSO / TE' : 'World Bank';
  const gdpRetained = hasLiveQuarterlyGdp ? Boolean(gdpMeta?.retained) : wbRetained;
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
  const vnNow = new Date(now + 7 * 3_600_000);
  const currentCalendarYear = vnNow.getUTCFullYear();
  const avgPeriod = fm?.ytdAvgCpiPct?.period;
  const avgPeriodYear = avgPeriod?.match(/\/(20\d{2})$/)?.[1];
  const hasYtdAvgCpi =
    pulse?.ytdAvgCpiPct !== undefined &&
    avgPeriodYear !== undefined &&
    Number(avgPeriodYear) === currentCalendarYear;
  const monthlyMeta = fm?.monthlyCpiPct;
  const hasMonthlySpotCpi =
    pulse?.monthlyCpiPct !== undefined && isFreshVietnamMonthlyPeriod(monthlyMeta?.period, now);
  const hasCurrentYearWbCpi =
    vn.cpiYear !== null && vn.cpiYear === currentCalendarYear && vn.cpiInflationPct !== null;
  const cpiValue =
    (hasYtdAvgCpi ? pulse?.ytdAvgCpiPct : undefined) ??
    (hasCurrentYearWbCpi ? vn.cpiInflationPct : undefined) ??
    (hasMonthlySpotCpi ? pulse?.monthlyCpiPct : undefined) ??
    undefined;
  const isMonthlyOnlyCpi =
    !hasYtdAvgCpi && !hasCurrentYearWbCpi && hasMonthlySpotCpi && cpiValue !== undefined;
  const hasPolicyComparableCpi = hasYtdAvgCpi || hasCurrentYearWbCpi;
  const spotMonthlyCpi = hasMonthlySpotCpi ? pulse?.monthlyCpiPct : undefined;
  const corePeriod = fm?.ytdCoreCpiPct?.period;
  const coreCpi =
    hasYtdAvgCpi && avgPeriod !== undefined && avgPeriod === corePeriod
      ? pulse?.ytdCoreCpiPct
      : undefined;
  const cpiPreviousValue = isMonthlyOnlyCpi ? pulse?.monthlyCpiPrevPct : vn.cpiPrevPct;
  const cpiTrend =
    !hasYtdAvgCpi && cpiValue !== undefined && cpiPreviousValue !== null && cpiPreviousValue !== undefined
      ? Number((cpiValue - cpiPreviousValue).toFixed(2))
      : undefined;

  // World Bank gaps stay undefined: a missing indicator is omitted, never replaced by an invented value.
  const fdi = vn.fdiPctGdp ?? undefined;
  const exportsGdp = vn.exportsPctGdp ?? undefined;
  const unemp = vn.unemploymentPct ?? undefined;
  const currentAccount = vn.currentAccountPctGdp;
  const cabYear = vn.currentAccountYear ?? undefined;
  const isCabNotCurrentYear = cabYear !== currentCalendarYear;
  const creditPctGdp = vn.creditPctGdp;
  const vn10y = pulse?.vn10yYieldPct;
  const interbank = pulse?.interbankRatePct;
  const ytdTradePeriod = fm?.ytdTradeBalanceBillionUsd?.period;
  const ytdTradeYear = ytdTradePeriod?.match(/\/(20\d{2})$/)?.[1];
  const ytdTradeB =
    pulse?.ytdTradeBalanceBillionUsd !== undefined &&
    ytdTradeYear !== undefined &&
    Number(ytdTradeYear) === currentCalendarYear
      ? pulse.ytdTradeBalanceBillionUsd
      : undefined;
  const ytdTradeMonths = ytdTradePeriod?.match(/^(1[0-2]|[2-9])T\//)?.[1];
  const vcbSell = pulse?.vcbSellUsdVnd;
  const erp = vn10y !== undefined && vn10y > 0
    ? computeVietnamEquityRiskPremium(vniQuote?.peRatio, vn10y)
    : null;
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
  const effectiveCpiForZ =
    cpiValue !== undefined && coreCpi !== undefined
      ? cpiValue * 0.65 + coreCpi * 0.35
      : cpiValue ?? coreCpi;
  const inflationZ = Number(
    Math.max(
      -3,
      Math.min(
        3,
        (effectiveCpiForZ !== undefined ? ((effectiveCpiForZ - 3.9) / 0.75) * 0.6 : 0) +
          fxStressZ * 0.25 +
          interbankStressZ * 0.15,
      ),
    ).toFixed(2),
  );
  const quad =
    effectiveCpiForZ !== undefined ? classifyMacroQuadrant(growthZ, inflationZ) : undefined;

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
      sourceLabel: gdpSource,
      retained: gdpRetained,
      fetchedAt: hasLiveQuarterlyGdp ? gdpMeta?.fetchedAt : undefined,
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
        periodLabel: fm?.manufacturingPmi?.period ?? 'Tháng mới nhất',
        sourceLabel: fm?.manufacturingPmi?.source ?? 'S&P Global / TE',
        retained: Boolean(fm?.manufacturingPmi?.retained),
        fetchedAt: fm?.manufacturingPmi?.fetchedAt,
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
        periodLabel: formatWbYear(vn.manufacturingYear ?? vn.gdpGrowthYear),
        sourceLabel: 'World Bank',
        retained: wbRetained,
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
            ? `Lũy kế ${ytdTradePeriod ?? (pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths}T` : 'năm')}: ${ytdTradeB >= 0 ? '+' : ''}${ytdTradeB.toFixed(2)}B$ (${ytdTradeB < 0 ? 'nhập siêu máy móc/NL' : 'xuất siêu'})`
            : exportsGdp !== undefined
              ? `Độ mở XK: ${exportsGdp.toFixed(0)}% GDP`
              : undefined,
        periodLabel: fm?.tradeBalanceBillionUsd?.period ?? 'Tháng mới nhất',
        sourceLabel:
          ytdTradeB !== undefined && fm?.ytdTradeBalanceBillionUsd
            ? `${fm?.tradeBalanceBillionUsd?.source ?? 'Hải quan / TE'} · ${fm.ytdTradeBalanceBillionUsd.source}`
            : (fm?.tradeBalanceBillionUsd?.source ?? 'Hải quan / TE'),
        retained: Boolean(
          fm?.tradeBalanceBillionUsd?.retained ||
            (ytdTradeB !== undefined && fm?.ytdTradeBalanceBillionUsd?.retained),
        ),
        fetchedAt: fm?.tradeBalanceBillionUsd?.fetchedAt,
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
        periodLabel: formatWbYear(vn.exportsYear ?? vn.gdpGrowthYear),
        sourceLabel: 'World Bank',
        retained: wbRetained,
        status: exportsGdp >= 75 ? 'good' : 'watch',
      },
  ];
  const growthMetrics = growthMetricsRaw.filter((m): m is MacroPillarMetric => m !== null);

  const cpiMetricLabel = hasYtdAvgCpi
    ? `CPI Bình quân ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths}T` : 'Lũy kế'} (Chỉ tiêu QH)`
    : isMonthlyOnlyCpi
      ? 'CPI Tháng so cùng kỳ (chưa phải CPI bình quân)'
      : 'Lạm phát CPI bình quân';

  const cpiSubParts: string[] = [];
  if (coreCpi !== undefined) cpiSubParts.push(`Lõi BQ ${coreCpi.toFixed(2)}%`);
  if (spotMonthlyCpi !== undefined && !isMonthlyOnlyCpi && cpiValue !== spotMonthlyCpi) {
    cpiSubParts.push(`Tháng YoY ${spotMonthlyCpi.toFixed(2)}%`);
  } else if (isMonthlyOnlyCpi && pulse?.monthlyCpiPrevPct !== undefined && cpiTrend !== undefined) {
    cpiSubParts.push(`${cpiTrend >= 0 ? '+' : ''}${cpiTrend}% vs tháng trước`);
  } else if (cpiTrend !== undefined) {
    cpiSubParts.push(`${cpiTrend >= 0 ? '+' : ''}${cpiTrend}% vs kỳ trước`);
  }

  const inflationMetrics: MacroPillarMetric[] =
    cpiValue === undefined
      ? []
      : [{
      id: 'vn-cpi',
      name: cpiMetricLabel,
      actual: cpiValue,
      unit: '%',
      benchmarkLabel: isMonthlyOnlyCpi
        ? 'Mốc tham chiếu · chỉ tiêu QH tính CPI bình quân'
        : 'Trần BQ Quốc hội',
      benchmarkValue: cpiCeiling,
      deltaVsBenchmark: Number((cpiValue - cpiCeiling).toFixed(2)),
      zScore: Number(((cpiValue - 3.9) / 0.75).toFixed(2)),
      trendSlope: cpiTrend,
      trendLabel: cpiSubParts.length > 0 ? cpiSubParts.join(' · ') : undefined,
      periodLabel: hasYtdAvgCpi
        ? fm?.ytdAvgCpiPct?.period ?? `${pulse?.ytdCpiMonths ?? ''}T/${currentCalendarYear}`
        : isMonthlyOnlyCpi
          ? fm?.monthlyCpiPct?.period ?? 'CPI tháng live'
          : formatWbYear(vn.cpiYear),
      sourceLabel: hasYtdAvgCpi
        ? fm?.ytdAvgCpiPct?.source ?? 'Cục Thống kê (NSO)'
        : isMonthlyOnlyCpi
          ? fm?.monthlyCpiPct?.source ?? 'GSO / TradingEconomics'
          : 'World Bank',
      retained: hasYtdAvgCpi
        ? Boolean(fm?.ytdAvgCpiPct?.retained ||
          (coreCpi !== undefined && fm?.ytdCoreCpiPct?.retained) ||
          (spotMonthlyCpi !== undefined && spotMonthlyCpi !== cpiValue && fm?.monthlyCpiPct?.retained))
        : isMonthlyOnlyCpi
          ? Boolean(fm?.monthlyCpiPct?.retained)
          : wbRetained,
      fetchedAt: hasYtdAvgCpi ? fm?.ytdAvgCpiPct?.fetchedAt : isMonthlyOnlyCpi ? fm?.monthlyCpiPct?.fetchedAt : undefined,
      status: isMonthlyOnlyCpi
        ? cpiValue > cpiCeiling ? 'warn' : 'watch'
        : cpiValue <= 4.2 ? 'good' : cpiValue <= 4.75 ? 'watch' : 'warn',
    }];

  if (usdVndRate && usdVndRate > 15_000) {
    const fxBenchmark = 25_500;
    const fxPctDiff = Number((((usdVndRate - fxBenchmark) / fxBenchmark) * 100).toFixed(2));
    const fxQuote = provenance?.fxQuote;
    const vcbMeta = fm?.vcbSellUsdVnd;
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
      periodLabel: vcbMeta?.period ?? 'Hiện hành',
      sourceLabel: vcbSell
        ? `${fxQuote?.source ?? 'ER-API'} · Vietcombank`
        : (fxQuote?.source ?? 'ER-API'),
      retained: Boolean(fxQuote?.retained || (vcbSell !== undefined && vcbMeta?.retained)),
      fetchedAt: fxQuote?.updatedAt,
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
      periodLabel: fm?.interbankRatePct?.period ?? 'Kỳ ngắn hạn',
      sourceLabel: fm?.interbankRatePct?.source ?? 'SBV / TE',
      retained: Boolean(fm?.interbankRatePct?.retained),
      fetchedAt: fm?.interbankRatePct?.fetchedAt,
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
      periodLabel: fm?.vn10yYieldPct?.period ?? 'Hiện hành',
      sourceLabel: fm?.vn10yYieldPct?.source ?? 'VBMA / TE',
      retained: Boolean(fm?.vn10yYieldPct?.retained || provenance?.us10yRetained),
      fetchedAt: fm?.vn10yYieldPct?.fetchedAt,
      status: spreadVsUs !== undefined && spreadVsUs < -1.0 ? 'warn' : vn10y <= 5.2 ? 'good' : 'watch',
    });
  }

  // World Bank current-account values are annual; never infer a current-year value from YTD goods trade.
  if (currentAccount !== null && currentAccount !== undefined) {
    if (isCabNotCurrentYear) {
      monetaryMetrics.push({
        id: 'vn-cab',
        name: `Cán cân Vãng lai / GDP (${cabYear !== undefined ? `Số chốt năm ${cabYear}` : 'chưa rõ kỳ'})`,
        actual: Number(currentAccount.toFixed(2)),
        unit: '% GDP',
        benchmarkLabel: 'Thặng dư an toàn',
        benchmarkValue: 2.0,
        deltaVsBenchmark: Number((currentAccount - 2.0).toFixed(2)),
        trendLabel: 'Số liệu năm cũ hoặc chưa rõ kỳ; không dùng để đánh giá cán cân vãng lai hiện tại',
        periodLabel: formatWbYear(cabYear),
        sourceLabel: 'World Bank',
        retained: wbRetained,
        status: 'watch',
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
        periodLabel: formatWbYear(cabYear ?? vn.gdpGrowthYear),
        sourceLabel: 'World Bank',
        retained: wbRetained,
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
      periodLabel: formatWbYear(vn.fdiYear),
      sourceLabel: 'World Bank',
      retained: wbRetained,
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
      periodLabel: formatWbYear(vn.creditYear),
      sourceLabel: 'World Bank',
      retained: wbRetained,
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
      periodLabel: formatWbYear(vn.unemploymentYear),
      sourceLabel: 'World Bank',
      retained: wbRetained,
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
      periodLabel: 'Hiện hành',
      sourceLabel: `${vniQuote.source} · ${vniQuote.valuationSource ?? 'Simplize'}`,
      retained: Boolean(
        vniQuote.retained || vniQuote.valuationRetained || (vn10y !== undefined && fm?.vn10yYieldPct?.retained),
      ),
      fetchedAt: vniQuote.updatedAt,
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
    ...(cpiValue !== undefined
      ? [{
          score: smoothFactorScore(
            cpiValue,
            isMonthlyOnlyCpi ? 3.9 : cpiCeiling,
            isMonthlyOnlyCpi ? 0.75 : 1.15,
            true,
          ),
          weight: 0.55,
        }]
      : []),
    ...(usdVndRate && usdVndRate > 15_000
      ? [{ score: smoothFactorScore(usdVndRate, 25_950, 500, true), weight: 0.25 }]
      : []),
    ...(interbank !== undefined
      ? [{ score: smoothFactorScore(interbank, 6.2, 2.2, true), weight: 0.2 }]
      : []),
  ]);

  const monetaryScore = weightedMean([
    ...(fdi !== undefined ? [{ score: smoothFactorScore(fdi, 2.3, 1.4, false), weight: 0.3 }] : []),
    ...(unemp !== undefined ? [{ score: smoothFactorScore(unemp, 2.8, 1.0, true), weight: 0.2 }] : []),
    ...(!isCabNotCurrentYear && currentAccount !== null && currentAccount !== undefined
      ? [{ score: smoothFactorScore(currentAccount, 0.5, 3.2, false), weight: 0.25 }]
      : []),
    ...(erp ? [{ score: smoothFactorScore(erp.erpPct, 1.2, 2.2, false), weight: 0.35 }] : []),
  ]);

  const compositeScore = clampScore(
    growthScore * 0.42 + inflationScore * 0.3 + monetaryScore * 0.28,
  );

  // Unknown manufacturing data is neutral (growthBeat is then decided by GDP alone).
  const pmiHealthy =
    hasLivePmi && pmi !== undefined ? pmi >= 50.0 : manf !== undefined ? manf >= 6.5 : true;
  const classified = hasPolicyComparableCpi
    ? classifyRegime({
        growthBeat: gdp >= gdpBenchmark - 0.3 && pmiHealthy,
        inflationContained: cpiValue !== undefined && cpiValue <= cpiCeiling,
        // With no PMI or manufacturing data, GDP below 4% stands in for weak leading indicators.
        leadingWeakening:
          hasLivePmi && pmi !== undefined ? pmi < 49.0 : manf !== undefined ? manf < 5.0 : gdp < 4.0,
      })
    : undefined;

  const warningFlags: EconomyHealthReport['warningFlags'] = [];
  if (worldBankMissing) {
    warningFlags.push({ severity: 'warn', text: 'Thiếu dữ liệu World Bank; báo cáo chỉ sử dụng các chỉ báo Việt Nam hiện có.' });
  }
  if (gdp >= 7.0 && pmiHealthy) {
    const resolvedTradeMonths = ytdTradeMonths ?? (pulse?.ytdCpiMonths ? String(pulse.ytdCpiMonths) : undefined);
    const tradePeriodLabel = resolvedTradeMonths ? `${resolvedTradeMonths} tháng ` : 'năm ';
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

  if (hasPolicyComparableCpi && cpiValue !== undefined && cpiValue <= cpiCeiling) {
    const spotNote =
      spotMonthlyCpi !== undefined && spotMonthlyCpi > cpiCeiling
        ? ` (dù CPI tháng đơn lẻ tăng ${spotMonthlyCpi.toFixed(2)}% YoY)`
        : '';
    warningFlags.push({
      severity: 'good',
      text: `Lạm phát kiểm soát tốt: CPI bình quân ${cpiValue.toFixed(2)}% thấp hơn mục tiêu Quốc hội (${cpiCeiling}%)${spotNote}.`,
    });
  } else if (hasPolicyComparableCpi && cpiValue !== undefined) {
    const isMildOvershoot = cpiValue - cpiCeiling <= 0.35;
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
        ? `Theo dõi lạm phát: CPI bình quân ${pulse?.ytdCpiMonths ? `${pulse.ytdCpiMonths} tháng ` : ''}(${cpiValue.toFixed(2)}%) vượt ${isMildOvershoot ? 'nhẹ' : ''} mốc ${cpiCeiling}% cả năm của Quốc hội${detailParts.length > 0 ? ` (${detailParts.join('; ')})` : ''
        }.`
        : `Theo dõi lạm phát: CPI (${cpiValue.toFixed(2)}%) cao hơn mốc tham chiếu ${cpiCeiling}% (lưu ý chỉ tiêu Quốc hội ${cpiCeiling}% tính trên bình quân cả năm).`,
    });
  } else if (isMonthlyOnlyCpi && cpiValue !== undefined) {
    warningFlags.push({
      severity: 'warn',
      text: `CPI tháng YoY ${cpiValue.toFixed(2)}% là số liệu đơn lẻ; chưa đủ kết luận CPI bình quân có vượt mục tiêu ${cpiCeiling}% của Quốc hội.`,
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

  // Never claim a prior-year or undated annual Current Account as a current-year shield.
  if (currentAccount !== null && currentAccount !== undefined) {
    if (isCabNotCurrentYear) {
      warningFlags.push({
        severity: 'warn',
        text: `Cán cân vãng lai/GDP ${cabYear !== undefined ? `năm ${cabYear}` : 'chưa rõ kỳ'} không đại diện cho ${currentCalendarYear}; không suy ra số hiện tại từ cán cân thương mại lũy kế.`,
      });
    } else if (currentAccount >= 3.0) {
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
    ...(classified ? { regime: classified.regime } : {}),
    regimeLabel: classified?.label ?? 'CHƯA ĐỦ DỮ LIỆU CPI BÌNH QUÂN',
    regimeSummary:
      classified?.summary ??
      'Chưa có CPI bình quân cùng kỳ để kết luận mức độ kiểm soát lạm phát và phân loại chế độ kinh tế.',
    ...(quad ? { quadrant: quad.quadrant, quadrantLabel: quad.quadrantLabel } : {}),
    growthZ,
    inflationZ,
    pillars,
    warningFlags,
  };
}

