import { describe, expect, it } from 'vitest';
import { evaluateInvestmentCompass } from '../shared/macro-health';

const now = Date.parse('2026-11-26T00:00:00Z');
const quote = (symbol: string, price: number, extra = {}) =>
  ({ symbol, name: symbol, group: 'index' as const, price, ma200: 100, changePercent24h: 0, updatedAt: now, source: 'test', ...extra });
const fred = (id: string, value: number) => ({ id, label: id, subtitle: id, value, change: 0, unit: '%', date: '2026-11-24', pillar: 'market' as const, sparkline: [] });

describe('compass summary', () => {
  it('states only the available figures', () => {
    const report = evaluateInvestmentCompass({
      quotes: [quote('VN-Index', 93.1, { peRatio: 10 }), quote('S&P 500', 102)],
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
      vnMacroPulse: { vn10yYieldPct: 4.5, interbankRatePct: 4.9, updatedAt: now },
      fred: [fred('M2SL', 5), fred('BAMLH0A0HYM2', 3.72), fred('SAHMREALTIME', 0), fred('VIXCLS', 26.36), fred('DFII10', 2.79)],
    }, undefined, now)!;
    expect(report.summary).toBe(
      'VN-Index -6.9% so MA200 · S&P 500 +2.0% so MA200 · P/E VN-Index 10.0x (ERP +5.50% so TPCP 10 năm) · Lãi qua đêm VND 4.90% · Lãi thực Mỹ 10 năm 2.79% · Chênh lệch HY 3.72% · Sahm 0.00 · VIX 26.4',
    );
  });

  it('omits missing figures instead of filling them in', () => {
    const report = evaluateInvestmentCompass({
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now, fred: [fred('M2SL', 5)],
    }, undefined, now)!;
    expect(report.summary).toBe('Chưa đủ số liệu thị trường để tóm tắt.');
  });
});

describe('compass status label', () => {
  it('names only the score level, even when a recession trigger is on', () => {
    const report = evaluateInvestmentCompass({
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now,
      fred: [fred('M2SL', 6), fred('NFCI', -0.5), fred('BAMLH0A0HYM2', 3), fred('SAHMREALTIME', 0.6)],
    }, undefined, now)!;
    const level = report.riskAppetiteScore >= 65 ? 'CAO' : report.riskAppetiteScore >= 46 ? 'VỪA' : 'THẤP';
    expect(report.stance).toBe('defensive_recession');
    expect(report.stanceLabel).toBe(`MỨC ĐIỂM: ${level}`);
  });
});

describe('VIX backwardation notice', () => {
  it('shows the two readings without calling a bottom or suggesting a trade', () => {
    const vol = (symbol: string, price: number) => quote(symbol, price, { observedAt: now });
    const report = evaluateInvestmentCompass({
      quotes: [quote('S&P 500', 90, { rsi14: 25 }), vol('VIX', 27), vol('VIX 3M', 25)],
      crypto: [], fearGreed: null, macro: [], updatedAt: now, fred: [fred('M2SL', 5), fred('SAHMREALTIME', 0)],
    }, undefined, now)!;
    expect(report.capitulationLabel).toBe('VIX/VIX3M 1.080x · RSI-14 S&P 500: 25');
    expect(report.signals.find((s) => s.id === 'vix-term')?.signalBadge).toBe('BACKWARDATION · BẤT ỔN');
  });
});
