import { describe, expect, it, vi } from 'vitest';
import { normalizeUsgsEarthquakes } from '../server/collectors/earthquakes';
import { normalizeGdeltGeoJson, parseGdeltExportTsv } from '../server/collectors/geopolitics-gdelt';
import { normalizeWorldBankIndicators } from '../server/collectors/macro-worldbank';
import {
  normalizeCoinGeckoMarkets,
  fetchCryptoQuotes,
  normalizeVn30DchartQuote,
  normalizeErApiFx,
  normalizeFearGreed,
  normalizeMihongGoldPrices,
  normalizeYahooChartQuote,
  fetchMarketsAndCrypto,
  getRetainedMarketSnapshot,
} from '../server/collectors/markets-crypto';
import { SnapshotStore } from '../server/cache/snapshot-store';
import type { MarketSnapshot } from '../shared/types';
import { normalizeEonetEvents, normalizeGdacsEvents } from '../server/collectors/natural-events';
import {
  decodeHtmlEntities,
  matchGeoLocation,
  normalizePolymarketEvents,
  parseRssFeedXml,
} from '../server/collectors/polymarket-news';
import { normalizeRainViewerRadar } from '../server/collectors/weather-radar';

describe('Collectors Normalizers & Fault-Tolerant Parsers', () => {
  it('keeps missing crypto metrics unknown instead of reporting zero', () => {
    const [missing, zero] = normalizeCoinGeckoMarkets([
      { id: 'bitcoin', symbol: 'btc', current_price: 100, price_change_percentage_24h: null },
      { id: 'ethereum', symbol: 'eth', current_price: 10, price_change_percentage_24h: 0, market_cap: 0, total_volume: 0 },
    ]);
    expect(missing).toMatchObject({ changePercent24h: null, marketCapUsd: null, volume24hUsd: null });
    expect(zero).toMatchObject({ changePercent24h: 0, marketCapUsd: 0, volume24hUsd: 0 });
  });

  it('keeps missing CoinPaprika fallback metrics unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
      String(url).includes('coinpaprika.com')
        ? new Response(JSON.stringify([{ id: 'btc-bitcoin', symbol: 'BTC', quotes: { USD: { price: 100 } } }]))
        : new Response('unavailable', { status: 404 })));
    try {
      expect((await fetchCryptoQuotes(Date.now()))[0]).toMatchObject({
        changePercent24h: null, marketCapUsd: null, volume24hUsd: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('preserves missing crypto and VN30 symbols after a partial refresh', async () => {
    const now = Date.now();
    const previous: MarketSnapshot = {
      quotes: [],
      crypto: [
        { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: 1, volume24hUsd: 1, updatedAt: now },
        { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', priceUsd: 10, changePercent24h: 0, marketCapUsd: 2, volume24hUsd: 2, updatedAt: now },
      ],
      vn30: [
        { symbol: 'VCB', name: 'VCB', sector: 'bank', priceThousandVnd: 80, changePercent: 0, volume: 1, sparkline: [], updatedAt: now, observedAt: now - 86_400_000 },
        { symbol: 'FPT', name: 'FPT', sector: 'tech', priceThousandVnd: 90, changePercent: 0, volume: 1, sparkline: [], updatedAt: now, observedAt: now - 86_400_000 },
      ],
      fearGreed: null, macro: [], updatedAt: now,
    };
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('api.coingecko.com')) return new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 110 }]));
      if (target.includes('symbol=VCB')) return new Response(JSON.stringify({ c: [81], t: [Math.floor(now / 1000)] }));
      if (target.includes('symbol=VNINDEX')) return new Response(JSON.stringify({ c: [1200], t: [Math.floor((now - 8 * 86_400_000) / 1000)] }));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      const result = await fetchMarketsAndCrypto(previous);
      expect(result.crypto).toEqual(expect.arrayContaining([
        expect.objectContaining({ symbol: 'BTC', priceUsd: 110, retained: false }),
        expect.objectContaining({ symbol: 'ETH', priceUsd: 10, retained: true }),
      ]));
      expect(result.vn30).toEqual(expect.arrayContaining([
        expect.objectContaining({ symbol: 'VCB', priceThousandVnd: 81, retained: false }),
        expect.objectContaining({ symbol: 'FPT', priceThousandVnd: 90, retained: true }),
      ]));
      expect(result.quotes.find((q) => q.symbol === 'VN-Index')).toMatchObject({
        observedAt: Math.floor((now - 8 * 86_400_000) / 1000) * 1000, retained: true,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('associates the last valid VN30 close with its own observation time', () => {
    const now = Date.now();
    const target = { symbol: 'VCB', name: 'VCB', sector: 'bank' };
    const seconds = Math.floor((now - 8 * 86_400_000) / 1000);
    expect(normalizeVn30DchartQuote(target, { c: [80, 0], t: [seconds, seconds + 100] }, now)?.observedAt).toBe(seconds * 1000);
    expect(normalizeVn30DchartQuote(target, { c: [80] }, now)?.observedAt).toBeUndefined();
    expect(normalizeVn30DchartQuote(target, { c: [80], t: [Math.floor(now / 1000) + 60] }, now)?.observedAt).toBeUndefined();
    expect(normalizeVn30DchartQuote(target, { c: [80, 0], v: [100, 999] }, now))
      .toMatchObject({ priceThousandVnd: 80, changePercent: null, volume: 100 });
    expect(normalizeVn30DchartQuote(target, { c: [75, 80] }, now))
      .toMatchObject({ changePercent: 6.67, volume: null });
    expect(normalizeVn30DchartQuote(target, { c: [80], v: [0] }, now)?.volume).toBe(0);
  });

  it('merges partial FX, rejects older replacements, and does not treat stale FX as fresh', async () => {
    const now = Date.now();
    const previous: MarketSnapshot = {
      quotes: normalizeErApiFx({ rates: { VND: 25000, EUR: 0.9 }, time_last_update_unix: Math.floor((now - 3_600_000) / 1000) }, now),
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
    };
    let sourceTime: number | undefined = Math.floor(now / 1000);
    let cryptoAvailable = false;
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('open.er-api.com')) return new Response(JSON.stringify({ rates: { VND: 26000 }, time_last_update_unix: sourceTime }));
      if (cryptoAvailable && String(url).includes('api.coingecko.com')) return new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 100 }]));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      const partial = await fetchMarketsAndCrypto(previous);
      expect(partial.quotes.find((q) => q.symbol === 'USD/VND')).toMatchObject({ price: 26000, retained: false, changePercent24h: null });
      expect(partial.quotes.find((q) => q.symbol === 'EUR/USD')).toMatchObject({ retained: true });
      sourceTime = Math.floor((now - 30 * 86_400_000) / 1000);
      await expect(fetchMarketsAndCrypto()).rejects.toThrow('All market and macro upstream endpoints failed');
      cryptoAvailable = true;
      const stale = await fetchMarketsAndCrypto();
      expect(stale.quotes.find((q) => q.symbol === 'USD/VND')).toMatchObject({ retained: true });
      const older = await fetchMarketsAndCrypto(previous);
      expect(older.quotes.find((q) => q.symbol === 'USD/VND')).toMatchObject({ price: 25000, retained: true });
      sourceTime = undefined;
      expect((await fetchMarketsAndCrypto()).quotes[0]).toMatchObject({ retained: true });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('rejects older Yahoo quotes per symbol and does not renew health for stale or undated sessions', async () => {
    const now = Date.now();
    const previous: MarketSnapshot = {
      quotes: [
        { symbol: 'Gold', name: 'Gold', group: 'commodity', price: 2500, changePercent24h: null, observedAt: now - 3_600_000, updatedAt: now, source: 'Yahoo Finance Chart v8' },
        { symbol: 'AUD/JPY', name: 'AUD/JPY', group: 'fx', price: 95, changePercent24h: null, observedAt: now - 3_600_000, updatedAt: now, source: 'Yahoo Finance Chart v8' },
      ],
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
    };
    let sourceTime: number | undefined = Math.floor((now - 30 * 86_400_000) / 1000);
    let cryptoAvailable = false;
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('GC%3DF') || target.includes('AUDJPY%3DX')) {
        return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 42, regularMarketTime: sourceTime } }] } }));
      }
      if (cryptoAvailable && target.includes('api.coingecko.com')) return new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 100 }]));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      await expect(fetchMarketsAndCrypto()).rejects.toThrow('All market and macro upstream endpoints failed');
      cryptoAvailable = true;
      const stale = await fetchMarketsAndCrypto(previous);
      expect(stale.quotes.find((q) => q.symbol === 'Gold')).toMatchObject({ price: 2500, retained: true });
      expect(stale.quotes.find((q) => q.symbol === 'AUD/JPY')).toMatchObject({ price: 95, retained: true });
      sourceTime = undefined;
      const undated = await fetchMarketsAndCrypto(previous);
      expect(undated.quotes.find((q) => q.symbol === 'Gold')).toMatchObject({ price: 2500, retained: true });
      expect(undated.quotes.find((q) => q.symbol === 'AUD/JPY')).toMatchObject({ price: 95, retained: true });
      cryptoAvailable = false;
      await expect(fetchMarketsAndCrypto()).rejects.toThrow('All market and macro upstream endpoints failed');
      const store = new SnapshotStore('/tmp/wm-yahoo-age-unused');
      store.set('markets-crypto', previous, 10 * 86_400_000, 1, now);
      expect(getRetainedMarketSnapshot(store, now + 8 * 86_400_000)?.quotes).toEqual([
        expect.objectContaining({ symbol: 'Gold', retained: true }),
        expect.objectContaining({ symbol: 'AUD/JPY', retained: true }),
      ]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('retains missing and newer domestic gold codes without marking old world comparisons fresh', async () => {
    const now = Date.now();
    const vnDate = (time: number) => {
      const date = new Date(time + 7 * 3_600_000).toISOString();
      return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} ${date.slice(11, 16)}`;
    };
    const previous: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now,
      vnGold: normalizeMihongGoldPrices([
        { code: 'SJC', buyingPrice: 10_000_000, sellingPrice: 11_000_000, dateTime: vnDate(now - 3_600_000) },
        { code: '999', buyingPrice: 9_000_000, sellingPrice: 10_000_000, dateTime: vnDate(now - 3_600_000) },
      ], 2500, 25000, now),
    };
    let dateTime: string | undefined = vnDate(now - 3 * 3_600_000);
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('api.coingecko.com')) return new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 100 }]));
      if (target.includes('api.mihong.vn')) return new Response(JSON.stringify([{ code: 'SJC', buyingPrice: 12_000_000, sellingPrice: 13_000_000, dateTime }]));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      for (const candidate of [dateTime, undefined]) {
        dateTime = candidate;
        const result = await fetchMarketsAndCrypto(previous);
        expect(result.vnGold).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: 'SJC', sellPerLuongMillionVnd: 110, retained: true, worldParityRetained: true }),
          expect.objectContaining({ code: '999', sellPerLuongMillionVnd: 100, retained: true, worldParityRetained: true }),
        ]));
      }
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('does not invent a VN-Index or Yahoo change when the prior close is missing', async () => {
    const now = Date.now();
    expect(normalizeYahooChartQuote('S&P 500', 'S&P', 'index', {
      chart: { result: [{ meta: { regularMarketPrice: 1200 } }] },
    })?.changePercent24h).toBeNull();
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
      String(url).includes('symbol=VNINDEX')
        ? new Response(JSON.stringify({ c: [1200], t: [Math.floor(now / 1000)] }))
        : new Response('unavailable', { status: 404 })));
    try {
      expect((await fetchMarketsAndCrypto()).quotes.find((q) => q.symbol === 'VN-Index')?.changePercent24h).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('does not renew market health when VN stock feeds only return old sessions', async () => {
    const now = Date.now();
    const old = Math.floor((now - 8 * 86_400_000) / 1000);
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('symbol=VNINDEX')) return new Response(JSON.stringify({ c: [1200], t: [old] }));
      if (target.includes('symbol=VCB')) return new Response(JSON.stringify({ c: [80], t: [old] }));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      await expect(fetchMarketsAndCrypto()).rejects.toThrow('All market and macro upstream endpoints failed');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('does not renew a wholly failed market snapshot and marks partial retained data', async () => {
    const now = Date.now();
    const vnTime = new Date(now + 7 * 3_600_000).toISOString();
    const goldDate = `${vnTime.slice(8, 10)}/${vnTime.slice(5, 7)}/${vnTime.slice(0, 4)} ${vnTime.slice(11, 16)}`;
    const previous: MarketSnapshot = {
      quotes: [{ symbol: 'Gold', name: 'COMEX', group: 'commodity', price: 2500, changePercent24h: 0, updatedAt: now, source: 'Yahoo' }],
      crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: 1, volume24hUsd: 1, updatedAt: now, marketDataFetchedAt: now - 7 * 3_600_000 }],
      fearGreed: { value: 50, classification: 'Neutral', updatedAt: now },
      macro: [], updatedAt: now,
    };
    let fxAvailable = false;
    let goldAvailable = false;
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) =>
      fxAvailable && String(url).includes('open.er-api.com')
        ? new Response(JSON.stringify({ rates: { VND: 25000 }, time_last_update_unix: Math.floor(now / 1000) }), { status: 200 })
        : fxAvailable && String(url).includes('api.mihong.vn')
          ? new Response(JSON.stringify([{ code: 'SJC', buyingPrice: 10000000, sellingPrice: 11000000, dateTime: goldDate }]), { status: 200 })
          : goldAvailable && String(url).includes('GC%3DF')
            ? new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 2500, regularMarketTime: Math.floor(now / 1000) } }] } }), { status: 200 })
          : new Response('unavailable', { status: 404 })));
    try {
      await expect(fetchMarketsAndCrypto(previous)).rejects.toThrow('All market and macro upstream endpoints failed');
      fxAvailable = true;
      const partial = await fetchMarketsAndCrypto(previous);
      expect(partial.quotes.find((q) => q.symbol === 'Gold')?.retained).toBe(true);
      expect(partial.crypto[0].retained).toBe(true);
      expect(partial.crypto[0]).toMatchObject({ priceUsd: 100, marketCapUsd: null, volume24hUsd: null });
      expect(partial.vnGold?.[0]).toMatchObject({ retained: false, worldParityRetained: true });
      expect(partial.fearGreed?.retained).toBe(true);
      goldAvailable = true;
      const currentGold = await fetchMarketsAndCrypto(previous);
      expect(currentGold.vnGold?.[0]).toMatchObject({ retained: false, worldParityRetained: false });
      goldAvailable = false;
      const expired = await fetchMarketsAndCrypto({
        ...previous,
        quotes: previous.quotes.map((q) => ({ ...q, updatedAt: now - 7 * 3_600_000 })),
        crypto: previous.crypto.map((coin) => ({ ...coin, updatedAt: now - 7 * 3_600_000 })),
      });
      expect(expired.quotes.some((q) => q.symbol === 'Gold')).toBe(false);
      expect(expired.crypto).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])('preserves Binance ticks received during market refresh (crypto source succeeds: %s)', async (cryptoAvailable) => {
    let clock = Date.now();
    const start = clock;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    vi.stubEnv('FRED_API_KEY', '');
    const previous: MarketSnapshot = {
      quotes: [{ symbol: 'PAXG', name: 'PAXG', group: 'commodity', price: 2500, changePercent24h: 0, updatedAt: start, source: 'Binance' }],
      crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: 10, volume24hUsd: 1, updatedAt: start, marketDataFetchedAt: start }],
      fearGreed: null, macro: [], updatedAt: start,
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('open.er-api.com')) {
        clock = start + 1_000;
        Object.assign(previous.crypto[0], { priceUsd: 105, updatedAt: clock });
        Object.assign(previous.quotes[0], { price: 2550, updatedAt: clock });
        return new Response(JSON.stringify({ rates: { VND: 25000 }, time_last_update_unix: Math.floor(start / 1000) }));
      }
      if (cryptoAvailable && target.includes('api.coingecko.com')) {
        return new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 101, market_cap: 20, total_volume: 2 }]));
      }
      if (target.includes('api.mihong.vn')) {
        clock = start + 2_000;
        Object.assign(previous.crypto[0], { priceUsd: 110, changePercent24h: 3, updatedAt: clock });
        Object.assign(previous.quotes[0], { price: 2600, updatedAt: clock });
      }
      return new Response('unavailable', { status: 404 });
    }));
    try {
      const result = await fetchMarketsAndCrypto(previous);
      expect(result.crypto[0]).toMatchObject({
        priceUsd: 110, updatedAt: start + 2_000, retained: false,
        marketCapUsd: cryptoAvailable ? 20 : 10,
      });
      expect(result.quotes.find((q) => q.symbol === 'PAXG')).toMatchObject({ price: 2600, updatedAt: start + 2_000 });
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('uses the ER-API download time for retention, not the source observation time', async () => {
    const now = Date.now();
    const previous: MarketSnapshot = {
      quotes: normalizeErApiFx({ rates: { VND: 25000 }, time_last_update_unix: Math.floor((now - 12 * 3_600_000) / 1000) }, now),
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
    };
    expect(previous.quotes[0].updatedAt).toBe(now);
    expect(previous.quotes[0].observedAt).toBeLessThan(now - 11 * 3_600_000);
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('api.coingecko.com')
      ? new Response(JSON.stringify([{ id: 'bitcoin', symbol: 'btc', current_price: 100 }]))
      : new Response('unavailable', { status: 404 })));
    try {
      const result = await fetchMarketsAndCrypto(previous);
      expect(result.quotes.find((q) => q.symbol === 'USD/VND')).toMatchObject({ price: 25000, retained: true, updatedAt: now });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('parses Mi Hong observation times in Vietnam time and rejects invalid dates', () => {
    const now = Date.UTC(2026, 10, 23, 8);
    const quote = { code: 'SJC', buyingPrice: 10000000, sellingPrice: 11000000 };
    const parsed = normalizeMihongGoldPrices([
      { ...quote, dateTime: '23/11/2026 14:30' },
      { ...quote, dateTime: '31/02/2026 14:30' },
      quote,
    ], 2500, 25000, now);
    expect(parsed[0].observedAt).toBe(Date.UTC(2026, 10, 23, 7, 30));
    expect(parsed[1].observedAt).toBeUndefined();
    expect(parsed[2].observedAt).toBeUndefined();
  });

  it('does not mark stale or undated gold and sentiment responses as fresh', async () => {
    const now = Date.now();
    let dateTime: string | undefined = '01/01/2020 10:00';
    const previous: MarketSnapshot = { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now };
    vi.stubEnv('FRED_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('open.er-api.com')) return new Response(JSON.stringify({ rates: { VND: 25000 }, time_last_update_unix: Math.floor(now / 1000) }));
      if (target.includes('GC%3DF')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 2500, regularMarketTime: Math.floor(now / 1000) } }] } }));
      if (target.includes('api.mihong.vn')) return new Response(JSON.stringify([{ code: 'SJC', buyingPrice: 10000000, sellingPrice: 11000000, dateTime }]));
      if (target.includes('api.alternative.me')) return new Response(JSON.stringify({ data: [{ value: '70', timestamp: Math.floor((now - 8 * 86_400_000) / 1000) }] }));
      return new Response('unavailable', { status: 404 });
    }));
    try {
      const stale = await fetchMarketsAndCrypto(previous);
      expect(stale.vnGold?.[0].retained).toBe(true);
      expect(stale.vnGold?.[0].worldParityRetained).toBe(true);
      expect(stale.fearGreed).toBeNull();
      dateTime = undefined;
      const undated = await fetchMarketsAndCrypto(previous);
      expect(undated.vnGold?.[0].retained).toBe(true);
      expect(undated.vnGold?.[0].worldParityRetained).toBe(true);
      expect(normalizeFearGreed({ data: [{ value: '50' }] }, now)).toBeNull();
      expect(normalizeFearGreed({ data: [{ value: '50', timestamp: Math.floor(now / 1000) + 60 }] }, now)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('normalizes USGS earthquakes and maps magnitude to severity accurately', () => {
    const quakes = normalizeUsgsEarthquakes({
      type: 'FeatureCollection',
      features: [
        {
          id: 'us7000abc',
          properties: { mag: 6.4, place: '120 km E of Miyako, Japan', time: 1_700_000_000_000, tsunami: 1 },
          geometry: { type: 'Point', coordinates: [143.2, 39.6, 28.4] },
        },
        {
          id: 'us7000def',
          properties: { mag: 4.3, place: 'Mindanao, Philippines', time: 1_700_000_100_000, tsunami: 0 },
          geometry: { type: 'Point', coordinates: [126.1, 7.5, 14.0] },
        },
        // Invalid record should be skipped
        {
          id: 'bad',
          properties: { mag: null, place: 'Nowhere' },
          geometry: { type: 'Point', coordinates: [999, 999] },
        },
      ],
    });

    expect(quakes).toHaveLength(2);
    expect(quakes[0].id).toBe('eq:us7000def');
    expect(quakes[0].severity).toBe('medium');
    expect(quakes[1].id).toBe('eq:us7000abc');
    expect(quakes[1].severity).toBe('critical');
    expect(quakes[1].meta.depthKm).toBe(28.4);
  });

  it('normalizes EONET Point + Polygon centroids and GDACS alerts while skipping duplicate EQ', () => {
    const now = 1_700_000_000_000;
    const eonet = normalizeEonetEvents(
      {
        events: [
          {
            id: 'EONET_1',
            title: 'Typhoon in East Sea',
            categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
            geometry: [{ date: '2023-11-14T10:00:00Z', type: 'Point', coordinates: [113.5, 16.2], magnitudeValue: 85, magnitudeUnit: 'kts' }],
          },
          {
            id: 'EONET_POLY',
            title: 'Flood Zone Mekong',
            categories: [{ id: 'floods', title: 'Floods' }],
            geometry: [
              {
                date: '2023-11-14T08:00:00Z',
                type: 'Polygon',
                coordinates: [[[105.0, 10.0], [106.0, 10.0], [106.0, 11.0], [105.0, 11.0]]],
              },
            ],
          },
          {
            id: 'EONET_EQ',
            title: 'Ignored Quake',
            categories: [{ id: 'earthquakes', title: 'Earthquakes' }],
            geometry: [{ date: '2023-11-14T08:00:00Z', type: 'Point', coordinates: [120, 20] }],
          },
        ],
      },
      now,
    );

    expect(eonet).toHaveLength(2);
    expect(eonet[0].severity).toBe('critical');
    expect(eonet[1].lat).toBeCloseTo(10.5, 2);
    expect(eonet[1].lon).toBeCloseTo(105.5, 2);

    const gdacs = normalizeGdacsEvents(
      {
        features: [
          {
            geometry: { type: 'Point', coordinates: [121.0, 18.5] },
            properties: {
              eventtype: 'TC',
              eventid: '1001',
              name: 'Tropical Cyclone MAN-YI',
              alertlevel: 'Red',
              country: 'Philippines',
              fromdate: '2023-11-14T00:00:00Z',
            },
          },
          {
            geometry: { type: 'Point', coordinates: [140.0, 35.0] },
            properties: { eventtype: 'EQ', eventid: '999', alertlevel: 'Orange' },
          },
        ],
      },
      now,
    );
    expect(gdacs).toHaveLength(1);
    expect(gdacs[0].severity).toBe('critical');
  });

  it('rejects non-JSON GDELT rate-limit bodies and normalizes valid RainViewer frames', () => {
    expect(() => normalizeGdeltGeoJson('Please limit requests to one every 5 seconds.')).toThrow();

    const gdelt = normalizeGdeltGeoJson(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [35.2, 31.8] },
            properties: {
              name: 'Jerusalem, Israel',
              count: 42,
              html: '<a href="https://example.com/news1" target="_blank">Missile defense alert reported</a>',
            },
          },
        ],
      }),
      1_700_000_000_000,
    );
    expect(gdelt).toHaveLength(1);
    expect(gdelt[0].severity).toBe('critical');
    expect(gdelt[0].url).toBe('https://example.com/news1');

    const radar = normalizeRainViewerRadar({
      host: 'https://tilecache.rainviewer.com',
      generated: 1_700_000_000,
      radar: {
        past: [
          { time: 1_699_999_400, path: '/v2/radar/1699999400' },
          { time: 1_700_000_000, path: '/v2/radar/1700000000' },
        ],
      },
    });
    expect(radar.frameTime).toBe(1_700_000_000);
    expect(radar.tileUrlTemplate).toBe('https://tilecache.rainviewer.com/v2/radar/1700000000/256/{z}/{x}/{y}/6/1_1.png');
  });

  it('normalizes CoinGecko, Fear & Greed, USD/VND FX rates, and Yahoo chart quotes', () => {
    const crypto = normalizeCoinGeckoMarkets([
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 91250.5,
        price_change_percentage_24h: 3.42,
        market_cap: 1_800_000_000_000,
        total_volume: 48_000_000_000,
      },
    ]);
    expect(crypto).toHaveLength(1);
    expect(crypto[0].symbol).toBe('BTC');
    expect(crypto[0].priceUsd).toBe(91250.5);

    const fg = normalizeFearGreed({
      data: [{ value: '74', value_classification: 'Greed', timestamp: '1700000000' }],
    });
    expect(fg?.value).toBe(74);
    expect(fg?.classification).toBe('Greed');

    const fx = normalizeErApiFx({
      time_last_update_unix: 1_700_000_000,
      rates: {
        VND: 25410,
        EUR: 0.9259,
        JPY: 154.2,
        CNY: 7.24,
        SGD: 1.34,
        GBP: 0.79,
      },
    });
    const usdVnd = fx.find((q) => q.symbol === 'USD/VND');
    const eurUsd = fx.find((q) => q.symbol === 'EUR/USD');
    expect(usdVnd?.price).toBe(25410);
    expect(eurUsd?.price).toBeCloseTo(1 / 0.9259, 3);

    const spx = normalizeYahooChartQuote(
      '^GSPC',
      'S&P 500',
      'index',
      {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 5985.2, chartPreviousClose: 5920.0 },
            },
          ],
        },
      },
    );
    expect(spx?.price).toBe(5985.2);
    expect(spx?.changePercent24h).toBeCloseTo(((5985.2 - 5920) / 5920) * 100, 2);

    const observed = normalizeYahooChartQuote('Gold', 'Gold', 'commodity', {
      chart: { result: [{ meta: { regularMarketPrice: 2500, regularMarketTime: 1_700_000_000 } }] },
    }, 'USD/oz', 1_700_010_000_000);
    expect(observed?.observedAt).toBe(1_700_000_000_000);
    expect(observed?.updatedAt).toBe(1_700_010_000_000);
    expect(spx?.observedAt).toBeUndefined();
    const close = normalizeYahooChartQuote('Gold', 'Gold', 'commodity', {
      chart: { result: [{
        meta: { regularMarketTime: 1_700_009_000 },
        timestamp: [1_700_000_000, 1_700_005_000],
        indicators: { quote: [{ close: [2500, null] }] },
      }] },
    }, 'USD/oz', 1_700_010_000_000);
    expect(close?.observedAt).toBe(1_700_000_000_000);
  });

  it('normalizes World Bank macro indicators with latest non-null year including Vietnam (VNM)', () => {
    const gdpGrowthRaw = [
      { total: 4 },
      [
        { countryiso3code: 'VNM', date: '2026', value: null },
        { countryiso3code: 'VNM', date: '2025', value: 6.82 },
        { countryiso3code: 'USA', date: '2025', value: 2.71 },
      ],
    ];
    const gdpCurrentRaw = [
      { total: 2 },
      [
        { countryiso3code: 'VNM', date: '2025', value: 476_000_000_000 },
        { countryiso3code: 'USA', date: '2025', value: 29_100_000_000_000 },
      ],
    ];
    const cpiRaw = [
      { total: 2 },
      [
        { countryiso3code: 'VNM', date: '2025', value: 3.61 },
        { countryiso3code: 'USA', date: '2025', value: 2.94 },
      ],
    ];

    const macro = normalizeWorldBankIndicators(gdpGrowthRaw, gdpCurrentRaw, cpiRaw);
    const vn = macro.find((m) => m.countryCode === 'VNM');
    expect(vn).toBeDefined();
    expect(vn?.isVietnam).toBe(true);
    expect(vn?.gdpGrowthPct).toBe(6.82);
    expect(vn?.gdpGrowthYear).toBe(2025);
    expect(vn?.gdpCurrentUsd).toBe(476_000_000_000);
    expect(vn?.cpiInflationPct).toBe(3.61);
  });

  it('deduplicates Polymarket events by slug keeping highest volume and classifies categories', () => {
    const items = normalizePolymarketEvents([
      {
        id: '1',
        slug: 'fed-rate-cut-december',
        title: 'Will the Fed cut interest rates in December?',
        volume: 1_200_000,
        liquidity: 250_000,
        endDate: '2026-12-18T00:00:00Z',
        markets: [{ outcomePrices: '["0.68", "0.32"]' }],
      },
      // Duplicate slug with higher volume wins
      {
        id: '2',
        slug: 'fed-rate-cut-december',
        title: 'Will the Fed cut interest rates in December?',
        volume: 3_500_000,
        liquidity: 410_000,
        endDate: '2026-12-18T00:00:00Z',
        markets: [{ outcomePrices: '["0.71", "0.29"]' }],
      },
      {
        id: '3',
        slug: 'israel-iran-ceasefire',
        title: 'Israel-Iran ceasefire agreement before Q2?',
        volume: 2_100_000,
        liquidity: 180_000,
        markets: [{ outcomePrices: '["0.24", "0.76"]' }],
      },
      {
        id: '4',
        slug: 'bitcoin-150k',
        title: 'Will Bitcoin reach $150k this year?',
        volume: 5_000_000,
        liquidity: 900_000,
        markets: [{ outcomePrices: '["0.42", "0.58"]' }],
      },
    ]);

    expect(items).toHaveLength(3);
    expect(items[0].id).toBe('bitcoin-150k');
    expect(items[0].category).toBe('crypto_tech');
    expect(items[0].yesPercent).toBe(42);

    const fed = items.find((i) => i.id === 'fed-rate-cut-december');
    expect(fed?.volumeUsd).toBe(3_500_000);
    expect(fed?.yesPercent).toBe(71);
    expect(fed?.category).toBe('finance');

    const geo = items.find((i) => i.id === 'israel-iran-ceasefire');
    expect(geo?.category).toBe('geopolitics');
  });

  it('parses RSS XML and attaches flyTo coordinates for Biển Đông, Hormuz, and global flashpoints', () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>VnExpress</title>
          <item>
            <title>Áp thấp nhiệt đới mạnh lên trên Biển Đông</title>
            <link>https://vnexpress.net/ap-thap-bien-dong-123.html</link>
            <pubDate>Sat, 21 Nov 2026 15:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Oil tankers reroute near Strait of Hormuz amid naval exercises</title>
            <link>https://example.com/hormuz-tankers</link>
            <pubDate>Sat, 21 Nov 2026 14:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;

    const news = parseRssFeedXml(sampleXml, 'VnExpress', 'vietnam');
    expect(news).toHaveLength(2);
    expect(news[0].matchedLocation).toBe('Biển Đông');
    expect(news[0].matchedLat).toBeCloseTo(14.5, 1);
    expect(news[0].matchedLon).toBeCloseTo(112.0, 1);

    const hormuzLoc = matchGeoLocation('Oil tankers reroute near Strait of Hormuz');
    expect(hormuzLoc?.name).toContain('Hormuz');
    expect(hormuzLoc?.lat).toBeCloseTo(26.5, 1);

    expect(decodeHtmlEntities('Britain&#039;s &amp; Don&#x2019;t')).toBe("Britain's & Don’t");
    expect(decodeHtmlEntities('Tr&ugrave;m ma t&uacute;y kh&eacute;t tiếng &ndash; Thanh Ni&ecirc;n')).toBe(
      'Trùm ma túy khét tiếng – Thanh Niên',
    );
  });

  it('parses GDELT v2 61-column CAMEO export TSV rows into conflict/sanctions geo points', () => {
    const cols = new Array<string>(61).fill('');
    cols[0] = '123456789';
    cols[6] = 'IRAN';
    cols[16] = 'UNITED STATES';
    cols[26] = '190';
    cols[28] = '19';
    cols[30] = '-10.0';
    cols[31] = '18';
    cols[52] = 'Strait of Hormuz, Iran';
    cols[56] = '26.56';
    cols[57] = '56.25';
    cols[60] = 'https://example.com/naval-standoff-in-hormuz-strait';

    const events = parseGdeltExportTsv(cols.join('\t'), 1_700_000_000_000);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('conflict');
    expect(events[0].severity).toBe('critical');
    expect(events[0].lat).toBeCloseTo(26.56, 2);
    expect(events[0].lon).toBeCloseTo(56.25, 2);
    expect(events[0].meta.actors).toBe('IRAN ↔ UNITED STATES');
  });
});
