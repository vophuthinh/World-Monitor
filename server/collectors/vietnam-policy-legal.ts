import { parseFeedDate } from '../lib/feed-date';
import { XMLParser } from 'fast-xml-parser';
import type { LegalDocType, PolicyLegalItem, PolicyLegalSnapshot } from '@shared/types';
import { callGroqChatCompletion } from '../lib/groq-intel';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../lib/http';
import { setBounded } from '../lib/bounded-map';
import { decodeHtmlEntities } from './polymarket-news';

const VANBAN_CHINHPHU_LIST_URL = 'https://vanban.chinhphu.vn/he-thong-van-ban?classid=1&mode=1';
const MST_VANBAN_LIST_URL = 'https://mst.gov.vn/van-ban-phap-luat.htm';

interface LegalRssFeedDef {
  name: string;
  url: string;
  maxItems: number;
}

export const VIETNAM_LEGAL_FEEDS: readonly LegalRssFeedDef[] = [
  // 1. Official Government Gazette & Policy Portals
  {
    name: 'Công báo Chính phủ (Văn bản mới)',
    url: 'https://congbao.chinhphu.vn/cac-van-ban-moi-ban-hanh.rss',
    maxItems: 14,
  },
  {
    name: 'Công báo Chính phủ (Số mới đăng)',
    url: 'https://congbao.chinhphu.vn/cac-so-cong-bao-moi-dang.rss',
    maxItems: 8,
  },
  {
    name: 'Xây dựng Chính sách & Pháp luật',
    url: 'https://xaydungchinhsach.chinhphu.vn/chinh-sach-moi.rss',
    maxItems: 10,
  },
  {
    name: 'Cổng Chính sách & Pháp luật (Tin mới)',
    url: 'https://xaydungchinhsach.chinhphu.vn/tin-moi-nhat.rss',
    maxItems: 8,
  },
  {
    name: 'Báo Điện tử Chính phủ (Chính sách)',
    url: 'https://baochinhphu.vn/chinh-sach-va-cuoc-song.rss',
    maxItems: 8,
  },
  {
    name: 'Thư Viện Pháp Luật',
    url: 'https://thuvienphapluat.vn/rss.xml',
    maxItems: 10,
  },

  // 2. Official Bộ Khoa học và Công nghệ (mst.gov.vn + Tia Sáng + Chính phủ KH&CN)
  {
    name: 'Bộ Khoa học & Công nghệ (Tiêu điểm CS)',
    url: 'https://mst.gov.vn/rss/tieu-diem-chinh-sach.rss',
    maxItems: 12,
  },
  {
    name: 'Bộ Khoa học & Công nghệ (mst.gov.vn)',
    url: 'https://mst.gov.vn/rss/tin-tuc-su-kien.rss',
    maxItems: 10,
  },
  {
    name: 'Tạp chí Tia Sáng (Bộ KH&CN)',
    url: 'https://tiasang.com.vn/rss/nen-tang-kien-tao.rss',
    maxItems: 8,
  },
  {
    name: 'Báo Chính phủ · Khoa học & Công nghệ',
    url: 'https://baochinhphu.vn/khoa-hoc-cong-nghe.rss',
    maxItems: 8,
  },
  {
    name: 'Xây dựng Chính sách · KH&CN',
    url: 'https://xaydungchinhsach.chinhphu.vn/khoa-hoc-cong-nghe.rss',
    maxItems: 8,
  },
  {
    name: 'Google News · Bộ Khoa học & Công nghệ',
    url: 'https://news.google.com/rss/search?q=%22B%E1%BB%99+Khoa+h%E1%BB%8Dc+v%C3%A0+C%C3%B4ng+ngh%E1%BB%87%22+OR+%22TT-BKHCN%22+OR+%22Q%C4%90-BKHCN%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 10,
  },

  // 3. "Bộ tứ Nghị quyết Chiến lược" (Nghị quyết 57, 59, 66, 68) + Nghị định mới
  {
    name: 'Nghị quyết 57 · KHCN & Chuyển đổi số',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+quy%E1%BA%BFt+57%22+OR+%2257-NQ%2FTW%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 10,
  },
  {
    name: 'Nghị quyết 59 · Hội nhập quốc tế',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+quy%E1%BA%BFt+59%22+OR+%2259-NQ%2FTW%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 9,
  },
  {
    name: 'Nghị quyết 66 · Thể chế & Pháp luật',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+quy%E1%BA%BFt+66%22+OR+%2266-NQ%2FTW%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 9,
  },
  {
    name: 'Nghị quyết 68 · Kinh tế tư nhân',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+quy%E1%BA%BFt+68%22+OR+%2268-NQ%2FTW%22&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 10,
  },
  {
    name: 'Google News · Nghị định & Nghị quyết mới',
    url: 'https://news.google.com/rss/search?q=%22Ngh%E1%BB%8B+%C4%91%E1%BB%8Bnh%22+OR+%22Ngh%E1%BB%8B+quy%E1%BA%BFt%22+Ch%C3%ADnh+ph%E1%BB%A7&hl=vi&gl=VN&ceid=VN:vi',
    maxItems: 8,
  },
];

