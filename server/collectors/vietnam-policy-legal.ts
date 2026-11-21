import { XMLParser } from 'fast-xml-parser';
import type { LegalDocType, PolicyLegalItem, PolicyLegalSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../lib/http';
import { decodeHtmlEntities } from './polymarket-news';

const VANBAN_CHINHPHU_LIST_URL = 'https://vanban.chinhphu.vn/he-thong-van-ban?classid=1&mode=1';

interface LegalRssFeedDef {
  name: string;
  url: string;
  maxItems: number;
}

export const VIETNAM_LEGAL_FEEDS: readonly LegalRssFeedDef[] = [
  {
    name: 'Công báo Chính phủ (Văn bản mới)',
    url: 'https://congbao.chinhphu.vn/cac-van-ban-moi-ban-hanh.rss',
    maxItems: 15,
  },
  {
    name: 'Công báo Chính phủ (Số mới đăng)',
    url: 'https://congbao.chinhphu.vn/cac-so-cong-bao-moi-dang.rss',
    maxItems: 8,
  },
  {
    name: 'Xây dựng Chính sách & Pháp luật',
    url: 'https://xaydungchinhsach.chinhphu.vn/chinh-sach-moi.rss',
    maxItems: 12,
  },
  {
    name: 'Cổng Chính sách & Pháp luật (Tin mới)',
    url: 'https://xaydungchinhsach.chinhphu.vn/tin-moi-nhat.rss',
    maxItems: 10,
  },
  {
    name: 'Báo Điện tử Chính phủ (Chính sách)',
    url: 'https://baochinhphu.vn/chinh-sach-va-cuoc-song.rss',
    maxItems: 10,
  },
  {
    name: 'Thư Viện Pháp Luật',
    url: 'https://thuvienphapluat.vn/rss.xml',
    maxItems: 12,
  },
  {
    name: 'Google News · Nghị quyết 57 & 66',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+quy%E1%BA%BFt+57%22+OR+%22Ngh%E1%BB%8B+quy%E1%BA%BFt+66%22+OR+%2257-NQ%2FTW%22+OR+%2266-NQ%2FTW%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 10,
  },
  {
    name: 'Google News · Nghị định & Nghị quyết mới',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+%C4%91%E1%BB%8Bnh%22+OR+%22Ngh%E1%BB%8B+quy%E1%BA%BFt%22+Ch%C3%ADnh+ph%E1%BB%A7&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 10,
  },
];

const SECTOR_RULES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'Khoa học - Công nghệ & Đổi mới sáng tạo',
    pattern: /\b(khoa học|công nghệ|đổi mới sáng tạo|bán dẫn|trí tuệ nhân tạo|ai\b|nghiên cứu|nghị quyết 57|57-nq\/tw)\b/i,
  },
  {
    label: 'Chuyển đổi số & Dữ liệu quốc gia',
    pattern: /\b(chuyển đổi số|dữ liệu|viễn thông|mạng|chính phủ số|giao dịch điện tử|căn cước|định danh)\b/i,
  },
  {
    label: 'Tài chính · Thuế · Ngân hàng · Tín dụng',
    pattern: /\b(tài chính|thuế|ngân sách|tín dụng|ngân hàng|lãi suất|chứng khoán|trái phiếu|hải quan|kho bạc|tiền tệ)\b/i,
  },
  {
    label: 'Đất đai · Xây dựng · Nhà ở · Bất động sản',
    pattern: /\b(đất đai|nhà ở|bất động sản|xây dựng|quy hoạch|đô thị|giải phóng mặt bằng)\b/i,
  },
  {
    label: 'Cải cách Thể chế & Thủ tục hành chính',
    pattern: /\b(thủ tục hành chính|tổ chức bộ máy|tinh gọn|phân cấp|phân quyền|nghị quyết 66|66-nq|cán bộ|công chức)\b/i,
  },
  {
    label: 'Đầu tư công · Hạ tầng · Năng lượng',
    pattern: /\b(đầu tư công|cao tốc|đường sắt|sân bay|điện lực|năng lượng|hạt nhân|dầu khí|giao thông|cảng biển)\b/i,
  },
  {
    label: 'Doanh nghiệp · Thương mại · Xuất nhập khẩu',
    pattern: /\b(doanh nghiệp|thương mại|xuất khẩu|nhập khẩu|kinh tế tư nhân|nghị quyết 68|đầu tư)\b/i,
  },
  {
    label: 'Lao động · Tiền lương · An sinh · Y tế · Giáo dục',
    pattern: /\b(tiền lương|bảo hiểm|lao động|y tế|giáo dục|đào tạo|học phí|người có công|dân tộc thiểu số)\b/i,
  },
];

