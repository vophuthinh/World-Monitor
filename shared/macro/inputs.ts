import type { EconomyHealthReport, ExpiredMacroMetricNotice, MarketQuote, MarketSnapshot, PredictionItem, VietnamMacroPulseFieldKey } from '../types';
import { isFreshVietnamMonthlyPeriod } from './core';
import { buildVietnamMacroHealth } from './vietnam';
import { buildUsGlobalMacroHealth } from './us';

const RETAINED_MAX_AGE_MS = 7 * 86_400_000;

function expiredRetained(retained: boolean | undefined, fetchedAt: number | undefined, now: number): boolean {
  return retained === true && (fetchedAt === undefined || !Number.isFinite(fetchedAt) || fetchedAt <= 0 ||
    fetchedAt > now || now - fetchedAt > RETAINED_MAX_AGE_MS);
}

function expiredPrice(quote: MarketQuote, now: number): boolean {
  const tracksSourceTime = quote.source === 'Yahoo Finance Chart v8' || quote.source === 'ExchangeRate-API (open.er-api)' ||
    quote.source === 'HOSE / VNDirect Feed' || quote.source === 'HOSE / Stooq Feed';
  return expiredRetained(quote.retained, quote.updatedAt, now) ||
    (tracksSourceTime && expiredRetained(true, quote.observedAt, now));
}

function isCurrentVnStatYear(period: string | undefined, currentVnYear: number): boolean {
  const year = period?.match(/\/(20\d{2})$/)?.[1];
  return Boolean(year && Number(year) === currentVnYear);
}

const VN_PULSE_LABELS: Partial<Record<VietnamMacroPulseFieldKey, { label: string; defaultSource: string; unit: string }>> = {
  quarterlyGdpPct: { label: 'GDP thực Quý VN', defaultSource: 'NSO / TE', unit: '%' },
  manufacturingPmi: { label: 'PMI Sản xuất VN', defaultSource: 'S&P Global / TE', unit: ' pts' },
  tradeBalanceBillionUsd: { label: 'Cán cân Thương mại Tháng', defaultSource: 'Hải quan / TE', unit: 'B$' },
  ytdTradeBalanceBillionUsd: { label: 'Cán cân Thương mại Lũy kế', defaultSource: 'Cục Thống kê (NSO)', unit: 'B$' },
  ytdAvgCpiPct: { label: 'CPI Bình quân Lũy kế', defaultSource: 'Cục Thống kê (NSO)', unit: '%' },
  ytdCoreCpiPct: { label: 'CPI Lõi Bình quân Lũy kế', defaultSource: 'Cục Thống kê (NSO)', unit: '%' },
  monthlyCpiPct: { label: 'CPI Tháng VN (YoY)', defaultSource: 'GSO / TE', unit: '%' },
  interbankRatePct: { label: 'Lãi suất Liên ngân hàng qua đêm', defaultSource: 'Báo chí · thị trường LNH', unit: '%' },
  interbankTermRatePct: { label: 'Lãi suất Liên ngân hàng kỳ hạn dài', defaultSource: 'TradingEconomics', unit: '%' },
  vn10yYieldPct: { label: 'Lợi suất TPCP VN 10Y', defaultSource: 'VBMA / TE', unit: '%' },
  vcbSellUsdVnd: { label: 'Tỷ giá bán Vietcombank', defaultSource: 'Vietcombank', unit: '₫' },
};