const SECTOR_RULES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'Hội nhập Quốc tế trong tình hình mới (NQ 59)',
    pattern: /\b(nghị quyết\s*(?:số\s*)?59\b|59-nq\/tw|hội nhập quốc tế)\b/i,
  },
  {
    label: 'Phát triển Kinh tế tư nhân (NQ 68)',
    pattern: /\b(nghị quyết\s*(?:số\s*)?68\b|68-nq\/tw|kinh tế tư nhân)\b/i,
  },
  {
    label: 'Cải cách Thể chế & Pháp luật (NQ 66)',
    pattern: /\b(nghị quyết\s*(?:số\s*)?66\b|66-nq\/tw|thủ tục hành chính|tổ chức bộ máy|tinh gọn|phân cấp|phân quyền)\b/i,
  },
  {
    label: 'Khoa học - Công nghệ & Đổi mới sáng tạo',
    pattern:
      /\b(khoa học|công nghệ|đổi mới sáng tạo|bán dẫn|trí tuệ nhân tạo|ai\b|nghiên cứu|phóng xạ|hạt nhân|sở hữu trí tuệ|tiêu chuẩn đo lường|nghị quyết\s*(?:số\s*)?57\b|57-nq\/tw|bkhcn)\b/i,
  },
  {
    label: 'Chuyển đổi số · Viễn thông · Dữ liệu',
    pattern: /\b(chuyển đổi số|dữ liệu|viễn thông|tần số|băng tần|mạng|chính phủ số|giao dịch điện tử|căn cước|định danh)\b/i,
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
    label: 'Đầu tư công · Hạ tầng · Năng lượng',
    pattern: /\b(đầu tư công|cao tốc|đường sắt|sân bay|điện lực|năng lượng|dầu khí|giao thông|cảng biển)\b/i,
  },
  {
    label: 'Doanh nghiệp · Thương mại · Xuất nhập khẩu',
    pattern: /\b(doanh nghiệp|thương mại|xuất khẩu|nhập khẩu|đầu tư)\b/i,
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
  isMost: boolean;
  pillarResolution?: '57' | '59' | '66' | '68';
}

function detectPillarResolution(
  text: string,
  docCode?: string,
): '57' | '59' | '66' | '68' | undefined {
  const code = (docCode ?? '').toUpperCase();
  if (code === '57-NQ/TW') return '57';
  if (code === '59-NQ/TW') return '59';
  if (code === '66-NQ/TW') return '66';
  if (code === '68-NQ/TW') return '68';
  // Do not confuse 66/NQ-CP or 68/2026/TT-BKHCN with Politburo Resolutions 57/59/66/68
  if (code && (code.includes('/NQ-CP') || code.includes('/NĐ-CP') || code.includes('/TT-'))) {
    return undefined;
  }
  if (/\b(?:nghị quyết\s+(?:số\s+)?57|57-nq\/tw)\b/i.test(text)) return '57';
  if (/\b(?:nghị quyết\s+(?:số\s+)?59|59-nq\/tw)\b/i.test(text)) return '59';
  if (/\b(?:nghị quyết\s+(?:số\s+)?66|66-nq\/tw)\b/i.test(text)) return '66';
  if (/\b(?:nghị quyết\s+(?:số\s+)?68|68-nq\/tw)\b/i.test(text)) return '68';
  return undefined;
}