export interface ClassifiedLegalInfo {
  docCode?: string;
  docType: LegalDocType;
  typeBadge: string;
  sector: string;
}

export function classifyVietnameseLegalDoc(rawText: string, explicitCode?: string): ClassifiedLegalInfo {
  const text = rawText.trim();

  // 1. Extract official Vietnamese legal code via Regex
  const stdCodeMatch =
    /\b(\d{1,4}\/\d{4}\/(?:VBHN-)?(?:NĐ-CP|NQ-CP|QĐ-TTg|QH\d+|UBTVQH\d+|TT-[A-ZĐ0-9-]+|TTL[T]?-[A-ZĐ0-9-]+))\b/i.exec(
      explicitCode || text,
    ) ??
    /\b(\d{1,3}-NQ\/TW)\b/i.exec(explicitCode || text) ??
    /\b(\d{1,4}\/(?:NQ-CP|QĐ-TTg|CT-TTg))\b/i.exec(explicitCode || text);

  let docCode = explicitCode?.trim() || (stdCodeMatch ? stdCodeMatch[1].toUpperCase() : undefined);

  if (!docCode) {
    if (/\bnghị quyết\s+(?:số\s+)?57\b/i.test(text)) docCode = '57-NQ/TW';
    else if (/\bnghị quyết\s+(?:số\s+)?66\b/i.test(text)) docCode = 'NQ 66';
    else if (/\bnghị quyết\s+(?:số\s+)?68\b/i.test(text)) docCode = '68-NQ/TW';
  }

  const codeUpper = (docCode ?? '').toUpperCase();
  let docType: LegalDocType = 'phan_tich';
  let typeBadge = 'CHÍNH SÁCH MỚI';

  if (codeUpper.includes('NQ/TW')) {
    docType = 'nq_tw_cp';
    typeBadge = 'NGHỊ QUYẾT TW';
  } else if (codeUpper.includes('NQ-CP') || codeUpper.startsWith('NQ ') || /\bnghị quyết\b/i.test(text)) {
    docType = 'nq_tw_cp';
    typeBadge = codeUpper.includes('NQ/TW') ? 'NGHỊ QUYẾT TW' : 'NGHỊ QUYẾT';
  } else if (codeUpper.includes('NĐ-CP') || /\bnghị định\b/i.test(text)) {
    docType = 'nghi_dinh';
    typeBadge = 'NGHỊ ĐỊNH';
  } else if (codeUpper.includes('QH') || /\bluật\s+[a-zA-ZÀ-ỹ]/i.test(text)) {
    docType = 'luat_qh';
    typeBadge = 'LUẬT / QUỐC HỘI';
  } else if (
    codeUpper.includes('QĐ-TTG') ||
    codeUpper.includes('CT-TTG') ||
    codeUpper.includes('/TT-') ||
    /\b(quyết định|thông tư|chỉ thị)\b/i.test(text)
  ) {
    docType = 'quyet_dinh_tt';
    typeBadge = codeUpper.includes('/TT-') || /\bthông tư\b/i.test(text) ? 'THÔNG TƯ' : 'QUYẾT ĐỊNH';
  }

  let sector = 'Quản lý Nhà nước & Pháp luật';
  for (const rule of SECTOR_RULES) {
    if (rule.pattern.test(text)) {
      sector = rule.label;
      break;
    }
  }

  return {
    docCode,
    docType,
    typeBadge,
    sector,
  };
}

function parseVnDate(ddmmyyyy?: string, fallbackNow = Date.now()): number {
  if (!ddmmyyyy) return fallbackNow;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return fallbackNow;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const ts = Date.UTC(year, month, day, 5, 0, 0);
  return Number.isFinite(ts) ? ts : fallbackNow;
}

function buildStructuredHighlights(params: {
  title: string;
  description?: string;
  docCode?: string;
  typeBadge: string;
  sector: string;
  issuedDate?: string;
  hasPdf?: boolean;
}): string[] {
  const bullets: string[] = [];

  if (params.docCode) {
    bullets.push(
      `Văn bản: ${params.typeBadge} số ${params.docCode}${params.issuedDate ? ` (ban hành ${params.issuedDate})` : ''}.`,
    );
  } else {
    bullets.push(`Nhóm chính sách: ${params.typeBadge} · Trọng tâm ${params.sector}.`);
  }

  bullets.push(`Lĩnh vực điều chỉnh: ${params.sector}.`);

  const cleanDesc = (params.description ?? '').trim();
  if (cleanDesc && cleanDesc.length > 25 && cleanDesc !== params.title) {
    bullets.push(cleanDesc.slice(0, 170) + (cleanDesc.length > 170 ? '…' : ''));
  } else if (params.hasPdf) {
    bullets.push('Đã đính kèm bản PDF gốc ký số / dấu đỏ chính thức từ Cổng Văn bản Chính phủ.');
  }

  return bullets.slice(0, 3);
}

