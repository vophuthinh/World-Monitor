import { describe, expect, it } from 'vitest';
import { parseFeedDate } from '../server/lib/feed-date';
import { normalizeYahooChartQuote } from '../server/collectors/markets/fx-yahoo';
import { applyActualCloses } from '../server/collectors/markets/vn-gold-stocks';
import { normalizePolymarketEvents } from '../server/collectors/polymarket-news';

const sec = (iso: string) => Date.parse(iso) / 1000;

describe('feed dates', () => {
  it('reads zone-less Vietnamese feed dates as UTC+7 on any server timezone', () => {
    expect(new Date(parseFeedDate('11/27/2026 12:28:00 AM')).toISOString()).toBe('2026-11-26T17:28:00.000Z');
  });

  it('leaves dates that carry their own zone unchanged', () => {
    expect(new Date(parseFeedDate('Thu, 26 Nov 2026 20:32:00 +07')).toISOString()).toBe('2026-11-26T13:32:00.000Z');
    expect(new Date(parseFeedDate('Thu, 26 Nov 2026 10:00:00 GMT')).toISOString()).toBe('2026-11-26T10:00:00.000Z');
    expect(parseFeedDate('')).toBeNaN();
  });
});

describe('Yahoo daily change', () => {
  const quote = (closes: Array<number | null>, marketTime: string) => normalizeYahooChartQuote('N', 'N', 'index', {
    chart: { result: [{
      meta: { regularMarketPrice: 102, regularMarketTime: sec(marketTime), gmtoffset: 32400 },
      timestamp: [sec('2026-11-24T00:00:00Z'), sec('2026-11-25T00:00:00Z'), sec('2026-11-26T00:00:00Z')],
      indicators: { quote: [{ close: closes }] },
    }] },
  }, 'pts', Date.parse('2026-11-27T00:00:00Z'))!;

  it("uses the latest close as the base while today's bar is still empty", () => {
    expect(quote([90, 100, null], '2026-11-26T06:45:00Z').changePercent24h).toBe(2);
  });

  it("uses the close before today's bar once that bar exists", () => {
    expect(quote([90, 100, 102], '2026-11-26T06:45:00Z').changePercent24h).toBe(2);
  });
});

describe('VN30 displayed price', () => {
  it('shows the traded close when the chart series is dividend-adjusted, only for the same session', () => {
    const base = { name: 'x', sector: 'x', changePercent: -3.37, volume: 1, sparkline: [], updatedAt: 1, observedAt: Date.parse('2026-11-26T00:00:00Z') };
    const [fpt, vcb] = applyActualCloses(
      [{ ...base, symbol: 'FPT', priceThousandVnd: 43.5 }, { ...base, symbol: 'VCB', priceThousandVnd: 48.95 }],
      [{ code: 'FPT', date: '2026-11-26', close: 44.5 }, { code: 'VCB', date: '2026-11-25', close: 50 }],
    );
    expect(fpt.closeThousandVnd).toBe(44.5);
    expect(fpt.priceThousandVnd).toBe(43.5);
    expect(vcb.closeThousandVnd).toBeUndefined();
  });
});

describe('prediction markets', () => {
  it('drops events whose shown outcome is already settled at 0% or 100%', () => {
    const event = (slug: string, yes: string) => ({ slug, title: `Question ${slug}`, volume24hr: 10,
      markets: [{ active: true, closed: false, outcomePrices: JSON.stringify([yes, String(1 - Number(yes))]) }] });
    expect(normalizePolymarketEvents([event('a', '1'), event('b', '0'), event('c', '0.62')]).map((p) => p.id)).toEqual(['c']);
  });
});