export function classifyVietnameseLegalDoc(
  rawText: string,
  explicitCode?: string,
  sourceName = '',
): ClassifiedLegalInfo {
  const text = rawText.trim();

  const stdCodeMatch =
    /\b(\d{1,4}\/\d{4}\/(?:VBHN-)?(?:NĐ-CP|NQ-CP|QĐ-TTg|QH\d+|UBTVQH\d+|TT-[A-ZĐ0-9-]+|QĐ-[A-ZĐ0-9-]+|TTL[T]?-[A-ZĐ0-9-]+))\b/i.exec(
      explicitCode || text,
    ) ??
    /\b(\d{1,3}-NQ\/TW)\b/i.exec(explicitCode || text) ??
    /\b(\d{1,4}\/(?:NQ-CP|QĐ-TTg|CT-TTg))\b/i.exec(explicitCode || text);

  let docCode = explicitCode?.trim() || (stdCodeMatch ? stdCodeMatch[1].toUpperCase() : undefined);
  const pillarResolution = detectPillarResolution(text, docCode);

  if (!docCode && pillarResolution) {
    docCode = `${pillarResolution}-NQ/TW`;
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
    codeUpper.includes('/QĐ-') ||
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

  const combinedMeta = `${codeUpper} ${text} ${sourceName}`;
  const isMost =
    /\b(BKHCN|BTTTT|mst\.gov\.vn|Tia Sáng|Bộ Khoa học\s*(?:và|&)\s*Công nghệ|Bộ KH&CN)\b/i.test(
      combinedMeta,
    );

  return {
    docCode,
    docType,
    typeBadge,
    sector,
    isMost,
    ...(pillarResolution ? { pillarResolution } : {}),
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

const PILLAR_RESOLUTION_CONTEXT: Record<'57' | '59' | '66' | '68', string> = {
  '57': 'Trụ cột Nghị quyết 57-NQ/TW: Đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo & chuyển đổi số quốc gia.',
  '59': 'Trụ cột Nghị quyết 59-NQ/TW: Chủ động, tích cực hội nhập quốc tế sâu rộng trong tình hình mới.',
  '66': 'Trụ cột Nghị quyết 66-NQ/TW: Đổi mới toàn diện công tác xây dựng và thi hành pháp luật kỷ nguyên mới.',
  '68': 'Trụ cột Nghị quyết 68-NQ/TW: Phát triển kinh tế tư nhân trở thành một động lực quan trọng nhất của nền kinh tế.',
};

function buildStructuredHighlights(params: {
  title: string;
  description?: string;
  docCode?: string;
  typeBadge: string;
  sector: string;
  issuedDate?: string;
  hasPdf?: boolean;
  isMost?: boolean;
  pillarResolution?: '57' | '59' | '66' | '68';
}): string[] {
  const bullets: string[] = [];

  if (params.pillarResolution) {
    bullets.push(PILLAR_RESOLUTION_CONTEXT[params.pillarResolution]);
  } else if (params.docCode) {
    bullets.push(
      `Văn bản: ${params.typeBadge} số ${params.docCode}${params.issuedDate ? ` (ban hành ${params.issuedDate})` : ''}.`,
    );
  } else {
    bullets.push(`Nhóm chính sách: ${params.typeBadge} · Trọng tâm ${params.sector}.`);
  }

  bullets.push(
    params.isMost
      ? `Cơ quan / Chuyên ngành: Bộ Khoa học và Công nghệ · ${params.sector}.`
      : `Lĩnh vực điều chỉnh: ${params.sector}.`,
  );

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
    const classified = classifyVietnameseLegalDoc(fullTitle, docCode, 'Hệ thống Văn bản Chính phủ');
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
      isMost: classified.isMost,
      ...(classified.pillarResolution ? { pillarResolution: classified.pillarResolution } : {}),
      highlights: buildStructuredHighlights({
        title: summary,
        docCode: classified.docCode ?? docCode,
        typeBadge: classified.typeBadge,
        sector: classified.sector,
        issuedDate,
        hasPdf: Boolean(pdfUrl),
        isMost: classified.isMost,
        pillarResolution: classified.pillarResolution,
      }),
    });

    if (out.length >= 18) break;
  }

  return out;
}

