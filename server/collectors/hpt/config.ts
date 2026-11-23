import type { HptItemCategory, HptSentiment } from '@shared/types';

// HPT Tax Code & Headquarters (Khu Công nghệ cao TP.HCM — SHTP)
export const HPT_TAX_CODE = '0301447436';
export const HPT_HQ_LAT = 10.8411;
export const HPT_HQ_LON = 106.8099;

export const SIMPLIZE_HPT_SUMMARY_URL = 'https://api2.simplize.vn/api/company/summary/HPT';
export const CAFEF_HPT_NEWS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=18&Type=1';
export const CAFEF_HPT_EVENTS_URL =
  'https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=HPT&floorID=0&configID=0&PageIndex=1&PageSize=12&Type=2';
export const BAOMOI_HPT_SEARCH_URL =
  'https://baomoi.com/tim-kiem/C%C3%B4ng-ngh%E1%BB%87-Tin-h%E1%BB%8Dc-HPT.epi';
export const REDDIT_HPT_SEARCH_URL =
  'https://www.reddit.com/search.json?q=(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22HSOC%22+OR+%220301447436%22)&sort=new&limit=20';

export interface ExternalRssFeedDef {
  name: string;
  defaultCategory: HptItemCategory;
  url: string;
}

// 100% Independent Third-Party Feeds (hpt.vn AND all recruitment/job sites are strictly excluded per user requirement)
export const HPT_EXTERNAL_FEEDS: readonly ExternalRssFeedDef[] = [
  {
    name: 'Đấu thầu & Dự án (Báo Đấu thầu / MST 0301447436)',
    defaultCategory: 'bidding_project',
    url: 'https://news.google.com/rss/search?q=(%22HPT%22+OR+%220301447436%22)+(%22tr%C3%BAng+th%E1%BA%A7u%22+OR+%22g%C3%B3i+th%E1%BA%A7u%22+OR+%22%C4%91%E1%BA%A5u+th%E1%BA%A7u%22+OR+%22l%E1%BB%B1a+ch%E1%BB%8Dn+nh%C3%A0+th%E1%BA%A7u%22+OR+site:baodauthau.vn)+(%22c%C3%B4ng+ngh%E1%BB%87%22+OR+%22tin+h%E1%BB%8Dc%22+OR+%22ng%C3%A2n+h%C3%A0ng%22+OR+%22an+to%C3%A0n+th%C3%B4ng+tin%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Báo CNTT · Chuyển đổi số · Hiệp hội VINASA/VNISA',
    defaultCategory: 'it_press_partner',
    url: 'https://news.google.com/rss/search?q=(site:ictvietnam.vn+OR+site:vietnamnet.vn+OR+site:vneconomy.vn+OR+site:nhipsongthitruong.vn+OR+site:antoanthongtin.vn+OR+site:vinasa.org.vn+OR+site:vnisa.org.vn)+(%22HPT%22+OR+%22HSOC%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Hệ sinh thái Hãng Quốc tế (Microsoft / IBM / Cisco / NetApp)',
    defaultCategory: 'it_press_partner',
    url: 'https://news.google.com/rss/search?q=(%22HPT%22+OR+%22HSOC%22)+(%22Vi%E1%BB%87t+Nam%22+OR+%22Vietnam%22)+(Microsoft+OR+IBM+OR+Cisco+OR+Oracle+OR+NetApp+OR+Fortinet+OR+%22Sao+Khu%C3%AA%22+OR+VINASA+OR+VNISA)&hl=vi&gl=VN&ceid=VN:vi',
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
    name: 'Bing News Search · Cổ phiếu HPT & HSOC',
    defaultCategory: 'press_social',
    url: 'https://www.bing.com/news/search?q=(%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22HPT+Cyber+Security%22+OR+%22HSOC%22)&format=rss&mkt=vi-VN',
  },
  {
    name: 'Pháp lý · Thuế · Sở hữu trí tuệ (MST 0301447436)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(%220301447436%22+OR+%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22)+(%22thu%E1%BA%BF%22+OR+%22s%E1%BB%9F+h%E1%BB%AFu+tr%C3%AD+tu%E1%BB%87%22+OR+%22ch%E1%BB%A9ng+nh%E1%BA%ADn%22+OR+%22t%C3%B2a+%C3%A1n%22+OR+%22%C4%91%C4%83ng+k%C3%BD+kinh+doanh%22+OR+%22k%C3%BD+k%E1%BA%BFt%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Diễn đàn & Cộng đồng Mở (VOZ / Tinh tế / F319 / F247 / Spiderum)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(site:f319.com+OR+site:f247.com+OR+site:voz.vn+OR+site:tinhte.vn+OR+site:spiderum.com+OR+site:reddit.com)+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22m%C3%A3+HPT%22+OR+%22HSOC%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'YouTube Video & Podcast Công nghệ / Tài chính',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=site:youtube.com+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22HPT+Cyber+Security%22+OR+%22HSOC%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Facebook Công khai (Bài đăng bên thứ ba nhắc HPT)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=site:facebook.com+-site:facebook.com/HPTVietnamCorp+-site:facebook.com/LifeAtHPT+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22HPT+Cyber+Security%22+OR+%22c%C3%B4ng+ty+HPT%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22HPT+Vietnam%22+OR+%220301447436%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'LinkedIn Posts & Pulse (Bên thứ ba nhắc HPT)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(site:linkedin.com/posts+OR+site:vn.linkedin.com/posts+OR+site:linkedin.com/pulse+OR+site:vn.linkedin.com/pulse)+-site:linkedin.com/posts/hpt-vietnam-corporation+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22HPT+Cyber+Security%22+OR+%22HPT+Vietnam%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Threads · TikTok (Bên thứ ba nhắc HPT)',
    defaultCategory: 'press_social',
    url: 'https://news.google.com/rss/search?q=(site:threads.net+OR+site:threads.com+OR+site:tiktok.com)+-site:tiktok.com/@hptvietnamcorp+-site:threads.net/@hptvietnamcorp+(%22C%C3%B4ng+ngh%E1%BB%87+Tin+h%E1%BB%8Dc+HPT%22+OR+%22HPT+Cyber+Security%22+OR+%22c%E1%BB%95+phi%E1%BA%BFu+HPT%22+OR+%22HPT+Vietnam%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
  {
    name: 'Vietstock · FireAnt · 24hMoney · Tin nhanh Chứng khoán',
    defaultCategory: 'exchange_filing',
    url: 'https://news.google.com/rss/search?q=(site:vietstock.vn+OR+site:fireant.vn+OR+site:24hmoney.vn+OR+site:stockbiz.vn+OR+site:tinnhanhchungkhoan.vn+OR+site:nguoiquansat.vn)+(%22HPT%22+OR+%220301447436%22)&hl=vi&gl=VN&ceid=VN:vi',
  },
];

// Default public Vietnamese stock/finance/cyber Telegram channels (`https://t.me/s/<handle>`)
// Users can append more comma-separated handles via `HPT_TELEGRAM_CHANNELS` in `.env`
export const DEFAULT_HPT_TELEGRAM_CHANNELS: readonly string[] = [
  'vietstock_official',
  'cafef_official',
  'chungkhoanvietnam',
  'antoanthongtinvn',
];

// ============================================================================
// 1. Strict HPT Context Filter + Self-Website & Recruitment Exclusion
// ============================================================================

export const HPT_WORD_OR_TAX_RE = /\b(HPT|HSOC|0301447436)\b/i;

export const HPT_RECRUITMENT_DOMAIN_RE =
  /(topcv\.vn|itviec\.com|vietnamworks\.com|careerviet\.vn|careerbuilder\.vn|careerlink\.vn|vieclam24h\.vn|timviecnhanh\.com|jobsgo\.vn|glints\.com|1900\.com\.vn|ybox\.vn|devwork\.vn|topdev\.vn|linkedin\.com\/jobs|indeed\.com|glassdoor\.com)/i;

// Static ticker-quote, bio-profile, tax-code directory, CV profile, and bare social homepage URLs (not news/discussions)
export const HPT_STATIC_DIRECTORY_URL_RE = new RegExp(
  [
    'fireant\\.vn\\/(?:ma-chung-khoan|ca-nhan)\\/',
    '24hmoney\\.vn\\/stock\\/[^/?#]+(?:\\/profile|$)',
    'simplize\\.vn\\/co-phieu\\/',
    'tradingview\\.com\\/symbols\\/',
    'investing\\.com\\/equities\\/',
    'finance\\.vietstock\\.vn\\/[a-z0-9]{3}-',
    'upstock\\.com\\.vn\\/chi-tiet-co-phieu\\/',
    '(?:thuvienphapluat\\.vn\\/ma-so-thue|masothue\\.com|hosocongty\\.vn|thongtindoanhnghiep\\.co|dauthau\\.info|vnr500\\.vn\\/thong-tin-doanh-nghiep)\\/',
    'linkedin\\.com\\/in\\/',
    '^https?:\\/\\/(?:www\\.|m\\.|web\\.)?(?:facebook\\.com|fb\\.com)\\/(?!(?:story|permalink|photo|watch)\\.php\\b|watch\\/|share\\/)[^/?#]+\\/?$',
  ].join('|'),
  'i',
);

export const HPT_RECRUITMENT_NOISE_RE =
  /(?:\b(?:tuyển\s+dụng|cần\s+tuyển|tin\s+tuyển|thông\s+báo\s+tuyển|tuyển\s+gấp|việc\s+làm\s+tại\s+hpt|cơ\s+hội\s+nghề\s+nghiệp|mô\s+tả\s+công\s+việc|hiring|job\s+opening|we\s+are\s+hiring|reviews\s*&\s*jobs)\b|(?:^|\s)(?:ứng\s+tuyển|tìm\s+kiếm\s+(?:nhân\s+sự|ứng\s+viên|đồng\s+đội)|cho\s+các\s+vị\s+trí\s*:)(?=$|[\s.,;:!?)}\]"'])|\b(?:analyst|engineer|developer|specialist|intern|consultant|architect|thực\s+tập\s+sinh|chuyên\s+viên|nhân\s+viên|kỹ\s+sư)\b[^.|]{0,48}\btại\s+hpt\b)/i;

export const HPT_FALSE_POSITIVE_NOISE_RE =
  /(?:\b(?:hải phòng tourist|hai phong tourist|hypertension|pulmonary|hyperparathyroidism|high[- ]pressure turbine|blade inspection|bệnh nhân|huyết áp|phẫu thuật|y khoa|clinical study)\b|hptvietnam\.vn|nongsanxuatkhau|ai\s+x-ray|showroom\s+(?:công\s+nghệ\s+)?ai\s*(?:và|&)\s*tự\s+động\s+hóa|công\s+ty\s+tnhh[^.|]{0,48}\bhpt\b|^\s*\d{10}\s*-\s*công\s+ty\b)/i;

export const HPT_VALID_CONTEXT_RE =
  /(0301447436|hpt\s+cyber|công nghệ|tin học|hạ tầng|chuyển đổi số|tích hợp hệ thống|an toàn thông tin|an ninh mạng|bảo mật|soc\b|erp\b|cyber|ai\b|trí tuệ nhân tạo|điện toán|cloud|lượng tử|microsoft|ibm|netapp|cisco|oracle|fortinet|vnpt|vinasa|vnisa|sao khuê|thái hà|thực tập|môi trường làm việc|review\s+về\s+(?:cty|công\s+ty)\s+hpt|cổ phiếu|mã hpt|hpt\s*:|upcom|hnx|hose|ubck|chứng khoán|cổ tức|chốt quyền|đkcc|phát hành|cổ đông|hđqt|hội đồng quản trị|đhđcđ|nghị quyết|báo cáo tài chính|quản trị công ty|lợi nhuận|doanh thu|đấu thầu|trúng thầu|gói thầu|nhà thầu|ngô vi đồng|đinh hà duy linh)/i;

// Direct URL patterns for official/self-owned HPT accounts across Facebook, LinkedIn (/posts, /pulse, /company), Threads, and TikTok
export const HPT_SELF_SOCIAL_URL_RE = new RegExp(
  [
    // Facebook official pages, sub-brand pages (e.g. HPTVietnamCorp, Hpt.RPAsolution, LifeAtHPT), & legacy /pages/...HPT...
    '(?:facebook\\.com|fb\\.com)\\/(?:pages\\/[^/?#]*\\bhpt\\b[^/?#]*|(?:pg\\/|people\\/[^/?#]*\\bhpt\\b[^/?#]*\\/)?(?:hpt(?:[._-]?[a-z0-9._-]+)?|life[._-]?at[._-]?hpt|tuyen[._-]?dung[._-]?hpt|hsoc(?:[._-]?vietnam)?|cong[._-]?nghe[._-]?tin[._-]?hoc[._-]?hpt))(?:[/?#]|$)',
    // LinkedIn company page
    'linkedin\\.com\\/company\\/(?:hpt[-_a-z0-9]*|life-at-hpt[-_a-z0-9]*|hsoc[-_a-z0-9]*|cong-nghe-tin-hoc-hpt[-_a-z0-9]*)(?:[/?#]|$)',
    // LinkedIn /posts/ authored by HPT accounts (author slug immediately follows /posts/ before '_')
    'linkedin\\.com\\/posts\\/(?:hpt(?:-(?:vietnam(?:-corporation)?|corp(?:oration)?|cyber(?:-security)?|group|jsc|it|tech|careers?|tuyen-dung))?|life-at-hpt|hsoc(?:-vietnam|-hpt)?|cong-nghe-tin-hoc-hpt)(?:_|[-_]?activity[-_]|[/?#]|$)',
    // LinkedIn /pulse/ articles authored by HPT accounts (author slug at end of article slug before optional short ID)
    'linkedin\\.com\\/pulse\\/(?:[^/?#]*-(?:hpt-vietnam(?:-corporation)?|hpt-cyber-security|life-at-hpt|hsoc-vietnam|cong-nghe-tin-hoc-hpt)(?:-[a-z0-9]{4,8})?|(?:hpt-vietnam(?:-corporation)?|hpt-cyber-security|life-at-hpt))(?:[/?#]|$)',
    // Threads (@handle)
    'threads\\.(?:net|com)\\/@?(?:hpt(?:[._-]?(?:vietnam(?:[._-]?corp(?:oration)?)?|vn|corp|cyber(?:[._-]?security)?|careers?|group|jsc))?|life[._-]?at[._-]?hpt|tuyen[._-]?dung[._-]?hpt|hsoc(?:[._-]?vietnam)?|cong[._-]?nghe[._-]?tin[._-]?hoc[._-]?hpt)(?:[/?#]|$)',
    // TikTok (@handle)
    'tiktok\\.com\\/@(?:hpt(?:[._-]?(?:vietnam(?:[._-]?corp(?:oration)?)?|vn|corp|cyber(?:[._-]?security)?|careers?|group|jsc))?|life[._-]?at[._-]?hpt|tuyen[._-]?dung[._-]?hpt|hsoc(?:[._-]?vietnam)?|cong[._-]?nghe[._-]?tin[._-]?hoc[._-]?hpt)(?:[/?#]|$)',
  ].join('|'),
  'i',
);

const SOCIAL_PLATFORM_CONTEXT_RE =
  /(?:facebook\.com|fb\.com|\bfacebook\b|linkedin\.com|\blinkedin\b|threads\.net|threads\.com|\bthreads\b|tiktok\.com|\btiktok\b)/i;

const HPT_OFFICIAL_SOCIAL_HANDLE_RE =
  /@(?:hpt(?:[._-]?(?:vietnam(?:[._-]?corp(?:oration)?)?|vn|corp|cyber(?:[._-]?security)?|careers?))?|life[._-]?at[._-]?hpt|tuyen[._-]?dung[._-]?hpt|hsoc(?:[._-]?vietnam)?)\b/i;

const HPT_OFFICIAL_SOCIAL_AUTHOR_SOURCE_RE =
  /^(?:(?:facebook|linkedin|threads|tiktok)\s*[·|:-]\s*)?(?:hpt\s+vietnam(?:\s+corporation)?|công\s+ty\s+(?:cổ\s+phần\s+|cp\s+)?dịch\s+vụ\s+công\s+nghệ\s+tin\s+học\s+hpt|công\s+nghệ\s+tin\s+học\s+hpt|life\s+at\s+hpt|hpt\s+cyber\s+security|hsoc\s+vietnam)\s*$/i;

export function isHptSelfSocialPost(
  url: string,
  title = '',
  snippet = '',
  source = '',
): boolean {
  if (url && HPT_SELF_SOCIAL_URL_RE.test(url)) return true;
  if (source && HPT_OFFICIAL_SOCIAL_AUTHOR_SOURCE_RE.test(source.trim())) return true;

  const combinedMeta = `${url} ${source} ${title} ${snippet}`;
  if (!SOCIAL_PLATFORM_CONTEXT_RE.test(combinedMeta)) return false;

  const text = `${title} ${snippet}`;
  if (HPT_OFFICIAL_SOCIAL_HANDLE_RE.test(text)) return true;
  if (/(?:\bhpt\.vn\b|#lifeathpt\b|#hptvietnamcorporation\b)/i.test(text)) return true;

  if (
    /\b(?:bài\s+đăng\s+của|post\s+by|video\s+tiktok\s+từ|tiktok\s+video\s+from)\s+(?:hpt\s+vietnam(?:\s+corporation)?|life\s+at\s+hpt|hpt\s+cyber\s+security|công\s+nghệ\s+tin\s+học\s+hpt)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  const coreTitle = title
    .replace(/\s*[-|•]\s*(?:Facebook|LinkedIn|Threads(?:\s*,\s*Say\s+more)?|TikTok)\s*$/i, '')
    .trim();
  if (!coreTitle) return false;

  // Profile/tab title on FB/LinkedIn/Threads/TikTok (e.g. "HPT Vietnam Corporation - Videos")
  if (
    /^(?:hpt\s+vietnam(?:\s+corporation)?|life\s+at\s+hpt|hpt\s+cyber\s+security|công\s+nghệ\s+tin\s+học\s+hpt)\s*(?:\([^)]*\))?\s*(?:[-–—|•]\s*(?:videos?|photos?|reels?|posts?|about|events?|mentions?|reviews?))?$/i.test(
      coreTitle,
    )
  ) {
    return true;
  }

  // Prefix author attribution (e.g. "HPT Vietnam Corporation on LinkedIn: ...", "HPT Vietnam Corporation - ...")
  if (
    /^(?:hpt\s+vietnam(?:\s+corporation)?|life\s+at\s+hpt|hpt\s+cyber\s+security|công\s+nghệ\s+tin\s+học\s+hpt)\s*(?:\([^)]*\))?\s*(?:on\s+(?:linkedin|threads)\b|•\s*threads\b|đã\s+đăng\b|posted\s+on\b|[-–—:|•]\s+)/i.test(
      coreTitle,
    )
  ) {
    return true;
  }

  // Suffix author attribution on LinkedIn Pulse / LinkedIn posts / TikTok ("... | HPT Vietnam Corporation")
  if (
    /(?:\||—|\s-\s)\s*(?:hpt\s+vietnam(?:\s+corporation)?|life\s+at\s+hpt|hpt\s+cyber\s+security)(?:\s+(?:posted\s+on\s+the\s+topic|on\s+linkedin|official))?\s*(?:\([^)]*\))?\s*$/i.test(
      coreTitle,
    )
  ) {
    return true;
  }

  // Self-PR product showcase post on social media (e.g. "HPT SAALEM - ... HPT đã triển khai thành công...")
  if (/^hpt\s+[a-z0-9]{2,16}\s*[-–—:]\s+.{12,}\bhpt\s+(?:đã\s+triển\s+khai|cung\s+cấp|mang\s+đến|giới\s+thiệu)\b/i.test(coreTitle)) {
    return true;
  }

  return false;
}

export function isAuthenticHptMention(
  title: string,
  snippet = '',
  url = '',
  customKeywords: readonly string[] = [],
  source = '',
): boolean {
  const lowerUrl = url.toLowerCase();
  // Explicitly block company self-PR from hpt.vn, HPT's own social channels, static quote/directory pages, AND recruitment domains
  if (
    lowerUrl.includes('hpt.vn') ||
    HPT_RECRUITMENT_DOMAIN_RE.test(lowerUrl) ||
    HPT_STATIC_DIRECTORY_URL_RE.test(url) ||
    isHptSelfSocialPost(url, title, snippet, source)
  ) {
    return false;
  }

  const combined = `${title} ${snippet}`.trim();
  if (!combined) return false;

  // Strictly reject hiring / recruitment ads and non-HPT namesake domains/phrases across all feeds
  if (HPT_RECRUITMENT_NOISE_RE.test(combined)) return false;
  if (HPT_FALSE_POSITIVE_NOISE_RE.test(`${combined} ${lowerUrl}`)) return false;

  const lowerCombined = combined.toLowerCase();
  const matchedCustom = customKeywords.some((kw) => {
    const clean = kw.trim().toLowerCase();
    return clean.length >= 3 && lowerCombined.includes(clean);
  });
  if (matchedCustom) return true;

  if (!HPT_WORD_OR_TAX_RE.test(combined)) return false;
  // If matched via 'HSOC' alone without 'HPT' or tax code '0301447436', require Vietnamese language or Vietnam mention to block foreign 'HSOC' acronyms (e.g. UK roofing / student societies)
  if (
    !/\b(HPT|0301447436)\b/i.test(combined) &&
    !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]|việt\s*nam|vietnam/i.test(
      combined,
    )
  ) {
    return false;
  }
  return HPT_VALID_CONTEXT_RE.test(combined);
}

