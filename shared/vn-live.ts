import type { MarketSnapshot, VnLiveTick } from './types';

/** Patches intraday prices onto a snapshot. Daily indicators (moving averages, RSI) stay as collected. */
export function applyVnTick(markets: MarketSnapshot, tick: VnLiveTick): MarketSnapshot {
  const session = Date.parse(`${tick.sessionDate}T00:00:00Z`);
  const newer = (observedAt: number | undefined) => Math.max(observedAt ?? 0, session);
  const stocks = new Map(tick.stocks.map((s) => [s.symbol, s]));
  return {
    ...markets,
    quotes: markets.quotes.map((quote) =>
      quote.symbol === 'VN-Index' && tick.index
        ? { ...quote, price: tick.index.price, changePercent24h: tick.index.changePercent,
            observedAt: newer(quote.observedAt), updatedAt: tick.ts, liveAt: tick.ts, retained: false }
        : quote),
    vn30: markets.vn30?.map((quote) => {
      const live = stocks.get(quote.symbol);
      return live
        ? { ...quote, priceThousandVnd: live.priceThousandVnd, closeThousandVnd: live.priceThousandVnd,
            changePercent: live.changePercent, volume: live.volume,
            observedAt: newer(quote.observedAt), updatedAt: tick.ts, liveAt: tick.ts, retained: false }
        : quote;
    }),
  };
}
