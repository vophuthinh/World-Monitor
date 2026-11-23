import type { HptCompanyIntelSnapshot, HptCompanyItem, HptStockSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { maybeEnrichHptWithGroqSentiment } from './hpt/ai';
import { BAOMOI_HPT_SEARCH_URL, CAFEF_HPT_EVENTS_URL, CAFEF_HPT_NEWS_URL, DEFAULT_HPT_TELEGRAM_CHANNELS, HPT_EXTERNAL_FEEDS, HPT_FALSE_POSITIVE_NOISE_RE, HPT_HQ_LAT, HPT_HQ_LON, HPT_RECRUITMENT_DOMAIN_RE, HPT_RECRUITMENT_NOISE_RE, HPT_STATIC_DIRECTORY_URL_RE, HPT_TAX_CODE, REDDIT_HPT_SEARCH_URL, SIMPLIZE_HPT_SUMMARY_URL, isHptSelfSocialPost } from './hpt/config';
import { GoogleCseSearchPayload, MetaGraphPostsPayload, RedditSearchPayload, SearxngSearchPayload, SimplizeSummaryPayload, enrichTopDisclosuresWithPdfLinks, normalizeSimplizeHptSummary, parseBaoMoiHptSearchHtml, parseCafeFHptDisclosuresHtml, parseGoogleCseHptSearchJson, parseHptExternalRss, parseMetaPageMentionsJson, parseRedditHptSearchJson, parseSearxngHptSearchJson, parseTelegramPublicChannelHtml } from './hpt/sources';

export * from './hpt/config';
export * from './hpt/sources';
export * from './hpt/ai';

async function fetchHptUpcomStockAndFundamentals(now: number): Promise<HptStockSnapshot | null> {
  const toSec = Math.floor(now / 1000);
  const fromSec = toSec - 45 * 86_400;
  const dchartUrl = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=HPT&from=${fromSec}&to=${toSec}`;

  const [dchartRes, simpRes] = await Promise.allSettled([
    fetchJsonWithTimeout<{ c?: number[]; v?: number[]; h?: number[]; l?: number[] }>(dchartUrl, {
      timeoutMs: 7_000,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
      headers: { Accept: '*/*' },
    }),
    fetchJsonWithTimeout<SimplizeSummaryPayload>(SIMPLIZE_HPT_SUMMARY_URL, {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    }),
  ]);

  const fundamentals =
    simpRes.status === 'fulfilled' ? normalizeSimplizeHptSummary(simpRes.value) : { taxCode: HPT_TAX_CODE as '0301447436' };

  if (dchartRes.status === 'fulfilled') {
    const dchart = dchartRes.value;
    const closes = (dchart?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (closes.length > 0) {
      const latest = closes[closes.length - 1];
      const prev = closes.length >= 2 ? closes[closes.length - 2] : latest;
      const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
      const vols = dchart?.v ?? [];
      const highs = dchart?.h ?? [];
      const lows = dchart?.l ?? [];

      return {
        symbol: 'HPT',
        exchange: 'UPCoM · HNX',
        companyName: 'CTCP Dịch vụ Công nghệ Tin học HPT',
        priceThousandVnd: Number(latest.toFixed(2)),
        changePercent: Number(changePct.toFixed(2)),
        volume: Number(vols[vols.length - 1] ?? 0) || 0,
        highThousandVnd: highs.length > 0 ? Number(Number(highs[highs.length - 1]).toFixed(2)) : undefined,
        lowThousandVnd: lows.length > 0 ? Number(Number(lows[lows.length - 1]).toFixed(2)) : undefined,
        sparkline: closes.slice(-20).map((c) => Number(c.toFixed(2))),
        fundamentals,
        hqLat: HPT_HQ_LAT,
        hqLon: HPT_HQ_LON,
        updatedAt: now,
      };
    }
  }

  if (fundamentals?.refThousandVnd) {
    return {
      symbol: 'HPT',
      exchange: 'UPCoM · HNX',
      companyName: 'CTCP Dịch vụ Công nghệ Tin học HPT',
      priceThousandVnd: fundamentals.refThousandVnd,
      changePercent: 0,
      volume: 0,
      sparkline: [fundamentals.refThousandVnd],
      fundamentals,
      hqLat: HPT_HQ_LAT,
      hqLon: HPT_HQ_LON,
      updatedAt: now,
    };
  }

  return null;
}

// Local SearXNG multi-engine metasearch (`?format=json` on 127.0.0.1:8888 by default; silently skipped if container is stopped)
// Gentle 15m round-robin (1 single query per 15m = <=4 queries/hour) so upstream engines never rate-limit the local IP
const DEFAULT_SEARXNG_BASE_URL = 'http://127.0.0.1:8888';
const SEARXNG_MIN_INTERVAL_MS = 15 * 60_000;
let lastSearxngFetchAt = 0;
let searxngQueryCursor = 0;
const cachedSearxngBySlot = new Map<number, HptCompanyItem[]>();

export function resolveSearxngBaseUrl(rawEnv = process.env.SEARXNG_BASE_URL): string | null {
  const trimmed = rawEnv?.trim();
  if (trimmed && /^(0|false|off|none|disabled)$/i.test(trimmed)) {
    return null;
  }
  const candidate = trimmed || DEFAULT_SEARXNG_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

// Flat, exact-phrase HPT queries rotated one per cycle (no tangential personal names and no nested boolean soup)
const SEARXNG_HPT_QUERIES: readonly string[] = [
  'site:facebook.com "Công nghệ Tin học HPT" -site:facebook.com/HPTVietnamCorp -site:facebook.com/LifeAtHPT',
  '(site:fireant.vn/bai-viet OR site:f319.com OR site:f247.com OR site:voz.vn OR site:tinhte.vn) ("cổ phiếu HPT" OR "Công nghệ Tin học HPT")',
];

function flattenCachedSearxngItems(): HptCompanyItem[] {
  const out: HptCompanyItem[] = [];
  for (const list of cachedSearxngBySlot.values()) {
    out.push(...list);
  }
  return out;
}

async function fetchOptionalSearxngMentions(now: number): Promise<HptCompanyItem[]> {
  const baseUrl = resolveSearxngBaseUrl();
  if (!baseUrl) return [];
  if (cachedSearxngBySlot.size > 0 && now - lastSearxngFetchAt < SEARXNG_MIN_INTERVAL_MS) {
    return flattenCachedSearxngItems();
  }

  const slot = searxngQueryCursor % SEARXNG_HPT_QUERIES.length;
  searxngQueryCursor += 1;
  const q = SEARXNG_HPT_QUERIES[slot];
  const url = `${baseUrl}/search?q=${encodeURIComponent(q)}&format=json&language=vi`;

  try {
    const payload = await fetchJsonWithTimeout<SearxngSearchPayload>(url, {
      timeoutMs: 8_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    });
    lastSearxngFetchAt = now;
    const parsed = parseSearxngHptSearchJson(payload, now);
    // Keep previous good results for this slot if upstream engines are temporarily in cooldown
    if (parsed.length > 0) {
      cachedSearxngBySlot.set(slot, parsed);
    }
  } catch {
    // Local SearXNG container stopped or unreachable — skip silently
  }

  return flattenCachedSearxngItems();
}

// Throttle optional Google CSE to once per 20m (<= 72 queries/day) to stay strictly inside Google's 100/day free tier
const GOOGLE_CSE_MIN_INTERVAL_MS = 20 * 60_000;
let lastGoogleCseFetchAt = 0;
let cachedGoogleCseItems: HptCompanyItem[] = [];

async function fetchOptionalGoogleCseSocial(now: number): Promise<HptCompanyItem[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  if (!apiKey || !cx) return [];
  if (cachedGoogleCseItems.length > 0 && now - lastGoogleCseFetchAt < GOOGLE_CSE_MIN_INTERVAL_MS) {
    return cachedGoogleCseItems;
  }

  const query =
    '(site:facebook.com OR site:linkedin.com/posts OR site:linkedin.com/pulse OR site:threads.net OR site:tiktok.com) -site:facebook.com/HPTVietnamCorp -site:linkedin.com/posts/hpt-vietnam-corporation ("Công nghệ Tin học HPT" OR "HPT Cyber Security" OR "0301447436")';
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=10&dateRestrict=m1`;
  const payload = await fetchJsonWithTimeout<GoogleCseSearchPayload>(url, {
    timeoutMs: 7_500,
    retries: 0,
    userAgent: DEFAULT_BROWSER_UA,
  });
  lastGoogleCseFetchAt = now;
  cachedGoogleCseItems = parseGoogleCseHptSearchJson(payload, now);
  return cachedGoogleCseItems;
}

async function fetchOptionalMetaPageMentions(now: number): Promise<HptCompanyItem[]> {
  const pageId = process.env.META_PAGE_ID?.trim();
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) return [];

  const fields = 'id,message,story,created_time,permalink_url,from';
  const base = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}`;
  const [taggedRes, visitorRes] = await Promise.allSettled([
    fetchJsonWithTimeout<MetaGraphPostsPayload>(
      `${base}/tagged?fields=${fields}&limit=15&access_token=${encodeURIComponent(token)}`,
      { timeoutMs: 7_000, retries: 0, userAgent: DEFAULT_BROWSER_UA },
    ),
    fetchJsonWithTimeout<MetaGraphPostsPayload>(
      `${base}/visitor_posts?fields=${fields}&limit=15&access_token=${encodeURIComponent(token)}`,
      { timeoutMs: 7_000, retries: 0, userAgent: DEFAULT_BROWSER_UA },
    ),
  ]);

  const out: HptCompanyItem[] = [];
  if (taggedRes.status === 'fulfilled') {
    out.push(...parseMetaPageMentionsJson(taggedRes.value, pageId, now));
  }
  if (visitorRes.status === 'fulfilled') {
    out.push(...parseMetaPageMentionsJson(visitorRes.value, pageId, now));
  }
  return out;
}

function resolvePublicTelegramChannels(): string[] {
  const extra = (process.env.HPT_TELEGRAM_CHANNELS ?? '')
    .split(',')
    .map((h) => h.replace(/^@+/, '').trim())
    .filter((h) => /^[a-zA-Z0-9_]{4,64}$/.test(h));
  return [...new Set([...DEFAULT_HPT_TELEGRAM_CHANNELS, ...extra])].slice(0, 12);
}

export async function fetchHptCompanyIntelligence(
  previous?: HptCompanyIntelSnapshot | null,
): Promise<HptCompanyIntelSnapshot> {
  const now = Date.now();
  const tgChannels = resolvePublicTelegramChannels();

  const [stockRes, cfNewsRes, cfEventsRes, baoMoiRes, redditRes, searxngRes, cseRes, metaRes, ...restResults] =
    await Promise.allSettled([
      fetchHptUpcomStockAndFundamentals(now),
      fetchTextWithTimeout(CAFEF_HPT_NEWS_URL, {
        timeoutMs: 8_000,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Referer: 'https://cafef.vn/' },
      }),
      fetchTextWithTimeout(CAFEF_HPT_EVENTS_URL, {
        timeoutMs: 8_000,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Referer: 'https://cafef.vn/' },
      }),
      fetchTextWithTimeout(BAOMOI_HPT_SEARCH_URL, {
        timeoutMs: 7_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
      }),
      fetchJsonWithTimeout<RedditSearchPayload>(REDDIT_HPT_SEARCH_URL, {
        timeoutMs: 6_500,
        retries: 0,
        userAgent: 'WorldMonitor-HPT-Intel/1.0',
      }),
      fetchOptionalSearxngMentions(now),
      fetchOptionalGoogleCseSocial(now),
      fetchOptionalMetaPageMentions(now),
      ...HPT_EXTERNAL_FEEDS.map(async (feed) => {
        const { text } = await fetchTextWithTimeout(feed.url, {
          timeoutMs: 7_500,
          retries: 0,
          userAgent: DEFAULT_BROWSER_UA,
        });
        return parseHptExternalRss(text, feed, now);
      }),
      ...tgChannels.map(async (handle) => {
        const { text } = await fetchTextWithTimeout(`https://t.me/s/${encodeURIComponent(handle)}`, {
          timeoutMs: 6_500,
          retries: 0,
          userAgent: DEFAULT_BROWSER_UA,
        });
        return parseTelegramPublicChannelHtml(text, handle, now);
      }),
    ]);

  let sourceCount = 0;
  const rawCollected: HptCompanyItem[] = [];

  if (cfNewsRes.status === 'fulfilled') {
    const items = parseCafeFHptDisclosuresHtml(cfNewsRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  if (cfEventsRes.status === 'fulfilled') {
    const items = parseCafeFHptDisclosuresHtml(cfEventsRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  if (baoMoiRes.status === 'fulfilled') {
    const items = parseBaoMoiHptSearchHtml(baoMoiRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  if (redditRes.status === 'fulfilled') {
    const items = parseRedditHptSearchJson(redditRes.value, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  if (searxngRes.status === 'fulfilled' && searxngRes.value.length > 0) {
    sourceCount += 1;
    rawCollected.push(...searxngRes.value);
  }
  if (cseRes.status === 'fulfilled' && cseRes.value.length > 0) {
    sourceCount += 1;
    rawCollected.push(...cseRes.value);
  }
  if (metaRes.status === 'fulfilled' && metaRes.value.length > 0) {
    sourceCount += 1;
    rawCollected.push(...metaRes.value);
  }
  for (const r of restResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sourceCount += 1;
      rawCollected.push(...r.value);
    }
  }

  // Final safety guard: never allow hpt.vn, HPT self-authored social posts, static directories, or recruitment links into the stream
  const isCleanExternalItem = (it: HptCompanyItem): boolean =>
    !it.url.toLowerCase().includes('hpt.vn') &&
    !HPT_RECRUITMENT_DOMAIN_RE.test(it.url) &&
    !HPT_STATIC_DIRECTORY_URL_RE.test(it.url) &&
    !HPT_RECRUITMENT_NOISE_RE.test(it.title) &&
    !HPT_FALSE_POSITIVE_NOISE_RE.test(`${it.title} ${it.url}`) &&
    !isHptSelfSocialPost(it.url, it.title, '', it.source);

  const cleanExternalOnly = rawCollected.filter(isCleanExternalItem);

  const normalizeDedupKey = (title: string): string =>
    title
      .toLowerCase()
      .replace(/\s*[-|•]\s*(?:facebook|linkedin|tiktok|threads|fireant|vietstock|cafef|24hmoney)\s*$/i, '')
      .replace(/\s*(?:\.{2,}|…)\s*$/, '')
      .replace(/^(?:forbes|htv(?:\s*-\s*đài\s+truyền\s+hình\s+tp\.?\s*hcm)?)\s*[-.:]+\s*/i, '')
      .replace(/^hpt\s*[-:]\s*/i, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 38);

  const isWrappedRedirect = (url: string): boolean => url.includes('news.google.com/rss/articles/');

  const byKey = new Map<string, HptCompanyItem>();
  for (const item of cleanExternalOnly) {
    const normTitle = normalizeDedupKey(item.title);
    const existing = byKey.get(normTitle);
    if (!existing) {
      byKey.set(normTitle, item);
      continue;
    }
    const preferFiling = item.category === 'exchange_filing' && existing.category !== 'exchange_filing';
    const preferDirectUrl =
      existing.category === item.category &&
      isWrappedRedirect(existing.url) &&
      !isWrappedRedirect(item.url);
    if (preferFiling || preferDirectUrl) {
      byKey.set(normTitle, {
        ...item,
        publishedAt:
          item.dateLabel === 'Không rõ ngày' ? existing.publishedAt : item.publishedAt,
        dateLabel:
          item.dateLabel === 'Không rõ ngày' ? existing.dateLabel : item.dateLabel,
      });
    }
  }

  let deduped = [...byKey.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 60);

  if (deduped.length === 0 && previous?.items.length) {
    deduped = previous.items.filter(isCleanExternalItem);
  }

  await enrichTopDisclosuresWithPdfLinks(deduped);
  const enriched = await maybeEnrichHptWithGroqSentiment(deduped);

  const stock =
    stockRes.status === 'fulfilled' && stockRes.value
      ? stockRes.value
      : (previous?.stock ?? null);

  if (!stock && enriched.items.length === 0) {
    throw new Error('All independent external HPT intelligence & UPCoM quote sources failed');
  }

  return {
    stock,
    items: enriched.items,
    sourceCount: Math.max(sourceCount, 1),
    aiSentimentEnabled: enriched.aiEnabled,
    updatedAt: now,
  };
}