export function classifyHptExternalItem(
  title: string,
  source = '',
  url = '',
  fallbackCategory: HptItemCategory = 'press_social',
  snippet = '',
): { category: HptItemCategory; badge: string; sentiment: HptSentiment } {
  const lower = `${title} ${snippet}`.toLowerCase();
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

  const isSocialForum =
    /facebook\.com|fb\.com|\bfacebook\b|linkedin\.com|\blinkedin\b|tiktok\.com|\btiktok\b|threads\.net|threads\.com|\bthreads\b|reddit\.com|t\.me\/|youtube\.com|youtu\.be|voz\.vn|tinhte\.vn|f319\.com|f247\.com|spiderum\.com/.test(
      hay,
    );

  // 3. IT Trade Press, Associations (VINASA / VNISA / Sao Khuê) & Global Tech Vendors (when not a forum/social post)
  if (
    !isSocialForum &&
    (/microsoft|ibm|cisco|oracle|netapp|fortinet|vinasa|vnisa|sao khuê|chìa khóa vàng|ictvietnam|vietnamnet|antoanthongtin|vneconomy|nhipsongthitruong|liên doanh|hợp tác/.test(
      hay,
    ) ||
      fallbackCategory === 'it_press_partner')
  ) {
    const isNeg = /sự cố|gián đoạn|bị hack|rò rỉ|khiếu nại|bị phạt|cảnh báo/.test(lower);
    const isAwardOrPartner =
      /đạt danh hiệu|partner|sao khuê|giải thưởng|ký kết|liên doanh|top\s*10|tiên phong|vượt kế hoạch/.test(
        lower,
      );
    return {
      category: 'it_press_partner',
      badge: /microsoft|ibm|cisco|oracle|netapp|vinasa|vnisa|sao khuê|liên doanh/.test(hay)
        ? 'ĐỐI TÁC · HIỆP HỘI'
        : 'BÁO CHUYÊN NGÀNH CNTT',
      sentiment: isNeg ? 'negative' : isAwardOrPartner ? 'positive' : 'neutral',
    };
  }

  // 4. Legal / Tax / IP / Press, YouTube, Reddit, Public Telegram & Community Forums
  if (/bản án|tranh chấp|kiện tụng|xử phạt|truy thu thuế/.test(lower)) {
    return { category: 'press_social', badge: 'PHÁP LÝ · THUẾ', sentiment: 'negative' };
  }
  if (/sở hữu trí tuệ|nhãn hiệu|bằng sáng chế|chứng nhận/.test(lower)) {
    return { category: 'press_social', badge: 'SỞ HỮU TRÍ TUỆ', sentiment: 'positive' };
  }

  const isNeg =
    /giảm sàn|thua lỗ|bị phạt|cảnh báo|rủi ro|sự cố|gián đoạn|bị hack|rò rỉ|bóc phốt|khiếu nại|lừa đảo|chậm|lỗi hệ thống|drama/.test(
      lower,
    );
  const isPos =
    /tăng trần|tăng trưởng|hoàn thành vượt|khởi sắc|đột phá|hợp tác|ký hợp đồng|giải thưởng|trúng/.test(
      lower,
    );

  let socialBadge = 'BÁO MỚI · BING · DIỄN ĐÀN';
  if (/facebook\.com|fb\.com|\bfacebook\b/.test(hay)) socialBadge = 'FACEBOOK · CÔNG KHAI';
  else if (/linkedin\.com|\blinkedin\b/.test(hay)) socialBadge = 'LINKEDIN · MẠNG XÃ HỘI';
  else if (/tiktok\.com|\btiktok\b|threads\.net|threads\.com|\bthreads\b/.test(hay)) socialBadge = 'TIKTOK · THREADS';
  else if (/reddit\.com/.test(hay)) socialBadge = 'REDDIT · DIỄN ĐÀN';
  else if (/t\.me\//.test(hay)) socialBadge = 'TELEGRAM · KÊNH CÔNG KHAI';
  else if (/youtube\.com|youtu\.be/.test(hay)) socialBadge = 'YOUTUBE · VIDEO';
  else if (/voz\.vn|tinhte\.vn|f319\.com|f247\.com|spiderum\.com/.test(hay)) socialBadge = 'DIỄN ĐÀN · CỘNG ĐỒNG';

  return {
    category: fallbackCategory,
    badge: socialBadge,
    sentiment: isNeg ? 'negative' : isPos ? 'positive' : 'neutral',
  };
}

// ============================================================================
// 1b. Custom RSS / RSSHub & Public Telegram Channel Watchlist Store
// ============================================================================

