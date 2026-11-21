import { describe, expect, it } from 'vitest';
import { parseGoogleTrendsRss } from '../server/collectors/google-trends';
import {
  normalizePolymarketEvents,
  selectTopHotPolymarket,
} from '../server/collectors/polymarket-news';
import { parsePolymarketWsMessage } from '../server/realtime/polymarket-stream';

describe('Live Intel Realtime: Polymarket Top 5 Hot & Google Trends Realtime', () => {
  it('parses Google Trends Realtime RSS (VN & Global) with approx_traffic, news context, and geo coordinates', () => {
    const sampleTrendsXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
        <channel>
          <title>Daily Search Trends</title>
          <item>
            <title>giá vàng hôm nay</title>
            <ht:approx_traffic>50,000+</ht:approx_traffic>
            <pubDate>Sat, 21 Nov 2026 19:50:00 +0000</pubDate>
            <ht:picture>https://encrypted-tbn0.gstatic.com/images?q=gold</ht:picture>
            <ht:news_item>
              <ht:news_item_title>Giá vàng SJC tại Hà Nội tăng mạnh đầu phiên</ht:news_item_title>
              <ht:news_item_url>https://vnexpress.net/gia-vang-hom-nay-1.html</ht:news_item_url>
              <ht:news_item_source>VnExpress</ht:news_item_source>
            </ht:news_item>
          </item>
          <item>
            <title>bão biển đông</title>
            <ht:approx_traffic>20,000+</ht:approx_traffic>
            <pubDate>Sat, 21 Nov 2026 19:40:00 +0000</pubDate>
            <ht:news_item>
              <ht:news_item_title>Áp thấp nhiệt đới mạnh lên trên Biển Đông hướng về Hoàng Sa</ht:news_item_title>
              <ht:news_item_url>https://tuoitre.vn/bao-bien-dong-2.html</ht:news_item_url>
              <ht:news_item_source>Tuổi Trẻ</ht:news_item_source>
            </ht:news_item>
          </item>
          <item>
            <title>Giá vàng hôm nay</title>
            <ht:approx_traffic>10,000+</ht:approx_traffic>
            <pubDate>Sat, 21 Nov 2026 19:30:00 +0000</pubDate>
          </item>
        </channel>
      </rss>`;

    const items = parseGoogleTrendsRss(sampleTrendsXml, 'VN', 10);
    // Case-insensitive duplicate "Giá vàng hôm nay" is deduplicated
    expect(items).toHaveLength(2);
    expect(items[0].rank).toBe(1);
    expect(items[0].query).toBe('giá vàng hôm nay');
    expect(items[0].approxTraffic).toBe('50,000+');
    expect(items[0].trafficScore).toBe(50_000);
    expect(items[0].topNewsSource).toBe('VnExpress');
    expect(items[0].topNewsUrl).toBe('https://vnexpress.net/gia-vang-hom-nay-1.html');
    expect(items[0].matchedLocation).toBe('Hà Nội, Việt Nam');

    expect(items[1].query).toBe('bão biển đông');
    expect(items[1].trafficScore).toBe(20_000);
    expect(items[1].matchedLocation).toContain('Hoàng Sa');
  });

  it('selects open active sub-markets on Polymarket, preserves 24h volume + clobTokenId, and picks diverse Top 5 Hot', () => {
    const normalized = normalizePolymarketEvents([
      {
        id: 'fed-dec',
        slug: 'fed-decision-in-december',
        title: 'Fed Decision in December?',
        volume24hr: 2_590_000,
        volume: 49_150_000,
        liquidity: 4_200_000,
        markets: [
          {
            groupItemTitle: '50+ bps decrease',
            closed: false,
            active: true,
            outcomePrices: '["0.007", "0.993"]',
            clobTokenIds: '["tok_50dec", "tok_50dec_no"]',
          },
          {
            groupItemTitle: '25 bps increase',
            closed: false,
            active: true,
            outcomePrices: '["0.895", "0.105"]',
            oneDayPriceChange: 0.045,
            clobTokenIds: '["tok_25inc", "tok_25inc_no"]',
          },
        ],
      },
      {
        id: 'ceasefire',
        slug: 'israel-iran-ceasefire',
        title: 'Israel x Iran ceasefire continues through...?',
        volume24hr: 1_200_000,
        volume: 60_400_000,
        markets: [
          // Settled historical bracket must be skipped!
          {
            groupItemTitle: 'July 18',
            closed: true,
            active: true,
            outcomePrices: '["1", "0"]',
            clobTokenIds: '["tok_settled", "tok_settled_no"]',
          },
          {
            groupItemTitle: 'December 31',
            closed: false,
            active: true,
            outcomePrices: '["0.64", "0.36"]',
            oneDayPriceChange: -0.03,
            clobTokenIds: '["tok_dec31", "tok_dec31_no"]',
          },
        ],
      },
      {
        id: 'btc-2026',
        slug: 'btc-hit-2026',
        title: 'What price will Bitcoin hit in 2026?',
        volume24hr: 1_900_000,
        volume: 93_000_000,
        markets: [
          {
            groupItemTitle: '↑ 120,000',
            closed: false,
            active: true,
            outcomePrices: '["0.58", "0.42"]',
            clobTokenIds: '["tok_btc26", "tok_btc26_no"]',
          },
        ],
      },
      // Duplicate rolling Bitcoin price clone should not crowd out other Top 5 Hot contracts
      {
        id: 'btc-nov',
        slug: 'btc-hit-november',
        title: 'What price will Bitcoin hit in November?',
        volume24hr: 1_250_000,
        volume: 13_000_000,
        markets: [{ outcomePrices: '["0.71", "0.29"]' }],
      },
      {
        id: 'taiwan-2026',
        slug: 'china-taiwan-2026',
        title: 'Will China blockade Taiwan in 2026?',
        volume24hr: 780_000,
        volume: 28_000_000,
        markets: [{ outcomePrices: '["0.14", "0.86"]' }],
      },
      {
        id: 'openai-gpt6',
        slug: 'openai-gpt6-release',
        title: 'Will OpenAI release GPT-6 before Q3?',
        volume24hr: 540_000,
        volume: 9_500_000,
        markets: [{ outcomePrices: '["0.46", "0.54"]' }],
      },
    ]);

    const fed = normalized.find((p) => p.id === 'fed-decision-in-december');
    expect(fed?.yesPercent).toBe(90);
    expect(fed?.outcomeLabel).toBe('25 bps increase');
    expect(fed?.volume24hUsd).toBe(2_590_000);
    expect(fed?.change24hPct).toBeCloseTo(4.5, 1);
    expect(fed?.clobTokenId).toBe('tok_25inc');

    const ceasefire = normalized.find((p) => p.id === 'israel-iran-ceasefire');
    expect(ceasefire?.yesPercent).toBe(64);
    expect(ceasefire?.outcomeLabel).toBe('December 31');
    expect(ceasefire?.clobTokenId).toBe('tok_dec31');

    const top5Hot = selectTopHotPolymarket(normalized, 5);
    expect(top5Hot).toHaveLength(5);
    expect(top5Hot[0].id).toBe('fed-decision-in-december');
    expect(top5Hot[1].id).toBe('btc-hit-2026');
    // Rolling clone 'btc-hit-november' skipped in favor of diverse hot events
    expect(top5Hot.some((p) => p.id === 'btc-hit-november')).toBe(false);
    expect(top5Hot.some((p) => p.id === 'israel-iran-ceasefire')).toBe(true);
    expect(top5Hot.some((p) => p.id === 'china-taiwan-2026')).toBe(true);
    expect(top5Hot.some((p) => p.id === 'openai-gpt6-release')).toBe(true);
  });

  it('parses live Polymarket CLOB WebSocket book & price_change ticks into probability updates', () => {
    const bookTicks = parsePolymarketWsMessage(
      JSON.stringify([
        {
          event_type: 'book',
          asset_id: 'tok_25inc',
          bids: [{ price: '0.88', size: '5000' }, { price: '0.91', size: '1200' }],
          asks: [{ price: '0.93', size: '1800' }, { price: '0.95', size: '4000' }],
        },
      ]),
    );
    expect(bookTicks).toEqual([{ assetId: 'tok_25inc', yesPercent: 92 }]);

    const tradeTicks = parsePolymarketWsMessage(
      JSON.stringify({
        event_type: 'last_trade_price',
        asset_id: 'tok_dec31',
        price: '0.668',
      }),
    );
    expect(tradeTicks).toEqual([{ assetId: 'tok_dec31', yesPercent: 67 }]);
  });
});
