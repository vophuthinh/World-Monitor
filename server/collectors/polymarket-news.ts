import { XMLParser } from 'fast-xml-parser';
import type { NewsCategory, NewsItem, PredictionCategory, PredictionItem } from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const POLYMARKET_EVENTS_URL =
  'https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=60';

export interface RawPolymarketMarket {
  question?: string;
  outcomePrices?: string | number[];
  volume?: string | number;
  liquidity?: string | number;
}

export interface RawPolymarketEvent {
  id?: string | number;
  slug?: string;
  title?: string;
  volume?: string | number;
  volume24hr?: string | number;
  liquidity?: string | number;
  endDate?: string;
  tags?: Array<{ label?: string; slug?: string }>;
  markets?: RawPolymarketMarket[];
}

function parseYesPercent(rawPrices?: string | number[]): number | null {
  if (!rawPrices) return null;
  let arr: unknown[] | null = null;
  if (Array.isArray(rawPrices)) {
    arr = rawPrices;
  } else if (typeof rawPrices === 'string') {
    try {
      const parsed = JSON.parse(rawPrices);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return null;
    }
  }
  if (!arr || arr.length === 0) return null;
  const first = Number(arr[0]);
  if (!Number.isFinite(first) || first < 0 || first > 1.0001) return null;
  return Math.round(first * 100);
}

function classifyPredictionCategory(title: string, tags: string): PredictionCategory {
  const text = `${title} ${tags}`.toLowerCase();
  // Filter out pure sports/entertainment when categorizing; prioritize crypto/tech & finance & geopolitics
  if (
    /\b(bitcoin|btc|ethereum|eth|solana|crypto|token|defi|openai|gpt|claude|gemini|apple|nvidia|tesla|ai\b|artificial intelligence|spacex|tiktok)\b/.test(
      text,
    )
  ) {
    return 'crypto_tech';
  }
  if (
    /\b(fed\b|interest rate|fomc|inflation|cpi|recession|gdp|tariff|s&p|nasdaq|treasury|oil\b|gold\b|dollar|bank of japan|ecb)\b/.test(
      text,
    )
  ) {
    return 'finance';
  }
  return 'geopolitics';
}

function isSportsNoise(title: string, tags: string): boolean {
  const text = `${title} ${tags}`.toLowerCase();
  return /\b(nba|nfl|mlb|nhl|premier league|champions league|la liga|ufc|formula 1|super bowl|world series|stanley cup|fifa|tennis|golf|esports|valorant|counter-strike)\b/.test(
    text,
  );
}

export function normalizePolymarketEvents(events: RawPolymarketEvent[]): PredictionItem[] {
  if (!Array.isArray(events)) {
    throw new Error('Malformed Polymarket Gamma events array');
  }

  const deduped = new Map<string, PredictionItem>();

  for (const ev of events) {
    const title = (ev.title ?? '').trim();
    if (!title) continue;

    const tagText = (ev.tags ?? []).map((t) => `${t.label ?? ''} ${t.slug ?? ''}`).join(' ');
    if (isSportsNoise(title, tagText)) continue;

    const slug = (ev.slug ?? '').trim();
    const identityKey =
      slug && !['undefined', 'null', 'nan'].includes(slug.toLowerCase())
        ? `slug:${slug.toLowerCase()}`
        : `title:${title.toLowerCase()}`;

    const primaryMarket = ev.markets?.[0];
    const yesPercent = parseYesPercent(primaryMarket?.outcomePrices) ?? 50;
    const volumeUsd = Number(ev.volume ?? ev.volume24hr ?? primaryMarket?.volume ?? 0);
    const liquidityUsd = Number(ev.liquidity ?? primaryMarket?.liquidity ?? 0);
    const url = slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com';

    const candidate: PredictionItem = {
      id: slug || String(ev.id ?? title.slice(0, 32)),
      title,
      category: classifyPredictionCategory(title, tagText),
      yesPercent,
      volumeUsd: Number.isFinite(volumeUsd) ? Math.round(volumeUsd) : 0,
      liquidityUsd: Number.isFinite(liquidityUsd) ? Math.round(liquidityUsd) : 0,
      endDate: ev.endDate ?? null,
      url,
    };

    const incumbent = deduped.get(identityKey);
    if (!incumbent || candidate.volumeUsd > incumbent.volumeUsd) {
      deduped.set(identityKey, candidate);
    }
  }

  return [...deduped.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 45);
}

