import { XMLParser } from 'fast-xml-parser';
import type { NewsCategory, NewsItem, PredictionCategory, PredictionItem } from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { globalViTranslator } from '../lib/translator';

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
  { pattern: /\b(hoàng sa|paracel)\b/i, name: 'Quần đảo Hoàng Sa (VN)', lat: 16.48, lon: 111.98 },
  { pattern: /\b(trường sa|spratly|song tử tây|sinh tồn)\b/i, name: 'Quần đảo Trường Sa (VN)', lat: 9.95, lon: 113.85 },
  { pattern: /\b(biển đông|south china sea|vịnh bắc bộ|tonkin)\b/i, name: 'Biển Đông', lat: 14.5, lon: 112.0 },
  { pattern: /\b(hà nội|hanoi)\b/i, name: 'Hà Nội, Việt Nam', lat: 21.0285, lon: 105.8542 },
  { pattern: /\b(tp\.?\s*hcm|hồ chí minh|ho chi minh|saigon|sài gòn)\b/i, name: 'TP.HCM, Việt Nam', lat: 10.7769, lon: 106.7009 },
  { pattern: /\b(đà nẵng|da nang)\b/i, name: 'Đà Nẵng, Việt Nam', lat: 16.0544, lon: 108.2022 },
  { pattern: /\b(hải phòng|hai phong)\b/i, name: 'Hải Phòng, Việt Nam', lat: 20.8449, lon: 106.6881 },
  { pattern: /\b(phú quốc|phu quoc)\b/i, name: 'Phú Quốc, Việt Nam', lat: 10.2289, lon: 103.9572 },
  { pattern: /\b(cần thơ|đồng bằng sông cửu long|mekong)\b/i, name: 'ĐBSCL, Việt Nam', lat: 10.0452, lon: 105.7469 },
  { pattern: /\b(việt nam|vietnam|vn-index|nhnn)\b/i, name: 'Việt Nam', lat: 16.0, lon: 107.8 },
  { pattern: /\b(hormuz)\b/i, name: 'Strait of Hormuz', lat: 26.5, lon: 56.5 },
  { pattern: /\b(red sea|biển đỏ|bab el-mandeb|houthi|yemen)\b/i, name: 'Biển Đỏ / Bab el-Mandeb', lat: 14.5, lon: 42.5 },
  { pattern: /\b(suez)\b/i, name: 'Kênh đào Suez', lat: 30.5, lon: 32.3 },
  { pattern: /\b(malacca)\b/i, name: 'Eo biển Malacca', lat: 2.5, lon: 101.5 },
  { pattern: /\b(taiwan|đài loan|taipei|đài bắc|tsmc)\b/i, name: 'Đài Loan', lat: 24.0, lon: 120.8 },
  { pattern: /\b(ukraine|kyiv|kiev|kharkiv|odesa|crimea|zaporizhzhia|donetsk)\b/i, name: 'Ukraine', lat: 49.0, lon: 31.4 },
  { pattern: /\b(gaza|israel|tel aviv|jerusalem|lebanon|beirut|hezbollah|syria|damascus)\b/i, name: 'Trung Đông / Levant', lat: 31.8, lon: 35.0 },
  { pattern: /\b(iran|tehran|natanz)\b/i, name: 'Iran', lat: 32.4, lon: 53.7 },
  { pattern: /\b(russia|moscow|nga|kremlin)\b/i, name: 'Nga (Moscow)', lat: 55.75, lon: 37.62 },
  { pattern: /\b(north korea|triều tiên|pyongyang|bình nhưỡng)\b/i, name: 'Triều Tiên', lat: 39.03, lon: 125.75 },
  { pattern: /\b(south korea|hàn quốc|seoul)\b/i, name: 'Hàn Quốc', lat: 37.56, lon: 126.98 },
  { pattern: /\b(japan|nhật bản|tokyo|boj|nikkei)\b/i, name: 'Nhật Bản', lat: 35.68, lon: 139.76 },
  { pattern: /\b(china|trung quốc|beijing|bắc kinh|shanghai|thượng hải)\b/i, name: 'Trung Quốc', lat: 35.86, lon: 104.19 },
  { pattern: /\b(philippines|manila|luzon)\b/i, name: 'Philippines', lat: 14.6, lon: 120.98 },
  { pattern: /\b(singapore)\b/i, name: 'Singapore', lat: 1.35, lon: 103.82 },
  { pattern: /\b(indonesia|jakarta)\b/i, name: 'Indonesia', lat: -6.2, lon: 106.82 },
  { pattern: /\b(thailand|thái lan|bangkok)\b/i, name: 'Thái Lan', lat: 13.75, lon: 100.5 },
  { pattern: /\b(myanmar|yangon)\b/i, name: 'Myanmar', lat: 19.76, lon: 96.07 },
  { pattern: /\b(panama)\b/i, name: 'Kênh đào Panama', lat: 9.1, lon: -79.7 },
  { pattern: /\b(fed\b|federal reserve|washington|white house|pentagon|wall street|silicon valley|mỹ|hoa kỳ)\b/i, name: 'Hoa Kỳ', lat: 38.9, lon: -77.04 },
  { pattern: /\b(ecb|frankfurt|germany|đức|berlin)\b/i, name: 'Đức / Khu vực Euro', lat: 50.11, lon: 8.68 },
  { pattern: /\b(france|pháp|paris)\b/i, name: 'Pháp', lat: 48.85, lon: 2.35 },
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

