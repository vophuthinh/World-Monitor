import { XMLParser } from 'fast-xml-parser';
import type { HptCompanyItem, HptFundamentals } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../../lib/http';
import { decodeHtmlEntities } from '../polymarket-news';
import { ExternalRssFeedDef, HPT_RECRUITMENT_DOMAIN_RE, HPT_TAX_CODE, classifyHptExternalItem, isAuthenticHptMention } from './config';

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
        pdfAttachmentCache.set(item.url, foundPdf);
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

  for (const entry of entries.slice(0, 18)) {
    const fullTitle = decodeHtmlEntities(String(entry?.title?.['#text'] ?? entry?.title ?? ''));
    const rawDesc = decodeHtmlEntities(
      String(entry?.description ?? entry?.summary ?? entry?.content ?? ''),
    );
    const atomHref = entry?.link?.['@_href'];
    const rawLink = String(atomHref ?? entry?.link ?? '').trim();
    if (!fullTitle || !rawLink.startsWith('http')) continue;

    const link = rawLink.includes('bing.com/news/apiclick') ? extractBingRealUrl(rawLink) : rawLink;
    if (link.toLowerCase().includes('hpt.vn') || HPT_RECRUITMENT_DOMAIN_RE.test(link)) continue;

    const parts = fullTitle.split(/\s+-\s+/);
    const publisher =
      parts.length >= 2 && parts[parts.length - 1].length <= 42
        ? parts[parts.length - 1].trim()
        : String(entry?.['News:Source'] ?? feed.name);
    if (/hpt\.vn/i.test(publisher)) continue;

    const cleanTitle =
      parts.length >= 2 && parts[parts.length - 1].length <= 42
        ? parts.slice(0, -1).join(' - ').trim()
        : fullTitle;

    if (!isAuthenticHptMention(cleanTitle, rawDesc, link, customKeywords)) {
      continue;
    }

    const rawDate = String(entry?.pubDate ?? entry?.published ?? entry?.updated ?? '');
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
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
// 3. Groq LPU AI Verification + Sentiment Analysis (Cached per Article ID)
// ============================================================================