export function parseMstVanBanHtml(html: string, fallbackNow = Date.now()): PolicyLegalItem[] {
  if (!html) return [];
  const rowMatches = [...html.matchAll(/<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const out: PolicyLegalItem[] = [];

  for (const m of rowMatches) {
    const rowHtml = m[1];
    const codeMatch = /<td[^>]*class="[^"]*\bsh\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
    const contentTdMatch = /<td[^>]*class="[^"]*\bnd\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
    if (!codeMatch || !contentTdMatch) continue;

    const docCode = decodeHtmlEntities(codeMatch[1]).trim();
    const contentHtml = contentTdMatch[1];
    const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(contentHtml);
    const summary = decodeHtmlEntities(pMatch ? pMatch[1] : contentHtml)
      .replace(/\bXem chi tiết\b/gi, '')
      .trim();

    if (!docCode || !summary) continue;

    const fieldMatch = /<td[^>]*class="[^"]*\blv\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
    const explicitField = fieldMatch ? decodeHtmlEntities(fieldMatch[1]).trim() : '';

    const dateMatch = /<td[^>]*class="[^"]*\bnbh\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
    const issuedDate = dateMatch ? decodeHtmlEntities(dateMatch[1]).trim() : undefined;

    const hrefMatch = /<a[^>]+href=['"]([^'"]+)['"]/i.exec(contentHtml);
    const relHref = hrefMatch ? decodeHtmlEntities(hrefMatch[1]).trim() : '/van-ban-phap-luat.htm';
    const detailUrl = relHref.startsWith('http')
      ? relHref
      : `https://mst.gov.vn${relHref.startsWith('/') ? '' : '/'}${relHref}`;

    const sourceName = 'Bộ Khoa học & Công nghệ (mst.gov.vn)';
    const classified = classifyVietnameseLegalDoc(
      `${docCode} ${summary} ${explicitField}`,
      docCode,
      sourceName,
    );
    const sector = explicitField || classified.sector;
    const publishedAt = parseVnDate(issuedDate, fallbackNow);

    out.push({
      id: `mst-vb:${docCode}`,
      title: summary,
      docCode: classified.docCode ?? docCode,
      docType: classified.docType,
      typeBadge: classified.typeBadge,
      sector,
      source: sourceName,
      issuedDate,
      publishedAt,
      url: detailUrl,
      isMost: true,
      ...(classified.pillarResolution ? { pillarResolution: classified.pillarResolution } : {}),
      highlights: buildStructuredHighlights({
        title: summary,
        docCode: classified.docCode ?? docCode,
        typeBadge: classified.typeBadge,
        sector,
        issuedDate,
        isMost: true,
        pillarResolution: classified.pillarResolution,
      }),
    });

    if (out.length >= 15) break;
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
  const isGoogleSearchFeed =
    sourceName.startsWith('Google News') || sourceName.startsWith('Nghị quyết ');

  for (const entry of entries.slice(0, maxItems)) {
    const rawTitle = readXmlText(entry?.title);
    const rawDesc = readXmlText(entry?.description ?? entry?.summary);

    // Crucial: Công báo điện tử Chính phủ leaves <title></title> empty and puts full text in <description>!
    let title = rawTitle || rawDesc;
    if (isGoogleSearchFeed) {
      title = title.replace(/\s+-\s+[^-]{2,42}$/, '').trim();
    }

    const url = readXmlLink(entry?.link) || readXmlText(entry?.guid);
    if (!title || title.length < 12 || !url || !url.startsWith('http')) continue;

    const rawDate = readXmlText(entry?.pubDate ?? entry?.published ?? entry?.updated);
    const parsedTs = rawDate ? parseFeedDate(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTs) ? parsedTs : fallbackNow;

    const classified = classifyVietnameseLegalDoc(`${title} ${rawDesc}`, undefined, sourceName);

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
      isMost: classified.isMost,
      ...(classified.pillarResolution ? { pillarResolution: classified.pillarResolution } : {}),
      highlights: buildStructuredHighlights({
        title,
        description: rawDesc !== title ? rawDesc : undefined,
        docCode: classified.docCode,
        typeBadge: classified.typeBadge,
        sector: classified.sector,
        isMost: classified.isMost,
        pillarResolution: classified.pillarResolution,
      }),
    });
  }

  return out;
}

const aiSummaryCache = new Map<string, string[]>();