export function parseVanBanChinhPhuHtml(html: string, fallbackNow = Date.now()): PolicyLegalItem[] {
  if (!html) return [];
  const tableIdx = html.indexOf('search-result');
  const slice = tableIdx >= 0 ? html.slice(tableIdx, tableIdx + 95_000) : html;

  const rowMatches = [...slice.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const out: PolicyLegalItem[] = [];

  for (const m of rowMatches) {
    const rowHtml = m[1];
    const codeMatch = /<span[^>]*class="[^"]*code[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    const summaryMatch = /<span[^>]*class="[^"]*substract[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    if (!codeMatch || !summaryMatch) continue;

    const docCode = decodeHtmlEntities(codeMatch[1]).trim();
    const summary = decodeHtmlEntities(summaryMatch[1]).trim();
    if (!docCode || !summary) continue;

    const dateMatch = /<span[^>]*class="[^"]*issued-date[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(rowHtml);
    const issuedDate = dateMatch ? decodeHtmlEntities(dateMatch[1]).trim() : undefined;

    const hrefMatch = /<a[^>]+href=['"]([^'"]*pageid=27160[^'"]*)['"]/i.exec(rowHtml);
    const relHref = hrefMatch ? decodeHtmlEntities(hrefMatch[1]).trim() : '';
    const detailUrl = relHref.startsWith('http')
      ? relHref
      : `https://vanban.chinhphu.vn${relHref.startsWith('/') ? '' : '/'}${relHref}`;

    const pdfMatch = /<a[^>]+href=['"](https?:\/\/datafiles\.chinhphu\.vn[^'"]+\.pdf)['"]/i.exec(rowHtml);
    const pdfUrl = pdfMatch ? pdfMatch[1].trim() : undefined;

    const fullTitle = `${docCode} — ${summary}`;
    const classified = classifyVietnameseLegalDoc(fullTitle, docCode);
    const publishedAt = parseVnDate(issuedDate, fallbackNow);

    out.push({
      id: `vbcp:${docCode}`,
      title: summary,
      docCode: classified.docCode ?? docCode,
      docType: classified.docType,
      typeBadge: classified.typeBadge,
      sector: classified.sector,
      source: 'Hệ thống Văn bản Chính phủ',
      issuedDate,
      publishedAt,
      url: detailUrl,
      pdfUrl,
      highlights: buildStructuredHighlights({
        title: summary,
        docCode: classified.docCode ?? docCode,
        typeBadge: classified.typeBadge,
        sector: classified.sector,
        issuedDate,
        hasPdf: Boolean(pdfUrl),
      }),
    });

    if (out.length >= 18) break;
  }

  return out;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function readXmlText(val: unknown): string {
  if (typeof val === 'string') return decodeHtmlEntities(val);
  if (val && typeof val === 'object' && '#text' in (val as Record<string, unknown>)) {
    return readXmlText((val as Record<string, unknown>)['#text']);
  }
  return '';
}

function readXmlLink(rawLink: unknown): string {
  if (typeof rawLink === 'string') return rawLink.trim();
  if (Array.isArray(rawLink)) {
    for (const item of rawLink) {
      const candidate = readXmlLink(item);
      if (candidate.startsWith('http')) return candidate;
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

export function parseCongBaoOrLegalRss(
  xml: string,
  sourceName: string,
  maxItems = 12,
  fallbackNow = Date.now(),
): PolicyLegalItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, any>;
  const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const out: PolicyLegalItem[] = [];

  for (const entry of entries.slice(0, maxItems)) {
    const rawTitle = readXmlText(entry?.title);
    const rawDesc = readXmlText(entry?.description ?? entry?.summary);

    // Crucial: Công báo điện tử Chính phủ leaves <title></title> empty and puts full text in <description>!
    let title = rawTitle || rawDesc;
    // Clean Google News trailing " - Publisher" suffix while keeping publisher context if helpful
    title = title.replace(/\s+-\s+(VnExpress|Tuổi Trẻ|Thanh Niên|Báo Chính phủ|Thư Viện Pháp Luật|Dân trí).*$/i, '').trim();

    const url = readXmlLink(entry?.link) || readXmlText(entry?.guid);
    if (!title || title.length < 12 || !url || !url.startsWith('http')) continue;

    const rawDate = readXmlText(entry?.pubDate ?? entry?.published ?? entry?.updated);
    const parsedTs = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyVietnameseLegalDoc(`${title} ${rawDesc}`);

    out.push({
      id: `legal:${sourceName}:${url}`,
      title,
      docCode: classified.docCode,
      docType: classified.docType,
      typeBadge: classified.typeBadge,
      sector: classified.sector,
      source: sourceName,
      publishedAt,
      url,
      highlights: buildStructuredHighlights({
        title,
        description: rawDesc !== title ? rawDesc : undefined,
        docCode: classified.docCode,
        typeBadge: classified.typeBadge,
        sector: classified.sector,
      }),
    });
  }

  return out;
}

const aiSummaryCache = new Map<string, string[]>();

async function maybeEnrichTopDecreesWithFreeAi(items: PolicyLegalItem[]): Promise<{
  items: PolicyLegalItem[];
  aiEnabled: boolean;
}> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!geminiKey && !groqKey) {
    return { items, aiEnabled: false };
  }

  const targets = items.filter((i) => i.docCode && !aiSummaryCache.has(i.id)).slice(0, 3);
  for (const doc of targets) {
    try {
      const prompt = `Tóm tắt đúng 3 gạch đầu dòng ngắn gọn (mỗi dòng dưới 22 từ, tiếng Việt) về nội dung và đối tượng chịu tác động chính của văn bản pháp luật Việt Nam sau:\nSố hiệu: ${doc.docCode}\nTiêu đề: ${doc.title}`;
      let rawReply = '';

      if (geminiKey) {
        const postResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: AbortSignal.timeout(6_500),
          },
        );
        if (postResp.ok) {
          const j = (await postResp.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          rawReply = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        }
      } else if (groqKey) {
        const postResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            temperature: 0.2,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: AbortSignal.timeout(6_500),
        });
        if (postResp.ok) {
          const j = (await postResp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          rawReply = j.choices?.[0]?.message?.content ?? '';
        }
      }

      const bullets = rawReply
        .split('\n')
        .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((l) => l.length >= 12)
        .slice(0, 3);

      if (bullets.length >= 2) {
        aiSummaryCache.set(doc.id, bullets);
      }
    } catch {
      // Keep deterministic highlights on error
    }
  }

  return {
    aiEnabled: true,
    items: items.map((item) => {
      const cached = aiSummaryCache.get(item.id);
      return cached ? { ...item, highlights: cached } : item;
    }),
  };
}

