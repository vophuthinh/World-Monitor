import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataCrossCheckSide, HptCompanyIntelSnapshot, HptCompanyItem, HptFundamentals, HptStockSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { fetchVndRatios } from './markets/cross-check';
import { maybeEnrichHptWithGroqSentiment } from './hpt/ai';
import { BAOMOI_HPT_SEARCH_URL, CAFEF_HPT_EVENTS_URL, CAFEF_HPT_NEWS_URL, DEFAULT_HPT_TELEGRAM_CHANNELS, HPT_EXTERNAL_FEEDS, HPT_FALSE_POSITIVE_NOISE_RE, HPT_HQ_LAT, HPT_HQ_LON, HPT_RECRUITMENT_DOMAIN_RE, HPT_RECRUITMENT_NOISE_RE, HPT_STATIC_DIRECTORY_URL_RE, HPT_TAX_CODE, REDDIT_HPT_SEARCH_URL, SIMPLIZE_HPT_SUMMARY_URL, areSameHptStory, isHptSelfSocialPost } from './hpt/config';
import { GoogleCseSearchPayload, MetaGraphPostsPayload, RedditSearchPayload, SearxngSearchPayload, SerperSearchPayload, SimplizeSummaryPayload, enrichTopDisclosuresWithPdfLinks, normalizeSimplizeHptSummary, parseBaoMoiHptSearchHtml, parseCafeFHptDisclosuresHtml, parseGoogleCseHptSearchJson, parseHptExternalRss, parseMetaPageMentionsJson, parseRedditHptSearchJson, parseSearxngHptSearchJson, parseSerperHptSearchJson, parseTelegramPublicChannelHtml } from './hpt/sources';

export * from './hpt/config';
export * from './hpt/sources';
export * from './hpt/ai';

/**
 * Simplize's HPT valuation is frozen at end-2023 (old price, old share count), so market cap, P/B and
 * P/E come from VNDirect only. A figure we cannot date or that is over 400 days old is not shown.
 */
export function applyHptValuation(
  base: HptFundamentals,
  ratios: ReadonlyMap<string, DataCrossCheckSide>,
  now = Date.now(),
): HptFundamentals {
  const { peRatio: _pe, pbRatio: _pb, marketCapBillionVnd: _cap, ...rest } = base;
  const fresh = (key: string) => {
    const side = ratios.get(key);
    const asOf = side?.asOf ? Date.parse(side.asOf) : Number.NaN;
    return side && side.value > 0 && now - asOf <= 400 * 86_400_000 ? side : undefined;
  };
  const cap = fresh('MARKETCAP');
  const pb = fresh('PRICE_TO_BOOK');
  const pe = fresh('PRICE_TO_EARNINGS');
  const peAsOf = ratios.get('PRICE_TO_EARNINGS')?.asOf;
  return {
    ...rest,
    ...(cap ? { marketCapBillionVnd: Number((cap.value / 1e9).toFixed(1)), valuationAsOf: cap.asOf } : {}),
    ...(pb ? { pbRatio: Number(pb.value.toFixed(2)) } : {}),
    ...(pe ? { peRatio: Number(pe.value.toFixed(2)) } : {}),
    ...(peAsOf ? { peAsOf } : {}),
  };
}

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

  const simplize =
    simpRes.status === 'fulfilled' ? normalizeSimplizeHptSummary(simpRes.value) : { taxCode: HPT_TAX_CODE as '0301447436' };
  const ratios = await fetchVndRatios('HPT').catch(() => new Map<string, DataCrossCheckSide>());
  const fundamentals = simplize ? applyHptValuation(simplize, ratios, now) : simplize;

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
        priceKind: 'trade',
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
      priceKind: 'reference',
      sparkline: [fundamentals.refThousandVnd],
      fundamentals,
      hqLat: HPT_HQ_LAT,
      hqLon: HPT_HQ_LON,
      updatedAt: now,
    };
  }

  return null;
}

// Optional Serper.dev Google SERP JSON API (`SERPER_API_KEY`)
// Disk-cached & throttled to 1 query per 60m (<= 24 credits/day -> 100+ days on Serper's 2,500 free-tier pool, surviving restarts)
const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_MIN_INTERVAL_MS = 60 * 60_000;
const SERPER_CACHE_PATH = resolve(process.cwd(), '.cache', 'serper-hpt.json');

