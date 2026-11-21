import { XMLParser } from 'fast-xml-parser';
import type { GoogleTrendGeo, GoogleTrendItem, GoogleTrendsSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../lib/http';
import { globalViTranslator } from '../lib/translator';
import { decodeHtmlEntities, matchGeoLocation } from './polymarket-news';

const GTRENDS_VN_RSS_URL = 'https://trends.google.com/trending/rss?geo=VN';
const GTRENDS_US_RSS_URL = 'https://trends.google.com/trending/rss?geo=US';
const GTRENDS_SG_RSS_URL = 'https://trends.google.com/trending/rss?geo=SG';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function readXmlText(val: unknown): string {
  if (typeof val === 'string') return decodeHtmlEntities(val).trim();
  if (typeof val === 'number') return String(val);
  if (val && typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (typeof rec['#text'] === 'string' || typeof rec['#text'] === 'number') {
      return decodeHtmlEntities(String(rec['#text'])).trim();
    }
  }
  return '';
}

export function parseTrafficScore(approxTraffic: string): number {
  const digits = approxTraffic.replace(/[^0-9]/g, '');
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

export function parseGoogleTrendsRss(
  xml: string,
  geo: GoogleTrendGeo,
  maxItems = 14,
  fallbackNow = Date.now(),
): GoogleTrendItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const seenQueries = new Set<string>();
  const out: GoogleTrendItem[] = [];

  for (const entry of entries) {
    const query = readXmlText(entry?.title);
    if (!query || query.length < 2) continue;

    const normKey = query.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenQueries.has(normKey)) continue;
    seenQueries.add(normKey);

    const approxTraffic = readXmlText(entry?.['ht:approx_traffic']) || '100+';
    const trafficScore = parseTrafficScore(approxTraffic);

    const rawPubDate = readXmlText(entry?.pubDate);
    const parsedTs = rawPubDate ? Date.parse(rawPubDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const pictureUrl = readXmlText(entry?.['ht:picture']) || undefined;

    const rawNews = entry?.['ht:news_item'];
    const firstNews = Array.isArray(rawNews) ? rawNews[0] : rawNews;
    const topNewsTitle = firstNews ? readXmlText(firstNews['ht:news_item_title']) || undefined : undefined;
    const topNewsUrl = firstNews ? readXmlText(firstNews['ht:news_item_url']) || undefined : undefined;
    const topNewsSource = firstNews ? readXmlText(firstNews['ht:news_item_source']) || undefined : undefined;

    const geoCode = geo === 'VN' ? 'VN' : 'US';
    const trendUrl = `https://trends.google.com/trending?geo=${geoCode}&q=${encodeURIComponent(query)}`;

    const geoMatch = matchGeoLocation(`${query} ${topNewsTitle ?? ''}`);

    out.push({
      id: `gtrends:${geo}:${normKey}`,
      rank: out.length + 1,
      query,
      approxTraffic,
      trafficScore,
      geo,
      publishedAt,
      trendUrl,
      pictureUrl,
      topNewsTitle,
      topNewsSource,
      topNewsUrl,
      ...(geoMatch
        ? {
            matchedLocation: geoMatch.name,
            matchedLat: geoMatch.lat,
            matchedLon: geoMatch.lon,
          }
        : {}),
    });

    if (out.length >= maxItems) break;
  }

  return out;
}

export async function fetchGoogleTrendsRealtime(): Promise<GoogleTrendsSnapshot> {
  const now = Date.now();

  const [vnRes, usRes, sgRes] = await Promise.allSettled([
    fetchTextWithTimeout(GTRENDS_VN_RSS_URL, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
    }),
    fetchTextWithTimeout(GTRENDS_US_RSS_URL, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
    }),
    fetchTextWithTimeout(GTRENDS_SG_RSS_URL, {
      timeoutMs: 8_000,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    }),
  ]);

  const vnItems =
    vnRes.status === 'fulfilled' ? parseGoogleTrendsRss(vnRes.value.text, 'VN', 12, now) : [];

  const globalMergedMap = new Map<string, GoogleTrendItem>();
  if (usRes.status === 'fulfilled') {
    for (const item of parseGoogleTrendsRss(usRes.value.text, 'GLOBAL', 10, now)) {
      globalMergedMap.set(item.query.toLowerCase(), item);
    }
  }
  if (sgRes.status === 'fulfilled') {
    for (const item of parseGoogleTrendsRss(sgRes.value.text, 'GLOBAL', 6, now)) {
      const k = item.query.toLowerCase();
      if (!globalMergedMap.has(k)) {
        globalMergedMap.set(k, item);
      }
    }
  }

  const globalRaw = [...globalMergedMap.values()]
    .sort((a, b) => b.trafficScore - a.trafficScore || b.publishedAt - a.publishedAt)
    .slice(0, 12)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  if (vnItems.length === 0 && globalRaw.length === 0) {
    throw new Error('Google Trends Realtime RSS feeds failed');
  }

  // Auto-translate English news snippets into Vietnamese for seamless reading
  const globalNewsHeadlines = globalRaw.map((g) => g.topNewsTitle ?? '');
  const vnForeignHeadlines = vnItems.map((v) => v.topNewsTitle ?? '');

  const [translatedGlobal, translatedVn] = await Promise.all([
    globalViTranslator.translateBatch(globalNewsHeadlines),
    globalViTranslator.translateBatch(vnForeignHeadlines),
  ]);

  const vnEnriched = vnItems.map((item, idx) => ({
    ...item,
    topNewsTitleVi: translatedVn[idx] || item.topNewsTitle,
  }));

  const globalEnriched = globalRaw.map((item, idx) => ({
    ...item,
    topNewsTitleVi: translatedGlobal[idx] || item.topNewsTitle,
  }));

  return {
    vn: vnEnriched,
    global: globalEnriched,
    updatedAt: now,
  };
}
