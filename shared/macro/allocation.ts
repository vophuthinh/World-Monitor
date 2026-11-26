import type { InvestmentCompassReport, InvestmentStance, PortfolioAllocationSlice } from '../types';

/** [equities, cash/bonds, gold, crypto] at the score where each stance mix applies in full. */
const SCORE_ANCHORS = [
  { score: 42, mix: [20, 55, 23, 2] }, // defensive
  { score: 50, mix: [35, 43, 18, 4] }, // cautious
  { score: 64, mix: [52, 28, 14, 6] }, // selective growth
  { score: 80, mix: [66, 16, 10, 8] }, // risk on
] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function interpolateMix(score: number): number[] {
  const hi = SCORE_ANCHORS.findIndex((a) => score <= a.score);
  if (hi === 0) return [...SCORE_ANCHORS[0].mix];
  if (hi < 0) return [...SCORE_ANCHORS[SCORE_ANCHORS.length - 1].mix];
  const from = SCORE_ANCHORS[hi - 1];
  const to = SCORE_ANCHORS[hi];
  const t = (score - from.score) / (to.score - from.score);
  return from.mix.map((v, i) => v + (to.mix[i] - v) * t);
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
  /** 0..1 macro support; blends smoothly between the "confirmed" and "diverging" states. */
  macroStrength?: number;
  /** High real yield: never go beyond the selective-growth mix. */
  riskOnBlocked?: boolean;
  /**
   * 0 = every index at least 2% above its MA200, 1 = some index at least 2% below. Weak-trend effects
   * scale with it, so crossing the average cannot jump the weights.
   */
  trendWeakness?: number;
}): PortfolioAllocationSlice[] {
  const {
    stance,
    riskAppetiteScore,
    vnErpPct,
    dualConfirmation,
    capitulationSignal,
    highInflationPressure,
    liquidityExpanding,
    riskOnBlocked,
  } = params;
  const labelledWeak = dualConfirmation === 'macro_bull_trend_weak' || dualConfirmation === 'confirmed_bear';
  const weakness = clamp01(params.trendWeakness ?? (labelledWeak ? 1 : 0));
  const hasTrend = dualConfirmation !== undefined;
  const strength = clamp01(
    params.macroStrength ??
      (dualConfirmation === 'confirmed_bull' || dualConfirmation === 'macro_bull_trend_weak' ? 1 : 0),
  );

  // Interpolate between stance mixes so a 1-point score change cannot jump the weights.
  // A hard recession trigger (Sahm / HY spread) still forces the defensive mix.
  let score = riskAppetiteScore;
  // Weak trend: cap between the cautious (50) and selective (64) anchors by macro support.
  if (hasTrend && weakness > 0) {
    const cap = 50 + 14 * strength;
    score -= weakness * Math.max(0, score - cap);
  }
  if (riskOnBlocked) score = Math.min(score, 64);
  if (stance === 'defensive_recession') score = SCORE_ANCHORS[0].score;
  let [equities, , gold, crypto] = interpolateMix(score);

  equities -= weakness * strength * (capitulationSignal ? 6 : 10);
  if (hasTrend) equities += (1 - weakness) * 6 * strength * clamp01((riskAppetiteScore - 68) / 8);

  if (vnErpPct !== undefined) {
    // Ramps, not steps: full bonus at ERP >= 4.5, full penalty at ERP <= -0.2.
    equities += (1 - weakness) * 7 * clamp01((vnErpPct - 2.5) / 2);
    equities -= 8 * clamp01((1.8 - vnErpPct) / 2);
  }

  if (highInflationPressure) {
    gold += 3;
  }
  if (!liquidityExpanding && crypto > 3) {
    crypto = 3;
  }

  equities = Math.max(15, Math.min(78, Math.round(equities)));
  gold = Math.max(8, Math.min(28, Math.round(gold)));
  crypto = Math.max(0, Math.min(12, Math.round(crypto)));
  let cashBonds = 100 - equities - gold - crypto;
  if (cashBonds < 10) {
    // Keep the 10% cash/bond floor by trimming equities, so the weights still sum to exactly 100.
    equities -= 10 - cashBonds;
    cashBonds = 10;
  }

  return [
    {
      id: 'equities',
      label: 'Cổ phiếu chất lượng',
      weightPct: equities,
      note:
        dualConfirmation === 'macro_bull_trend_weak'
          ? vnErpPct && vnErpPct >= 3.2
            ? 'Định giá P/E thấp nhưng xu hướng yếu'
            : 'Chỉ số còn dưới MA200'
          : 'Nhóm ngành nhạy theo pha vĩ mô',
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

