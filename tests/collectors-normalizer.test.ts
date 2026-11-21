import { describe, expect, it } from 'vitest';
import { normalizeUsgsEarthquakes } from '../server/collectors/earthquakes';
import { normalizeGdeltGeoJson, parseGdeltExportTsv } from '../server/collectors/geopolitics-gdelt';
import { normalizeWorldBankIndicators } from '../server/collectors/macro-worldbank';
import {
  normalizeCoinGeckoMarkets,
  normalizeErApiFx,
  normalizeFearGreed,
  normalizeYahooChartQuote,
} from '../server/collectors/markets-crypto';
import { normalizeEonetEvents, normalizeGdacsEvents } from '../server/collectors/natural-events';
import {
  decodeHtmlEntities,
  matchGeoLocation,
  normalizePolymarketEvents,
  parseRssFeedXml,
} from '../server/collectors/polymarket-news';
import { normalizeRainViewerRadar } from '../server/collectors/weather-radar';

describe('Collectors Normalizers & Fault-Tolerant Parsers', () => {
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