interface SerperDiskCacheState {
  lastFetchedAt: number;
  nextSlot: number;
  slots: Record<string, HptCompanyItem[]>;
  slotFetchedAt: Record<string, number>;
}

interface OptionalSearchResult {
  items: HptCompanyItem[];
  freshItems: HptCompanyItem[];
}

let serperCacheState: SerperDiskCacheState | null = null;

function loadSerperCacheState(): SerperDiskCacheState {
  if (serperCacheState) return serperCacheState;
  try {
    if (existsSync(SERPER_CACHE_PATH)) {
      const parsed = JSON.parse(readFileSync(SERPER_CACHE_PATH, 'utf8')) as Partial<SerperDiskCacheState>;
      if (parsed && typeof parsed === 'object') {
        serperCacheState = {
          lastFetchedAt: Number(parsed.lastFetchedAt) || 0,
          nextSlot: Number(parsed.nextSlot) || 0,
          slots: parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : {},
          slotFetchedAt: parsed.slotFetchedAt && typeof parsed.slotFetchedAt === 'object' ? parsed.slotFetchedAt : {},
        };
        return serperCacheState;
      }
    }
  } catch {
    // Ignore corrupted cache file
  }
  serperCacheState = { lastFetchedAt: 0, nextSlot: 0, slots: {}, slotFetchedAt: {} };
  return serperCacheState;
}

