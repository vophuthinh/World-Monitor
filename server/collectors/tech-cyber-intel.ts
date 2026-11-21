import { XMLParser } from 'fast-xml-parser';
import type {
  InfraStatusLevel,
  SeverityLevel,
  TechCyberItem,
  TechCyberSnapshot,
  TechInfraStatus,
  TechSubCategory,
} from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { globalViTranslator } from '../lib/translator';
import { fetchHackerNewsTop } from '../realtime/news-stream';
import { decodeHtmlEntities, matchGeoLocation } from './polymarket-news';

export interface TechFeedDefinition {
  name: string;
  subCategory: TechSubCategory;
  url: string;
  maxItems?: number;
}

/**
 * Comprehensive AI, Cybersecurity, Semiconductor, Cloud, Dev & Vietnam Tech catalog
 * synthesized from koala73/worldmonitor's `tech` variant (`ai`, `security`, `tech`,
 * `hardware`, `cloud`, `github`, `startups`, `regionalStartups`, `DEFAULT_ENABLED_INTEL`)
 * plus major Vietnamese technology desks. Every URL verified 200 OK without API keys.
 */
export const TECH_CYBER_FEEDS: readonly TechFeedDefinition[] = [
  // 1. AI, LLM & Frontier Research Labs (11 feeds)
  { name: 'OpenAI News', subCategory: 'ai', url: 'https://openai.com/news/rss.xml', maxItems: 4 },
  { name: 'Google DeepMind', subCategory: 'ai', url: 'https://deepmind.google/blog/rss.xml', maxItems: 4 },
  { name: 'Google AI Blog', subCategory: 'ai', url: 'https://blog.google/technology/ai/rss/', maxItems: 4 },
  { name: 'Hugging Face', subCategory: 'ai', url: 'https://huggingface.co/blog/feed.xml', maxItems: 4 },
  { name: 'MIT Tech Review AI', subCategory: 'ai', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', maxItems: 4 },
  { name: 'The Verge AI', subCategory: 'ai', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', maxItems: 4 },
  { name: 'TechCrunch AI', subCategory: 'ai', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', maxItems: 4 },
  { name: 'NVIDIA Technical Blog', subCategory: 'ai', url: 'https://developer.nvidia.com/blog/feed/', maxItems: 3 },
  { name: 'Simon Willison AI', subCategory: 'ai', url: 'https://simonwillison.net/atom/everything/', maxItems: 3 },
  { name: 'MarkTechPost AI', subCategory: 'ai', url: 'https://www.marktechpost.com/feed/', maxItems: 3 },
  {
    name: 'ArXiv CS.AI & LLM',
    subCategory: 'ai',
    url: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=8',
    maxItems: 3,
  },

  // 2. Cybersecurity, Threat Intelligence & Zero-Days (16 feeds)
  { name: 'CISA Advisories', subCategory: 'cyber', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', maxItems: 4 },
  { name: 'Krebs on Security', subCategory: 'cyber', url: 'https://krebsonsecurity.com/feed/', maxItems: 4 },
  { name: 'The Hacker News', subCategory: 'cyber', url: 'https://feeds.feedburner.com/TheHackersNews', maxItems: 4 },
  { name: 'The Record (Cyber)', subCategory: 'cyber', url: 'https://therecord.media/feed', maxItems: 4 },
  { name: 'Palo Alto Unit 42', subCategory: 'cyber', url: 'https://unit42.paloaltonetworks.com/feed/', maxItems: 4 },
  { name: 'Cisco Talos Intel', subCategory: 'cyber', url: 'https://blog.talosintelligence.com/rss/', maxItems: 3 },
  { name: 'Google Project Zero', subCategory: 'cyber', url: 'https://googleprojectzero.blogspot.com/feeds/posts/default', maxItems: 3 },
  { name: 'Zero Day Initiative', subCategory: 'cyber', url: 'https://www.zerodayinitiative.com/blog?format=rss', maxItems: 3 },
  { name: 'Dark Reading', subCategory: 'cyber', url: 'https://www.darkreading.com/rss.xml', maxItems: 3 },
  { name: 'SecurityWeek', subCategory: 'cyber', url: 'https://www.securityweek.com/feed/', maxItems: 3 },
  { name: 'CyberScoop', subCategory: 'cyber', url: 'https://www.cyberscoop.com/feed/', maxItems: 3 },
  { name: 'SANS Storm Center', subCategory: 'cyber', url: 'https://isc.sans.edu/rssfeed_full.xml', maxItems: 2 },
  { name: 'Schneier on Security', subCategory: 'cyber', url: 'https://www.schneier.com/feed/atom/', maxItems: 3 },
  { name: 'Malwarebytes Labs', subCategory: 'cyber', url: 'https://www.malwarebytes.com/blog/feed/index.xml', maxItems: 3 },
  { name: 'Graham Cluley Cyber', subCategory: 'cyber', url: 'https://grahamcluley.com/feed/', maxItems: 2 },
  { name: 'Wired Security', subCategory: 'cyber', url: 'https://www.wired.com/feed/category/security/latest/rss', maxItems: 3 },

  // 3. Semiconductors, Cloud, Developer & Global Tech Industry (20 feeds incl. BBC Tech & Science)
  { name: 'BBC Technology', subCategory: 'tech_infra', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', maxItems: 4 },
  { name: 'BBC Science & AI', subCategory: 'ai', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', maxItems: 3 },
  { name: 'Ars Technica', subCategory: 'tech_infra', url: 'https://feeds.arstechnica.com/arstechnica/index', maxItems: 4 },
  { name: 'The Verge', subCategory: 'tech_infra', url: 'https://www.theverge.com/rss/index.xml', maxItems: 3 },
  { name: 'MIT Tech Review', subCategory: 'tech_infra', url: 'https://www.technologyreview.com/feed/', maxItems: 3 },
  { name: 'TechCrunch', subCategory: 'tech_infra', url: 'https://techcrunch.com/feed/', maxItems: 3 },
  { name: 'Wired', subCategory: 'tech_infra', url: 'https://www.wired.com/feed/rss', maxItems: 3 },
  { name: 'The Register', subCategory: 'tech_infra', url: 'https://www.theregister.com/headlines.atom', maxItems: 3 },
  { name: "Tom's Hardware (Chips)", subCategory: 'tech_infra', url: 'https://www.tomshardware.com/feeds/all', maxItems: 3 },
  { name: 'Semiconductor Eng.', subCategory: 'tech_infra', url: 'https://semiengineering.com/feed/', maxItems: 3 },
  { name: 'SiliconANGLE Cloud', subCategory: 'tech_infra', url: 'https://siliconangle.com/feed/', maxItems: 3 },
  { name: 'GitHub Blog', subCategory: 'tech_infra', url: 'https://github.blog/feed/', maxItems: 3 },
  { name: 'Cloudflare Blog', subCategory: 'tech_infra', url: 'https://blog.cloudflare.com/rss/', maxItems: 3 },
  { name: 'AWS What is New', subCategory: 'tech_infra', url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', maxItems: 2 },
  { name: 'Lobsters Dev', subCategory: 'tech_infra', url: 'https://lobste.rs/rss', maxItems: 3 },
  { name: 'DEV Community', subCategory: 'tech_infra', url: 'https://dev.to/feed', maxItems: 2 },
  { name: 'Product Hunt', subCategory: 'tech_infra', url: 'https://www.producthunt.com/feed', maxItems: 2 },
  { name: 'Crunchbase Startups', subCategory: 'tech_infra', url: 'https://news.crunchbase.com/feed/', maxItems: 3 },
  { name: 'Tech in Asia', subCategory: 'tech_infra', url: 'https://www.techinasia.com/feed', maxItems: 3 },
  { name: 'Rest of World Tech', subCategory: 'tech_infra', url: 'https://restofworld.org/feed/latest/', maxItems: 3 },

  // 4. Bộ Khoa học & Công nghệ + Báo Công nghệ & Chuyển đổi số Việt Nam (9 feeds)
  { name: 'Bộ KH&CN (mst.gov.vn)', subCategory: 'vn_tech', url: 'https://mst.gov.vn/rss/home.rss', maxItems: 6 },
  { name: 'Bộ KH&CN Chính sách', subCategory: 'vn_tech', url: 'https://mst.gov.vn/rss/tieu-diem-chinh-sach.rss', maxItems: 5 },
  { name: 'Tạp chí Tia Sáng (Bộ KH&CN)', subCategory: 'vn_tech', url: 'https://tiasang.com.vn/rss/khoa-hoc-cong-nghe.rss', maxItems: 5 },
  { name: 'VnExpress Số hóa', subCategory: 'vn_tech', url: 'https://vnexpress.net/rss/so-hoa.rss', maxItems: 5 },
  { name: 'VnExpress KH-CN', subCategory: 'vn_tech', url: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss', maxItems: 5 },
  { name: 'Tuổi Trẻ Công nghệ', subCategory: 'vn_tech', url: 'https://tuoitre.vn/rss/nhip-song-so.rss', maxItems: 5 },
  { name: 'Thanh Niên Công nghệ', subCategory: 'vn_tech', url: 'https://thanhnien.vn/rss/cong-nghe.rss', maxItems: 5 },
  { name: 'Dân Trí Công nghệ', subCategory: 'vn_tech', url: 'https://dantri.com.vn/rss/cong-nghe.rss', maxItems: 5 },
  { name: 'VietNamNet Công nghệ', subCategory: 'vn_tech', url: 'https://vietnamnet.vn/rss/cong-nghe.rss', maxItems: 5 },
];

const CISA_KEV_JSON_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

const INFRA_STATUS_TARGETS: ReadonlyArray<{ name: string; pageUrl: string; apiUrl: string }> = [
  { name: 'OpenAI', pageUrl: 'https://status.openai.com', apiUrl: 'https://status.openai.com/api/v2/summary.json' },
  { name: 'Anthropic', pageUrl: 'https://status.anthropic.com', apiUrl: 'https://status.anthropic.com/api/v2/summary.json' },
  { name: 'GitHub', pageUrl: 'https://www.githubstatus.com', apiUrl: 'https://www.githubstatus.com/api/v2/summary.json' },
  { name: 'Cloudflare', pageUrl: 'https://www.cloudflarestatus.com', apiUrl: 'https://www.cloudflarestatus.com/api/v2/summary.json' },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function cleanNodeText(raw: unknown): string {
  if (typeof raw === 'string') return decodeHtmlEntities(raw);
  if (raw && typeof raw === 'object' && '#text' in (raw as Record<string, unknown>)) {
    return cleanNodeText((raw as Record<string, unknown>)['#text']);
  }
  return '';
}

function extractEntryUrl(rawLink: unknown): string {
  if (typeof rawLink === 'string') return rawLink.trim();
  if (Array.isArray(rawLink)) {
    for (const item of rawLink) {
      if (item && typeof item === 'object') {
        const rel = (item as Record<string, unknown>)['@_rel'];
        const href = (item as Record<string, unknown>)['@_href'];
        if ((rel === 'alternate' || !rel) && typeof href === 'string' && href.startsWith('http')) {
          return href.trim();
        }
      }
      const fallback = extractEntryUrl(item);
      if (fallback.startsWith('http')) return fallback;
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

function inferTechSeverity(title: string, subCategory: TechSubCategory): SeverityLevel | undefined {
  if (
    subCategory === 'cyber' &&
    /\b(zero-day|0-day|actively exploited|ransomware|critical|rce|remote code execution|cve-\d{4}-\d+|backdoor|apt\d*)\b/i.test(
      title,
    )
  ) {
    return 'critical';
  }
  if (subCategory === 'cyber') return 'high';
  return undefined;
}

export function parseTechFeedXml(
  xml: string,
  feed: TechFeedDefinition,
  fallbackNow = Date.now(),
): TechCyberItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawEntries = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
  const limit = feed.maxItems ?? 4;

  const out: TechCyberItem[] = [];
  for (const entry of entries.slice(0, limit)) {
    const title = cleanNodeText(entry?.title);
    const url = extractEntryUrl(entry?.link) || cleanNodeText(entry?.id) || cleanNodeText(entry?.guid);
    if (!title || !url || !url.startsWith('http')) continue;

    const rawDate = cleanNodeText(entry?.pubDate ?? entry?.published ?? entry?.updated);
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const cveMatch = /\b(CVE-\d{4}-\d{4,7})\b/i.exec(title);
    const loc = matchGeoLocation(title);

    out.push({
      id: `tech:${feed.name}:${url}`,
      title,
      titleVi: feed.subCategory === 'vn_tech' ? title : undefined,
      source: feed.name,
      subCategory: feed.subCategory,
      severity: inferTechSeverity(title, feed.subCategory),
      cveId: cveMatch ? cveMatch[1].toUpperCase() : undefined,
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

export interface CisaKevPayload {
  vulnerabilities?: Array<{
    cveID?: string;
    vendorProject?: string;
    product?: string;
    vulnerabilityName?: string;
    dateAdded?: string;
    shortDescription?: string;
    knownRansomwareCampaignUse?: string;
  }>;
}

export function normalizeCisaKevCatalog(
  payload: CisaKevPayload,
  fallbackNow = Date.now(),
): TechCyberItem[] {
  const list = payload?.vulnerabilities;
  if (!Array.isArray(list)) return [];

  const sorted = [...list]
    .filter((v) => v?.cveID && v?.vulnerabilityName)
    .sort((a, b) => String(b.dateAdded ?? '').localeCompare(String(a.dateAdded ?? '')))
    .slice(0, 8);

  return sorted.map((v) => {
    const cveId = String(v.cveID).trim().toUpperCase();
    const vendor = (v.vendorProject ?? '').trim();
    const vulnName = (v.vulnerabilityName ?? '').trim();
    const isRansomware = v.knownRansomwareCampaignUse === 'Known';
    const parsedDate = v.dateAdded ? Date.parse(`${v.dateAdded}T12:00:00Z`) : Number.NaN;
    const publishedAt = Number.isFinite(parsedDate) ? parsedDate : fallbackNow;

    return {
      id: `cisa-kev:${cveId}`,
      title: `${cveId} (${vendor}): ${vulnName}${isRansomware ? ' [Active Ransomware]' : ''}`,
      source: 'CISA KEV Exploit',
      subCategory: 'cyber',
      severity: isRansomware ? 'critical' : 'high',
      cveId,
      publishedAt,
      url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`,
    };
  });
}

export interface StatuspageSummaryPayload {
  status?: {
    indicator?: string;
    description?: string;
  };
}

export function normalizeStatuspageSummary(
  name: string,
  url: string,
  payload: StatuspageSummaryPayload,
): TechInfraStatus {
  const indicator = (payload?.status?.indicator ?? 'none').toLowerCase();
  const description = (payload?.status?.description ?? 'Operational').trim();

  let level: InfraStatusLevel = 'operational';
  if (indicator === 'major' || indicator === 'critical') {
    level = 'outage';
  } else if (indicator !== 'none' || /degraded|partial|minor|incident/i.test(description)) {
    level = 'degraded';
  }

  return {
    name,
    level,
    description,
    url,
  };
}

export function mergeBalancedTechItems(
  items: readonly TechCyberItem[],
  maxPerSource = 4,
): TechCyberItem[] {
  const sorted = [...items].sort((a, b) => b.publishedAt - a.publishedAt);
  const perSourceCounts = new Map<string, number>();
  const seenUrls = new Set<string>();
  const out: TechCyberItem[] = [];

  for (const item of sorted) {
    const cleanUrl = item.url.split('?')[0].toLowerCase();
    if (seenUrls.has(cleanUrl)) continue;

    const used = perSourceCounts.get(item.source) ?? 0;
    if (used >= maxPerSource) continue;

    seenUrls.add(cleanUrl);
    perSourceCounts.set(item.source, used + 1);
    out.push(item);
  }

  return out.slice(0, 180);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        const value = await worker(items[idx]);
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

export async function fetchTechCyberIntelligence(): Promise<TechCyberSnapshot> {
  const now = Date.now();

  const [feedResults, kevResult, hnResult, statusResults] = await Promise.all([
    mapWithConcurrency(TECH_CYBER_FEEDS, 10, async (feed) => {
      const { text } = await fetchTextWithTimeout(feed.url, {
        timeoutMs: 6_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      });
      return parseTechFeedXml(text, feed, now);
    }),
    fetchJsonWithTimeout<CisaKevPayload>(CISA_KEV_JSON_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }).catch(() => null),
    fetchHackerNewsTop().catch(() => []),
    Promise.allSettled(
      INFRA_STATUS_TARGETS.map(async (target) => {
        const summary = await fetchJsonWithTimeout<StatuspageSummaryPayload>(target.apiUrl, {
          timeoutMs: 5_000,
          retries: 0,
          userAgent: NAMED_APP_UA,
        });
        return normalizeStatuspageSummary(target.name, target.pageUrl, summary);
      }),
    ),
  ]);

  let activeSourceCount = 0;
  const rawItems: TechCyberItem[] = [];

  for (const res of feedResults) {
    if (res.status === 'fulfilled' && res.value.length > 0) {
      activeSourceCount += 1;
      rawItems.push(...res.value);
    }
  }

  if (kevResult) {
    const kevItems = normalizeCisaKevCatalog(kevResult, now);
    if (kevItems.length > 0) {
      activeSourceCount += 1;
      rawItems.push(...kevItems);
    }
  }

  if (hnResult.length > 0) {
    activeSourceCount += 1;
    for (const hn of hnResult.slice(0, 10)) {
      rawItems.push({
        id: `tech-hn:${hn.id}`,
        title: hn.title,
        titleVi: hn.titleVi,
        source: hn.source,
        subCategory: 'tech_infra',
        publishedAt: hn.publishedAt,
        url: hn.url,
        matchedLat: hn.matchedLat,
        matchedLon: hn.matchedLon,
        matchedLocation: hn.matchedLocation,
      });
    }
  }

  if (rawItems.length === 0) {
    throw new Error('All Tech/AI/Cyber intelligence feeds timed out');
  }

  const balanced = mergeBalancedTechItems(rawItems, 4);

  // Batch-translate all non-Vietnamese headlines using the shared cached translator
  const translatedTitles = await globalViTranslator.translateBatch(balanced.map((i) => i.title));
  const enrichedItems: TechCyberItem[] = balanced.map((item, idx) => ({
    ...item,
    titleVi: translatedTitles[idx] || item.titleVi || item.title,
  }));

  const infraStatus: TechInfraStatus[] = [];
  for (const sRes of statusResults) {
    if (sRes.status === 'fulfilled') {
      infraStatus.push(sRes.value);
    }
  }

  return {
    items: enrichedItems,
    infraStatus,
    activeSourceCount,
    updatedAt: now,
  };
}
