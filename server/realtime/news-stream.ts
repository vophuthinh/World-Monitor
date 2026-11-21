import type { GeoPointFeature, NewsItem, NewsStreamStats } from '@shared/types';
import { extractWsPayloadText } from '../collectors/maritime-vessels';
import { decodeHtmlEntities, matchGeoLocation } from '../collectors/polymarket-news';
import type { SnapshotStore } from '../cache/snapshot-store';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';
import { globalViTranslator } from '../lib/translator';
import type { RealtimeHub } from './hub';

const BLUESKY_JETSTREAM_WS =
  'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
const WIKIMEDIA_RECENTCHANGE_SSE = 'https://stream.wikimedia.org/v2/stream/recentchange';
const HN_TOPSTORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const GDELT_DOC_ARTLIST_URL =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict%20OR%20military%20OR%20maritime%20OR%20vietnam%20OR%20tariff%20OR%20earthquake)%20sourcelang:eng&mode=ArtList&maxrecords=24&format=json&timespan=6h';

const BREAKING_WIRE_PREFIX_RE = /^(?:🚨\s*|⚡\s*|🔴\s*)?(BREAKING|URGENT|FLASH|DEVELOPING|ALERT|TIN NÓNG)\b[:\s-]*/i;

const OSINT_TOPIC_RE =
  /\b(missile|airstrike|drone strike|naval|warship|tanker|strait of hormuz|south china sea|biển đông|paracel|spratly|taiwan strait|red sea|houthi|suez|malacca|ukraine|kyiv|russia|israel|iran|tehran|gaza|lebanon|north korea|pyongyang|pentagon|nato|ceasefire|sanctions|tariff|central bank|federal reserve|inflation|recession|oil price|earthquake|tsunami|typhoon|volcano|coup|state of emergency|cyberattack|vietnam|hanoi)\b/i;

const TRUSTED_NEWS_DOMAIN_RE =
  /\b(reuters\.com|apnews\.com|bloomberg\.com|bbc\.co|bbc\.com|aljazeera\.com|ft\.com|wsj\.com|nytimes\.com|theguardian\.com|cnbc\.com|dw\.com|france24\.com|nikkei\.com|scmp\.com|channelnewsasia\.com|vnexpress\.net|tuoitre\.vn|bellingcat\.com)\b/i;

interface JetstreamEnvelope {
  did?: string;
  time_us?: number;
  kind?: string;
  commit?: {
    operation?: string;
    collection?: string;
    rkey?: string;
    record?: {
      text?: string;
      langs?: string[];
      reply?: unknown;
      embed?: {
        $type?: string;
        external?: {
          uri?: string;
          title?: string;
          description?: string;
        };
      };
    };
  };
}