function saveSerperCacheState(state: SerperDiskCacheState): void {
  try {
    mkdirSync(dirname(SERPER_CACHE_PATH), { recursive: true });
    const tmp = `${SERPER_CACHE_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), 'utf8');
    renameSync(tmp, SERPER_CACHE_PATH);
  } catch (error) {
    console.warn('[hpt] Cannot persist Serper throttle state:', error instanceof Error ? error.message : String(error));
  }
}

function flattenSerperSlots(state: SerperDiskCacheState, freshAfter?: number): HptCompanyItem[] {
  const out: HptCompanyItem[] = [];
  for (const [slot, list] of Object.entries(state.slots)) {
    if (freshAfter !== undefined && (state.slotFetchedAt[slot] ?? 0) <= freshAfter) continue;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (
        item &&
        typeof item.url === 'string' &&
        !/google\.[a-z.]+\/(?:goto|url)\?/i.test(item.url) &&
        !HPT_FALSE_POSITIVE_NOISE_RE.test(`${item.title} ${item.url}`) &&
        !isHptSelfSocialPost(item.url, item.title, '', item.source)
      ) {
        out.push(item);
      }
    }
  }
  return out;
}

const SERPER_HPT_QUERIES: readonly string[] = [
  '(site:facebook.com OR site:linkedin.com/posts OR site:linkedin.com/pulse OR site:threads.net OR site:tiktok.com) -site:facebook.com/HPTVietnamCorp -site:facebook.com/LifeAtHPT -site:linkedin.com/posts/hpt-vietnam-corporation ("Công nghệ Tin học HPT" OR "HPT Cyber Security" OR "cổ phiếu HPT" OR "0301447436")',
  '(site:fireant.vn/bai-viet OR site:f319.com OR site:f247.com OR site:voz.vn OR site:tinhte.vn OR site:spiderum.com) ("cổ phiếu HPT" OR "Công nghệ Tin học HPT" OR "0301447436")',
];

async function fetchOptionalSerperMentions(now: number): Promise<OptionalSearchResult> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return { items: [], freshItems: [] };

  const state = loadSerperCacheState();
  const cached = flattenSerperSlots(state);
  if (state.lastFetchedAt > 0 && now - state.lastFetchedAt < SERPER_MIN_INTERVAL_MS) {
    return { items: cached, freshItems: flattenSerperSlots(state, now - SERPER_MIN_INTERVAL_MS) };
  }

  const slot = state.nextSlot % SERPER_HPT_QUERIES.length;
  const q = SERPER_HPT_QUERIES[slot];

  state.lastFetchedAt = now;
  saveSerperCacheState(state);
  try {
    const payload = await fetchJsonWithTimeout<SerperSearchPayload>(SERPER_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 10 }),
      timeoutMs: 8_000,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });
    const parsed = parseSerperHptSearchJson(payload, now);
    state.nextSlot = slot + 1;
    state.slots[String(slot)] = parsed;
    state.slotFetchedAt[String(slot)] = now;
    saveSerperCacheState(state);
  } catch (error) {
    console.warn('[hpt] Serper search failed:', error instanceof Error ? error.message : String(error));
  }

  return { items: flattenSerperSlots(state), freshItems: flattenSerperSlots(state, now - SERPER_MIN_INTERVAL_MS) };
}

// Local SearXNG multi-engine metasearch (`?format=json` on 127.0.0.1:8888 by default; silently skipped if container is stopped)
// Gentle 15m round-robin (1 single query per 15m = <=4 queries/hour) so upstream engines never rate-limit the local IP
const DEFAULT_SEARXNG_BASE_URL = 'http://127.0.0.1:8888';
const SEARXNG_MIN_INTERVAL_MS = 15 * 60_000;
let lastSearxngFetchAt = 0;
let searxngQueryCursor = 0;
const cachedSearxngBySlot = new Map<number, HptCompanyItem[]>();
const cachedSearxngAtBySlot = new Map<number, number>();

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
// The general-press query appears twice so it runs every other turn (30 min) between the social/forum queries.
const SEARXNG_GENERAL_QUERY = '"Công nghệ Tin học HPT" OR "cổ phiếu HPT" OR "HPT UPCoM"';
const SEARXNG_HPT_QUERIES: readonly string[] = [
  SEARXNG_GENERAL_QUERY,
  'site:facebook.com "Công nghệ Tin học HPT" -site:facebook.com/HPTVietnamCorp -site:facebook.com/LifeAtHPT',
  SEARXNG_GENERAL_QUERY,
  '(site:fireant.vn/bai-viet OR site:f319.com OR site:f247.com OR site:voz.vn OR site:tinhte.vn) ("cổ phiếu HPT" OR "Công nghệ Tin học HPT")',
];

function flattenCachedSearxngItems(freshAfter?: number): HptCompanyItem[] {
  const out: HptCompanyItem[] = [];
  for (const [slot, list] of cachedSearxngBySlot) {
    if (freshAfter !== undefined && (cachedSearxngAtBySlot.get(slot) ?? 0) <= freshAfter) continue;
    out.push(...list);
  }
  return out;
}

async function fetchOptionalSearxngMentions(now: number): Promise<OptionalSearchResult> {
  const baseUrl = resolveSearxngBaseUrl();
  if (!baseUrl) return { items: [], freshItems: [] };
  if (lastSearxngFetchAt > 0 && now - lastSearxngFetchAt < SEARXNG_MIN_INTERVAL_MS) {
    return { items: flattenCachedSearxngItems(), freshItems: flattenCachedSearxngItems(now - SEARXNG_MIN_INTERVAL_MS) };
  }

  const slot = searxngQueryCursor % SEARXNG_HPT_QUERIES.length;
  searxngQueryCursor += 1;
  const q = SEARXNG_HPT_QUERIES[slot];
  const url = `${baseUrl}/search?q=${encodeURIComponent(q)}&format=json&language=vi`;

  lastSearxngFetchAt = now;
  try {
    const payload = await fetchJsonWithTimeout<SearxngSearchPayload>(url, {
      timeoutMs: 8_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    });
    const parsed = parseSearxngHptSearchJson(payload, now);
    // Keep previous good results for this slot if upstream engines are temporarily in cooldown
    if (parsed.length > 0) {
      cachedSearxngBySlot.set(slot, parsed);
      cachedSearxngAtBySlot.set(slot, now);
    }
  } catch {
    // Local SearXNG container stopped or unreachable — skip silently
  }

  return { items: flattenCachedSearxngItems(), freshItems: flattenCachedSearxngItems(now - SEARXNG_MIN_INTERVAL_MS) };
}

// Throttle optional Google CSE to once per 20m (<= 72 queries/day) to stay strictly inside Google's 100/day free tier
const GOOGLE_CSE_MIN_INTERVAL_MS = 20 * 60_000;
let lastGoogleCseFetchAt = 0;
let lastGoogleCseSuccessAt = 0;
let cachedGoogleCseItems: HptCompanyItem[] = [];

async function fetchOptionalGoogleCseSocial(now: number): Promise<OptionalSearchResult> {
  // Skip redundant Google CSE REST calls when Serper.dev (`SERPER_API_KEY`) is already querying Google SERP directly
  if (process.env.SERPER_API_KEY?.trim()) return { items: [], freshItems: [] };
  const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  if (!apiKey || !cx) return { items: [], freshItems: [] };
  if (lastGoogleCseFetchAt > 0 && now - lastGoogleCseFetchAt < GOOGLE_CSE_MIN_INTERVAL_MS) {
    return {
      items: cachedGoogleCseItems,
      freshItems: now - lastGoogleCseSuccessAt < GOOGLE_CSE_MIN_INTERVAL_MS ? cachedGoogleCseItems : [],
    };
  }

  const query =
    '(site:facebook.com OR site:linkedin.com/posts OR site:linkedin.com/pulse OR site:threads.net OR site:tiktok.com) -site:facebook.com/HPTVietnamCorp -site:linkedin.com/posts/hpt-vietnam-corporation ("Công nghệ Tin học HPT" OR "HPT Cyber Security" OR "0301447436")';
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=10&dateRestrict=m1`;
  lastGoogleCseFetchAt = now;
  const payload = await fetchJsonWithTimeout<GoogleCseSearchPayload>(url, {
    timeoutMs: 7_500,
    retries: 0,
    userAgent: DEFAULT_BROWSER_UA,
  });
  cachedGoogleCseItems = parseGoogleCseHptSearchJson(payload, now);
  lastGoogleCseSuccessAt = now;
  return { items: cachedGoogleCseItems, freshItems: cachedGoogleCseItems };
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

function isWrappedRedirectUrl(url: string): boolean {
  return url.includes('news.google.com/rss/articles/');
}

function isTruncatedTitle(title: string): boolean {
  return /(?:\.{2,}|…)\s*(?:[-|•]\s*[^-|•]+)?$/.test(title.trim());
}

function scoreHptSourceAuthority(item: HptCompanyItem): number {
  let score = 0;
  if (item.category === 'exchange_filing' && item.source.includes('HNX')) score += 50;
  else if (item.category === 'exchange_filing') score += 30;
  else if (item.category === 'bidding_project') score += 25;
  if (!isWrappedRedirectUrl(item.url)) score += 20;
  if (!isTruncatedTitle(item.title)) score += 10;
  if (item.dateLabel !== 'Không rõ ngày') score += 8;
  if (item.pdfUrl) score += 15;
  if (!/báo\s+mới/i.test(item.source)) score += 4;
  return score;
}

export function mergeDuplicateHptItems(existing: HptCompanyItem, incoming: HptCompanyItem): HptCompanyItem {
  const winner = scoreHptSourceAuthority(incoming) > scoreHptSourceAuthority(existing) ? incoming : existing;
  const runnerUp = winner === incoming ? existing : incoming;

  const bestUrl =
    isWrappedRedirectUrl(winner.url) && !isWrappedRedirectUrl(runnerUp.url) ? runnerUp.url : winner.url;
  const bestSource =
    bestUrl === runnerUp.url && isWrappedRedirectUrl(winner.url) ? runnerUp.source : winner.source;
  const bestTitle =
    (isTruncatedTitle(winner.title) && !isTruncatedTitle(runnerUp.title)) ||
    (runnerUp.title.length > winner.title.length + 18 && !isTruncatedTitle(runnerUp.title))
      ? runnerUp.title
      : winner.title;
  const bestPublishedAt =
    winner.dateLabel === 'Không rõ ngày' && runnerUp.dateLabel !== 'Không rõ ngày'
      ? runnerUp.publishedAt
      : winner.publishedAt;
  const bestDateLabel =
    winner.dateLabel === 'Không rõ ngày' && runnerUp.dateLabel !== 'Không rõ ngày'
      ? runnerUp.dateLabel
      : winner.dateLabel ?? runnerUp.dateLabel;

  return {
    ...winner,
    title: bestTitle,
    url: bestUrl,
    source: bestSource,
    publishedAt: bestPublishedAt,
    dateLabel: bestDateLabel,
    pdfUrl: winner.pdfUrl ?? runnerUp.pdfUrl,
    aiSummary: winner.aiSummary ?? runnerUp.aiSummary,
  };
}

const HPT_ITEM_RETENTION_MS = 30 * 86_400_000;
const HPT_MAX_ITEMS = 60;

/** Search results rotate between runs, so keep previously seen items instead of replacing the list; anything older than 30 days is dropped, fresh or not. */
export function mergeRetainedHptItems(
  fresh: readonly HptCompanyItem[],
  previous: readonly HptCompanyItem[],
  now: number,
): HptCompanyItem[] {
  const recent = [...fresh, ...previous].filter((it) => now - it.publishedAt <= HPT_ITEM_RETENTION_MS);
  return deduplicateHptItems(recent).slice(0, HPT_MAX_ITEMS);
}

export function deduplicateHptItems(items: readonly HptCompanyItem[]): HptCompanyItem[] {
  const merged: HptCompanyItem[] = [];

  for (const item of items) {
    const dupIdx = merged.findIndex((existing) => areSameHptStory(existing, item));
    if (dupIdx === -1) {
      merged.push(item);
    } else {
      merged[dupIdx] = mergeDuplicateHptItems(merged[dupIdx], item);
    }
  }

  return merged.sort((a, b) => b.publishedAt - a.publishedAt);
}

export async function fetchHptCompanyIntelligence(
  previous?: HptCompanyIntelSnapshot | null,
): Promise<HptCompanyIntelSnapshot> {
  const now = Date.now();
  const tgChannels = resolvePublicTelegramChannels();

  const [stockRes, cfNewsRes, cfEventsRes, baoMoiRes, redditRes, serperRes, searxngRes, cseRes, metaRes, ...restResults] =
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
      fetchOptionalSerperMentions(now),
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
  const freshCollected: HptCompanyItem[] = [];

  if (cfNewsRes.status === 'fulfilled') {
    const items = parseCafeFHptDisclosuresHtml(cfNewsRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
      freshCollected.push(...items);
    }
  }
  if (cfEventsRes.status === 'fulfilled') {
    const items = parseCafeFHptDisclosuresHtml(cfEventsRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
      freshCollected.push(...items);
    }
  }
  if (baoMoiRes.status === 'fulfilled') {
    const items = parseBaoMoiHptSearchHtml(baoMoiRes.value.text, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
      freshCollected.push(...items);
    }
  }
  if (redditRes.status === 'fulfilled') {
    const items = parseRedditHptSearchJson(redditRes.value, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
      freshCollected.push(...items);
    }
  }
  for (const result of [serperRes, searxngRes, cseRes]) {
    if (result.status === 'fulfilled' && result.value.items.length > 0) {
      rawCollected.push(...result.value.items);
      if (result.value.freshItems.length > 0) {
        sourceCount += 1;
        freshCollected.push(...result.value.freshItems);
      }
    }
  }
  if (metaRes.status === 'fulfilled' && metaRes.value.length > 0) {
    sourceCount += 1;
    rawCollected.push(...metaRes.value);
    freshCollected.push(...metaRes.value);
  }
  for (const r of restResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sourceCount += 1;
      rawCollected.push(...r.value);
      freshCollected.push(...r.value);
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
  let deduped = mergeRetainedHptItems(cleanExternalOnly, previous?.items.filter(isCleanExternalItem) ?? [], now);
  const freshStock = stockRes.status === 'fulfilled' ? stockRes.value : null;
  const hasFreshItems = freshCollected.some(isCleanExternalItem);

  if (!freshStock && !hasFreshItems) {
    throw new Error('All independent external HPT intelligence & UPCoM quote sources failed');
  }

  const itemsRetained = !hasFreshItems && (deduped.length > 0 || Boolean(previous?.items.length));

  await enrichTopDisclosuresWithPdfLinks(deduped);
  const enriched = await maybeEnrichHptWithGroqSentiment(deduped);

  const stock = freshStock ?? previous?.stock ?? null;

  return {
    stock,
    items: enriched.items,
    sourceCount,
    stockRetained: !freshStock && Boolean(stock),
    itemsRetained,
    aiSentimentEnabled: enriched.aiEnabled,
    updatedAt: now,
  };
}