export async function fetchPolymarketPredictions(): Promise<PredictionItem[]> {
  const payload = await fetchJsonWithTimeout<RawPolymarketEvent[]>(POLYMARKET_EVENTS_URL, {
    timeoutMs: 12_000,
    retries: 1,
    userAgent: NAMED_APP_UA,
  });
  return normalizePolymarketEvents(payload);
}

// === GEO-TAGGED RSS NEWS COLLECTOR ===

interface GeoKeywordRule {
  pattern: RegExp;
  name: string;
  lat: number;
  lon: number;
}

const GEO_GAZETTEER: readonly GeoKeywordRule[] = [
  { pattern: /\b(biển đông|south china sea|trường sa|spratly|hoàng sa|paracel)\b/i, name: 'Biển Đông', lat: 14.5, lon: 112.0 },
  { pattern: /\b(hà nội|hanoi)\b/i, name: 'Hà Nội, Việt Nam', lat: 21.0285, lon: 105.8542 },
  { pattern: /\b(tp\.?\s*hcm|hồ chí minh|ho chi minh|saigon)\b/i, name: 'TP.HCM, Việt Nam', lat: 10.7769, lon: 106.7009 },
  { pattern: /\b(đà nẵng|da nang)\b/i, name: 'Đà Nẵng, Việt Nam', lat: 16.0544, lon: 108.2022 },
  { pattern: /\b(việt nam|vietnam|vn-index)\b/i, name: 'Việt Nam', lat: 16.0, lon: 107.8 },
  { pattern: /\b(hormuz)\b/i, name: 'Strait of Hormuz', lat: 26.5, lon: 56.5 },
  { pattern: /\b(red sea|biển đỏ|bab el-mandeb|houthi)\b/i, name: 'Biển Đỏ / Bab el-Mandeb', lat: 14.5, lon: 42.5 },
  { pattern: /\b(suez)\b/i, name: 'Kênh đào Suez', lat: 30.5, lon: 32.3 },
  { pattern: /\b(malacca)\b/i, name: 'Eo biển Malacca', lat: 2.5, lon: 101.5 },
  { pattern: /\b(taiwan|đài loan|taipei|đài bắc)\b/i, name: 'Đài Loan', lat: 24.0, lon: 120.8 },
  { pattern: /\b(ukraine|kyiv|kiev|kharkiv|odesa|crimea|zaporizhzhia)\b/i, name: 'Ukraine', lat: 49.0, lon: 31.4 },
  { pattern: /\b(gaza|israel|tel aviv|jerusalem|lebano|beirut|hezbollah)\b/i, name: 'Israel / Levant', lat: 31.8, lon: 35.0 },
  { pattern: /\b(iran|tehran|natanz)\b/i, name: 'Iran', lat: 32.4, lon: 53.7 },
  { pattern: /\b(russia|moscow|nga|kremlin)\b/i, name: 'Nga (Moscow)', lat: 55.75, lon: 37.62 },
  { pattern: /\b(north korea|triều tiên|pyongyang|bình nhưỡng)\b/i, name: 'Triều Tiên', lat: 39.03, lon: 125.75 },
  { pattern: /\b(south korea|hàn quốc|seoul)\b/i, name: 'Hàn Quốc', lat: 37.56, lon: 126.98 },
  { pattern: /\b(japan|nhật bản|tokyo|boj|nikkei)\b/i, name: 'Nhật Bản', lat: 35.68, lon: 139.76 },
  { pattern: /\b(china|trung quốc|beijing|bắc kinh|shanghai|thượng hải)\b/i, name: 'Trung Quốc', lat: 35.86, lon: 104.19 },
  { pattern: /\b(philippines|manila|luzon)\b/i, name: 'Philippines', lat: 14.6, lon: 120.98 },
  { pattern: /\b(singapore)\b/i, name: 'Singapore', lat: 1.35, lon: 103.82 },
  { pattern: /\b(panama)\b/i, name: 'Kênh đào Panama', lat: 9.1, lon: -79.7 },
  { pattern: /\b(fed\b|federal reserve|washington|white house|pentagon|wall street|mỹ|hoa kỳ)\b/i, name: 'Hoa Kỳ', lat: 38.9, lon: -77.04 },
  { pattern: /\b(ecb|frankfurt|germany|đức|berlin)\b/i, name: 'Đức / Khu vực Euro', lat: 50.11, lon: 8.68 },
  { pattern: /\b(uk\b|britain|london|anh)\b/i, name: 'Vương quốc Anh', lat: 51.51, lon: -0.12 },
  { pattern: /\b(india|ấn độ|new delhi|mumbai)\b/i, name: 'Ấn Độ', lat: 20.59, lon: 78.96 },
];

