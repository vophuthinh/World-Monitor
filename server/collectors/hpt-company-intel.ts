import { XMLParser } from 'fast-xml-parser';
import type {
  HptCompanyIntelSnapshot,
  HptCompanyItem,
  HptFundamentals,
  HptItemCategory,
  HptSentiment,
  HptStockSnapshot,
} from '@shared/types';
import { callGroqChatCompletion } from '../lib/groq-intel';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { decodeHtmlEntities } from './polymarket-news';

// HPT Tax Code & Headquarters (Khu Công nghệ cao TP.HCM — SHTP)
export const HPT_TAX_CODE = '0301447436';
const HPT_HQ_LAT = 10.8411;
const HPT_HQ_LON = 106.8099;

const SIMPLIZE_HPT_SUMMARY_URL = 'https://api2.simplize.vn/api/company/summary/HPT';
const CAFEF_HPT_NEWS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=18&Type=1';
const CAFEF_HPT_EVENTS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=12&Type=2';
const BAOMOI_HPT_SEARCH_URL =
  'https://baomoi.com/tim-kiem/C%C3%B4ng-ngh%E1%BB%87-Tin-h%E1%BB%8Dc-HPT.epi';

interface ExternalRssFeedDef {
  name: string;
  defaultCategory: HptItemCategory;
  url: string;
}

