import type { HptCompanyIntelSnapshot, HptCompanyItem, HptStockSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { maybeEnrichHptWithGroqSentiment } from './hpt/ai';
import { BAOMOI_HPT_SEARCH_URL, CAFEF_HPT_EVENTS_URL, CAFEF_HPT_NEWS_URL, HPT_EXTERNAL_FEEDS, HPT_HQ_LAT, HPT_HQ_LON, HPT_RECRUITMENT_DOMAIN_RE, HPT_RECRUITMENT_NOISE_RE, HPT_TAX_CODE, REDDIT_HPT_SEARCH_URL, SIMPLIZE_HPT_SUMMARY_URL } from './hpt/config';
import { RedditSearchPayload, SimplizeSummaryPayload, enrichTopDisclosuresWithPdfLinks, normalizeSimplizeHptSummary, parseBaoMoiHptSearchHtml, parseCafeFHptDisclosuresHtml, parseHptExternalRss, parseRedditHptSearchJson } from './hpt/sources';

export * from './hpt/config';
export * from './hpt/sources';
export * from './hpt/ai';

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

  const [stockRes, cfNewsRes, cfEventsRes, baoMoiRes, redditRes, ...restResults] =
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
  if (redditRes.status === 'fulfilled') {
    const items = parseRedditHptSearchJson(redditRes.value, now);
    if (items.length > 0) {
      sourceCount += 1;
      rawCollected.push(...items);
    }
  }
  for (const r of restResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sourceCount += 1;
      rawCollected.push(...r.value);
    }
  }

  // Final safety guard: never allow any hpt.vn or recruitment/job-board link into the stream
  const cleanExternalOnly = rawCollected.filter(
    (it) =>
      !it.url.toLowerCase().includes('hpt.vn') &&
      !HPT_RECRUITMENT_DOMAIN_RE.test(it.url) &&
      !HPT_RECRUITMENT_NOISE_RE.test(it.title),
  );

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
    .slice(0, 60);

  if (deduped.length === 0 && previous?.items.length) {
    deduped = previous.items.filter(
      (it) =>
        !it.url.toLowerCase().includes('hpt.vn') &&
        !HPT_RECRUITMENT_DOMAIN_RE.test(it.url) &&
        !HPT_RECRUITMENT_NOISE_RE.test(it.title),
    );
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