export function matchGeoLocation(text: string): { name: string; lat: number; lon: number } | null {
  if (!text) return null;
  for (const rule of GEO_GAZETTEER) {
    if (rule.pattern.test(text)) {
      return { name: rule.name, lat: rule.lat, lon: rule.lon };
    }
  }
  return null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function cleanText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (raw && typeof raw === 'object' && '#text' in (raw as Record<string, unknown>)) {
    return cleanText((raw as Record<string, unknown>)['#text']);
  }
  return '';
}

function extractLink(rawLink: unknown): string {
  if (typeof rawLink === 'string') return rawLink.trim();
  if (Array.isArray(rawLink)) {
    for (const entry of rawLink) {
      const candidate = extractLink(entry);
      if (candidate) return candidate;
    }
    return '';
  }
  if (rawLink && typeof rawLink === 'object') {
    const obj = rawLink as Record<string, unknown>;
    if (typeof obj['@_href'] === 'string') return obj['@_href'].trim();
    if (typeof obj['#text'] === 'string') return obj['#text'].trim();
  }
  return '';
}

export function parseRssFeedXml(
  xml: string,
  sourceName: string,
  category: NewsCategory,
  fallbackNow = Date.now(),
): NewsItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const channelItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const list = Array.isArray(channelItems) ? channelItems : channelItems ? [channelItems] : [];

  const out: NewsItem[] = [];
  for (const entry of list.slice(0, 15)) {
    const title = cleanText(entry?.title);
    const url = extractLink(entry?.link) || cleanText(entry?.guid);
    if (!title || !url || !url.startsWith('http')) continue;

    const rawDate = cleanText(entry?.pubDate ?? entry?.published ?? entry?.updated);
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const loc = matchGeoLocation(title);

    out.push({
      id: `${sourceName}:${url}`,
      title,
      source: sourceName,
      category,
      publishedAt,
      url,
      ...(loc
        ? {
            matchedLat: loc.lat,
            matchedLon: loc.lon,
            matchedLocation: loc.name,
          }
        : {}),
    });
  }

  return out;
}

interface FeedDefinition {
  name: string;
  category: NewsCategory;
  url: string;
}

const CURATED_RSS_FEEDS: readonly FeedDefinition[] = [
  // International Geopolitics
  { name: 'BBC World', category: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', category: 'world', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'The Guardian World', category: 'world', url: 'https://www.theguardian.com/world/rss' },
  { name: 'NYT World', category: 'world', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  // Global Finance & Energy
  { name: 'CNBC Markets', category: 'finance', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'MarketWatch', category: 'finance', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'OilPrice Energy', category: 'finance', url: 'https://oilprice.com/rss/main' },
  // Vietnam News & Markets
  { name: 'VnExpress Thế giới', category: 'vietnam', url: 'https://vnexpress.net/rss/the-gioi.rss' },
  { name: 'VnExpress Kinh doanh', category: 'vietnam', url: 'https://vnexpress.net/rss/kinh-doanh.rss' },
  { name: 'Tuổi Trẻ Thế giới', category: 'vietnam', url: 'https://tuoitre.vn/rss/the-gioi.rss' },
];

export async function fetchCuratedRssNews(): Promise<NewsItem[]> {
  const now = Date.now();
  const results = await Promise.allSettled(
    CURATED_RSS_FEEDS.map(async (feed) => {
      const { text } = await fetchTextWithTimeout(feed.url, {
        timeoutMs: 8_000,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      });
      return parseRssFeedXml(text, feed.name, feed.category, now);
    }),
  );

  const merged: NewsItem[] = [];
  const seenUrls = new Set<string>();

  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const item of res.value) {
      const cleanUrl = item.url.split('?')[0];
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);
      merged.push(item);
    }
  }

  if (merged.length === 0) {
    throw new Error('All 10 curated RSS feeds failed or timed out');
  }

  return merged.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 90);
}