// 100% Independent Third-Party Feeds (hpt.vn is strictly excluded per user requirement)
const HPT_EXTERNAL_FEEDS: readonly ExternalRssFeedDef[] = [
  {
    name: 'Đấu thầu & Dự án (Báo Đấu thầu / MST 0301447436)',
    defaultCategory: 'bidding_project',
    url: 'https://news.google.com/rss/search?q=(%22HPT%22+OR+%220301447436%22)+(%22tr%C3%BAng+th%E1%BA%A7u%22+OR+%22g%C3%B3i+th%E1%BA%A7u%22+OR+%22%C4%91%E1%BA%A5u+th%E1%BA%A7u%22+OR+%22l%E1%BB%B1a+ch%E1%BB%8Dn+nh%C3%A0+th%E1%BA%A7u%22+OR+site:baodauthau.vn)+(%22c%C3%B4ng+ngh%E1%BB%87%22+OR+%22tin+h%E1%BB%8Dc%22+OR+%22ng%C3%A2n+h%C3%A0ng%22+OR+%22an+to%C3%A0n+th%C3%B4ng+tin%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Báo CNTT · Chuyển đổi số · Hiệp hội VINASA/VNISA',
    defaultCategory: 'it_press_partner',
    url: 'https://news.google.com/rss/search?q=(site:ictvietnam.vn+OR+site:vietnamnet.vn+OR+site:vneconomy.vn+OR+site:nhipsongthitruong.vn+OR+site:antoanthongtin.vn+OR+site:vinasa.org.vn+OR+site:vnisa.org.vn)+%22HPT%22&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Hệ sinh thái Hãng Quốc tế (Microsoft / IBM / Cisco / NetApp)',
    defaultCategory: 'it_press_partner',
    url: 'https://news.google.com/rss/search?q=%22HPT%22+(%22Vi%E1%BB%87t+Nam%22+OR+%22Vietnam%22)+(Microsoft+OR+IBM+OR+Cisco+OR+Oracle+OR+NetApp+OR+Fortinet+OR+%22Sao+Khu%C3%AA%22+OR+VINASA+OR+VNISA)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Cổ đông nội bộ & Phân tích Tài chính (CafeF / Vietstock)',
    defaultCategory: 'exchange_filing',
    url: 'https://news.google.com/rss/search?q=(%22m%C3%A3+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22)+(%22c%E1%BB%95+%C4%91%C3%B4ng%22+OR+%22n%E1%BB%99i+b%E1%BB%99%22+OR+%22c%E1%BB%95+t%E1%BB%A9c%22+OR+%22l%E1%BB%A3i+nhu%E1%BA%ADn%22+OR+%22doanh+thu%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Bing News Search · Công nghệ Tin học HPT',
    defaultCategory: 'press_social',
    url: 'https://www.bing.com/news/search?q=%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22&format=rss&mkt=vi-VN',
  },
  {
    name: 'Bing News Search · Cổ phiếu HPT',
    defaultCategory: 'press_social',
    url: 'https://www.bing.com/news/search?q=%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22&format=rss&mkt=vi-VN',
  },
  {
    name: 'Pháp lý · Thuế · Sở hữu trí tuệ (MST 0301447436)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(%220301447436%22+OR+%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22)+(%22thu%E1%BA%BF%22+OR+%22s%E1%BB%9F+h%E1%BB%AFu+tr%C3%AD+tu%E1%BB%87%22+OR+%22ch%E1%BB%A9ng+nh%E1%BA%ADn%22+OR+%22t%C3%B2a+%C3%A1n%22+OR+%22%C4%91%C4%83ng+k%C3%BD+kinh+doanh%22+OR+%22k%C3%BD+k%E1%BA%BFt%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Diễn đàn & MXH Công khai (F319 / Voz / FB / LinkedIn)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(site:f319.com+OR+site:f247.com+OR+site:voz.vn+OR+site:tinhte.vn+OR+site:facebook.com+OR+site:linkedin.com+OR+site:youtube.com)+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22m%C3%A3+HPT%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
];

// ============================================================================
// 1. Strict HPT Context Filter + Self-Website Exclusion (NO hpt.vn!)
// ============================================================================

const HPT_WORD_OR_TAX_RE = /\b(HPT|0301447436)\b/i;

const HPT_FALSE_POSITIVE_NOISE_RE =
  /\b(hải phòng tourist|hai phong tourist|hypertension|pulmonary|hyperparathyroidism|high[- ]pressure turbine|blade inspection|bệnh nhân|huyết áp|phẫu thuật|y khoa|clinical study)\b/i;

const HPT_VALID_CONTEXT_RE =
  /(0301447436|công nghệ|tin học|hạ tầng|chuyển đổi số|tích hợp hệ thống|an toàn thông tin|an ninh mạng|bảo mật|soc\b|erp\b|cyber|ai\b|trí tuệ nhân tạo|điện toán|cloud|lượng tử|microsoft|ibm|netapp|cisco|oracle|fortinet|vnpt|vinasa|vnisa|sao khuê|cổ phiếu|mã hpt|hpt\s*:|upcom|hnx|hose|ubck|chứng khoán|cổ tức|chốt quyền|đkcc|phát hành|cổ đông|hđqt|hội đồng quản trị|đhđcđ|nghị quyết|báo cáo tài chính|quản trị công ty|lợi nhuận|doanh thu|đấu thầu|trúng thầu|gói thầu|nhà thầu|ngô vi đồng|đinh hà duy linh)/i;

export function isAuthenticHptMention(title: string, snippet = '', url = ''): boolean {
  const lowerUrl = url.toLowerCase();
  // Explicitly block company self-PR from hpt.vn per user instruction
  if (lowerUrl.includes('hpt.vn')) {
    return false;
  }

  const combined = `${title} ${snippet}`.trim();
  if (!combined) return false;

  if (!HPT_WORD_OR_TAX_RE.test(combined)) return false;
  if (HPT_FALSE_POSITIVE_NOISE_RE.test(combined)) return false;

  return HPT_VALID_CONTEXT_RE.test(combined);
}

export function classifyHptExternalItem(
  title: string,
  source = '',
  url = '',
  fallbackCategory: HptItemCategory = 'press_social',
): { category: HptItemCategory; badge: string; sentiment: HptSentiment } {
  const lower = title.toLowerCase();
  const hay = `${lower} ${source.toLowerCase()} ${url.toLowerCase()}`;

  // 1. Public Procurement & Bidding (muasamcong / Báo Đấu thầu / Bank & Ministry contracts)
  if (/gói thầu|đấu thầu|trúng thầu|mời thầu|nhà thầu|baodauthau|muasamcong|0301447436/.test(hay)) {
    const lostBid =
      /thắng hpt|vượt hpt|trượt thầu|bị loại|hủy thầu|kiến nghị/.test(lower);
    const wonBid = /hpt trúng|liên danh.*hpt.*trúng|ký kết|chọn hpt|trúng nhiều gói thầu/.test(lower);
    return {
      category: 'bidding_project',
      badge: 'ĐẤU THẦU · DỰ ÁN',
      sentiment: lostBid ? 'negative' : wonBid ? 'positive' : 'neutral',
    };
  }

  // 2. Exchange Filings, Insider Trades & Dividends
  if (/nghị quyết.*hội đồng quản trị|nq-hđqt|nghị quyết hđqt/.test(lower)) {
    return {
      category: 'exchange_filing',
      badge: 'NGHỊ QUYẾT HĐQT',
      sentiment: /cổ tức|phát hành|thông qua|phê duyệt/.test(lower) ? 'positive' : 'neutral',
    };
  }
  if (/cổ tức|đăng ký cuối cùng|chốt quyền|phát hành cổ phiếu để trả cổ tức/.test(lower)) {
    return { category: 'exchange_filing', badge: 'CỔ TỨC / CHỐT QUYỀN', sentiment: 'positive' };
  }
  if (/ủy ban chứng khoán|ubck|hnx|công bố thông tin/.test(lower)) {
    return { category: 'exchange_filing', badge: 'UBCKNN / HNX', sentiment: 'positive' };
  }
  if (/cổ đông lớn|cổ đông nội bộ|đăng ký mua|đăng ký bán|báo cáo tài chính|quản trị công ty/.test(lower)) {
    const isNeg = /đăng ký bán|thoái vốn|thua lỗ|sụt giảm|bị phạt/.test(lower);
    const isPos = /đăng ký mua|gom thêm|vượt kế hoạch|tăng trưởng|lãi/.test(lower);
    return {
      category: 'exchange_filing',
      badge: 'CỔ ĐÔNG · TÀI CHÍNH',
      sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral',
    };
  }

  // 3. IT Trade Press, Associations (VINASA / VNISA / Sao Khuê) & Global Tech Vendors
  if (
    /microsoft|ibm|cisco|oracle|netapp|fortinet|vinasa|vnisa|sao khuê|chìa khóa vàng|ictvietnam|vietnamnet|antoanthongtin|vneconomy|nhipsongthitruong|liên doanh|hợp tác/.test(
      hay,
    ) ||
    fallbackCategory === 'it_press_partner'
  ) {
    const isAwardOrPartner =
      /đạt danh hiệu|partner|sao khuê|giải thưởng|ký kết|liên doanh|top\s*10|tiên phong|vượt kế hoạch/.test(
        lower,
      );
    return {
      category: 'it_press_partner',
      badge: /microsoft|ibm|cisco|oracle|netapp|vinasa|vnisa|sao khuê|liên doanh/.test(hay)
        ? 'ĐỐI TÁC · HIỆP HỘI'
        : 'BÁO CHUYÊN NGÀNH CNTT',
      sentiment: isAwardOrPartner ? 'positive' : 'neutral',
    };
  }

  // 4. Legal / Tax / IP / Press & Community Forums
  if (/bản án|tranh chấp|kiện tụng|xử phạt|truy thu thuế/.test(lower)) {
    return { category: 'press_social', badge: 'PHÁP LÝ · THUẾ', sentiment: 'negative' };
  }
  if (/sở hữu trí tuệ|nhãn hiệu|bằng sáng chế|chứng nhận/.test(lower)) {
    return { category: 'press_social', badge: 'SỞ HỮU TRÍ TUỆ', sentiment: 'positive' };
  }

  const isNeg = /giảm sàn|thua lỗ|bị phạt|cảnh báo|rủi ro/.test(lower);
  const isPos = /tăng trần|tăng trưởng|hoàn thành vượt|khởi sắc|đột phá|hợp tác/.test(lower);
  return {
    category: fallbackCategory,
    badge: 'BÁO MỚI · BING · DIỄN ĐÀN',
    sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral',
  };
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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function extractBingRealUrl(rawLink: string): string {
  try {
    const parsed = new URL(rawLink);
    const embedded = parsed.searchParams.get('url');
    if (embedded && embedded.startsWith('http')) return embedded;
  } catch {
    // Keep rawLink
  }
  return rawLink;
}

function parseHptExternalRss(
  xml: string,
  feed: ExternalRssFeedDef,
  fallbackNow: number,
): HptCompanyItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const out: HptCompanyItem[] = [];

  for (const entry of entries.slice(0, 16)) {
    const fullTitle = decodeHtmlEntities(String(entry?.title ?? ''));
    const rawDesc = decodeHtmlEntities(String(entry?.description ?? ''));
    const rawLink = String(entry?.link ?? '').trim();
    if (!fullTitle || !rawLink.startsWith('http')) continue;

    const link = rawLink.includes('bing.com/news/apiclick') ? extractBingRealUrl(rawLink) : rawLink;
    if (link.toLowerCase().includes('hpt.vn')) continue;

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

    if (!isAuthenticHptMention(cleanTitle, rawDesc, link)) {
      continue;
    }

    const rawDate = String(entry?.pubDate ?? '');
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyHptExternalItem(cleanTitle, publisher, link, feed.defaultCategory);

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

  const uncached = items.filter((i) => !aiHptCache.has(i.id)).slice(0, 8);
  if (uncached.length > 0) {
    const numbered = uncached.map((it, idx) => `${idx} | [${it.source}] ${it.title}`).join('\n');
    const llm = await callGroqChatCompletion(
      [
        {
          role: 'system',
          content:
            'Bạn là Chuyên gia Phân tích Chứng khoán & Đấu thầu CNTT Việt Nam. Với mỗi dòng tiêu đề dưới đây, hãy xác nhận xem tin đó có đang nói về Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT (mã HPT sàn UPCoM, MST 0301447436, tích hợp hệ thống & an toàn thông tin) hay không. Lưu ý: nếu HPT trượt thầu/thua thầu thì đánh giá NEGATIVE; trúng thầu/chia cổ tức/đạt giải thưởng đối tác thì POSITIVE. Trả lời ĐÚNG định dạng mỗi dòng 4 trường cách nhau bởi dấu | (không thêm chữ thừa):\n<chỉ_số>|YES hoặc NO|POSITIVE hoặc NEGATIVE hoặc NEUTRAL|<Tóm tắt tác động 1 câu tiếng Việt ngắn dưới 20 từ>',
        },
        {
          role: 'user',
          content: numbered,
        },
      ],
      { maxTokens: 460, temperature: 0.1, timeoutMs: 7_500 },
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
    if (!cached.isHpt && item.source !== 'HNX / UBCKNN (qua CafeF)') {
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
// 4. Live HPT UPCoM Stock + Simplize Fundamentals + Independent Multi-Source Collector
// ============================================================================

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

export async function fetchHptCompanyIntelligence(
  previous?: HptCompanyIntelSnapshot | null,
): Promise<HptCompanyIntelSnapshot> {
  const now = Date.now();

  const [stockRes, cfNewsRes, cfEventsRes, baoMoiRes, ...extResults] = await Promise.allSettled([
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
    ...HPT_EXTERNAL_FEEDS.map(async (feed) => {
      const { text } = await fetchTextWithTimeout(feed.url, {
        timeoutMs: 7_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
      });
      return parseHptExternalRss(text, feed, now);
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
  for (const r of extResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sourceCount += 1;
      rawCollected.push(...r.value);
    }
  }

  // Final safety guard: never allow any hpt.vn link into the stream
  const cleanExternalOnly = rawCollected.filter((it) => !it.url.toLowerCase().includes('hpt.vn'));

  const byKey = new Map<string, HptCompanyItem>();
  for (const item of cleanExternalOnly) {
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
    .slice(0, 56);

  if (deduped.length === 0 && previous?.items.length) {
    deduped = previous.items.filter((it) => !it.url.toLowerCase().includes('hpt.vn'));
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
