import { XMLParser } from 'fast-xml-parser';
import type {
  HptCompanyIntelSnapshot,
  HptCompanyItem,
  HptItemCategory,
  HptSentiment,
  HptStockSnapshot,
} from '@shared/types';
import { callGroqChatCompletion } from '../lib/groq-intel';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { decodeHtmlEntities } from './polymarket-news';

// HPT Headquarters: Lô E2a-3, Đường D1, Khu Công nghệ cao (SHTP), TP. Thủ Đức, TP.HCM
const HPT_HQ_LAT = 10.8411;
const HPT_HQ_LON = 106.8099;

const CAFEF_HPT_NEWS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=18&Type=1';
const CAFEF_HPT_EVENTS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=12&Type=2';
const HPT_CO_DONG_URL = 'https://hpt.vn/co-dong';
const HPT_TIN_TUC_URL = 'https://hpt.vn/tin-tuc';

const HPT_GNEWS_FEEDS: ReadonlyArray<{ name: string; url: string }> = [
  {
    name: 'Google News · HPT',
    url: 'https://news.google.com/rss/search?q=%22C%C3%B4ng+ty+HPT%22+OR+%22m%C3%A3+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Diễn đàn & Báo CK (F319/Vietstock/CafeF)',
    url: 'https://news.google.com/rss/search?q=(site:f319.com+OR+site:f247.com+OR+site:voz.vn+OR+site:tinhte.vn+OR+site:vietstock.vn+OR+site:cafef.vn+OR+site:tinnhanhchungkhoan.vn)+%22HPT%22&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'MXH Công khai (FB/LinkedIn/YouTube)',
    url: 'https://news.google.com/rss/search?q=(site:facebook.com+OR+site:linkedin.com+OR+site:youtube.com+OR+site:tiktok.com)+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22C%C3%B4ng+ty+HPT%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
];

// ============================================================================
// 1. Strict HPT Context Disambiguation Filter (Blocks 3-letter Acronym Noise)
// ============================================================================

const HPT_WORD_RE = /\bHPT\b/i;

const HPT_FALSE_POSITIVE_NOISE_RE =
  /\b(hải phòng tourist|hai phong tourist|hypertension|pulmonary|hyperparathyroidism|high[- ]pressure turbine|blade inspection|bệnh nhân|huyết áp|phẫu thuật|y khoa|clinical study)\b/i;

const HPT_VALID_CONTEXT_RE =
  /(công nghệ|tin học|hạ tầng|chuyển đổi số|tích hợp hệ thống|an toàn thông tin|an ninh mạng|bảo mật|cyber|ai\b|trí tuệ nhân tạo|điện toán|cloud|lượng tử|microsoft|netapp|cisco|oracle|vnpt|cổ phiếu|mã hpt|hpt\s*:|upcom|hnx|hose|ubck|chứng khoán|cổ tức|chốt quyền|đkcc|phát hành|cổ đông|hđqt|hội đồng quản trị|đhđcđ|nghị quyết|báo cáo tài chính|quản trị công ty|lợi nhuận|doanh thu|đấu thầu|trúng thầu|ngô vi đồng|đinh hà duy linh|hpt\.vn)/i;

export function isAuthenticHptMention(title: string, snippet = '', url = ''): boolean {
  const combined = `${title} ${snippet}`.trim();
  if (!combined) return false;

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('hpt.vn')) return true;

  if (!HPT_WORD_RE.test(combined)) return false;
  if (HPT_FALSE_POSITIVE_NOISE_RE.test(combined)) return false;

  return HPT_VALID_CONTEXT_RE.test(combined);
}

