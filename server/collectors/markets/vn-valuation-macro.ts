import type {
  VietnamLiveMacroPulse,
} from '@shared/types';
import { fetchTextWithTimeout } from '../../lib/http';

export interface SimplizeIndexValuation {
  peRatio?: number;
  pbRatio?: number;
  close52wLow?: number;
  close52wHigh?: number;
  volumeVs90dRatio?: number;
}

export function parseSimplizeIndexValuationHtml(html: string): SimplizeIndexValuation | null {
  if (!html) return null;
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) return null;

  try {
    const parsed = JSON.parse(nextMatch[1]) as {
      props?: {
        pageProps?: {
          summary?: {
            peRatio?: number;
            pbRatio?: number;
            close52wLow?: number;
            close52wHigh?: number;
            volume?: number;
            volAvg90d?: number;
          };
        };
      };
    };
    const s = parsed?.props?.pageProps?.summary;
    if (!s) return null;

    const pe = Number(s.peRatio);
    const pb = Number(s.pbRatio);
    const low52 = Number(s.close52wLow);
    const high52 = Number(s.close52wHigh);
    const vol = Number(s.volume);
    const vol90 = Number(s.volAvg90d);

    const out: SimplizeIndexValuation = {};
    if (Number.isFinite(pe) && pe > 2 && pe < 80) out.peRatio = Number(pe.toFixed(2));
    if (Number.isFinite(pb) && pb > 0.2 && pb < 20) out.pbRatio = Number(pb.toFixed(2));
    if (Number.isFinite(low52) && low52 > 100) out.close52wLow = Number(low52.toFixed(2));
    if (Number.isFinite(high52) && high52 > 100) out.close52wHigh = Number(high52.toFixed(2));
    if (Number.isFinite(vol) && Number.isFinite(vol90) && vol > 0 && vol90 > 0) {
      out.volumeVs90dRatio = Number((vol / vol90).toFixed(2));
    }

    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function fetchSimplizeVnIndexValuation(): Promise<SimplizeIndexValuation | null> {
  try {
    const { text } = await fetchTextWithTimeout('https://simplize.vn/chi-so/VNINDEX', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    });
    return parseSimplizeIndexValuationHtml(text);
  } catch {
    return null;
  }
}

export function parseTradingEconomicsVietnamHtml(
  indicatorsHtml: string,
  bondHtml = '',
): Partial<VietnamLiveMacroPulse> {
  const out: Partial<VietnamLiveMacroPulse> = {};

  if (bondHtml) {
    const bondMeta = bondHtml.match(
      /Vietnam\s+10Y?\s+(?:Government\s+)?Bond\s+Yield[\s\S]{0,120}?at\s+([0-9]+\.[0-9]+)\s*%/i,
    );
    if (bondMeta) {
      const y = Number(bondMeta[1]);
      if (Number.isFinite(y) && y > 0.5 && y < 20) out.vn10yYieldPct = Number(y.toFixed(2));
    }
  }

  if (indicatorsHtml) {
    const rowRe =
      /href=['"]\/vietnam\/([^'"]+)['"][^>]*>\s*([^<]+?)\s*<\/a>\s*<\/td>\s*<td[^>]*>\s*([-0-9.,]+)\s*<\/td>\s*<td[^>]*>\s*([-0-9.,]+)\s*<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(indicatorsHtml)) !== null) {
      const slug = m[1].toLowerCase().trim();
      const latest = Number(m[3].replace(/,/g, ''));
      const prev = Number(m[4].replace(/,/g, ''));
      if (!Number.isFinite(latest)) continue;

      if (slug === 'inflation-cpi' && latest > -10 && latest < 40) {
        out.monthlyCpiPct = Number(latest.toFixed(2));
        if (Number.isFinite(prev)) out.monthlyCpiPrevPct = Number(prev.toFixed(2));
      } else if (slug === 'manufacturing-pmi' && latest > 20 && latest < 85) {
        out.manufacturingPmi = Number(latest.toFixed(1));
        if (Number.isFinite(prev)) out.manufacturingPmiPrev = Number(prev.toFixed(1));
      } else if (slug === 'interbank-rate' && latest >= 0 && latest < 30) {
        out.interbankRatePct = Number(latest.toFixed(2));
      } else if (slug === 'interest-rate' && latest >= 0 && latest < 25) {
        out.sbvPolicyRatePct = Number(latest.toFixed(2));
      } else if (slug === 'gdp-growth-annual' && latest > -15 && latest < 25) {
        out.quarterlyGdpPct = Number(latest.toFixed(2));
        if (Number.isFinite(prev)) out.quarterlyGdpPrevPct = Number(prev.toFixed(2));
      } else if (slug === 'balance-of-trade' && Math.abs(latest) < 100) {
        out.tradeBalanceBillionUsd = Number(latest.toFixed(2));
      } else if (slug === 'government-bond-yield' && out.vn10yYieldPct === undefined && latest > 0.5 && latest < 20) {
        out.vn10yYieldPct = Number(latest.toFixed(2));
      }
    }
  }

  return out;
}