const NAMED_HTML_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  igrave: 'ì',
  iacute: 'í',
  itilde: 'ĩ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ugrave: 'ù',
  uacute: 'ú',
  utilde: 'ũ',
  yacute: 'ý',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Igrave: 'Ì',
  Iacute: 'Í',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Yacute: 'Ý',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => NAMED_HTML_ENTITIES[name] ?? full)
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(raw: unknown): string {
  if (typeof raw === 'string') {
    return decodeHtmlEntities(raw);
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
  for (const entry of list.slice(0, 12)) {
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
      titleVi: category === 'vietnam' ? title : undefined,
      source: sourceName,
      category,
      streamSource: 'rss',
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

export interface FeedDefinition {
  name: string;
  category: NewsCategory;
  url: string;
}

export const CURATED_RSS_FEEDS: readonly FeedDefinition[] = [
  // Báo chí Chính thống Việt Nam (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí)
  { name: 'VnExpress Tin mới', category: 'vietnam', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss' },
  { name: 'VnExpress Thời sự', category: 'vietnam', url: 'https://vnexpress.net/rss/thoi-su.rss' },
  { name: 'VnExpress Thế giới', category: 'vietnam', url: 'https://vnexpress.net/rss/the-gioi.rss' },
  { name: 'VnExpress Kinh doanh', category: 'vietnam', url: 'https://vnexpress.net/rss/kinh-doanh.rss' },
  { name: 'Tuổi Trẻ Tin mới', category: 'vietnam', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss' },
  { name: 'Tuổi Trẻ Thế giới', category: 'vietnam', url: 'https://tuoitre.vn/rss/the-gioi.rss' },
  { name: 'Tuổi Trẻ Kinh doanh', category: 'vietnam', url: 'https://tuoitre.vn/rss/kinh-doanh.rss' },
  { name: 'Thanh Niên Thế giới', category: 'vietnam', url: 'https://thanhnien.vn/rss/the-gioi.rss' },
  { name: 'Thanh Niên Kinh tế', category: 'vietnam', url: 'https://thanhnien.vn/rss/kinh-te.rss' },
  { name: 'Dân Trí Thế giới', category: 'vietnam', url: 'https://dantri.com.vn/rss/the-gioi.rss' },
  { name: 'Dân Trí Kinh doanh', category: 'vietnam', url: 'https://dantri.com.vn/rss/kinh-doanh.rss' },

  // Báo chí Địa chính trị Quốc tế & Châu Á - Thái Bình Dương (tham chiếu Koala73)
  { name: 'BBC World', category: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', category: 'world', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'The Guardian World', category: 'world', url: 'https://www.theguardian.com/world/rss' },
  { name: 'NYT World', category: 'world', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'DW World', category: 'world', url: 'https://rss.dw.com/xml/rss-en-world' },
  { name: 'The Diplomat Asia', category: 'world', url: 'https://thediplomat.com/feed/' },
  { name: 'South China Morning Post', category: 'world', url: 'https://www.scmp.com/rss/91/feed' },
  { name: 'Channel NewsAsia', category: 'world', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml' },
  { name: 'Foreign Policy', category: 'world', url: 'https://foreignpolicy.com/feed/' },

  // Tình báo Quốc phòng & OSINT (Koala73 DEFAULT_ENABLED_INTEL)
  { name: 'Defense One', category: 'world', url: 'https://www.defenseone.com/rss/all/' },
  { name: 'Breaking Defense', category: 'world', url: 'https://breakingdefense.com/feed/' },
  { name: 'The War Zone', category: 'world', url: 'https://www.twz.com/feed' },
  { name: 'Bellingcat OSINT', category: 'world', url: 'https://www.bellingcat.com/feed/' },

  // Tài chính, Phố Wall & Năng lượng Quốc tế
  { name: 'CNBC Markets', category: 'finance', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'MarketWatch', category: 'finance', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'OilPrice Energy', category: 'finance', url: 'https://oilprice.com/rss/main' },
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
    throw new Error('All curated RSS feeds failed or timed out');
  }

  const sorted = merged.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 110);
  return globalViTranslator.enrichNewsItems(sorted);
}
