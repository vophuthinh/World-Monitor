import type { InvestmentCompassReport, InvestmentStance, PortfolioAllocationSlice } from '../types';

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
  cashBonds = 100 - equities - gold - crypto;
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