export function classifyHptBadgeAndSentiment(
  title: string,
  category: HptItemCategory,
): { badge: string; sentiment: HptSentiment } {
  const lower = title.toLowerCase();

  if (/nghị quyết.*hội đồng quản trị|nq-hđqt|nghị quyết hđqt/.test(lower)) {
    return {
      badge: 'NGHỊ QUYẾT HĐQT',
      sentiment: /cổ tức|phát hành|thông qua|phê duyệt/.test(lower) ? 'positive' : 'neutral',
    };
  }
  if (/cổ tức|đăng ký cuối cùng|chốt quyền|phát hành cổ phiếu để trả cổ tức/.test(lower)) {
    return { badge: 'CỔ TỨC / CHỐT QUYỀN', sentiment: 'positive' };
  }
  if (/ủy ban chứng khoán|ubck|hnx|công bố thông tin|chấp thuận/.test(lower)) {
    return { badge: 'UBCKNN / HNX', sentiment: 'positive' };
  }
  if (/báo cáo tài chính|báo cáo tình hình quản trị|kết quả kinh doanh|kiểm toán/.test(lower)) {
    const isPos = /tăng trưởng|lãi|vượt|chấp thuận|top\s*10/.test(lower);
    const isNeg = /lỗ|sụt giảm|phạt|chậm nộp|cảnh báo/.test(lower);
    return {
      badge: 'BÁO CÁO / QUẢN TRỊ',
      sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral',
    };
  }
  if (/đại hội đồng cổ đông|đhđcđ/.test(lower)) {
    return { badge: 'ĐHĐCĐ HPT', sentiment: 'neutral' };
  }

  if (category === 'shareholder_ir') {
    return { badge: 'QUAN HỆ CỔ ĐÔNG', sentiment: 'neutral' };
  }
  if (category === 'tech_activity') {
    const isRiskTopic = /tấn công|lỗ hổng|rủi ro|đe dọa|mã độc/.test(lower);
    return {
      badge: 'HPT TECH · AI · CYBER',
      sentiment: isRiskTopic ? 'neutral' : 'positive',
    };
  }

  const isNeg = /giảm sàn|thua lỗ|bị phạt|cảnh báo|rủi ro|bán tháo/.test(lower);
  const isPos =
    /tăng trần|trúng thầu|hợp tác|cổ tức|tăng trưởng|top\s*10|đột phá|khởi sắc/.test(lower);
  return {
    badge: 'BÁO CHÍ · DIỄN ĐÀN',
    sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral',
  };
}

// ============================================================================
// 2. Parsers for CafeF (HNX/UBCKNN Mirror), hpt.vn Official IR/Tech & RSS
// ============================================================================

function parseVnDateString(dateStr: string, fallbackNow: number): { ts: number; dateLabel?: string } {
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
    const linkMatch = li.match(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].split('?')[0].trim();
    const title = decodeHtmlEntities(linkMatch[2]);
    if (!title || title.length < 10) continue;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : `https://cafef.vn${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

    const { ts, dateLabel } = parseVnDateString(timeMatch?.[1] ?? '', fallbackNow);
    const { badge, sentiment } = classifyHptBadgeAndSentiment(title, 'exchange_filing');

    out.push({
      id: `hpt-cbtt:${fullUrl}`,
      title,
      category: 'exchange_filing',
      badge,
      source: 'HNX / UBCKNN (qua CafeF)',
      publishedAt: ts,
      dateLabel,
      url: fullUrl,
      sentiment,
    });
  }

  return out;
}

const pdfAttachmentCache = new Map<string, string | null>();

async function enrichTopDisclosuresWithPdfLinks(items: HptCompanyItem[]): Promise<void> {
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

export function parseHptOfficialSiteHtml(
  html: string,
  category: 'shareholder_ir' | 'tech_activity',
  fallbackNow = Date.now(),
): HptCompanyItem[] {
  if (!html) return [];
  const pathPrefix = category === 'shareholder_ir' ? '/co-dong/' : '/tin-tuc/';
  const matches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  const seenUrls = new Set<string>();
  const out: HptCompanyItem[] = [];

  for (const m of matches) {
    const rawHref = m[1].trim();
    if (!rawHref.includes(pathPrefix) || rawHref.includes('/cat/')) continue;

    const title = decodeHtmlEntities(m[2]);
    if (!title || title.length < 22) continue;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : `https://hpt.vn${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    const dateInTitle = parseVnDateString(title, fallbackNow - out.length * 3_600_000);
    const { badge, sentiment } = classifyHptBadgeAndSentiment(title, category);

    out.push({
      id: `hpt-web:${fullUrl}`,
      title,
      category,
      badge,
      source: category === 'shareholder_ir' ? 'HPT Quan hệ Cổ đông (hpt.vn)' : 'HPT Tin tức Công nghệ (hpt.vn)',
      publishedAt: dateInTitle.ts,
      dateLabel: dateInTitle.dateLabel,
      url: fullUrl,
      sentiment,
    });

    if (out.length >= 12) break;
  }

  return out;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function parseHptMentionRss(xml: string, feedLabel: string, fallbackNow: number): HptCompanyItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const out: HptCompanyItem[] = [];

  for (const entry of entries.slice(0, 15)) {
    const fullTitle = decodeHtmlEntities(String(entry?.title ?? ''));
    const rawDesc = decodeHtmlEntities(String(entry?.description ?? ''));
    const link = String(entry?.link ?? '').trim();
    if (!fullTitle || !link.startsWith('http')) continue;

    // Extract trailing "- SourceName" from Google News titles
    const parts = fullTitle.split(/\s+-\s+/);
    const publisher = parts.length >= 2 ? parts[parts.length - 1].trim() : feedLabel;
    const cleanTitle = parts.length >= 2 ? parts.slice(0, -1).join(' - ').trim() : fullTitle;

    if (!isAuthenticHptMention(cleanTitle, rawDesc, link)) {
      continue;
    }

    const rawDate = String(entry?.pubDate ?? '');
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;
    const { badge, sentiment } = classifyHptBadgeAndSentiment(cleanTitle, 'press_social');

    out.push({
      id: `hpt-mention:${link}`,
      title: cleanTitle,
      category: 'press_social',
      badge,
      source: publisher,
      publishedAt,
      url: link,
      sentiment,
    });
  }

  return out;
}

