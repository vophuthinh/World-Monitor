import { describe, expect, it, vi } from 'vitest';
import { applyVnTick } from '../shared/vn-live';
import { isVnTradingWindow, parseSsiVnTick, VnLiveStream } from '../server/realtime/vn-live-stream';
import { applyHptValuation } from '../server/collectors/hpt-company-intel';
import type { MarketSnapshot } from '../shared/types';

// Thursday 26/11/2026 10:00 Vietnam time
const now = Date.parse('2026-11-26T03:00:00Z');
const index = { data: { indexValue: 1650.5, changePercent: -2.19, time: now - 2_000 } };
const stock = (stockSymbol: string, matchedPrice: number | null, tradingDate = '20261126') =>
  ({ stockSymbol, matchedPrice, priceChangePercent: 1.2, nmTotalTradedQty: 5_000, tradingDate });

describe('Vietnam trading window', () => {
  it('opens on weekdays between 08:55 and 15:10 Vietnam time only', () => {
    expect(isVnTradingWindow(now)).toBe(true);
    expect(isVnTradingWindow(Date.parse('2026-11-26T01:00:00Z'))).toBe(false); // 08:00
    expect(isVnTradingWindow(Date.parse('2026-11-26T08:30:00Z'))).toBe(false); // 15:30
    expect(isVnTradingWindow(Date.parse('2026-11-28T03:00:00Z'))).toBe(false); // Saturday
  });
});

describe('SSI tick parsing', () => {
  it('keeps only matched prices from today', () => {
    const tick = parseSsiVnTick(index, { data: [stock('FPT', 45_100), stock('VCB', null), stock('HPG', 19_000, '20261125')] },
      { data: stock('HPT', 24_600) }, now)!;
    expect(tick.index).toMatchObject({ price: 1650.5, changePercent: -2.19 });
    expect(tick.stocks).toEqual([{ symbol: 'FPT', priceThousandVnd: 45.1, changePercent: 1.2, volume: 5_000 }]);
    expect(tick.hpt?.priceThousandVnd).toBe(24.6);
  });

  it('returns nothing on a holiday, when the index still shows an earlier day', () => {
    expect(parseSsiVnTick({ data: { ...index.data, time: now - 86_400_000 } }, { data: [stock('FPT', 45_100, '20261125')] }, null, now)).toBeNull();
  });
});

describe('applying a tick', () => {
  it('updates price, change and live time without touching moving averages or other symbols', () => {
    const markets = {
      quotes: [{ symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1629.68, changePercent24h: -3.42, ma200: 1782, retained: true, updatedAt: 1, source: 'HOSE' }],
      vn30: [{ symbol: 'FPT', name: 'FPT', sector: 'x', priceThousandVnd: 43.5, closeThousandVnd: 44.5, changePercent: -3.37, volume: 1, sparkline: [], ma50: 50, updatedAt: 1 }],
      crypto: [], fearGreed: null, macro: [], updatedAt: 1,
    } as MarketSnapshot;
    const out = applyVnTick(markets, parseSsiVnTick(index, { data: [stock('FPT', 45_100)] }, null, now)!);
    expect(out.quotes[0]).toMatchObject({ price: 1650.5, changePercent24h: -2.19, ma200: 1782, retained: false, liveAt: now });
    expect(out.vn30![0]).toMatchObject({ priceThousandVnd: 45.1, closeThousandVnd: 45.1, ma50: 50, liveAt: now });
    expect(markets.quotes[0].price).toBe(1629.68);
  });
});

describe('live stream polling', () => {
  it('does not call the exchange outside trading hours', async () => {
    const fetcher = vi.fn();
    const stream = new VnLiveStream({ publish: vi.fn() } as never, { get: () => null } as never, fetcher);
    await stream.poll(Date.parse('2026-11-26T12:00:00Z'));
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('HPT valuation source', () => {
  const simplize = { taxCode: '0301447436' as const, peRatio: 3.98, pbRatio: 0.88, marketCapBillionVnd: 253.6, ytdChangePct: 20.89 };
  const side = (value: number, asOf: string) => ({ value, source: 'VNDirect', asOf });

  it('takes market cap and P/B from VNDirect and drops a P/E computed long ago', () => {
    const out = applyHptValuation(simplize, new Map([
      ['MARKETCAP', side(320_812_506_000, '2026-11-26')],
      ['PRICE_TO_BOOK', side(1.8052, '2026-11-26')],
      ['PRICE_TO_EARNINGS', side(3.98, '2023-12-31')],
    ]), now);
    expect(out).toMatchObject({ marketCapBillionVnd: 320.8, pbRatio: 1.81, valuationAsOf: '2026-11-26', peAsOf: '2023-12-31', ytdChangePct: 20.89 });
    expect(out.peRatio).toBeUndefined();
  });

  it('shows no valuation rather than the stale figures when VNDirect is unavailable', () => {
    const out = applyHptValuation(simplize, new Map(), now);
    expect([out.peRatio, out.pbRatio, out.marketCapBillionVnd]).toEqual([undefined, undefined, undefined]);
  });
});
