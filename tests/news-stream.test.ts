import { describe, expect, it } from 'vitest';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';
import {
  VietnamTranslator,
  isLikelyVietnamese,
  parseGoogleGtxResponse,
} from '../server/lib/translator';
import {
  WikimediaBurstDetector,
  normalizeGdeltDocArticles,
  normalizeHackerNewsItems,
} from '../server/realtime/news-stream';

describe('Unified OSINT Realtime News Stream & Auto-Vietnamese Translator', () => {
  it('detects native Vietnamese headlines accurately and parses Google GTX translation payloads', () => {
    expect(isLikelyVietnamese('Áp thấp nhiệt đới mạnh lên trên Biển Đông')).toBe(true);
    expect(isLikelyVietnamese('Thủ tướng chỉ đạo thúc đẩy giải ngân đầu tư công')).toBe(true);
    expect(isLikelyVietnamese('Federal Reserve holds interest rates steady amid inflation')).toBe(false);

    const sampleGtx = [
      [
        ['Tàu chở dầu đổi hướng gần eo biển Hormuz\n', 'Oil tankers reroute near Strait of Hormuz\n'],
        ['Cục Dự trữ Liên bang giữ nguyên lãi suất', 'Federal Reserve holds interest rates'],
      ],
    ];
    expect(parseGoogleGtxResponse(sampleGtx)).toBe(
      'Tàu chở dầu đổi hướng gần eo biển Hormuz\nCục Dự trữ Liên bang giữ nguyên lãi suất',
    );
  });

  it('caches translated headlines in VietnamTranslator and skips network for Vietnamese text', async () => {
    let networkCalls = 0;
    const translator = new VietnamTranslator(async (texts) => {
      networkCalls += 1;
      return texts.map((t) => `[VI] ${t}`);
    });

    const firstBatch = await translator.translateBatch([
      ' Tin nóng tại Hà Nội: VN-Index tăng mạnh ',
      'Oil prices surge after Red Sea tanker incident',
    ]);

    expect(firstBatch[0]).toBe('Tin nóng tại Hà Nội: VN-Index tăng mạnh');
    expect(firstBatch[1]).toBe('[VI] Oil prices surge after Red Sea tanker incident');
    expect(networkCalls).toBe(1);

    // Second call with already cached headline makes 0 network calls
    const secondBatch = await translator.translateBatch([
      'Oil prices surge after Red Sea tanker incident',
    ]);
    expect(secondBatch[0]).toBe('[VI] Oil prices surge after Red Sea tanker incident');
    expect(networkCalls).toBe(1);
  });

  it('includes major Vietnamese newspapers (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí) in CURATED_RSS_FEEDS', () => {
    const names = CURATED_RSS_FEEDS.map((f) => f.name).join(' | ');
    expect(names).toContain('VnExpress');
    expect(names).toContain('Tuổi Trẻ');
    expect(names).toContain('Thanh Niên');
    expect(names).toContain('Dân Trí');
    expect(CURATED_RSS_FEEDS.filter((f) => f.category === 'vietnam').length).toBeGreaterThanOrEqual(8);
  });

  it('detects Wikipedia EventStreams human edit bursts while ignoring bots and Talk namespaces', () => {
    const detector = new WikimediaBurstDetector({ burstThreshold: 3, windowMs: 180_000 });
    const t0 = 1_700_000_000_000;

    // Bot edit ignored
    expect(
      detector.ingestEvent(
        {
          bot: true,
          namespace: 0,
          type: 'edit',
          wiki: 'enwiki',
          title: '2026 Luzon earthquake',
          user: 'ClueBot',
          meta: { uri: 'https://en.wikipedia.org/wiki/2026_Luzon_earthquake' },
        },
        t0,
      ),
    ).toBeNull();

    // 3 rapid human edits by distinct users trigger an OSINT burst item
    expect(
      detector.ingestEvent(
        {
          bot: false,
          namespace: 0,
          type: 'edit',
          wiki: 'enwiki',
          title: 'Strait of Malacca',
          user: 'EditorA',
          comment: 'Update maritime incident',
          meta: { uri: 'https://en.wikipedia.org/wiki/Strait_of_Malacca' },
        },
        t0 + 1_000,
      ),
    ).toBeNull();

    expect(
      detector.ingestEvent(
        {
          bot: false,
          namespace: 0,
          type: 'edit',
          wiki: 'enwiki',
          title: 'Strait of Malacca',
          user: 'EditorB',
          comment: 'Add coast guard source',
          meta: { uri: 'https://en.wikipedia.org/wiki/Strait_of_Malacca' },
        },
        t0 + 5_000,
      ),
    ).toBeNull();

    const burstItem = detector.ingestEvent(
      {
        bot: false,
        namespace: 0,
        type: 'edit',
        wiki: 'enwiki',
        title: 'Strait of Malacca',
        user: 'EditorC',
        comment: 'Confirmed collision report',
        meta: { uri: 'https://en.wikipedia.org/wiki/Strait_of_Malacca' },
      },
      t0 + 9_000,
    );

    expect(burstItem).not.toBeNull();
    expect(burstItem?.streamSource).toBe('wikimedia');
    expect(burstItem?.category).toBe('osint_live');
    expect(burstItem?.matchedLocation).toContain('Malacca');
  });

  it('normalizes Hacker News Firebase stories and GDELT DOC 2.0 articles cleanly', () => {
    const hn = normalizeHackerNewsItems([
      {
        id: 9001,
        title: 'OpenAI releases new reasoning architecture for autonomous agents',
        score: 340,
        time: 1_700_000_000,
        url: 'https://example.com/ai-agents',
      },
      {
        id: 9002,
        title: 'Ask HN: Semiconductor supply chain impact in Taiwan',
        score: 95,
        time: 1_700_000_100,
      },
    ]);

    expect(hn).toHaveLength(2);
    expect(hn[0].streamSource).toBe('hackernews');
    expect(hn[0].category).toBe('tech');
    expect(hn[1].url).toBe('https://news.ycombinator.com/item?id=9002');
    expect(hn[1].matchedLocation).toBe('Đài Loan');

    const gdeltDocs = normalizeGdeltDocArticles({
      articles: [
        {
          url: 'https://www.aljazeera.com/news/2026/11/21/south-china-sea-patrols',
          title: 'Regional navies expand joint patrols across South China Sea',
          seendate: '20261121T183000Z',
          domain: 'aljazeera.com',
          sourcecountry: 'Qatar',
        },
      ],
    });
    expect(gdeltDocs).toHaveLength(1);
    expect(gdeltDocs[0].streamSource).toBe('gdelt');
    expect(gdeltDocs[0].matchedLocation).toBe('Biển Đông');
  });
});
