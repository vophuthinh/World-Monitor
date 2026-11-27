import type {
  CompassFactorPillar,
  InvestmentCompassReport,
  InvestmentStance,
  LeadingCompassSignal,
  MarketQuote,
  MarketSnapshot,
  PredictionItem,
} from '../types';
import { NEUTRAL_SCORE, VN_CPI_TARGET_PCT, buildSectorRotation, clampScore, computeFedNetLiquidity, computeVietnamEquityRiskPremium, computeVn30MarketBreadth, extractPolymarketMacroInsight, isFreshGoldComparison, resolveNyFedSpreadAndProb, shrunkPillarScore, smoothFactorScore, scoreLevel } from './core';
import { evaluateMacroHealth, usableMacroInputs } from './inputs';
import { computeDynamicPortfolioAllocation } from './allocation';
export { computeDynamicPortfolioAllocation } from './allocation';
export { collectExpiredMacroNotices, evaluateMacroHealth } from './inputs';

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

export function evaluateInvestmentCompass(
  markets: MarketSnapshot,
  predictions?: readonly PredictionItem[],
  now = Date.now(),
): InvestmentCompassReport | null {
  markets = usableMacroInputs(markets, now);
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
  const vix = quoteBySym.get('VIX');
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
    walclDelta4wMillions: walcl?.delta4w,
    wtregenDelta4wMillions: wtregen?.delta4w,
    rrpDelta4wBillions: rrp?.delta4w,
  });

  if (netLiq) {
    const delta4w = netLiq.delta4wBillions;
    if (delta4w !== undefined) {
      f1Liquidity.push({
        score: smoothFactorScore(delta4w, 0, 75, false),
        weight: 0.28,
      });
    }
    const trillions = (netLiq.netLiquidityBillions / 1000).toFixed(2);
    signals.push({
      id: 'fed-net-liq',
      label: 'Thanh khoản Ròng Fed',
      category: 'liquidity',
      valueDisplay: `$${trillions}T`,
      subtext:
        delta4w !== undefined
          ? `4T: ${delta4w >= 0 ? '+' : ''}${delta4w.toFixed(0)}B$ (WALCL−TGA−RRP)`
          : 'Chưa đủ dữ liệu đồng bộ để tính biến động 4 tuần',
      signalBadge:
        delta4w === undefined
          ? 'CHƯA ĐỦ DỮ LIỆU'
          : delta4w >= 30
            ? 'BƠM RÒNG MẠNH'
            : delta4w <= -60
              ? 'HÚT THANH KHOẢN'
              : 'THANH KHOẢN ỔN ĐỊNH',
      tone:
        delta4w === undefined
          ? 'neutral'
          : delta4w >= 30
            ? 'bullish'
            : delta4w <= -60
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
      label: 'Kỳ vọng hàm ý Fed (Polymarket)',
      category: 'liquidity',
      valueDisplay: polyMacro.fedActionLabel,
      subtext: `Vol $${(polyMacro.fedVolumeUsd / 1_000_000).toFixed(1)}M · Giá hợp đồng FOMC (thị trường)`,
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

  // Credit and volatility momentum: a calm level that is deteriorating fast must score lower.
  if (hySpread?.delta4w !== undefined) {
    f2CreditRecession.push({ score: smoothFactorScore(hySpread.delta4w, 0, 0.5, true), weight: 0.15 });
  }
  if (vixSpot?.delta4w !== undefined) {
    f5FxVolatility.push({ score: smoothFactorScore(vixSpot.delta4w, 0, 6, true), weight: 0.15 });
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

  // 5. Dr. Copper / Gold Ratio against its 50-day average (one day of price moves is noise)
  if (copper?.ma50 && gold?.ma50 && gold.price > 0) {
    const ratio = (copper.price * 1000) / gold.price;
    const vsAvgPct = (ratio / ((copper.ma50 * 1000) / gold.ma50) - 1) * 100;

    // Low weight: as a timing signal this performed poorly in a 2007-2026 backtest (Sharpe < buy-and-hold).
    f4TrendBreadth.push({ score: smoothFactorScore(vsAvgPct, 0, 5, false), weight: 0.05 });

    signals.push({
      id: 'copper-gold',
      label: 'Tỷ lệ Đồng / Vàng',
      category: 'cycle_tech',
      valueDisplay: `${ratio.toFixed(2)}x`,
      subtext: `So TB 50 phiên: ${vsAvgPct >= 0 ? '+' : ''}${vsAvgPct.toFixed(1)}%`,
      signalBadge: vsAvgPct >= 2 ? 'CẦU SẢN XUẤT TỐT' : vsAvgPct <= -2 ? 'THIÊN VỀ TRÚ ẨN' : 'TRUNG TÍNH',
      tone: vsAvgPct >= 2 ? 'bullish' : vsAvgPct <= -2 ? 'bearish' : 'neutral',
    });
  }

  // 6. PHLX Semiconductor Index (^SOX)
  if (sox && (sox.changePercent24h != null || (sox.ma200 !== undefined && sox.ma200 > 0))) {
    const change = sox.changePercent24h;
    const up = change != null && change >= 0;
    const hasMa200 = sox.ma200 !== undefined && sox.ma200 > 0;
    const aboveSoxMa200 = hasMa200 ? sox.price >= sox.ma200! : up;
    const soxPctMa200 = hasMa200 ? ((sox.price - sox.ma200!) / sox.ma200!) * 100 : change! * 2;
    const changeText = change == null ? 'không rõ' : `${up ? '+' : ''}${change.toFixed(hasMa200 ? 1 : 2)}%`;

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
        ? `MA200: ${Math.round(sox.ma200!).toLocaleString('en-US')} · 24h ${changeText}`
        : `24h: ${changeText} · Dẫn dắt CNTT & ĐTử`,
      signalBadge: aboveSoxMa200
        ? 'CHU KỲ AI MẠNH'
        : hasMa200
          ? 'DƯỚI MA200 · ĐIỀU CHỈNH'
          : 'NHỊP ĐIỀU CHỈNH',
      tone: aboveSoxMa200 ? 'bullish' : hasMa200 ? 'bearish' : 'neutral',
    });
  }

  // 7. NY Fed 12-Month Recession Probability (Official Monthly GS10 - Bond-Equivalent TB3MS Probit, fallback T10Y3M)
  const nyFedCompass = resolveNyFedSpreadAndProb(fredById);
  const recessionProb12m = nyFedCompass.prob12m;
  const nyFedSpreadUsed = nyFedCompass.spreadPct;
  if (recessionProb12m !== undefined && nyFedSpreadUsed !== undefined) {
    f2CreditRecession.push({
      score: smoothFactorScore(recessionProb12m, 32.0, 14.0, true),
      weight: 0.22,
    });

    signals.push({
      id: 'nyfed-prob',
      label: 'Xác suất Suy thoái NY Fed',
      category: 'recession_watch',
      valueDisplay: `${recessionProb12m.toFixed(1)}%`,
      subtext: `Spread 10Y–3M${nyFedCompass.isMonthlyAverage ? ' (BQ tháng)' : ''}: ${nyFedSpreadUsed >= 0 ? '+' : ''}${nyFedSpreadUsed.toFixed(2)}%`,
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
  const vnErp = pulse?.vn10yYieldPct !== undefined && pulse.vn10yYieldPct > 0
    ? computeVietnamEquityRiskPremium(vni?.peRatio, pulse.vn10yYieldPct)
    : null;
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
          ? 'P/E THẤP SO LỊCH SỬ'
          : pe <= 15.2
            ? 'VÙNG ĐỊNH GIÁ TRUNG BÌNH'
            : 'ĐỊNH GIÁ CAO',
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
      subtext: `${breadth.sampleCount} mã · Trên MA200: ${breadth.aboveMa200Pct}%${breadth.medianRsi14 !== undefined ? ` · RSI vị ${breadth.medianRsi14}` : ''
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

  // Term structure needs both legs from one session; FRED VIXCLS lags by 1-2 days.
  const sessionDay = (t: number | undefined) => (t === undefined ? undefined : new Date(t).toISOString().slice(0, 10));
  const vixDay = sessionDay(vix?.observedAt);
  if (vix && vix3m && vix3m.price > 0 && vixDay !== undefined && vixDay === sessionDay(vix3m.observedAt)) {
    vixTermRatio = vix.price / vix3m.price; // unrounded: 0.996 is not backwardation
    const hasRecessionData = recessionProb12m !== undefined || sahm !== undefined;
    const macroNotRecession =
      hasRecessionData &&
      (recessionProb12m === undefined || recessionProb12m < 35) &&
      (sahm === undefined || sahm.value < 0.45);
    const equityOversold = spx?.rsi14 !== undefined && spx.rsi14 <= 32;

    if (vixTermRatio >= 1.0 && macroNotRecession && equityOversold) {
      capitulationSignal = true;
      capitulationLabel = `VIX/VIX3M ${vixTermRatio.toFixed(3)}x · RSI-14 S&P 500: ${spx!.rsi14!.toFixed(0)}`;
    }

    // Low weight for the same backtest reason; the capitulation rule above is unaffected.
    f5FxVolatility.push({
      score: smoothFactorScore(vixTermRatio, 0.94, 0.08, true),
      weight: 0.08,
    });

    signals.push({
      id: 'vix-term',
      label: 'Cấu trúc Kỳ hạn VIX',
      category: 'valuation_breadth',
      valueDisplay: `${vixTermRatio.toFixed(3)}x`,
      subtext: `VIX ${vix.price.toFixed(2)} / VIX3M ${vix3m.price.toFixed(2)}`,
      signalBadge:
        vixTermRatio >= 1.0
          ? 'BACKWARDATION · BẤT ỔN'
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
  if (audJpy && audJpy.price > 0 && audJpy.changePercent24h != null) {
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
      subtext: `VN10Y ${pulse.vn10yYieldPct.toFixed(2)}%${pulse.interbankRatePct !== undefined ? ` · LNH qua đêm ${pulse.interbankRatePct.toFixed(2)}%` : ''
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
  // A pillar with no data uses the neutral score as prior and must never read as bullish.
  const liquidityScore = shrunkPillarScore(f1Liquidity, NEUTRAL_SCORE);
  const creditScore = shrunkPillarScore(f2CreditRecession, NEUTRAL_SCORE);
  const valuationScore = shrunkPillarScore(f3ValuationErp, NEUTRAL_SCORE);
  const trendScore = shrunkPillarScore(f4TrendBreadth, NEUTRAL_SCORE);
  const fxVolScore = shrunkPillarScore(f5FxVolatility, NEUTRAL_SCORE);
  const hasMacroCoreData =
    f1Liquidity.length > 0 && f2CreditRecession.length > 0 && f3ValuationErp.length > 0;

  const factorPillars: CompassFactorPillar[] = [
    {
      id: 'liquidity',
      label: 'Thanh khoản Fed & M2',
      weightPct: 25,
      score: liquidityScore,
      hasData: f1Liquidity.length > 0,
      inputCount: f1Liquidity.length,
    },
    {
      id: 'credit_recession',
      label: 'Tín dụng & Suy thoái',
      weightPct: 20,
      score: creditScore,
      hasData: f2CreditRecession.length > 0,
      inputCount: f2CreditRecession.length,
    },
    {
      id: 'valuation_erp',
      label: 'Định giá Đắt/Rẻ (ERP)',
      weightPct: 20,
      score: valuationScore,
      hasData: f3ValuationErp.length > 0,
      inputCount: f3ValuationErp.length,
    },
    {
      id: 'trend_breadth',
      label: 'Xu hướng MA & Độ rộng',
      weightPct: 20,
      score: trendScore,
      hasData: f4TrendBreadth.length > 0,
      inputCount: f4TrendBreadth.length,
    },
    {
      id: 'fx_volatility',
      label: 'Biến động VIX & Tỷ giá',
      weightPct: 15,
      score: fxVolScore,
      hasData: f5FxVolatility.length > 0,
      inputCount: f5FxVolatility.length,
    },
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

  // The blended state below drives the single simulated allocation; each market is also reported on
  // its own macro health and its own index, so US data never speaks for Vietnam.
  const health = evaluateMacroHealth(markets, predictions, now);
  const marketConfirmations: NonNullable<InvestmentCompassReport['marketConfirmations']> = [];
  for (const [market, report, trend, index] of [
    ['VN', health.vn, vniTrend, 'VN-Index'],
    ['US', health.us, spxTrend, 'S&P 500'],
  ] as const) {
    if (!report || !trend) continue;
    const macroText = report.compositeScore >= 56 ? 'vĩ mô thuận' : 'vĩ mô yếu';
    marketConfirmations.push({
      market,
      macroScore: report.compositeScore,
      trendAboveMa200: trend.aboveMa200,
      label: `${market === 'VN' ? 'VN' : 'Mỹ'}: ${macroText} (${report.compositeScore}/100) · ${index} ${trend.aboveMa200 ? 'trên' : 'dưới'} MA200 (${trend.pctVsMa200 >= 0 ? '+' : ''}${trend.pctVsMa200}%)`,
    });
  }

  if (hasTrendFilter && hasMacroCoreData) {
    const macroBullish = macroCoreScore >= 56;
    if (macroBullish && trendBullish) {
      dualConfirmation = 'confirmed_bull';
      dualConfirmationLabel = 'XÁC NHẬN KÉP TỔNG HỢP: NỀN VĨ MÔ THUẬN + GIÁ TRÊN MA200';
    } else if (macroBullish && !trendBullish) {
      dualConfirmation = 'macro_bull_trend_weak';
      dualConfirmationLabel = 'PHÂN KỲ TỔNG HỢP: NỀN VĨ MÔ ỔN NHƯNG CÓ CHỈ SỐ DƯỚI MA200';
    } else if (!macroBullish && trendBullish) {
      dualConfirmation = 'macro_weak_trend_bull';
      dualConfirmationLabel = 'PHÂN KỲ TỔNG HỢP: GIÁ TRÊN MA200 NHƯNG NỀN VĨ MÔ SUY YẾU';
    } else {
      dualConfirmation = 'confirmed_bear';
      dualConfirmationLabel = 'CẢNH BÁO KÉP TỔNG HỢP: NỀN VĨ MÔ SUY YẾU + CHỈ SỐ DƯỚI MA200';
    }
  }

  // Distance to the 200-day average drives a 0..1 weakness over a ±2% band (the same band that
  // performed best in the 2007-2026 S&P 500 backtest of this filter).
  const trends = [vniTrend, spxTrend].filter((t): t is NonNullable<typeof t> => t !== null);
  const trendWeakness = trends.length
    ? Math.max(...trends.map((t) => Math.max(0, Math.min(1, (2 - t.pctVsMa200) / 4))))
    : 0;
  // A weak trend caps the score: down to 68 with one index broken, 64 with both, phased in smoothly.
  const bothIndicesBroken = trends.length === 2 && trends.every((t) => t.pctVsMa200 <= -2);
  const scoreCap = bothIndicesBroken ? 64 : 68;
  const riskAppetiteScore = Math.round(rawComposite - trendWeakness * Math.max(0, rawComposite - scoreCap));

  // Determine active Macro Quadrant for Sector Rotation
  const activeQuad = health.vn?.quadrant ?? health.us?.quadrant;
  const sectorRotation = activeQuad ? buildSectorRotation(activeQuad) : undefined;

  let stance: InvestmentStance = 'selective_growth';
  // The label states the score level only (same bands as the factor bar colours), with no judgement.
  const level = scoreLevel(riskAppetiteScore);
  const stanceLabel = `MỨC ĐIỂM: ${level === 'high' ? 'CAO' : level === 'medium' ? 'VỪA' : 'THẤP'}`;

  if (
    (sahm && sahm.value >= 0.5) ||
    (hySpread && hySpread.value >= 5.0) ||
    riskAppetiteScore < 42
  ) {
    stance = 'defensive_recession';
  } else if (riskAppetiteScore < 55 || dualConfirmation === 'confirmed_bear') {
    stance = 'cautious';
  } else if (
    riskAppetiteScore >= 74 &&
    (!realYield || realYield.value < 2.2) &&
    dualConfirmation !== 'macro_bull_trend_weak'
  ) {
    stance = 'risk_on';
  } else if (dualConfirmation === 'macro_bull_trend_weak') {
    stance = 'selective_growth';
  }

  // Figures only: interpretation of what they imply for any asset did not survive the backtest.
  const signed = (value: number, digits: number) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
  const facts = [
    vniTrend && `VN-Index ${signed(vniTrend.pctVsMa200, 1)} so MA200`,
    spxTrend && `S&P 500 ${signed(spxTrend.pctVsMa200, 1)} so MA200`,
    vni?.peRatio && `P/E VN-Index ${vni.peRatio.toFixed(1)}x${vnErp ? ` (ERP ${signed(vnErp.erpPct, 2)} so TPCP 10 năm)` : ''}`,
    pulse?.interbankRatePct !== undefined && `Lãi qua đêm VND ${pulse.interbankRatePct.toFixed(2)}%`,
    realYield && `Lãi thực Mỹ 10 năm ${realYield.value.toFixed(2)}%`,
    hySpread && `Chênh lệch HY ${hySpread.value.toFixed(2)}%`,
    sahm && `Sahm ${sahm.value.toFixed(2)}`,
    vixSpot && `VIX ${vixSpot.value.toFixed(1)}`,
  ].filter(Boolean);
  const summary = facts.length > 0 ? facts.join(' · ') : 'Chưa đủ số liệu thị trường để tóm tắt.';

  const highInflationPressure =
    (pulse?.ytdAvgCpiPct !== undefined
      ? pulse.ytdAvgCpiPct >= VN_CPI_TARGET_PCT
      : pulse?.monthlyCpiPct !== undefined && pulse.monthlyCpiPct >= 4.7) ||
    (corePce !== undefined && corePce.value >= 2.8) ||
    (fwdInfl !== undefined && fwdInfl.value >= 2.5);
  const liquidityExpanding =
    (m2 !== undefined && m2.value >= 2.0) &&
    netLiq?.delta4wBillions !== undefined &&
    netLiq.delta4wBillions > -50;

  const allocations = computeDynamicPortfolioAllocation({
    stance,
    riskAppetiteScore,
    vnErpPct: vnErp?.erpPct,
    dualConfirmation,
    capitulationSignal,
    highInflationPressure,
    liquidityExpanding,
    riskOnBlocked: realYield !== undefined && realYield.value >= 2.2,
    // 0 at macro core 50, 1 at 62: no allocation jump when it crosses the label threshold of 56.
    macroStrength: Math.max(0, Math.min(1, (macroCoreScore - 50) / 12)),
    trendWeakness,
  });

  // Sector-rotation-aware actionable guidance
  const favoredAssets: string[] = [...(sectorRotation?.leadingSectors.slice(0, 2) ?? [])];
  const watchAssets: string[] = [];
  const avoidAssets: string[] = [];

  if (stance === 'defensive_recession' || stance === 'cautious') {
    favoredAssets.unshift('Tiền gửi kỳ hạn / Trái phiếu lãi suất thực dương (nhóm ít biến động)');
    watchAssets.push('Nhóm cổ phiếu vốn hóa lớn VN30 định giá P/E thấp khi lấy lại đường MA200');
    avoidAssets.push('Vị thế đòn bẩy cao ở nhóm cổ phiếu đã gãy xu hướng MA200');
  } else {
    favoredAssets.push(
      `Nhóm doanh nghiệp P/E thấp, nợ vay thấp, dòng tiền cổ tức ổn định${vni?.peRatio && vni.peRatio <= 12.2 ? ` (P/E thị trường hiện ${vni.peRatio.toFixed(1)}x)` : ''
      }`,
    );
    watchAssets.push(
      `Tài sản số vốn hóa lớn (nhạy với Thanh khoản ròng Fed ${netLiq ? `$${(netLiq.netLiquidityBillions / 1000).toFixed(2)}T` : ''
      } & M2 ${m2 ? `+${m2.value.toFixed(1)}%` : 'mở rộng'})`,
    );
    watchAssets.push(
      'Vàng nhẫn 9999 (kênh nhạy với lạm phát & biến động tỷ giá)',
    );

    if (vniTrend && !vniTrend.aboveMa200) {
      avoidAssets.push('Rủi ro biến động cao khi VN-Index chưa vượt lại đường trung bình dài hạn MA200');
    }
    for (const lag of sectorRotation?.laggingSectors.slice(0, 1) ?? []) {
      avoidAssets.push(lag);
    }
    if (sjcGold && isFreshGoldComparison(sjcGold, gold, usdVnd, now) && sjcGold.premiumVsWorldMillionVnd && sjcGold.premiumVsWorldMillionVnd >= 15) {
      avoidAssets.push(
        `Vàng miếng SJC đang chênh lệch rộng so với giá thế giới quy đổi (+${sjcGold.premiumVsWorldMillionVnd.toFixed(1)} tr/lượng)`,
      );
    } else if (usdVnd && usdVnd.price >= 25_750) {
      avoidAssets.push(
        `Nhóm nhạy cảm chi phí vốn ngoại tệ khi tỷ giá USD/VND (${Math.round(usdVnd.price).toLocaleString('en-US')}₫) neo cao`,
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
        ...(netLiq.delta4wBillions !== undefined
          ? { netLiquidityDelta4wBillions: netLiq.delta4wBillions }
          : {}),
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
    ...(marketConfirmations.length > 0 ? { marketConfirmations } : {}),
    ...(sectorRotation ? { sectorRotation } : {}),
    allocations,
    favoredAssets,
    watchAssets,
    avoidAssets,
    signals,
  };
}
