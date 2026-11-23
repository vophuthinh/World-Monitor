import { XMLParser } from 'fast-xml-parser';
import type { RegionalWarning, RegionalWarningsSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const BMKG_NOWCAST_RSS_URL = 'https://www.bmkg.go.id/alerts/nowcast/en/rss.xml';
const HKO_WARNSUM_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const BMKG_FALLBACK_URL = 'https://www.bmkg.go.id/';
const HKO_URL = 'https://www.hko.gov.hk/en/wxinfo/currwx/wxwarnsum.htm';
const MAX_AGE_MS = 12 * 3_600_000;
const MAX_WARNINGS = 12;
const BMKG_HOST = /^([a-z0-9-]+\.)*bmkg\.go\.id$/i;

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function bmkgUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && BMKG_HOST.test(u.hostname) ? u.toString() : BMKG_FALLBACK_URL;
  } catch {
    return BMKG_FALLBACK_URL;
  }
}

function cleanDescription(raw: string): string | undefined {
  const t = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > 240 ? `${t.slice(0, 237)}...` : t;
}

/** BMKG (Indonesia) nowcast alerts: RSS with one item per province, issued in the last hours. */
export function parseBmkgNowcastRss(rss: string, now = Date.now()): RegionalWarning[] {
  let parsed: unknown;
  try {
    parsed = xml.parse(rss);
  } catch {
    return [];
  }
  const channel = (parsed as { rss?: { channel?: { item?: unknown } } } | null)?.rss?.channel;
  const raw = channel?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: RegionalWarning[] = [];
  for (const entry of items) {
    const it = entry as Record<string, unknown>;
    const title = text(it.title);
    const guid = text(it.guid);
    const issuedAt = Date.parse(text(it.pubDate));
    if (!title || !guid || !Number.isFinite(issuedAt)) continue;
    if (now - issuedAt > MAX_AGE_MS || issuedAt - now > 3_600_000) continue;
    const description = cleanDescription(text(it.description));
    const area = title.match(/\sin\s+(.+)$/i)?.[1]?.trim();
    out.push({
      id: `bmkg:${guid}`,
      source: 'BMKG',
      title,
      ...(area ? { area } : {}),
      severity: /extreme|severe|flood|very heavy|hail|tornado|waterspout/i.test(`${title} ${description ?? ''}`) ? 'high' : 'medium',
      issuedAt,
      ...(description ? { description } : {}),
      url: bmkgUrl(text(it.link)),
    });
  }
  return out.sort((a, b) => b.issuedAt - a.issuedAt);
}

/**
 * HKO warning summary: an object keyed by warning type, `{}` when nothing is in force.
 * The entry shape (name, code, type, actionCode, issueTime) follows HKO's published open-data documentation; it
 * has not been observed live because no warning was in force when this was written. Unknown shapes yield no
 * warnings rather than guesses.
 */
export function parseHkoWarningSummary(payload: unknown, now = Date.now()): RegionalWarning[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const out: RegionalWarning[] = [];
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const w = value as Record<string, unknown> | null;
    const name = text(w?.name);
    if (!w || !name) continue;
    if (text(w.actionCode).toUpperCase() === 'CANCEL') continue;
    const issuedAt = Date.parse(text(w.updateTime) || text(w.issueTime));
    const code = text(w.code);
    const type = text(w.type);
    const high = key === 'WTCSGNL' || /^TC(8|9|10)/i.test(code) || /black|red|typhoon|hurricane/i.test(name);
    out.push({
      id: `hko:${key}`,
      source: 'HKO',
      title: name,
      area: 'Hồng Kông',
      severity: high ? 'high' : 'medium',
      issuedAt: Number.isFinite(issuedAt) ? issuedAt : now,
      ...(type ? { description: type } : {}),
      url: HKO_URL,
    });
  }
  return out.sort((a, b) => b.issuedAt - a.issuedAt);
}

export async function fetchRegionalWarnings(): Promise<RegionalWarningsSnapshot> {
  const now = Date.now();
  const [bmkg, hko] = await Promise.allSettled([
    fetchTextWithTimeout(BMKG_NOWCAST_RSS_URL, { timeoutMs: 12_000, retries: 1, userAgent: DEFAULT_BROWSER_UA }).then((r) =>
      parseBmkgNowcastRss(r.text, now),
    ),
    fetchJsonWithTimeout<unknown>(HKO_WARNSUM_URL, { timeoutMs: 10_000, retries: 1 }).then((j) =>
      parseHkoWarningSummary(j, now),
    ),
  ]);
  if (bmkg.status === 'rejected' && hko.status === 'rejected') {
    throw new Error('Regional warnings: BMKG and HKO are both unavailable');
  }
  const warnings = [
    ...(bmkg.status === 'fulfilled' ? bmkg.value : []),
    ...(hko.status === 'fulfilled' ? hko.value : []),
  ]
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .slice(0, MAX_WARNINGS);
  return { warnings, bmkgOk: bmkg.status === 'fulfilled', hkoOk: hko.status === 'fulfilled', updatedAt: now };
}