export function collectExpiredMacroNotices(
  markets: MarketSnapshot,
  now = Date.now(),
): { vn: ExpiredMacroMetricNotice[]; us: ExpiredMacroMetricNotice[] } {
  const vn: ExpiredMacroMetricNotice[] = [...(markets.expiredMacroNotices?.vn ?? [])];
  const us: ExpiredMacroMetricNotice[] = [...(markets.expiredMacroNotices?.us ?? [])];
  const pulse = markets.vnMacroPulse;

  if (pulse?.fieldMeta) {
    for (const [rawKey, info] of Object.entries(VN_PULSE_LABELS)) {
      const key = rawKey as VietnamMacroPulseFieldKey;
      const val = pulse[key];
      const meta = pulse.fieldMeta[key];
      if (val !== undefined && info && meta && expiredRetained(meta.retained, meta.fetchedAt, now)) {
        vn.push({
          id: key,
          label: info.label,
          sourceLabel: meta.source || info.defaultSource,
          ...(meta.period ? { periodLabel: meta.period } : {}),
          lastValueLabel:
            info.unit === '₫' ? `${Math.round(val).toLocaleString('en-US')}₫` : `${val.toFixed(2)}${info.unit}`,
          ...(meta.fetchedAt && meta.fetchedAt > 0 ? { fetchedAt: meta.fetchedAt } : {}),
        });
      }
    }

    const spVal = pulse.sp500PeRatio;
    const spMeta = pulse.fieldMeta.sp500PeRatio;
    if (spVal !== undefined && spMeta && expiredRetained(spMeta.retained, spMeta.fetchedAt, now)) {
      us.push({
        id: 'sp500PeRatio',
        label: 'Định giá P/E S&P 500',
        sourceLabel: spMeta.source || 'Multpl (S&P 500)',
        lastValueLabel: `${spVal.toFixed(1)}x`,
        ...(spMeta.fetchedAt && spMeta.fetchedAt > 0 ? { fetchedAt: spMeta.fetchedAt } : {}),
      });
    }
  }

  const monthlyCpi = pulse?.monthlyCpiPct;
  const monthlyMeta = pulse?.fieldMeta?.monthlyCpiPct;
  if (
    monthlyCpi !== undefined &&
    !isFreshVietnamMonthlyPeriod(monthlyMeta?.period, now) &&
    !vn.some((notice) => notice.id === 'monthlyCpiPct')
  ) {
    vn.push({
      id: 'monthlyCpiPct',
      label: 'CPI Tháng VN (YoY)',
      sourceLabel: monthlyMeta?.source ?? 'GSO / TradingEconomics',
      ...(monthlyMeta?.period ? { periodLabel: monthlyMeta.period } : {}),
      lastValueLabel: `${monthlyCpi.toFixed(2)}%`,
      ...(monthlyMeta?.fetchedAt ? { fetchedAt: monthlyMeta.fetchedAt } : {}),
    });
  }

  const fxQuote = markets.quotes.find((q) => q.symbol === 'USD/VND');
  if (fxQuote && expiredPrice(fxQuote, now)) {
    const observedAt = fxQuote.observedAt ??
      (fxQuote.source === 'ExchangeRate-API (open.er-api)' ? undefined : fxQuote.updatedAt);
    vn.push({
      id: 'vn-fx',
      label: 'Tỷ giá USD/VND',
      sourceLabel: fxQuote.source || 'ER-API',
      lastValueLabel: `${Math.round(fxQuote.price).toLocaleString('en-US')}₫`,
      ...(observedAt && observedAt > 0 ? { fetchedAt: observedAt } : {}),
    });
  }

  const vniQuote = markets.quotes.find((q) => q.symbol === 'VN-Index');
  if (vniQuote) {
    if (expiredPrice(vniQuote, now)) {
      vn.push({
        id: 'vn-index',
        label: 'Chỉ số VN-Index',
        sourceLabel: vniQuote.source || 'HOSE',
        lastValueLabel: `${vniQuote.price.toFixed(2)} pts`,
        ...(vniQuote.observedAt && vniQuote.observedAt > 0 ? { fetchedAt: vniQuote.observedAt } : {}),
      });
    } else if (
      vniQuote.peRatio !== undefined &&
      expiredRetained(vniQuote.valuationRetained, vniQuote.valuationFetchedAt, now)
    ) {
      vn.push({
        id: 'vn-pe',
        label: 'Định giá P/E VN-Index',
        sourceLabel: vniQuote.valuationSource || 'Simplize',
        lastValueLabel: `${vniQuote.peRatio.toFixed(2)}x`,
        ...(vniQuote.valuationFetchedAt && vniQuote.valuationFetchedAt > 0
          ? { fetchedAt: vniQuote.valuationFetchedAt }
          : {}),
      });
    }
  }

  for (const m of markets.fred ?? []) {
    if (expiredRetained(m.retained, m.fetchedAt, now)) {
      us.push({
        id: m.id,
        label: m.subtitle || m.label,
        sourceLabel: m.source || 'FRED',
        periodLabel: m.date,
        lastValueLabel: `${m.value.toFixed(2)}${m.unit === '%' ? '%' : ` ${m.unit}`}`,
        ...(m.fetchedAt && m.fetchedAt > 0 ? { fetchedAt: m.fetchedAt } : {}),
      });
    }
  }

  return { vn, us };
}