// ============================================================================
// 3. Groq LPU AI Verification + Sentiment Analysis (Cached per Article ID)
// ============================================================================

export interface ParsedHptAiVerdict {
  isHpt: boolean;
  sentiment: HptSentiment;
  summary: string;
}

export function parseGroqHptSentimentBatch(rawText: string): Map<number, ParsedHptAiVerdict> {
  const map = new Map<number, ParsedHptAiVerdict>();
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/^[-*•\s]+/, '').trim();
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 4) continue;
    const idx = Number.parseInt(parts[0], 10);
    if (!Number.isFinite(idx)) continue;

    const isHpt = /^YES$/i.test(parts[1]);
    const sentCode = parts[2].toUpperCase();
    const sentiment: HptSentiment =
      sentCode === 'POSITIVE' ? 'positive' : sentCode === 'NEGATIVE' ? 'negative' : 'neutral';
    const summary = parts.slice(3).join(' | ').replace(/\*\*/g, '').trim();

    map.set(idx, { isHpt, sentiment, summary });
  }
  return map;
}

const aiHptCache = new Map<string, ParsedHptAiVerdict>();

async function maybeEnrichHptWithGroqSentiment(items: HptCompanyItem[]): Promise<{
  items: HptCompanyItem[];
  aiEnabled: boolean;
}> {
  const hasKey = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
  if (!hasKey || items.length === 0) {
    return { items, aiEnabled: false };
  }

  const uncached = items.filter((i) => !aiHptCache.has(i.id)).slice(0, 6);
  if (uncached.length > 0) {
    const numbered = uncached.map((it, idx) => `${idx} | [${it.source}] ${it.title}`).join('\n');
    const llm = await callGroqChatCompletion(
      [
        {
          role: 'system',
          content:
            'Bạn là Chuyên gia Phân tích Chứng khoán & Công nghệ Việt Nam. Với mỗi dòng tiêu đề dưới đây, hãy kiểm tra xem tin đó có đang nói về Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT (mã cổ phiếu HPT sàn UPCoM, hoạt động CNTT/An ninh mạng/AI tại Việt Nam) hay không. Trả lời ĐÚNG định dạng mỗi dòng 4 trường cách nhau bởi dấu | (không thêm chữ thừa):\n<chỉ_số>|YES hoặc NO|POSITIVE hoặc NEGATIVE hoặc NEUTRAL|<Tóm tắt ý nghĩa 1 câu tiếng Việt ngắn dưới 20 từ>',
        },
        {
          role: 'user',
          content: numbered,
        },
      ],
      { maxTokens: 420, temperature: 0.1, timeoutMs: 7_500 },
    );

    if (llm) {
      const parsed = parseGroqHptSentimentBatch(llm.text);
      for (const [idx, verdict] of parsed.entries()) {
        const target = uncached[idx];
        if (target) {
          aiHptCache.set(target.id, verdict);
        }
      }
    }
  }

  const filtered: HptCompanyItem[] = [];
  for (const item of items) {
    const cached = aiHptCache.get(item.id);
    if (!cached) {
      filtered.push(item);
      continue;
    }
    // Official filings from HNX/CafeF/hpt.vn are guaranteed HPT; external mentions marked NO by AI are dropped!
    if (!cached.isHpt && item.category === 'press_social') {
      continue;
    }
    filtered.push({
      ...item,
      sentiment: cached.sentiment,
      aiSummary: cached.summary || item.aiSummary,
      aiVerified: true,
    });
  }

  return { items: filtered, aiEnabled: true };
}

