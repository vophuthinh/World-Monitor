import { parseFeedDate } from '../../lib/feed-date';
import { XMLParser } from 'fast-xml-parser';
import type { HptCompanyItem, HptFundamentals } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../../lib/http';
import { decodeHtmlEntities } from '../polymarket-news';
import { setBounded } from '../../lib/bounded-map';
import { ExternalRssFeedDef, HPT_RECRUITMENT_DOMAIN_RE, HPT_TAX_CODE, classifyHptExternalItem, isAuthenticHptMention, isHptSelfSocialPost } from './config';

export interface RedditSearchPayload {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        subreddit?: string;
        title?: string;
        selftext?: string;
        permalink?: string;
        url?: string;
        created_utc?: number;
      };
    }>;
  };
}

export function parseRedditHptSearchJson(
  payload: RedditSearchPayload,
  fallbackNow = Date.now(),
  customKeywords: readonly string[] = [],
): HptCompanyItem[] {
  const children = payload?.data?.children ?? [];
  const out: HptCompanyItem[] = [];

  for (const child of children) {
    const post = child?.data;
    if (!post?.title) continue;
    const title = decodeHtmlEntities(post.title.trim());
    const selftext = decodeHtmlEntities((post.selftext ?? '').slice(0, 320));
    const url = post.permalink
      ? `https://www.reddit.com${post.permalink}`
      : String(post.url ?? '');
    if (!url.startsWith('http')) continue;

    if (!isAuthenticHptMention(title, selftext, url, customKeywords)) continue;

    const source = post.subreddit ? `Reddit · r/${post.subreddit}` : 'Reddit';
    const classified = classifyHptExternalItem(title, source, url, 'press_social', selftext);
    const publishedAt =
      post.created_utc && Number.isFinite(post.created_utc)
        ? Math.round(post.created_utc * 1000)
        : fallbackNow;

    out.push({
      id: `hpt-rd:${post.id ?? url}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source,
      publishedAt,
      url,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

export function parseTelegramPublicChannelHtml(
  html: string,
  channelHandle: string,
  fallbackNow = Date.now(),
  customKeywords: readonly string[] = [],
): HptCompanyItem[] {
  if (!html) return [];
  const handle = channelHandle.replace(/^@+/, '').trim() || channelHandle;
  const out: HptCompanyItem[] = [];
  const blocks = [...html.matchAll(/<div[^>]+class=["'][^"']*tgme_widget_message\b[^"']*["'][^>]*data-post=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*tgme_widget_message_wrap|$)/gi)];

  for (const b of blocks) {
    const postSlug = b[1].trim();
    const inner = b[2];
    const textMatch = inner.match(/<div[^>]+class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;

    const plain = decodeHtmlEntities(
      textMatch[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    if (!plain || plain.length < 12) continue;

    const url = `https://t.me/${postSlug}`;
    if (!isAuthenticHptMention(plain, '', url, customKeywords)) continue;

    const timeMatch = inner.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const parsedTs = timeMatch ? Date.parse(timeMatch[1]) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const title = plain.length > 150 ? `${plain.slice(0, 147).trim()}...` : plain;
    const source = `Telegram · @${handle}`;
    const classified = classifyHptExternalItem(title, source, url, 'press_social', plain);

    out.push({
      id: `hpt-tg:${postSlug}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source,
      publishedAt,
      url,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

// ============================================================================
// 2. Simplize Valuation Fundamentals + CafeF Filings + BaoMoi + Bing/GNews RSS
// ============================================================================

export interface SimplizeSummaryPayload {
  data?: {
    peRatio?: number;
    pbRatio?: number;
    marketCap?: number;
    freeFloatRate?: number;
    dividendYieldCurrent?: number;
    pricePctChgYtd?: number;
    pricePctChg1y?: number;
    priceCeiling?: number;
    priceFloor?: number;
    priceReferrance?: number;
    taSignal1d?: string;
  };
}

export function normalizeSimplizeHptSummary(
  payload: SimplizeSummaryPayload,
): HptFundamentals | undefined {
  const d = payload?.data;
  if (!d || typeof d !== 'object') return undefined;

  const numOrUndef = (v: unknown, scale = 1, digits = 2): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? Number((n / scale).toFixed(digits)) : undefined;
  };

  return {
    taxCode: HPT_TAX_CODE,
    peRatio: numOrUndef(d.peRatio),
    pbRatio: numOrUndef(d.pbRatio),
    marketCapBillionVnd: numOrUndef(d.marketCap, 1_000_000_000, 1),
    freeFloatPct: numOrUndef(d.freeFloatRate, 1, 1),
    dividendYieldPct: numOrUndef(d.dividendYieldCurrent, 1, 2),
    ytdChangePct: numOrUndef(d.pricePctChgYtd, 1, 2),
    oneYearChangePct: numOrUndef(d.pricePctChg1y, 1, 2),
    ceilingThousandVnd: numOrUndef(d.priceCeiling, 1_000, 1),
    floorThousandVnd: numOrUndef(d.priceFloor, 1_000, 1),
    refThousandVnd: numOrUndef(d.priceReferrance, 1_000, 1),
    taSignal: d.taSignal1d ? String(d.taSignal1d).toUpperCase() : undefined,
  };
}

export function parseVnDateString(dateStr: string, fallbackNow: number): { ts: number; dateLabel?: string } {
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return { ts: fallbackNow };
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  const hh = (m[4] ?? '08').padStart(2, '0');
  const mm = (m[5] ?? '00').padStart(2, '0');
  const parsed = Date.parse(`${year}-${month}-${day}T${hh}:${mm}:00+07:00`);
  return {
    ts: Number.isFinite(parsed) ? parsed : fallbackNow,
    dateLabel: `${day}/${month}/${year}`,
  };
}

export function parseCafeFHptDisclosuresHtml(
  html: string,
  fallbackNow = Date.now(),
): HptCompanyItem[] {
  if (!html) return [];
  const out: HptCompanyItem[] = [];
  const liBlocks = html.match(/<li\b[\s\S]*?<\/li>/gi) ?? [];

  for (const li of liBlocks) {
    const timeMatch = li.match(/class=["']timeTitle["'][^>]*>([\s\S]*?)<\/span>/i);
    const linkMatch = li.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].split('?')[0].trim();
    const title = decodeHtmlEntities(linkMatch[2]);
    if (!title || title.length < 10) continue;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : `https://cafef.vn${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
    if (fullUrl.toLowerCase().includes('hpt.vn')) continue;

    const { ts, dateLabel } = parseVnDateString(timeMatch?.[1] ?? '', fallbackNow);
    const classified = classifyHptExternalItem(title, 'HNX / UBCKNN', fullUrl, 'exchange_filing');

    out.push({
      id: `hpt-cbtt:${fullUrl}`,
      title,
      category: 'exchange_filing',
      badge: classified.badge,
      source: 'HNX / UBCKNN (qua CafeF)',
      publishedAt: ts,
      dateLabel,
      url: fullUrl,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

export function parseBaoMoiHptSearchHtml(html: string, fallbackNow = Date.now()): HptCompanyItem[] {
  if (!html) return [];
  const matches = [
    ...html.matchAll(
      /<a[^>]+href=["'](\/[^"']+-c\d+\.epi)["'][^>]*title=["']([^"']+)["']/gi,
    ),
  ];

  const seenUrls = new Set<string>();
  const out: HptCompanyItem[] = [];

  for (const m of matches) {
    const fullUrl = `https://baomoi.com${m[1]}`;
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    const title = decodeHtmlEntities(m[2]);
    if (!isAuthenticHptMention(title, '', fullUrl)) continue;

    const classified = classifyHptExternalItem(title, 'Báo Mới', fullUrl, 'press_social');
    out.push({
      id: `hpt-bm:${fullUrl}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source: 'Báo Mới',
      publishedAt: fallbackNow - out.length * 7_200_000,
      url: fullUrl,
      sentiment: classified.sentiment,
    });

    if (out.length >= 10) break;
  }

  return out;
}

export const pdfAttachmentCache = new Map<string, string | null>();

export async function enrichTopDisclosuresWithPdfLinks(items: HptCompanyItem[]): Promise<void> {
  const candidates = items
    .filter((i) => i.category === 'exchange_filing' && i.url.includes('cafef.vn/du-lieu/'))
    .slice(0, 6);

  await Promise.allSettled(
    candidates.map(async (item) => {
      if (pdfAttachmentCache.has(item.url)) {
        const cached = pdfAttachmentCache.get(item.url);
        if (cached) item.pdfUrl = cached;
        return;
      }
      try {
        const { text } = await fetchTextWithTimeout(item.url, {
          timeoutMs: 5_500,
          retries: 0,
          userAgent: DEFAULT_BROWSER_UA,
        });
        const pdfMatch = text.match(/https?:\/\/[^"'\s>]+\.pdf/i);
        const foundPdf = pdfMatch?.[0] ?? null;
        setBounded(pdfAttachmentCache, item.url, foundPdf, 500);
        if (foundPdf) {
          item.pdfUrl = foundPdf;
        }
      } catch {
        // Ignore transient timeout
      }
    }),
  );
}

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

export function extractBingRealUrl(rawLink: string): string {
  try {
    const parsed = new URL(rawLink);
    const embedded = parsed.searchParams.get('url');
    if (embedded && embedded.startsWith('http')) return embedded;
  } catch {
    // Keep rawLink
  }
  return rawLink;
}

export function parseHptExternalRss(
  xml: string,
  feed: ExternalRssFeedDef,
  fallbackNow: number,
  customKeywords: readonly string[] = [],
): HptCompanyItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const out: HptCompanyItem[] = [];

  for (const entry of entries.slice(0, 30)) {
    const fullTitle = decodeHtmlEntities(String(entry?.title?.['#text'] ?? entry?.title ?? ''));
    const rawDesc = decodeHtmlEntities(
      String(entry?.description ?? entry?.summary ?? entry?.content ?? ''),
    );
    const atomHref = entry?.link?.['@_href'];
    const rawLink = String(atomHref ?? entry?.link ?? '').trim();
    if (!fullTitle || !rawLink.startsWith('http')) continue;

    const link = rawLink.includes('bing.com/news/apiclick') ? extractBingRealUrl(rawLink) : rawLink;
    if (link.toLowerCase().includes('hpt.vn') || HPT_RECRUITMENT_DOMAIN_RE.test(link)) continue;

    const rssSourceTag = decodeHtmlEntities(
      String(entry?.source?.['#text'] ?? entry?.source ?? ''),
    ).trim();
    const parts = fullTitle.split(/\s+-\s+/);
    const publisher =
      parts.length >= 2 && parts[parts.length - 1].length <= 42
        ? parts[parts.length - 1].trim()
        : rssSourceTag || String(entry?.['News:Source'] ?? feed.name);
    if (/hpt\.vn/i.test(publisher)) continue;

    const cleanTitle =
      parts.length >= 2 && parts[parts.length - 1].length <= 42
        ? parts.slice(0, -1).join(' - ').trim()
        : fullTitle;

    if (!isAuthenticHptMention(cleanTitle, rawDesc, link, customKeywords, publisher)) {
      continue;
    }

    const rawDate = String(entry?.pubDate ?? entry?.published ?? entry?.updated ?? '');
    const parsedTs = rawDate ? parseFeedDate(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyHptExternalItem(
      cleanTitle,
      publisher,
      link,
      feed.defaultCategory,
      rawDesc,
    );

    out.push({
      id: `hpt-ext:${link}`,
      title: cleanTitle,
      category: classified.category,
      badge: classified.badge,
      source: publisher,
      publishedAt,
      url: link,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

// ============================================================================
// 3. Local SearXNG Metasearch (?format=json) & Optional Free-Tier Official APIs
// ============================================================================

export interface SearxngSearchPayload {
  query?: string;
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    engine?: string;
    engines?: string[];
    publishedDate?: string | null;
    pubdate?: string | null;
  }>;
}

function parseSearxngResultTimestamp(
  rawDate: string | null | undefined,
  snippet: string,
  fallbackNow: number,
): { publishedAt: number; dateLabel?: string } {
  if (rawDate) {
    const parsed = parseFeedDate(rawDate);
    if (Number.isFinite(parsed) && parsed > 946_684_800_000 && parsed <= fallbackNow + 86_400_000) {
      return { publishedAt: parsed };
    }
  }

  const head = snippet.slice(0, 80);

  const relVn = head.match(/(\d+)\s*(phút|giờ|ngày|tuần|tháng)\s+trước/i);
  if (relVn) {
    const n = Number(relVn[1]);
    const unit = relVn[2].toLowerCase();
    const mult =
      unit === 'phút'
        ? 60_000
        : unit === 'giờ'
          ? 3_600_000
          : unit === 'ngày'
            ? 86_400_000
            : unit === 'tuần'
              ? 7 * 86_400_000
              : 30 * 86_400_000;
    return { publishedAt: fallbackNow - n * mult };
  }

  const relEn = head.match(/(\d+)\s*(minute|hour|day|week|month)s?\s+ago/i);
  if (relEn) {
    const n = Number(relEn[1]);
    const unit = relEn[2].toLowerCase();
    const mult =
      unit === 'minute'
        ? 60_000
        : unit === 'hour'
          ? 3_600_000
          : unit === 'day'
            ? 86_400_000
            : unit === 'week'
              ? 7 * 86_400_000
              : 30 * 86_400_000;
    return { publishedAt: fallbackNow - n * mult };
  }

  const vnThg = head.match(/\b(\d{1,2})\s+thg\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (vnThg) {
    const day = vnThg[1].padStart(2, '0');
    const month = vnThg[2].padStart(2, '0');
    const year = vnThg[3];
    const parsed = Date.parse(`${year}-${month}-${day}T08:00:00+07:00`);
    if (Number.isFinite(parsed)) {
      return { publishedAt: parsed, dateLabel: `${day}/${month}/${year}` };
    }
  }

  const vnSlash = head.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (vnSlash) {
    const parsed = parseVnDateString(vnSlash[0], fallbackNow);
    if (parsed.dateLabel) {
      return { publishedAt: parsed.ts, dateLabel: parsed.dateLabel };
    }
  }

  const enDate = head.match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})\b/i,
  );
  if (enDate) {
    const parsed = Date.parse(enDate[1]);
    if (Number.isFinite(parsed)) {
      return { publishedAt: parsed };
    }
  }

  // Undated archival web result: rank below recent dated news rather than faking a breaking timestamp
  return {
    publishedAt: fallbackNow - 30 * 86_400_000,
    dateLabel: 'Không rõ ngày',
  };
}

function formatSearxngSourceLabel(url: string, engines?: string[], engine?: string): string {
  let host = 'Web';
  try {
    host = new URL(url).hostname.replace(/^(?:www|m|vn|web)\./i, '').toLowerCase();
  } catch {
    // Keep fallback host
  }

  const engineList =
    engines && engines.length > 0
      ? engines.slice(0, 2).join('+')
      : engine
        ? String(engine)
        : '';
  const suffix = engineList ? `SearXNG · ${engineList}` : 'SearXNG';

  if (host.includes('facebook.com') || host.includes('fb.com')) return `Facebook (${suffix})`;
  if (host.includes('linkedin.com')) return `LinkedIn (${suffix})`;
  if (host.includes('tiktok.com')) return `TikTok (${suffix})`;
  if (host.includes('threads.net') || host.includes('threads.com')) return `Threads (${suffix})`;
  return `${host} (${suffix})`;
}

// Require explicit 'HPT' or tax code '0301447436' in the article title OR decoded URL slug so SearXNG never pulls tangential executive quotes, peer-table PDFs, or unrelated tickers
const SEARXNG_TITLE_OR_SLUG_HPT_RE = /\b(hpt|0301447436)\b/i;

function safeDecodeUrlForMatch(rawUrl: string): string {
  try {
    return decodeURIComponent(rawUrl);
  } catch {
    return rawUrl;
  }
}

function isValidSearxngResultUrl(rawUrl: string): boolean {
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) return false;
  // Reject malformed relative redirects, Google Knowledge Panel goto cards, and generic unnamed PDF uploads
  if (/^https?:\/\/\/+/i.test(rawUrl)) return false;
  if (/google\.[a-z.]+\/(?:goto|url)\?/i.test(rawUrl)) return false;
  if (/\/no-name-\d+\.pdf$/i.test(rawUrl)) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function parseSearxngHptSearchJson(
  payload: SearxngSearchPayload,
  fallbackNow = Date.now(),
  customKeywords: readonly string[] = [],
): HptCompanyItem[] {
  const entries = payload?.results ?? [];
  const seenUrls = new Set<string>();
  const out: HptCompanyItem[] = [];

  for (const entry of entries.slice(0, 30)) {
    const link = String(entry?.url ?? '').trim();
    const title = decodeHtmlEntities(String(entry?.title ?? '').trim());
    const content = decodeHtmlEntities(String(entry?.content ?? '').trim());
    if (!title || !isValidSearxngResultUrl(link)) continue;
    if (seenUrls.has(link)) continue;
    seenUrls.add(link);

    const decodedLink = safeDecodeUrlForMatch(link);
    if (customKeywords.length === 0 && !SEARXNG_TITLE_OR_SLUG_HPT_RE.test(`${title} ${decodedLink}`)) {
      continue;
    }

    const source = formatSearxngSourceLabel(link, entry.engines, entry.engine);
    if (!isAuthenticHptMention(title, content, link, customKeywords, source)) continue;

    const { publishedAt, dateLabel } = parseSearxngResultTimestamp(
      entry.publishedDate ?? entry.pubdate,
      content,
      fallbackNow,
    );
    const classified = classifyHptExternalItem(title, source, link, 'press_social', content);

    out.push({
      id: `hpt-sx:${link}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source,
      publishedAt,
      dateLabel,
      url: link,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

export interface SerperSearchPayload {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
  news?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    source?: string;
  }>;
}

function formatSerperSourceLabel(url: string, explicitSource?: string): string {
  let host = 'Web';
  try {
    host = new URL(url).hostname.replace(/^(?:www|m|vn|web)\./i, '').toLowerCase();
  } catch {
    // Keep fallback host
  }
  if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook (Serper Google)';
  if (host.includes('linkedin.com')) return 'LinkedIn (Serper Google)';
  if (host.includes('tiktok.com')) return 'TikTok (Serper Google)';
  if (host.includes('threads.net') || host.includes('threads.com')) return 'Threads (Serper Google)';
  return `${explicitSource?.trim() || host} (Serper Google)`;
}

export function parseSerperHptSearchJson(
  payload: SerperSearchPayload,
  fallbackNow = Date.now(),
  customKeywords: readonly string[] = [],
): HptCompanyItem[] {
  const entries = [...(payload?.organic ?? []), ...(payload?.news ?? [])];
  const seenUrls = new Set<string>();
  const out: HptCompanyItem[] = [];

  for (const entry of entries.slice(0, 20)) {
    const link = String(entry?.link ?? '').trim();
    const title = decodeHtmlEntities(String(entry?.title ?? '').trim());
    const snippet = decodeHtmlEntities(String(entry?.snippet ?? '').trim());
    if (!title || !isValidSearxngResultUrl(link)) continue;
    if (seenUrls.has(link)) continue;
    seenUrls.add(link);

    if (
      customKeywords.length === 0 &&
      !SEARXNG_TITLE_OR_SLUG_HPT_RE.test(`${title} ${safeDecodeUrlForMatch(link)}`)
    ) {
      continue;
    }

    const explicitSrc = 'source' in entry && typeof entry.source === 'string' ? entry.source : undefined;
    const source = formatSerperSourceLabel(link, explicitSrc);
    if (!isAuthenticHptMention(title, snippet, link, customKeywords, source)) continue;

    const rawDate = entry?.date?.trim() ?? '';
    const { publishedAt, dateLabel } = parseSearxngResultTimestamp(
      rawDate,
      rawDate ? `${rawDate} — ${snippet}` : snippet,
      fallbackNow,
    );
    const classified = classifyHptExternalItem(title, source, link, 'press_social', snippet);

    out.push({
      id: `hpt-sp:${link}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source,
      publishedAt,
      dateLabel,
      url: link,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

export interface GoogleCseSearchPayload {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    displayLink?: string;
    pagemap?: {
      metatags?: Array<Record<string, string | undefined>>;
    };
  }>;
}

export function parseGoogleCseHptSearchJson(
  payload: GoogleCseSearchPayload,
  fallbackNow = Date.now(),
): HptCompanyItem[] {
  const entries = payload?.items ?? [];
  const out: HptCompanyItem[] = [];

  for (const entry of entries) {
    const link = String(entry?.link ?? '').trim();
    const title = decodeHtmlEntities(String(entry?.title ?? '').trim());
    const snippet = decodeHtmlEntities(String(entry?.snippet ?? '').trim());
    if (!title || !isValidSearxngResultUrl(link)) continue;
    if (!SEARXNG_TITLE_OR_SLUG_HPT_RE.test(`${title} ${safeDecodeUrlForMatch(link)}`)) continue;

    const host = (entry?.displayLink ?? '').toLowerCase();
    const source = host.includes('facebook.com') || host.includes('fb.com')
      ? 'Facebook (Google Index)'
      : host.includes('linkedin.com')
        ? 'LinkedIn (Google Index)'
        : host.includes('tiktok.com')
          ? 'TikTok (Google Index)'
          : host.includes('threads.net') || host.includes('threads.com')
            ? 'Threads (Google Index)'
            : entry?.displayLink || 'Google Search';
    if (!isAuthenticHptMention(title, snippet, link, [], source)) continue;

    const metaTag = entry?.pagemap?.metatags?.[0];
    const pubIso =
      metaTag?.['article:published_time'] ??
      metaTag?.['og:updated_time'] ??
      metaTag?.['date'];
    const parsedTs = pubIso ? Date.parse(pubIso) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyHptExternalItem(title, source, link, 'press_social', snippet);
    out.push({
      id: `hpt-cse:${link}`,
      title,
      category: classified.category,
      badge: classified.badge,
      source,
      publishedAt,
      url: link,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

export interface MetaGraphPostsPayload {
  data?: Array<{
    id?: string;
    message?: string;
    story?: string;
    created_time?: string;
    permalink_url?: string;
    from?: {
      id?: string;
      name?: string;
    };
  }>;
}

export function parseMetaPageMentionsJson(
  payload: MetaGraphPostsPayload,
  ownPageId: string,
  fallbackNow = Date.now(),
): HptCompanyItem[] {
  const posts = payload?.data ?? [];
  const cleanOwnId = ownPageId.trim();
  const out: HptCompanyItem[] = [];

  for (const post of posts) {
    // Skip self-authored posts by HPT's own Fanpage or sister HPT pages (keep strictly external visitor/tagged mentions)
    if (cleanOwnId && post?.from?.id && post.from.id === cleanOwnId) continue;

    const rawText = decodeHtmlEntities(String(post?.message ?? post?.story ?? '').replace(/\s+/g, ' ').trim());
    if (!rawText || rawText.length < 10) continue;
    if (HPT_RECRUITMENT_DOMAIN_RE.test(rawText)) continue;

    const postId = String(post?.id ?? '').trim();
    const url =
      post?.permalink_url && post.permalink_url.startsWith('http')
        ? post.permalink_url
        : postId
          ? `https://www.facebook.com/${postId}`
          : '';
    if (!url) continue;
    if (isHptSelfSocialPost(url, rawText, '', post?.from?.name ?? 'Facebook')) continue;

    const title = rawText.length > 150 ? `${rawText.slice(0, 147).trim()}...` : rawText;
    const author = post?.from?.name ? `Facebook · ${post.from.name}` : 'Facebook · Tag Fanpage HPT';
    const parsedTs = post?.created_time ? Date.parse(post.created_time) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyHptExternalItem(title, author, url, 'press_social', rawText);
    out.push({
      id: `hpt-fb:${postId || url}`,
      title,
      category: 'press_social',
      badge: 'FACEBOOK · TAG FANPAGE',
      source: author,
      publishedAt,
      url,
      sentiment: classified.sentiment,
    });
  }

  return out;
}