export function parseMultplSp500PeHtml(html: string): number | undefined {
  if (!html) return undefined;
  const match =
    html.match(/Current\s+S(?:&amp;|&)P\s+500\s+PE\s+Ratio[\s\S]{0,180}?([0-9]+\.[0-9]+)/i) ??
    html.match(/id=["']current["'][\s\S]{0,220}?([0-9]+\.[0-9]+)/i);
  if (!match) return undefined;
  const val = Number(match[1]);
  return Number.isFinite(val) && val > 5 && val < 90 ? Number(val.toFixed(2)) : undefined;
}

export function extractRssItems(xml: string): Array<{
  title: string;
  pubYear?: number;
  pubMonth?: number;
  pubDay?: number;
}> {
  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (itemBlocks.length > 0) {
    const out: Array<{ title: string; pubYear?: number; pubMonth?: number; pubDay?: number }> = [];
    for (const block of itemBlocks) {
      const inner = block[1];
      const titleMatch = inner.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      if (!titleMatch) continue;
      const pubMatch = inner.match(/<pubDate>([^<]+)<\/pubDate>/i);
      let pubYear: number | undefined;
      let pubMonth: number | undefined;
      let pubDay: number | undefined;
      if (pubMatch) {
        const parsedTs = Date.parse(pubMatch[1].trim());
        if (Number.isFinite(parsedTs)) {
          const d = new Date(parsedTs + 7 * 3_600_000);
          pubYear = d.getUTCFullYear();
          pubMonth = d.getUTCMonth() + 1;
          pubDay = d.getUTCDate();
        }
      }
      out.push({ title: titleMatch[1].trim(), pubYear, pubMonth, pubDay });
    }
    return out;
  }
  return [...xml.matchAll(/<title>([^<]+)<\/title>/gi)].map((m) => ({ title: m[1].trim() }));
}

export function parseVietnameseMonthsPhrase(phrase: string): number {
  const s = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.includes('cả năm')) return 12;
  const numMatch = s.match(/\b(1[0-2]|[2-9])\s*tháng\b/);
  if (numMatch) return Number(numMatch[1]);
  const orderedWords: Array<[string, number]> = [
    ['mười hai', 12],
    ['mười một', 11],
    ['mười', 10],
    ['chín', 9],
    ['tám', 8],
    ['bảy', 7],
    ['sáu', 6],
    ['năm', 5],
    ['bốn', 4],
    ['ba', 3],
    ['hai', 2],
  ];
  for (const [word, mVal] of orderedWords) {
    if (s.includes(`${word} tháng`)) return mVal;
  }
  return 0;
}

/**
 * Extracts official NSO/GSO (`nso.gov.vn`) cumulative YTD Average CPI, Core CPI, and cumulative YTD Trade Balance
 * (with Google News RSS fallback) plus Vietcombank commercial USD sell rate — strictly guarded by statistical year
 * and GSO release calendar so prior-year or mismatched mid-month figures never distort N-month comparisons.
 */
export function parseVietnamOfficialYtdContext(params: {
  nsoPostsJson?: string;
  cpiRssXml?: string;
  tradeRssXml?: string;
  vcbFxXml?: string;
  now?: number;
}): Partial<VietnamLiveMacroPulse> {
  const out: Partial<VietnamLiveMacroPulse> = {};
  const vnNow = new Date((params.now ?? Date.now()) + 7 * 3_600_000);
  const currentYear = vnNow.getUTCFullYear();
  const currentMonth = vnNow.getUTCMonth() + 1;
  const dayOfMonth = vnNow.getUTCDate();

  // GSO releases cumulative M-month CPI & trade around the 3rd–6th day of month M+1.
  // Before Feb 5 of a new year, multi-month YTD belongs to the prior year (12M); otherwise cap to published months of currentYear.
  const isEarlyNewYear = currentMonth === 1 || (currentMonth === 2 && dayOfMonth < 5);
  const targetStatYear = isEarlyNewYear ? currentYear - 1 : currentYear;
  const maxPublishedMonths = isEarlyNewYear
    ? 12
    : Math.max(2, currentMonth - (dayOfMonth < 3 ? 2 : 1));

  if (params.vcbFxXml) {
    const vcbMatch = params.vcbFxXml.match(/CurrencyCode=["']USD["'][^>]*Sell=["']([0-9,.]+)["']/i);
    if (vcbMatch) {
      const num = Number(vcbMatch[1].replace(/,/g, ''));
      if (Number.isFinite(num) && num > 18_000 && num < 40_000) {
        out.vcbSellUsdVnd = Math.round(num);
      }
    }
  }

  // 1. Primary Authoritative Source: Official Cục Thống kê (NSO Vietnam `www.nso.gov.vn`) REST JSON posts
  if (params.nsoPostsJson) {
    try {
      const posts = JSON.parse(params.nsoPostsJson) as Array<{
        date?: string;
        title?: { rendered?: string };
        content?: { rendered?: string };
      }>;
      if (Array.isArray(posts)) {
        let bestCpiScore = -1;
        let bestTradeMonths = 0;

        for (const post of posts) {
          const postYear = post.date ? Number(post.date.slice(0, 4)) : undefined;
          if (postYear && postYear < targetStatYear) continue;

          const plain = `${post.title?.rendered ?? ''}. ${post.content?.rendered ?? ''}`
            .replace(/<[^>]+>/g, ' ')
            .replace(/&#\d+;|&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ');

          const cpiMatches = [
            ...plain.matchAll(
              /Bình\s+quân\s+((?:1[0-2]|[2-9]|mười\s+hai|mười\s+một|mười|chín|tám|bảy|sáu|năm|bốn|ba|hai)\s+tháng|cả\s+năm)\s+năm\s+(20\d{2})\s*,\s*CPI\s+tăng\s+([0-9]+[.,][0-9]+)\s*%/gi,
            ),
            ...plain.matchAll(
              /CPI\s+bình\s+quân\s+((?:1[0-2]|[2-9]|mười\s+hai|mười\s+một|mười|chín|tám|bảy|sáu|năm|bốn|ba|hai)\s+tháng|cả\s+năm)\s+năm\s+(20\d{2})\s+tăng\s+([0-9]+[.,][0-9]+)\s*%/gi,
            ),
          ];

          for (const m of cpiMatches) {
            const months = parseVietnameseMonthsPhrase(m[1]);
            const statYear = Number(m[2]);
            const avgCpi = Number(m[3].replace(',', '.'));
            const nearbySlice = plain.slice(m.index ?? 0, (m.index ?? 0) + 220);
            const coreSubMatch = nearbySlice.match(/lạm\s+phát\s+cơ\s+bản[^0-9]{0,25}?([0-9]+[.,][0-9]+)\s*%/i);
            const coreCpi = coreSubMatch ? Number(coreSubMatch[1].replace(',', '.')) : undefined;
            if (statYear !== targetStatYear || months < 2 || months > maxPublishedMonths) continue;
            if (!Number.isFinite(avgCpi) || avgCpi <= 0 || avgCpi >= 25) continue;

            const score = months * 10 + (coreCpi !== undefined && Number.isFinite(coreCpi) ? 3 : 0);
            if (score > bestCpiScore) {
              bestCpiScore = score;
              out.ytdCpiMonths = months;
              out.ytdAvgCpiPct = Number(avgCpi.toFixed(2));
              if (coreCpi !== undefined && Number.isFinite(coreCpi) && coreCpi > 0 && coreCpi < 25) {
                out.ytdCoreCpiPct = Number(coreCpi.toFixed(2));
              }
            }
          }

          const tradeMatches = [
            ...plain.matchAll(
              /(?:cán\s+cân\s+thương\s+mại\s+hàng\s+hóa|tính\s+chung)\s+((?:1[0-2]|[2-9]|mười\s+hai|mười\s+một|mười|chín|tám|bảy|sáu|năm|bốn|ba|hai)\s+tháng|cả\s+năm)(?:\s+(?:đầu\s+)?năm\s+(20\d{2}))?(?:\s+ước\s+tính|\s+sơ\s+bộ)?\s+(nhập\s+siêu|xuất\s+siêu)\s+([0-9]+[.,][0-9]+)\s*t[ỷỉ]\s*USD/gi,
            ),
          ];

          for (const tm of tradeMatches) {
            const months = parseVietnameseMonthsPhrase(tm[1]);
            const statYear = tm[2] ? Number(tm[2]) : postYear;
            if (statYear !== undefined && statYear !== targetStatYear) continue;
            if (months < 2 || months > maxPublishedMonths || months < bestTradeMonths) continue;

            const val = Number(tm[4].replace(',', '.'));
            if (!Number.isFinite(val) || val <= 0 || val >= 100) continue;

            bestTradeMonths = months;
            const isDeficit = /nhập\s+siêu/i.test(tm[3]);
            out.ytdTradeBalanceBillionUsd = isDeficit ? -Number(val.toFixed(2)) : Number(val.toFixed(2));
          }
        }
      }
    } catch {
      // Fallback cleanly to RSS if NSO JSON is malformed
    }
  }

  const isStaleItemYear = (rawTitle: string, pubYear?: number): boolean => {
    if (pubYear !== undefined && pubYear < targetStatYear) return true;
    const boundYearMatch = rawTitle.match(/(?:tháng(?:\s+đầu)?(?:\s+năm)?|năm|\/)\s*(20\d{2})\b/i);
    if (boundYearMatch && Number(boundYearMatch[1]) !== targetStatYear) return true;
    const allYears = [...rawTitle.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    if (allYears.length > 0 && !allYears.includes(targetStatYear)) return true;
    return false;
  };

  // 2. Secondary Fallback: Google News RSS (only when NSO JSON did not populate CPI or Trade)
  if (out.ytdAvgCpiPct === undefined && params.cpiRssXml) {
    const items = extractRssItems(params.cpiRssXml);
    let bestScore = -1;
    for (const { title: rawTitle, pubYear } of items) {
      if (isStaleItemYear(rawTitle, pubYear)) continue;
      const months = parseVietnameseMonthsPhrase(rawTitle);
      if (months < 2 || months > maxPublishedMonths) continue;

      const cpiMatch = rawTitle.match(/CPI[^0-9]{0,40}?tăng\s+([0-9]+[.,][0-9]+)\s*%/i);
      const coreMatch = rawTitle.match(/lạm\s+phát\s+cơ\s+bản[^0-9]{0,40}?([0-9]+[.,][0-9]+)\s*%/i);
      if (!cpiMatch) continue;

      const avgCpi = Number(cpiMatch[1].replace(',', '.'));
      if (!Number.isFinite(avgCpi) || avgCpi <= 0 || avgCpi >= 25) continue;

      const hasExplicitTargetYear = rawTitle.includes(String(targetStatYear));
      const candidateScore = months * 10 + (hasExplicitTargetYear ? 4 : 0) + (coreMatch ? 2 : 0);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        out.ytdCpiMonths = months;
        out.ytdAvgCpiPct = Number(avgCpi.toFixed(2));
        if (coreMatch) {
          const coreVal = Number(coreMatch[1].replace(',', '.'));
          if (Number.isFinite(coreVal) && coreVal > 0 && coreVal < 25) {
            out.ytdCoreCpiPct = Number(coreVal.toFixed(2));
          }
        } else {
          delete out.ytdCoreCpiPct;
        }
      }
    }
  }

  if (out.ytdTradeBalanceBillionUsd === undefined && params.tradeRssXml) {
    const items = extractRssItems(params.tradeRssXml);
    const targetMonths = out.ytdCpiMonths ?? maxPublishedMonths;
    const expectedGsoReleaseMonth = targetMonths === 12 ? 1 : targetMonths + 1;
    let bestTradeScore = -1;

    for (const { title: rawTitle, pubYear, pubMonth, pubDay } of items) {
      if (isStaleItemYear(rawTitle, pubYear)) continue;
      if (
        /\btrong\s+tháng\s+\d+/i.test(rawTitle) ||
        /^\s*tháng\s+\d+\b/i.test(rawTitle) ||
        /\bnửa\s+(?:đầu|cuối)\s+tháng\b/i.test(rawTitle) ||
        /\bdịch\s+vụ\b/i.test(rawTitle) ||
        /\bViệt\s+Nam\s*[-–]\s*[A-ZĐ]/u.test(rawTitle)
      ) {
        continue;
      }

      const deficitMatch = rawTitle.match(/nhập\s+siêu[^0-9]{0,25}?([0-9]+[.,][0-9]+)\s*t[ỷỉ](?:\s*USD)?/i);
      const surplusMatch = rawTitle.match(/xuất\s+siêu[^0-9]{0,25}?([0-9]+[.,][0-9]+)\s*t[ỷỉ](?:\s*USD)?/i);
      let signedVal: number | undefined;
      if (deficitMatch) {
        const val = Number(deficitMatch[1].replace(',', '.'));
        if (Number.isFinite(val) && val > 0 && val < 100) signedVal = -Number(val.toFixed(2));
      } else if (surplusMatch && /\b\d+\s*tháng|cả\s+năm|đầu\s+năm\b/i.test(rawTitle)) {
        const val = Number(surplusMatch[1].replace(',', '.'));
        if (Number.isFinite(val) && val > 0 && val < 100) signedVal = Number(val.toFixed(2));
      }
      if (signedVal === undefined) continue;

      const explicitMonths = parseVietnameseMonthsPhrase(rawTitle);
      if (explicitMonths >= 2 && explicitMonths > maxPublishedMonths) continue;

      // Align cumulative trade horizon with NSO's full-month release window (days 1–14 of month M+1)
      // over Customs mid-month (15th) flash updates so N-month trade & N-month CPI stay strictly synchronized.
      let score = 50;
      if (explicitMonths === targetMonths) {
        score = 120;
      } else if (explicitMonths >= 2 && explicitMonths < targetMonths) {
        score = 20 + explicitMonths;
      } else if (pubMonth === expectedGsoReleaseMonth && pubDay !== undefined && pubDay <= 14) {
        score = 105;
      } else if (pubMonth === expectedGsoReleaseMonth && pubDay !== undefined && pubDay >= 15) {
        score = 65;
      } else if (pubMonth !== undefined && pubMonth < expectedGsoReleaseMonth) {
        score = 25 + pubMonth;
      }

      if (score > bestTradeScore) {
        bestTradeScore = score;
        out.ytdTradeBalanceBillionUsd = signedVal;
      }
    }
  }

  return out;
}

export async function fetchVietnamAndGlobalMacroPulse(now: number): Promise<VietnamLiveMacroPulse | undefined> {
  const currentYear = new Date(now + 7 * 3_600_000).getUTCFullYear();
  const nsoApiUrl =
    'https://www.nso.gov.vn/wp-json/wp/v2/posts?categories=94,90,74&per_page=10&_fields=date,title,content';
  const cpiRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `"tháng" "CPI tăng" "lạm phát cơ bản" ${currentYear}`,
  )}&hl=vi&gl=VN&ceid=VN:vi`;
  const tradeRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `("nhập siêu" OR "xuất siêu") ("tỷ USD" OR "tỉ USD") "xuất nhập khẩu" ${currentYear} Việt Nam`,
  )}&hl=vi&gl=VN&ceid=VN:vi`;

  const [teIndRes, teBondRes, multplRes, nsoRes, cpiRssRes, tradeRssRes, vcbRes] = await Promise.allSettled([
    fetchTextWithTimeout('https://tradingeconomics.com/vietnam/indicators', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://tradingeconomics.com/vietnam/government-bond-yield', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://www.multpl.com/s-p-500-pe-ratio', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout(nsoApiUrl, {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout(cpiRssUrl, {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout(tradeRssUrl, {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
    fetchTextWithTimeout('https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx', {
      timeoutMs: 5_500,
      retries: 0,
      userAgent: 'Mozilla/5.0',
    }),
  ]);

  const indHtml = teIndRes.status === 'fulfilled' ? teIndRes.value.text : '';
  const bondHtml = teBondRes.status === 'fulfilled' ? teBondRes.value.text : '';
  const multplHtml = multplRes.status === 'fulfilled' ? multplRes.value.text : '';
  const ytdContext = parseVietnamOfficialYtdContext({
    nsoPostsJson: nsoRes.status === 'fulfilled' ? nsoRes.value.text : undefined,
    cpiRssXml: cpiRssRes.status === 'fulfilled' ? cpiRssRes.value.text : undefined,
    tradeRssXml: tradeRssRes.status === 'fulfilled' ? tradeRssRes.value.text : undefined,
    vcbFxXml: vcbRes.status === 'fulfilled' ? vcbRes.value.text : undefined,
    now,
  });

  const vnParsed = parseTradingEconomicsVietnamHtml(indHtml, bondHtml);
  const sp500PeRatio = parseMultplSp500PeHtml(multplHtml);

  const combined: VietnamLiveMacroPulse = {
    ...vnParsed,
    ...ytdContext,
    ...(sp500PeRatio !== undefined ? { sp500PeRatio } : {}),
    updatedAt: now,
  };

  return Object.keys(combined).length > 1 ? combined : undefined;
}