// ============================================================================
// 4. Live HPT UPCoM Stock Quote + Combined Corporate Intelligence Collector
// ============================================================================

async function fetchHptUpcomStock(now: number): Promise<HptStockSnapshot | null> {
  try {
    const toSec = Math.floor(now / 1000);
    const fromSec = toSec - 45 * 86_400;
    const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=HPT&from=${fromSec}&to=${toSec}`;
    const dchart = await fetchJsonWithTimeout<{
      c?: number[];
      v?: number[];
      h?: number[];
      l?: number[];
    }>(url, {
      timeoutMs: 7_000,
      retries: 1,
      userAgent: DEFAULT_BROWSER_UA,
      headers: { Accept: '*/*' },
    });

    const closes = (dchart?.c ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (closes.length === 0) return null;

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
      hqLat: HPT_HQ_LAT,
      hqLon: HPT_HQ_LON,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

export async function fetchHptCompanyIntelligence(
  previous?: HptCompanyIntelSnapshot | null,
): Promise<HptCompanyIntelSnapshot> {
  const now = Date.now();

  const [stockRes, cfNewsRes, cfEventsRes, coDongRes, tinTucRes, ...gnewsResults] =
    await Promise.allSettled([
      fetchHptUpcomStock(now),
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
      fetchTextWithTimeout(HPT_CO_DONG_URL, {
        timeoutMs: 8_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
      }),
      fetchTextWithTimeout(HPT_TIN_TUC_URL, {
        timeoutMs: 8_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
      }),
      ...HPT_GNEWS_FEEDS.map(async (f) => {
        const { text } = await fetchTextWithTimeout(f.url, {
          timeoutMs: 7_500,
          retries: 0,
          userAgent: DEFAULT_BROWSER_UA,
        });
        return parseHptMentionRss(text, f.name, now);
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
  if (coDongRes.status === 'fulfilled') {
    const items = parseHptOfficialSiteHtml(coDongRes.value.text, 'shareholder_ir', now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  if (tinTucRes.status === 'fulfilled') {
    const items = parseHptOfficialSiteHtml(tinTucRes.value.text, 'tech_activity', now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  for (const r of gnewsResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sourceCount += 1;
      rawCollected.push(...r.value);
    }
  }

  const byKey = new Map<string, HptCompanyItem>();
  for (const item of rawCollected) {
    const normTitle = item.title
      .toLowerCase()
      .replace(/^hpt\s*[-:]\s*/i, '')
      .slice(0, 72);
    const existing = byKey.get(normTitle);
    if (!existing || (item.category === 'exchange_filing' && existing.category !== 'exchange_filing')) {
      byKey.set(normTitle, item);
    }
  }

  let deduped = [...byKey.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 48);

  if (deduped.length === 0 && previous?.items.length) {
    deduped = previous.items;
  }

  await enrichTopDisclosuresWithPdfLinks(deduped);
  const enriched = await maybeEnrichHptWithGroqSentiment(deduped);

  const stock =
    stockRes.status === 'fulfilled' && stockRes.value
      ? stockRes.value
      : (previous?.stock ?? null);

  if (!stock && enriched.items.length === 0) {
    throw new Error('All HPT corporate intelligence & UPCoM quote sources failed');
  }

  return {
    stock,
    items: enriched.items,
    sourceCount: Math.max(sourceCount, 1),
    aiSentimentEnabled: enriched.aiEnabled,
    updatedAt: now,
  };
}