export async function summarizeSinglePolicyItemWithAi(input: {
  id: string;
  title: string;
  docCode?: string;
  sector?: string;
  source?: string;
}): Promise<{ id: string; highlights: string[]; model: string; latencyMs: number }> {
  const existing = aiSummaryCache.get(input.id);
  if (existing && existing.length >= 2) {
    return { id: input.id, highlights: existing, model: 'groq-cache', latencyMs: 1 };
  }

  const prompt = [
    'Tóm tắt ĐÚNG 3 gạch đầu dòng tiếng Việt ngắn gọn (mỗi dòng 14–24 từ, không có lời mở đầu) theo cấu trúc:',
    '1. Nội dung cốt lõi / quy định mới',
    '2. Đối tượng / lĩnh vực chịu tác động',
    '3. Ý nghĩa thực thi hoặc mốc cần lưu ý',
    input.docCode ? `Số hiệu văn bản: ${input.docCode}` : '',
    input.sector ? `Lĩnh vực: ${input.sector}` : '',
    input.source ? `Nguồn: ${input.source}` : '',
    `Tiêu đề / Trích yếu: ${input.title}`,
  ]
    .filter(Boolean)
    .join('\n');

  const llm = await callGroqChatCompletion(
    [
      {
        role: 'system',
        content: 'Bạn là Chuyên gia Pháp chế & Chính sách Việt Nam. Chỉ xuất đúng 3 gạch đầu dòng súc tích, rõ ý.',
      },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 320, temperature: 0.15, timeoutMs: 8_000 },
  );

  if (!llm) {
    throw new Error('Chưa kết nối được dịch vụ AI tóm tắt văn bản.');
  }

  const bullets = llm.text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length >= 12)
    .slice(0, 3);

  if (bullets.length < 2) {
    throw new Error('Phản hồi AI quá ngắn, vui lòng thử lại.');
  }

  setBounded(aiSummaryCache, input.id, bullets, 500);
  return {
    id: input.id,
    highlights: bullets,
    model: llm.model,
    latencyMs: llm.latencyMs,
  };
}

function attachCachedOnDemandAiSummaries(items: PolicyLegalItem[]): {
  items: PolicyLegalItem[];
  aiEnabled: boolean;
} {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const aiEnabled = Boolean(geminiKey || groqKey);

  // Never auto-summarize in the background to conserve API quota.
  // Only attach 3-bullet AI summaries for documents explicitly requested by the user via /api/policy-summarize.
  return {
    aiEnabled,
    items: items.map((item) => {
      const cached = aiSummaryCache.get(item.id);
      return cached ? { ...item, highlights: cached, aiSummarized: true } : item;
    }),
  };
}

export async function fetchVietnamPolicyLegal(): Promise<PolicyLegalSnapshot> {
  const now = Date.now();

  const [vbHtmlRes, mstHtmlRes, ...rssResults] = await Promise.allSettled([
    fetchTextWithTimeout(VANBAN_CHINHPHU_LIST_URL, {
      timeoutMs: 8_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    }),
    fetchTextWithTimeout(MST_VANBAN_LIST_URL, {
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

  if (mstHtmlRes.status === 'fulfilled') {
    const mstDocs = parseMstVanBanHtml(mstHtmlRes.value.text, now);
    if (mstDocs.length > 0) {
      activeSourceCount += 1;
      collected.push(...mstDocs);
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

  // Deduplicate by official docCode or normalized URL/title while preferring signed PDF entries
  const byIdentity = new Map<string, PolicyLegalItem>();
  for (const item of collected) {
    const isOfficialTable =
      item.source === 'Hệ thống Văn bản Chính phủ' ||
      item.source === 'Bộ Khoa học & Công nghệ (mst.gov.vn)';
    const key =
      item.docCode && isOfficialTable
        ? `official:${item.docCode}`
        : `title:${item.title.toLowerCase().slice(0, 90)}`;
    const existing = byIdentity.get(key);
    if (!existing || (!existing.pdfUrl && item.pdfUrl)) {
      byIdentity.set(key, item);
    }
  }

  const sorted = [...byIdentity.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 160);

  const enriched = attachCachedOnDemandAiSummaries(sorted);

  return {
    items: enriched.items,
    activeSourceCount,
    aiSummaryEnabled: enriched.aiEnabled,
    updatedAt: now,
  };
}