export function usableMacroInputs(markets: MarketSnapshot, now: number): MarketSnapshot {
  const vnNow = new Date(now + 7 * 3_600_000);
  const currentVnYear = vnNow.getUTCFullYear();
  const pulse = markets.vnMacroPulse ? { ...markets.vnMacroPulse } : undefined;
  if (pulse) {
    const fm = pulse.fieldMeta;
    if (fm) {
      for (const [key, meta] of Object.entries(fm)) {
        if (meta && expiredRetained(meta.retained, meta.fetchedAt, now)) {
          delete pulse[key as keyof typeof fm];
        }
      }
    }

    // Require verified current-year period metadata on all cumulative YTD figures (rejects prior-year AND undated legacy CPI/trade)
    const cpiPeriod = fm?.ytdAvgCpiPct?.period;
    if (!isCurrentVnStatYear(cpiPeriod, currentVnYear)) {
      delete pulse.ytdAvgCpiPct;
      delete pulse.ytdCoreCpiPct;
      delete pulse.ytdCpiMonths;
    } else {
      const corePeriod = fm?.ytdCoreCpiPct?.period;
      if (!corePeriod || corePeriod !== cpiPeriod) {
        delete pulse.ytdCoreCpiPct;
      }
    }

    const ytdTradePeriod = fm?.ytdTradeBalanceBillionUsd?.period;
    if (!isCurrentVnStatYear(ytdTradePeriod, currentVnYear)) {
      delete pulse.ytdTradeBalanceBillionUsd;
    }

    // Reject monthly CPI without fieldMeta (legacy cache) or with a stale period > 3 months old
    const monthlyMeta = fm?.monthlyCpiPct;
    if (
      !monthlyMeta ||
      !isFreshVietnamMonthlyPeriod(monthlyMeta.period, now)
    ) {
      delete pulse.monthlyCpiPct;
      delete pulse.monthlyCpiPrevPct;
    }
  }

  const quotes = markets.quotes
    .filter((quote) => !expiredPrice(quote, now))
    .map((quote) => {
      if (!expiredRetained(quote.valuationRetained, quote.valuationFetchedAt, now)) return quote;
      const { peRatio, pbRatio, close52wLow, close52wHigh, volumeVs90dRatio, ...withoutValuation } = quote;
      return withoutValuation;
    });

  return {
    ...markets,
    quotes,
    fred: markets.fred?.filter((metric) => !expiredRetained(metric.retained, metric.fetchedAt, now)),
    vn30: markets.vn30?.filter((quote) => !expiredRetained(true, quote.updatedAt, now) &&
      !expiredRetained(true, quote.observedAt, now)),
    vnGold: markets.vnGold?.filter((quote) => !expiredRetained(true, quote.updatedAt, now)),
    vnMacroPulse: pulse,
  };
}

export function evaluateMacroHealth(
  markets: MarketSnapshot,
  predictions?: readonly PredictionItem[],
  now = Date.now(),
): {
  vn: EconomyHealthReport | null;
  us: EconomyHealthReport | null;
} {
  const expiredNotices = collectExpiredMacroNotices(markets, now);
  markets = usableMacroInputs(markets, now);
  const vnRow = markets.macro.find((r) => r.countryCode === 'VNM' || r.isVietnam);
  const fxQuote = markets.quotes.find((q) => q.symbol === 'USD/VND');
  const usdVnd = fxQuote?.price;
  const vniQuote = markets.quotes.find((q) => q.symbol === 'VN-Index');
  const us10yMetric = (markets.fred ?? []).find((m) => m.id === 'DGS10');
  const us10y = us10yMetric?.value;

  const vnReport = buildVietnamMacroHealth(vnRow, usdVnd, vniQuote, markets.vnMacroPulse, us10y, {
    fxQuote,
    us10yRetained: us10yMetric?.retained,
  }, now);
  const usReport = buildUsGlobalMacroHealth(
    markets.fred,
    markets.vnMacroPulse?.sp500PeRatio,
    predictions,
    markets.vnMacroPulse?.fieldMeta?.sp500PeRatio,
  );

  return {
    vn:
      vnReport && expiredNotices.vn.length > 0
        ? { ...vnReport, expiredMetrics: expiredNotices.vn }
        : vnReport,
    us:
      usReport && expiredNotices.us.length > 0
        ? { ...usReport, expiredMetrics: expiredNotices.us }
        : usReport,
  };
}