export function parseBlueskyJetstreamPost(rawJson: string, now = Date.now()): NewsItem | null {
  try {
    const msg = JSON.parse(rawJson) as JetstreamEnvelope;
    if (msg.kind !== 'commit') return null;
    const commit = msg.commit;
    if (!commit || commit.operation !== 'create' || commit.collection !== 'app.bsky.feed.post') {
      return null;
    }

    const record = commit.record;
    if (!record || record.reply) return null; // Skip reply chatter

    const rawText = (record.text ?? '').replace(/\s+/g, ' ').trim();
    if (rawText.length < 32 || rawText.length > 340) return null;

    // Skip hashtag spam (>3 hashtags)
    const hashtagCount = (rawText.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
    if (hashtagCount > 3) return null;

    const extUri = record.embed?.external?.uri ?? '';
    const extTitle = decodeHtmlEntities(record.embed?.external?.title ?? '');
    const combinedCheck = `${rawText} ${extTitle} ${extUri}`;

    const hasBreakingPrefix = BREAKING_WIRE_PREFIX_RE.test(rawText);
    const hasTopicMatch = OSINT_TOPIC_RE.test(combinedCheck);
    const hasTrustedLink = Boolean(extUri && TRUSTED_NEWS_DOMAIN_RE.test(extUri));

    if (!hasTopicMatch && !hasTrustedLink) return null;
    if (!hasBreakingPrefix && !extUri) return null;

    const did = msg.did ?? '';
    const rkey = commit.rkey ?? '';
    if (!did || !rkey) return null;

    const cleanHeadline = rawText
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\/\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = cleanHeadline.split(' ').filter(Boolean).length;
    const displayTitle =
      cleanHeadline.length >= 28 && wordCount >= 5
        ? cleanHeadline
        : extTitle.length >= 18
          ? extTitle
          : cleanHeadline;

    if (!displayTitle || displayTitle.length < 18) return null;

    const loc = matchGeoLocation(`${displayTitle} ${extTitle}`);
    const bskyPostUrl = `https://bsky.app/profile/${did}/post/${rkey}`;

    return {
      id: `bsky:${did}:${rkey}`,
      title: displayTitle,
      source: 'Bluesky Jetstream',
      category: 'osint_live',
      streamSource: 'bluesky',
      isLiveStream: true,
      publishedAt: now,
      url: bskyPostUrl,
      ...(loc
        ? {
            matchedLat: loc.lat,
            matchedLon: loc.lon,
            matchedLocation: loc.name,
          }
        : {}),
    };
  } catch {
    return null;
  }
}

export interface WikimediaRecentChangeEvent {
  bot?: boolean;
  namespace?: number;
  type?: string;
  wiki?: string;
  title?: string;
  user?: string;
  comment?: string;
  timestamp?: number;
  meta?: {
    uri?: string;
  };
}

const WATCHED_WIKIS = new Set([
  'enwiki',
  'viwiki',
  'zhwiki',
  'ruwiki',
  'ukwiki',
  'arwiki',
  'fawiki',
  'jawiki',
  'frwiki',
  'dewiki',
]);

const WIKI_CRISIS_RE =
  /\b(earthquake|tsunami|typhoon|cyclone|hurricane|explosion|airstrike|missile|coup|assassination|invasion|martial law|plane crash|shipwreck|wildfire|volcano|động đất|sóng thần|bão|biển đông|xung đột|khẩn cấp)\b/i;

interface WikiBucket {
  edits: number;
  users: Set<string>;
  firstSeenMs: number;
  lastEmittedMs: number;
}

export class WikimediaBurstDetector {
  private readonly buckets = new Map<string, WikiBucket>();
  private readonly burstThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor(options?: { burstThreshold?: number; windowMs?: number; cooldownMs?: number }) {
    this.burstThreshold = options?.burstThreshold ?? 3;
    this.windowMs = options?.windowMs ?? 180_000;
    this.cooldownMs = options?.cooldownMs ?? 12 * 60_000;
  }

  ingestEvent(ev: WikimediaRecentChangeEvent, now = Date.now()): NewsItem | null {
    if (!ev || ev.bot) return null;
    if (ev.namespace !== 0) return null;
    if (ev.type !== 'edit' && ev.type !== 'new') return null;

    const wiki = ev.wiki ?? '';
    if (!WATCHED_WIKIS.has(wiki)) return null;

    const title = (ev.title ?? '').trim();
    if (!title || title.length < 3) return null;
    if (/^(Main Page|Trang Chính|Wikipedia:|List of |Danh sách )/i.test(title)) return null;

    const key = `${wiki}:${title}`;
    const existing = this.buckets.get(key);
    let bucket: WikiBucket;

    if (!existing || now - existing.firstSeenMs > this.windowMs) {
      bucket = {
        edits: 1,
        users: new Set(ev.user ? [ev.user] : []),
        firstSeenMs: now,
        lastEmittedMs: existing?.lastEmittedMs ?? 0,
      };
      this.buckets.set(key, bucket);
    } else {
      bucket = existing;
      bucket.edits += 1;
      if (ev.user) bucket.users.add(ev.user);
    }

    if (this.buckets.size > 2_500) {
      for (const [k, b] of this.buckets) {
        if (now - b.firstSeenMs > this.windowMs) this.buckets.delete(k);
      }
    }

    const combinedText = `${title} ${ev.comment ?? ''}`;
    const isCrisisKeyword = WIKI_CRISIS_RE.test(combinedText);
    const requiredEdits = isCrisisKeyword ? Math.max(2, this.burstThreshold - 1) : this.burstThreshold;

    if (bucket.edits < requiredEdits) return null;
    if (bucket.lastEmittedMs > 0 && now - bucket.lastEmittedMs < this.cooldownMs) return null;

    bucket.lastEmittedMs = now;

    const langTag = wiki.replace('wiki', '').toUpperCase();
    const articleUrl =
      ev.meta?.uri ||
      `https://${wiki.replace('wiki', '')}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    const cleanComment = decodeHtmlEntities(ev.comment ?? '')
      .replace(/\/\*.*?\*\//g, '')
      .replace(/\[\[(?:Category|Thể loại|Catégorie|Kategorie):[^\]]+\]\]/gi, '')
      .replace(/\(\[\[[^\]]*Hotcat[^\]]*\]\]\)/gi, '')
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
      .replace(/^[\s+-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const headline =
      wiki === 'viwiki'
        ? `Biến động Wikipedia VI (${bucket.edits} lượt sửa dồn dập): ${title}${cleanComment ? ` — ${cleanComment.slice(0, 80)}` : ''}`
        : `Wikipedia OSINT Spike (${bucket.edits} rapid edits on ${langTag}): "${title}"${cleanComment ? ` — ${cleanComment.slice(0, 80)}` : ''}`;

    const loc = matchGeoLocation(`${title} ${cleanComment}`);

    return {
      id: `wiki:${key}:${Math.floor(now / 60_000)}`,
      title: headline,
      titleVi: wiki === 'viwiki' ? headline : undefined,
      source: `Wikimedia SSE (${langTag})`,
      category: 'osint_live',
      streamSource: 'wikimedia',
      isLiveStream: true,
      publishedAt: now,
      url: articleUrl,
      ...(loc
        ? {
            matchedLat: loc.lat,
            matchedLon: loc.lon,
            matchedLocation: loc.name,
          }
        : {}),
    };
  }
}

export interface RawHackerNewsItem {
  id?: number;
  type?: string;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  dead?: boolean;
  deleted?: boolean;
}

export function normalizeHackerNewsItems(items: readonly RawHackerNewsItem[]): NewsItem[] {
  const out: NewsItem[] = [];
  for (const item of items) {
    if (!item || item.dead || item.deleted) continue;
    const id = Number(item.id ?? 0);
    const title = decodeHtmlEntities(item.title ?? '').trim();
    const score = Number(item.score ?? 0);
    if (!id || !title || score < 20) continue;

    const url =
      item.url && item.url.startsWith('http')
        ? item.url
        : `https://news.ycombinator.com/item?id=${id}`;
    const publishedAt = item.time ? item.time * 1_000 : Date.now();
    const loc = matchGeoLocation(title);

    out.push({
      id: `hn:${id}`,
      title,
      source: `Hacker News (▲${score})`,
      category: 'tech',
      streamSource: 'hackernews',
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

export async function fetchHackerNewsTop(): Promise<NewsItem[]> {
  const ids = await fetchJsonWithTimeout<number[]>(HN_TOPSTORIES_URL, {
    timeoutMs: 8_000,
    retries: 1,
    userAgent: NAMED_APP_UA,
  });
  if (!Array.isArray(ids)) return [];

  const topSlice = ids.slice(0, 22);
  const settled = await Promise.allSettled(
    topSlice.map((id) =>
      fetchJsonWithTimeout<RawHackerNewsItem>(HN_ITEM_URL(id), {
        timeoutMs: 6_000,
        retries: 0,
        userAgent: NAMED_APP_UA,
      }),
    ),
  );

  const rawItems: RawHackerNewsItem[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value) rawItems.push(res.value);
  }

  const normalized = normalizeHackerNewsItems(rawItems);
  return globalViTranslator.enrichNewsItems(normalized);
}

export interface GdeltDocApiPayload {
  articles?: Array<{
    url?: string;
    title?: string;
    seendate?: string;
    domain?: string;
    sourcecountry?: string;
  }>;
}

function parseGdeltSeenDate(seen?: string, fallback = Date.now()): number {
  if (!seen) return fallback;
  // Format: 20261121T183000Z
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seen.trim());
  if (!m) return fallback;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : fallback;
}

export function normalizeGdeltDocArticles(
  payload: GdeltDocApiPayload,
  fallbackNow = Date.now(),
): NewsItem[] {
  const list = payload?.articles;
  if (!Array.isArray(list)) return [];

  const out: NewsItem[] = [];
  const seenUrls = new Set<string>();

  for (const art of list) {
    const title = decodeHtmlEntities(art.title ?? '').trim();
    const url = (art.url ?? '').trim();
    if (!title || title.length < 15 || !url.startsWith('http')) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const domain = (art.domain ?? 'GDELT').replace(/^www\./, '');
    const publishedAt = parseGdeltSeenDate(art.seendate, fallbackNow);
    const loc = matchGeoLocation(`${title} ${art.sourcecountry ?? ''}`);

    out.push({
      id: `gdelt-doc:${url}`,
      title,
      source: `GDELT · ${domain}`,
      category: 'osint_live',
      streamSource: 'gdelt',
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

  return out.slice(0, 22);
}

export async function fetchGdeltDocNews(): Promise<NewsItem[]> {
  try {
    const payload = await fetchJsonWithTimeout<GdeltDocApiPayload>(GDELT_DOC_ARTLIST_URL, {
      timeoutMs: 9_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    });
    const normalized = normalizeGdeltDocArticles(payload);
    return globalViTranslator.enrichNewsItems(normalized);
  } catch {
    return [];
  }
}

export class UnifiedNewsStreamService {
  private bskyWs: WebSocket | null = null;
  private wikiAbort: AbortController | null = null;
  private bskyReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wikiReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  private bskyConnected = false;
  private wikiConnected = false;
  private lastBskyAcceptedMs = 0;

  private readonly wikiDetector = new WikimediaBurstDetector({ burstThreshold: 3, windowMs: 180_000 });
  private readonly itemsById = new Map<string, NewsItem>();
  private readonly seenFingerprints = new Set<string>();
  private pendingLiveQueue: NewsItem[] = [];

  constructor(
    private readonly hub: RealtimeHub,
    private readonly store: SnapshotStore,
  ) {}

  start(): void {
    this.stopped = false;
    const cachedRss = this.store.get<NewsItem[]>('rss-news');
    if (cachedRss && cachedRss.length > 0) {
      this.ingestBatchItems(cachedRss, false);
    }
    const cachedGdelt = this.store.get<GeoPointFeature[]>('geopolitics-gdelt');
    if (cachedGdelt && cachedGdelt.length > 0) {
      void this.ingestGdeltGeoFeatures(cachedGdelt);
    }
    this.connectBlueskyJetstream();
    void this.connectWikimediaSse();
    void this.pollHnAndGdelt();

    // Flush queued real-time Bluesky + Wikimedia items every 4 seconds (batch-translating to Vietnamese)
    this.flushTimer = setInterval(() => {
      void this.flushPendingLiveItems();
    }, 4_000);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();

    // Poll Hacker News Firebase + GDELT DOC 2.0 every 4 minutes
    this.pollTimer = setInterval(() => {
      void this.pollHnAndGdelt();
    }, 240_000);
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  stop(): void {
    this.stopped = true;
    this.bskyConnected = false;
    this.wikiConnected = false;
    if (this.bskyReconnectTimer) clearTimeout(this.bskyReconnectTimer);
    if (this.wikiReconnectTimer) clearTimeout(this.wikiReconnectTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    try {
      this.bskyWs?.close();
    } catch {
      // Ignore
    }
    this.wikiAbort?.abort();
    this.bskyWs = null;
    this.wikiAbort = null;
  }

  ingestBatchItems(items: readonly NewsItem[], broadcastNew = false): NewsItem[] {
    const newlyAdded: NewsItem[] = [];
    for (const item of items) {
      const fp = this.fingerprint(item);
      if (this.itemsById.has(item.id) || this.seenFingerprints.has(fp)) {
        // Update existing item if titleVi was newly populated
        const prev = this.itemsById.get(item.id);
        if (prev && !prev.titleVi && item.titleVi) {
          this.itemsById.set(item.id, item);
        }
        continue;
      }
      this.seenFingerprints.add(fp);
      this.itemsById.set(item.id, item);
      newlyAdded.push(item);
    }

    if (this.seenFingerprints.size > 3_000) {
      const keep = [...this.seenFingerprints].slice(-1_500);
      this.seenFingerprints.clear();
      for (const k of keep) this.seenFingerprints.add(k);
    }

    this.pruneToLimit(240);

    if (broadcastNew && newlyAdded.length > 0) {
      this.hub.publish({
        type: 'news_prepend',
        items: newlyAdded.slice(0, 18),
        stats: this.getStats(),
        ts: Date.now(),
      });
    }

    return newlyAdded;
  }

  async ingestGdeltGeoFeatures(features: readonly GeoPointFeature[]): Promise<void> {
    if (this.stopped || features.length === 0) return;
    const candidates: NewsItem[] = [];
    for (const f of features.slice(0, 16)) {
      if (!f.url || !f.url.startsWith('http')) continue;
      let domain = 'GDELT';
      try {
        domain = new URL(f.url).hostname.replace(/^www\./, '');
      } catch {
        // Keep default
      }
      const rawHeadline = f.subtitle ? `${f.title} — ${f.subtitle}` : f.title;
      candidates.push({
        id: `gdelt-geo:${f.id}`,
        title: rawHeadline,
        source: `GDELT · ${domain}`,
        category: 'osint_live',
        streamSource: 'gdelt',
        publishedAt: f.timestamp || Date.now(),
        url: f.url,
        matchedLat: f.lat,
        matchedLon: f.lon,
        matchedLocation: f.title.split('—')[0].trim().slice(0, 42),
      });
    }
    if (candidates.length === 0) return;
    const translated = await globalViTranslator.enrichNewsItems(candidates);
    this.ingestBatchItems(translated, true);
  }

  getUnifiedNews(): NewsItem[] {
    if (this.itemsById.size === 0) {
      const cached = this.store.get<NewsItem[]>('rss-news');
      if (cached && cached.length > 0) {
        this.ingestBatchItems(cached, false);
      }
    }
    return [...this.itemsById.values()]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 200);
  }

  getStats(): NewsStreamStats {
    let blueskyCount = 0;
    let wikimediaCount = 0;
    let gdeltCount = 0;
    let hnCount = 0;
    let rssCount = 0;

    for (const item of this.itemsById.values()) {
      switch (item.streamSource) {
        case 'bluesky':
          blueskyCount += 1;
          break;
        case 'wikimedia':
          wikimediaCount += 1;
          break;
        case 'gdelt':
          gdeltCount += 1;
          break;
        case 'hackernews':
          hnCount += 1;
          break;
        default:
          rssCount += 1;
          break;
      }
    }

    return {
      blueskyConnected: this.bskyConnected,
      wikimediaConnected: this.wikiConnected,
      blueskyCount,
      wikimediaCount,
      gdeltCount,
      hnCount,
      rssCount,
    };
  }

  private async pollHnAndGdelt(): Promise<void> {
    if (this.stopped) return;
    const [hnRes, gdeltRes] = await Promise.allSettled([
      fetchHackerNewsTop(),
      fetchGdeltDocNews(),
    ]);

    const combined: NewsItem[] = [];
    if (hnRes.status === 'fulfilled') combined.push(...hnRes.value);
    if (gdeltRes.status === 'fulfilled') combined.push(...gdeltRes.value);

    if (combined.length > 0) {
      this.ingestBatchItems(combined, true);
    }
  }

  private async flushPendingLiveItems(): Promise<void> {
    if (this.stopped || this.pendingLiveQueue.length === 0) return;
    const batch = this.pendingLiveQueue.splice(0, 8);
    try {
      const translated = await globalViTranslator.enrichNewsItems(batch);
      this.ingestBatchItems(translated, true);
    } catch {
      this.ingestBatchItems(batch, true);
    }
  }

  private connectBlueskyJetstream(): void {
    if (this.stopped || typeof globalThis.WebSocket !== 'function') return;

    try {
      const ws = new WebSocket(BLUESKY_JETSTREAM_WS);
      this.bskyWs = ws;

      ws.onopen = () => {
        this.bskyConnected = true;
      };

      ws.onmessage = (event) => {
        const now = Date.now();
        // Throttle accepted Bluesky items to max 1 every 4.5s so firehose stays crisp & curated
        if (now - this.lastBskyAcceptedMs < 4_500 || this.pendingLiveQueue.length >= 12) return;

        void extractWsPayloadText(event.data).then((raw) => {
          if (this.stopped || !raw) return;
          const item = parseBlueskyJetstreamPost(raw, Date.now());
          if (!item) return;
          const fp = this.fingerprint(item);
          if (this.seenFingerprints.has(fp)) return;
          this.lastBskyAcceptedMs = Date.now();
          this.pendingLiveQueue.push(item);
        });
      };

      ws.onerror = () => {
        this.bskyConnected = false;
        try {
          ws.close();
        } catch {
          // Handled in onclose
        }
      };

      ws.onclose = () => {
        this.bskyConnected = false;
        this.bskyWs = null;
        if (this.stopped) return;
        this.bskyReconnectTimer = setTimeout(() => this.connectBlueskyJetstream(), 5_000);
        if (typeof this.bskyReconnectTimer.unref === 'function') this.bskyReconnectTimer.unref();
      };
    } catch {
      this.bskyConnected = false;
      if (!this.stopped) {
        this.bskyReconnectTimer = setTimeout(() => this.connectBlueskyJetstream(), 5_000);
      }
    }
  }

  private async connectWikimediaSse(): Promise<void> {
    if (this.stopped) return;
    const ctrl = new AbortController();
    this.wikiAbort = ctrl;

    try {
      const res = await fetch(WIKIMEDIA_RECENTCHANGE_SSE, {
        headers: {
          'User-Agent': NAMED_APP_UA,
          Accept: 'text/event-stream',
        },
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Wikimedia SSE HTTP ${res.status}`);
      }

      this.wikiConnected = true;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx = buffer.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          newlineIdx = buffer.indexOf('\n');

          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr) as WikimediaRecentChangeEvent;
            const burstItem = this.wikiDetector.ingestEvent(parsed, Date.now());
            if (burstItem && this.pendingLiveQueue.length < 16) {
              this.pendingLiveQueue.push(burstItem);
            }
          } catch {
            // Skip partial/malformed SSE line
          }
        }
      }
    } catch {
      // Reconnect below
    } finally {
      this.wikiConnected = false;
      if (!this.stopped) {
        this.wikiReconnectTimer = setTimeout(() => {
          void this.connectWikimediaSse();
        }, 6_000);
        if (typeof this.wikiReconnectTimer.unref === 'function') this.wikiReconnectTimer.unref();
      }
    }
  }

  private fingerprint(item: NewsItem): string {
    const cleanUrl = item.url.split('?')[0].toLowerCase();
    if (item.streamSource === 'bluesky') {
      return `txt:${item.title.toLowerCase().slice(0, 75)}`;
    }
    return `url:${cleanUrl}`;
  }

  private pruneToLimit(maxItems: number): void {
    if (this.itemsById.size <= maxItems) return;
    const sorted = [...this.itemsById.values()].sort((a, b) => b.publishedAt - a.publishedAt);
    this.itemsById.clear();
    for (const item of sorted.slice(0, maxItems)) {
      this.itemsById.set(item.id, item);
    }
  }
}
