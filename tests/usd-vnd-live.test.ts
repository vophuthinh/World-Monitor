import { describe, expect, it } from 'vitest';
import { preferLiveUsdVnd } from '../server/collectors/markets-crypto';
import type { MarketQuote } from '../shared/types';

const now = Date.parse('2026-11-26T19:20:00Z');
const quote = (price: number, ageMs: number | undefined, source: string): MarketQuote => ({
  symbol: 'USD/VND', name: 'USD/VND', group: 'fx', price, changePercent24h: null, updatedAt: now, source,
  ...(ageMs === undefined ? {} : { observedAt: now - ageMs }),
});
const daily = quote(25_817, 19 * 3_600_000, 'ER-API');

describe('live USD/VND', () => {
  it('replaces the daily rate with a newer intraday one', () => {
    expect(preferLiveUsdVnd(daily, quote(25_825, 120_000, 'Yahoo'), now)).toMatchObject({ price: 25_825, source: 'Yahoo', retained: false });
  });

  it('keeps the daily rate when the intraday one is old, undated, older, or more than 2% away', () => {
    for (const live of [
      quote(25_825, 7 * 3_600_000, 'Yahoo'),
      quote(25_825, undefined, 'Yahoo'),
      quote(2_582, 120_000, 'Yahoo'),
      quote(26_500, 120_000, 'Yahoo'),
      undefined,
    ]) expect(preferLiveUsdVnd(daily, live, now)).toBe(daily);
    const newerDaily = quote(25_817, 60_000, 'ER-API');
    expect(preferLiveUsdVnd(newerDaily, quote(25_825, 120_000, 'Yahoo'), now)).toBe(newerDaily);
  });

  it('uses the intraday rate alone when the daily source is down', () => {
    expect(preferLiveUsdVnd(undefined, quote(25_825, 120_000, 'Yahoo'), now)?.price).toBe(25_825);
  });
});
