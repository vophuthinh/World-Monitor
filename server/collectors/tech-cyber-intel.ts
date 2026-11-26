import { parseFeedDate } from '../lib/feed-date';
import { XMLParser } from 'fast-xml-parser';
import { detectMitreTechniques } from '@shared/intelligence';
import type {
  GitHubTrendingPeriod,
  GitHubTrendingRepo,
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

  // 1b. Frontier AI & Agent CLI GitHub Releases (fchchen/news-dashboard pattern — 8 feeds, 0 API keys)
  { name: 'Release · Claude Code', subCategory: 'github_release', url: 'https://github.com/anthropics/claude-code/releases.atom', maxItems: 3 },
  { name: 'Release · OpenAI Codex', subCategory: 'github_release', url: 'https://github.com/openai/codex/releases.atom', maxItems: 3 },
  { name: 'Release · Gemini CLI', subCategory: 'github_release', url: 'https://github.com/google-gemini/gemini-cli/releases.atom', maxItems: 3 },
  { name: 'Release · Ollama', subCategory: 'github_release', url: 'https://github.com/ollama/ollama/releases.atom', maxItems: 3 },
  { name: 'Release · vLLM Engine', subCategory: 'github_release', url: 'https://github.com/vllm-project/vllm/releases.atom', maxItems: 3 },
  { name: 'Release · llama.cpp', subCategory: 'github_release', url: 'https://github.com/ggml-org/llama.cpp/releases.atom', maxItems: 3 },
  { name: 'Release · LangGraph', subCategory: 'github_release', url: 'https://github.com/langchain-ai/langgraph/releases.atom', maxItems: 2 },
  { name: 'Release · Cline AI', subCategory: 'github_release', url: 'https://github.com/cline/cline/releases.atom', maxItems: 2 },

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
  {
    name: 'Tạp chí TT&TT · An toàn thông tin',
    subCategory: 'vn_tech',
    url: 'https://news.google.com/rss/search?q=(site:ictvietnam.vn+OR+site:antoanthongtin.vn)+when:7d&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 5,
  },
  {
    name: 'VINASA · VNISA · Kinh tế số',
    subCategory: 'vn_tech',
    url: 'https://news.google.com/rss/search?q=(site:vinasa.org.vn+OR+site:vnisa.org.vn+OR+(site:vneconomy.vn+%22chuy%E1%BB%83n+%C4%91%E1%BB%95i+s%E1%BB%91%22))+when:7d&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 5,
  },
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
    const parsedTs = rawDate ? parseFeedDate(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const cveMatch = /\b(CVE-\d{4}-\d{4,7})\b/i.exec(title);
    const loc = matchGeoLocation(title);
    const mitreTtps = detectMitreTechniques(title);
    const displayTitle =
      feed.subCategory === 'github_release' && !title.toLowerCase().includes(feed.name.replace('Release · ', '').toLowerCase())
        ? `${feed.name.replace('Release · ', '')} phát hành phiên bản ${title}`
        : title;

    out.push({
      id: `tech:${feed.name}:${url}`,
      title: displayTitle,
      titleVi: feed.subCategory === 'vn_tech' || feed.subCategory === 'github_release' ? displayTitle : undefined,
      source: feed.name,
      subCategory: feed.subCategory,
      severity: inferTechSeverity(displayTitle, feed.subCategory),
      cveId: cveMatch ? cveMatch[1].toUpperCase() : undefined,
      ...(mitreTtps.length > 0 ? { mitreTtps } : {}),
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

    const titleText = `${cveId} (${vendor}): ${vulnName}${isRansomware ? ' [Active Ransomware]' : ''}`;
    const mitreTtps = detectMitreTechniques(`${titleText} ${v.shortDescription ?? ''}`);

    return {
      id: `cisa-kev:${cveId}`,
      title: titleText,
      source: 'CISA KEV Exploit',
      subCategory: 'cyber',
      severity: isRansomware ? 'critical' : 'high',
      cveId,
      ...(mitreTtps.length > 0 ? { mitreTtps } : {}),
      publishedAt,
      url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`,
    };
  });
}

async function fetchNvdRecentHighCves(now: number): Promise<TechCyberItem[]> {
  const startIso = new Date(now - 3 * 86_400_000).toISOString().split('.')[0] + '.000';
  const endIso = new Date(now).toISOString().split('.')[0] + '.000';
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${encodeURIComponent(startIso)}&pubEndDate=${encodeURIComponent(endIso)}&resultsPerPage=14`;

  const payload = await fetchJsonWithTimeout<Record<string, any>>(url, {
    timeoutMs: 7_500,
    retries: 0,
    userAgent: NAMED_APP_UA,
  });

  const vulns: any[] = Array.isArray(payload?.vulnerabilities) ? payload.vulnerabilities : [];
  const out: TechCyberItem[] = [];

  for (const row of vulns) {
    const cve = row?.cve;
    const cveId = String(cve?.id ?? '').trim().toUpperCase();
    if (!cveId.startsWith('CVE-')) continue;

    const descList: Array<{ lang?: string; value?: string }> = Array.isArray(cve?.descriptions)
      ? cve.descriptions
      : [];
    const desc = (descList.find((d) => d.lang === 'en')?.value ?? descList[0]?.value ?? '').trim();
    if (!desc) continue;

    const metric =
      cve?.metrics?.cvssMetricV31?.[0]?.cvssData ??
      cve?.metrics?.cvssMetricV40?.[0]?.cvssData ??
      cve?.metrics?.cvssMetricV30?.[0]?.cvssData;
    const score = typeof metric?.baseScore === 'number' ? metric.baseScore : undefined;
    if (score !== undefined && score < 6.5) continue;

    const shortDesc = desc.length > 135 ? `${desc.slice(0, 135)}…` : desc;
    const pubTs = cve?.published ? Date.parse(String(cve.published)) : now;
    const mitreTtps = detectMitreTechniques(`${cveId} ${desc}`);

    out.push({
      id: `nvd:${cveId}`,
      title: `${cveId}: ${shortDesc}`,
      source: 'NIST NVD CVE 2.0',
      subCategory: 'cyber',
      severity: (score ?? 7.5) >= 9.0 ? 'critical' : 'high',
      cveId,
      ...(score !== undefined ? { cvssScore: score } : {}),
      ...(mitreTtps.length > 0 ? { mitreTtps } : {}),
      publishedAt: Number.isFinite(pubTs) ? pubTs : now,
      url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`,
    });

    if (out.length >= 6) break;
  }

  return out;
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

  return out.slice(0, 220);
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

const GITHUB_TRENDING_DAILY_URL = 'https://github.com/trending?since=daily';
const GITHUB_TRENDING_WEEKLY_URL = 'https://github.com/trending?since=weekly';

export function parseGitHubTrendingHtml(
  html: string,
  period: GitHubTrendingPeriod = 'daily',
  maxRepos = 20,
): GitHubTrendingRepo[] {
  if (!html) return [];
  const articles = [...html.matchAll(/<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
  const out: GitHubTrendingRepo[] = [];

  for (const match of articles) {
    const block = match[1];
    const fullNameRaw = block.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href="\/([^"/?#]+\/[^"/?#]+)"/i)?.[1];
    if (!fullNameRaw) continue;

    const fullName = fullNameRaw.trim();
    const slashIdx = fullName.indexOf('/');
    if (slashIdx <= 0) continue;
    const owner = fullName.slice(0, slashIdx).trim();
    const repoName = fullName.slice(slashIdx + 1).trim();
    if (!owner || !repoName) continue;

    // Must use <p\b so SVG <path> tags inside Octicons are never matched
    const rawDesc = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
    const description = decodeHtmlEntities(rawDesc.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

    const language = block
      .match(/itemprop="programmingLanguage"[^>]*>([^<]+)</i)?.[1]
      ?.trim();
    const languageColor = block
      .match(/repo-language-color"[^>]*style="background-color:\s*([^";]+)"/i)?.[1]
      ?.trim();

    const rawStars = block.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/i)?.[1] ?? '0';
    const rawForks = block.match(/href="\/[^"]+\/forks"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/i)?.[1] ?? '0';
    const rawPeriodStars =
      block.match(/([\d,]+)\s+stars\s+(?:today|this week|this month)/i)?.[1] ?? '0';

    const totalStars = Number(rawStars.replace(/,/g, '')) || 0;
    const forks = Number(rawForks.replace(/,/g, '')) || 0;
    const periodStars = Number(rawPeriodStars.replace(/,/g, '')) || 0;

    out.push({
      id: `gh-trending:${period}:${fullName}`,
      rank: out.length + 1,
      fullName,
      owner,
      repoName,
      description,
      ...(language ? { language: decodeHtmlEntities(language) } : {}),
      ...(languageColor ? { languageColor } : {}),
      totalStars,
      forks,
      periodStars,
      period,
      url: `https://github.com/${fullName}`,
    });

    if (out.length >= maxRepos) break;
  }

  return out;
}

async function fetchGitHubTrendingPeriod(
  url: string,
  period: GitHubTrendingPeriod,
): Promise<GitHubTrendingRepo[]> {
  const { text } = await fetchTextWithTimeout(url, {
    timeoutMs: 7_500,
    retries: 0,
    userAgent: DEFAULT_BROWSER_UA,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  return parseGitHubTrendingHtml(text, period, 20);
}

export async function fetchTechCyberIntelligence(): Promise<TechCyberSnapshot> {
  const now = Date.now();

  const [
    feedResults,
    kevResult,
    nvdItems,
    hnResult,
    ghDailyRepos,
    ghWeeklyRepos,
    statusResults,
  ] = await Promise.all([
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
    fetchNvdRecentHighCves(now).catch(() => []),
    fetchHackerNewsTop().catch(() => []),
    fetchGitHubTrendingPeriod(GITHUB_TRENDING_DAILY_URL, 'daily').catch(() => []),
    fetchGitHubTrendingPeriod(GITHUB_TRENDING_WEEKLY_URL, 'weekly').catch(() => []),
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

  if (nvdItems.length > 0) {
    activeSourceCount += 1;
    rawItems.push(...nvdItems);
  }

  if (ghDailyRepos.length > 0) activeSourceCount += 1;
  if (ghWeeklyRepos.length > 0) activeSourceCount += 1;

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

  if (rawItems.length === 0 && ghDailyRepos.length === 0) {
    throw new Error('All Tech/AI/Cyber intelligence feeds timed out');
  }

  const balanced = mergeBalancedTechItems(rawItems, 4);

  // Batch-translate all non-Vietnamese headlines and GitHub Trending descriptions using the shared cached translator
  const allTextsToTranslate = [
    ...balanced.map((i) => i.title),
    ...ghDailyRepos.map((r) => r.description),
    ...ghWeeklyRepos.map((r) => r.description),
  ];
  const translatedAll = await globalViTranslator.translateBatch(allTextsToTranslate);

  const enrichedItems: TechCyberItem[] = balanced.map((item, idx) => ({
    ...item,
    titleVi: translatedAll[idx] || item.titleVi || item.title,
  }));

  const dailyOffset = balanced.length;
  const enrichedDaily: GitHubTrendingRepo[] = ghDailyRepos.map((repo, idx) => ({
    ...repo,
    descriptionVi: translatedAll[dailyOffset + idx] || repo.description,
  }));

  const weeklyOffset = dailyOffset + ghDailyRepos.length;
  const enrichedWeekly: GitHubTrendingRepo[] = ghWeeklyRepos.map((repo, idx) => ({
    ...repo,
    descriptionVi: translatedAll[weeklyOffset + idx] || repo.description,
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
    githubTrending: {
      daily: enrichedDaily,
      weekly: enrichedWeekly,
    },
    activeSourceCount,
    updatedAt: now,
  };
}
