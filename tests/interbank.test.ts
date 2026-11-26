import { describe, expect, it } from 'vitest';
import { parseOvernightRateRss } from '../server/collectors/markets/vn-valuation-macro';
import { mergeVietnamMacroPulse } from '../server/collectors/markets-crypto';

const now = Date.parse('2026-11-26T19:00:00Z');
const rss = (...items: Array<[string, string]>) =>
  `<rss>${items.map(([title, date]) => `<item><title>${title}</title><pubDate>${date}</pubDate></item>`).join('')}</rss>`;

describe('overnight interbank rate from headlines', () => {
  it('takes the level from the most recent headline', () => {
    expect(parseOvernightRateRss(rss(
      ['Tuần (16-20/11): NHNN hút ròng, lãi suất qua đêm neo mức 4,5% - nguoiquansat.vn', 'Mon, 23 Nov 2026 02:00:00 GMT'],
      ['Phiên 26/11: Ngân hàng Nhà nước bơm ròng 20.667 tỷ đồng, lãi suất qua đêm neo mức 4,9% - nguoiquansat.vn', 'Thu, 26 Nov 2026 15:57:00 GMT'],
    ), now)).toEqual({ ratePct: 4.9, period: '26/11/2026' });
  });

  it('ignores changes in points, dollar rates, old stories and headlines without a level', () => {
    expect(parseOvernightRateRss(rss(
      ['Lãi suất qua đêm giảm 0,9 điểm % - Báo A', 'Thu, 26 Nov 2026 01:00:00 GMT'],
      ['Lãi suất USD qua đêm lên mức 3,85% - Báo A', 'Thu, 26 Nov 2026 01:00:00 GMT'],
      ['Lãi suất qua đêm tăng lên mức 11% - Báo A', 'Tue, 02 Jun 2026 01:00:00 GMT'],
      ['Lãi suất qua đêm hạ nhiệt, lượng vay tăng 17% - Báo A', 'Thu, 26 Nov 2026 01:00:00 GMT'],
    ), now)).toBeUndefined();
  });

  it('drops a cached long-tenor figure that was stored as the short rate', () => {
    const merged = mergeVietnamMacroPulse({ sbvPolicyRatePct: 4.5 }, {
      updatedAt: now - 1, interbankRatePct: 8.01,
      fieldMeta: { interbankRatePct: { source: 'SBV / TE', period: 'T11/2026', fetchedAt: now - 1, retained: false } },
    }, now)!;
    expect(merged.interbankRatePct).toBeUndefined();
  });
});

describe('trend transition', () => {
  it('moves equity weight gradually as an index crosses its 200-day average', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const equities = (pct: number) => {
      const quote = (symbol: string) => ({ symbol, name: symbol, group: 'index', price: 100 * (1 + pct / 100), ma200: 100, peRatio: 10, changePercent24h: 0, updatedAt: now, source: 'test' });
      return evaluateInvestmentCompass({
        quotes: [quote('VN-Index'), quote('S&P 500')], crypto: [], fearGreed: null, updatedAt: now,
        macro: [{ countryCode: 'VNM', isVietnam: true, gdpGrowthPct: 8, gdpGrowthYear: 2025 }],
        vnMacroPulse: { vn10yYieldPct: 4.5, updatedAt: now },
        fred: [
          { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 6, change: 0, unit: '%', date: '2026-10-01', sparkline: [] },
          { id: 'BAMLH0A0HYM2', label: 'HY', subtitle: 'HY', value: 3, change: 0, unit: '%', date: '2026-11-24', sparkline: [] },
          { id: 'SAHMREALTIME', label: 'Sahm', subtitle: 'Sahm', value: 0, change: 0, unit: 'pts', date: '2026-10-01', sparkline: [] },
        ],
      } as never, undefined, now)!.allocations[0].weightPct;
    };
    for (let pct = -4; pct <= 4; pct += 0.25) {
      expect(Math.abs(equities(pct) - equities(pct - 0.25)), `at ${pct}%`).toBeLessThanOrEqual(5);
    }
    expect(equities(4)).toBeGreaterThan(equities(-4));
  });
});