export async function fetchVietnamPolicyLegal(): Promise<PolicyLegalSnapshot> {
  const now = Date.now();

  const [vbHtmlRes, ...rssResults] = await Promise.allSettled([
    fetchTextWithTimeout(VANBAN_CHINHPHU_LIST_URL, {
      timeoutMs: 8_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    }),
    ...VIETNAM_LEGAL_FEEDS.map(async (feed) => {
      const { text } = await fetchTextWithTimeout(feed.url, {
        timeoutMs: 8_000,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      });
      return parseCongBaoOrLegalRss(text, feed.name, feed.maxItems, now);
    }),
  ]);

  let activeSourceCount = 0;
  const collected: PolicyLegalItem[] = [];

  if (vbHtmlRes.status === 'fulfilled') {
    const vbDocs = parseVanBanChinhPhuHtml(vbHtmlRes.value.text, now);
    if (vbDocs.length > 0) {
      activeSourceCount += 1;
      collected.push(...vbDocs);
    }
  }

  for (const res of rssResults) {
    if (res.status === 'fulfilled' && res.value.length > 0) {
      activeSourceCount += 1;
      collected.push(...res.value);
    }
  }

  if (collected.length === 0) {
    throw new Error('All Vietnam Policy & Legal Radar sources failed or timed out');
  }

  // Deduplicate by docCode (preferring items with signed pdfUrl!) or normalized title/URL
  const byIdentity = new Map<string, PolicyLegalItem>();
  for (const item of collected) {
    const key =
      item.docCode && item.source === 'Hệ thống Văn bản Chính phủ'
        ? `official:${item.docCode}`
        : `url:${item.url.split('?')[0].toLowerCase()}`;
    const existing = byIdentity.get(key);
    if (!existing || (!existing.pdfUrl && item.pdfUrl)) {
      byIdentity.set(key, item);
    }
  }

  const sorted = [...byIdentity.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 95);

  const enriched = await maybeEnrichTopDecreesWithFreeAi(sorted);

  return {
    items: enriched.items,
    activeSourceCount,
    aiSummaryEnabled: enriched.aiEnabled,
    updatedAt: now,
  };
}
