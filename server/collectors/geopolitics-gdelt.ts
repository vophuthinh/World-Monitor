import { inflateRawSync } from 'node:zlib';
import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const GDELT_GEO_URL =
  'https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict%20OR%20missile%20OR%20military%20OR%20sanctions%20OR%20protest)&mode=pointdata&format=geojson&timespan=1d';
const GDELT_LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

interface GdeltGeoFeature {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
  properties?: {
    name?: string;
    count?: number;
    shareimage?: string;
    html?: string;
  };
}

interface GdeltGeoCollection {
  type?: string;
  features?: GdeltGeoFeature[];
}

function extractHeadlineAndUrl(html?: string): { headline: string | null; url: string | null } {
  if (!html) return { headline: null, url: null };
  const anchorMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorMatch) return { headline: null, url: null };
  const url = anchorMatch[1]?.trim() || null;
  const headline =
    anchorMatch[2]
      ?.replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim() || null;
  return { headline, url };
}

function classifyGeoTopic(text: string): { category: string; severity: SeverityLevel } {
  const lower = text.toLowerCase();
  if (/missile|airstrike|strike|shelling|bomb|attack|drone|killed|war/.test(lower)) {
    return { category: 'conflict', severity: 'critical' };
  }
  if (/sanction|embargo|tariff|blockade|seized/.test(lower)) {
    return { category: 'sanctions', severity: 'high' };
  }
  if (/protest|riot|demonstration|unrest|clash/.test(lower)) {
    return { category: 'unrest', severity: 'medium' };
  }
  return { category: 'military_diplomacy', severity: 'medium' };
}

export function normalizeGdeltGeoJson(rawText: string, now = Date.now()): GeoPointFeature[] {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('{')) {
    throw new Error(`GDELT returned non-JSON body: ${trimmed.slice(0, 120)}`);
  }

  let parsed: GdeltGeoCollection;
  try {
    parsed = JSON.parse(trimmed) as GdeltGeoCollection;
  } catch {
    throw new Error(`GDELT returned malformed JSON: ${trimmed.slice(0, 120)}`);
  }

  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('GDELT Geo 2.0 payload is not a GeoJSON FeatureCollection');
  }

  const out: GeoPointFeature[] = [];
  const seenCoords = new Set<string>();

  for (const feat of parsed.features) {
    const coords = feat.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (lat === 0 && lon === 0) continue;

    const placeName = (feat.properties?.name ?? '').trim() || 'Global Flashpoint';
    const dedupeKey = `${lat.toFixed(2)}:${lon.toFixed(2)}`;
    if (seenCoords.has(dedupeKey)) continue;
    seenCoords.add(dedupeKey);

    const mentionCount = Math.max(1, Number(feat.properties?.count ?? 1));
    const { headline, url } = extractHeadlineAndUrl(feat.properties?.html);
    const combinedText = `${placeName} ${headline ?? ''}`;
    const { category, severity } = classifyGeoTopic(combinedText);
    const boostedSeverity: SeverityLevel =
      mentionCount >= 25 && severity !== 'critical' ? 'high' : severity;

    out.push({
      id: `gdelt:${dedupeKey}`,
      layer: 'geopolitics',
      title: headline ? `${placeName} — ${headline.slice(0, 95)}` : placeName,
      subtitle: `GDELT Geo 2.0 · ${mentionCount} bản tin trong 24h`,
      category,
      severity: boostedSeverity,
      lat,
      lon,
      timestamp: now,
      source: 'GDELT Project Geo 2.0',
      url: url ?? undefined,
      magnitude: mentionCount,
      meta: {
        location: placeName,
        articleMentions24h: mentionCount,
        sampleHeadline: headline,
      },
    });

    if (out.length >= 160) break;
  }

  return out;
}

const CAMEO_ROOT_LABELS: Record<string, { label: string; category: string; severity: SeverityLevel }> = {
  '13': { label: 'Cảnh báo / Đe dọa Địa chính trị', category: 'military_diplomacy', severity: 'medium' },
  '14': { label: 'Biểu tình / Bất ổn Xã hội', category: 'unrest', severity: 'medium' },
  '15': { label: 'Triển khai Lực lượng Quân sự', category: 'military_diplomacy', severity: 'high' },
  '17': { label: 'Cưỡng chế / Trừng phạt / Phong tỏa', category: 'sanctions', severity: 'high' },
  '18': { label: 'Tấn công Vũ trang / Đột kích', category: 'conflict', severity: 'critical' },
  '19': { label: 'Giao tranh Quân sự / Không kích', category: 'conflict', severity: 'critical' },
  '20': { label: 'Xung đột Quy mô lớn', category: 'conflict', severity: 'critical' },
};

function humanizeSlugFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.(html?|php|aspx?)$/i, '');
    if (!slug || slug.length < 8 || /^\d+$/.test(slug)) return null;
    const words = slug.replace(/[-_]+/g, ' ').replace(/\b\d{5,}\b/g, '').trim();
    if (words.split(/\s+/).length < 3) return null;
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return null;
  }
}

export function parseGdeltExportTsv(tsv: string, now = Date.now()): GeoPointFeature[] {
  const lines = tsv.split(/\r?\n/);
  const byCoord = new Map<string, GeoPointFeature & { mentions: number }>();

  for (const line of lines) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 61) continue;

    const rootCode = cols[28]?.trim() ?? '';
    const cameo = CAMEO_ROOT_LABELS[rootCode];
    if (!cameo) continue;

    const lat = Number(cols[56]);
    const lon = Number(cols[57]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (lat === 0 && lon === 0) continue;

    const locationName = (cols[52] ?? '').trim() || 'Global Flashpoint';
    const mentions = Math.max(1, Number(cols[31] ?? 1));
    const goldstein = Number(cols[30] ?? 0);
    const sourceUrl = (cols[60] ?? '').trim();
    const actor1 = (cols[6] ?? '').trim();
    const actor2 = (cols[16] ?? '').trim();

    const coordKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${rootCode}`;
    const existing = byCoord.get(coordKey);
    if (existing && existing.mentions >= mentions) continue;

    const actorsLabel = [actor1, actor2].filter(Boolean).join(' ↔ ');
    const slugHeadline = sourceUrl ? humanizeSlugFromUrl(sourceUrl) : null;

    byCoord.set(coordKey, {
      id: `gdelt:${cols[0] || coordKey}`,
      layer: 'geopolitics',
      title: `${locationName} — ${cameo.label}`,
      subtitle: `${actorsLabel ? `${actorsLabel} · ` : ''}${slugHeadline ?? `CAMEO ${cols[26]} · ${mentions} nguồn tin`}`,
      category: cameo.category,
      severity: cameo.severity,
      lat,
      lon,
      timestamp: now,
      source: 'GDELT v2 Live Event Stream (15m)',
      url: sourceUrl.startsWith('http') ? sourceUrl : undefined,
      magnitude: mentions,
      mentions,
      meta: {
        location: locationName,
        cameoCode: cols[26] || rootCode,
        eventType: cameo.label,
        actors: actorsLabel || null,
        goldsteinScale: Number.isFinite(goldstein) ? goldstein : null,
        mentions,
      },
    });
  }

  return [...byCoord.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 150)
    .map(({ mentions: _m, ...rest }) => rest);
}

function unzipFirstFileFromZipBuffer(buf: Buffer): string {
  // Local file header signature = 0x04034b50
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Invalid GDELT ZIP header');
  }
  const compressionMethod = buf.readUInt16LE(8);
  const compressedSize = buf.readUInt32LE(18);
  const fileNameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataOffset = 30 + fileNameLen + extraLen;

  const sliceEnd =
    compressedSize > 0 && dataOffset + compressedSize <= buf.length
      ? dataOffset + compressedSize
      : buf.length;
  const payload = buf.subarray(dataOffset, sliceEnd);

  if (compressionMethod === 0) {
    return payload.toString('utf8');
  }
  if (compressionMethod === 8) {
    return inflateRawSync(payload).toString('utf8');
  }
  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

async function fetchGdeltBulkLastUpdate(now: number): Promise<GeoPointFeature[]> {
  const { text } = await fetchTextWithTimeout(GDELT_LASTUPDATE_URL, {
    timeoutMs: 8_000,
    retries: 1,
    userAgent: NAMED_APP_UA,
  });

  const exportLine = text
    .split(/\r?\n/)
    .find((line) => line.includes('.export.CSV.zip'));
  const zipUrl = exportLine?.trim().split(/\s+/)[2];
  if (!zipUrl || !zipUrl.startsWith('http')) {
    throw new Error('Could not locate .export.CSV.zip URL in GDELT lastupdate.txt');
  }

  const resp = await fetch(zipUrl, {
    headers: { 'User-Agent': NAMED_APP_UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!resp.ok) {
    throw new Error(`GDELT export CSV HTTP ${resp.status}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const tsv = unzipFirstFileFromZipBuffer(Buffer.from(arrayBuf));
  const events = parseGdeltExportTsv(tsv, now);
  if (events.length === 0) {
    throw new Error('GDELT bulk export contained zero conflict/unrest events');
  }
  return events;
}

// ============================================================================
// ACLED OAuth 2.0 Automatic Token Manager + Armed Conflict Event Normalizer
// ============================================================================

const ACLED_OAUTH_URL = 'https://acleddata.com/oauth/token';
const ACLED_READ_URL = 'https://acleddata.com/api/acled/read?_format=json&limit=80';

let cachedAcledAuth: {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
} | null = null;

export async function getValidAcledAccessToken(now = Date.now()): Promise<string | null> {
  if (cachedAcledAuth && now < cachedAcledAuth.expiresAt) {
    return cachedAcledAuth.accessToken;
  }

  const email = process.env.ACLED_EMAIL?.trim();
  const password = process.env.ACLED_PASSWORD?.trim();
  const staticToken = process.env.ACLED_ACCESS_TOKEN?.trim();

  if (cachedAcledAuth?.refreshToken) {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'acled',
        refresh_token: cachedAcledAuth.refreshToken,
      });
      const resp = await fetch(ACLED_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(8_000),
      });
      if (resp.ok) {
        const j = (await resp.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        };
        if (j.access_token) {
          cachedAcledAuth = {
            accessToken: j.access_token,
            refreshToken: j.refresh_token ?? cachedAcledAuth.refreshToken,
            expiresAt: now + Math.max(3_600, (j.expires_in ?? 86_400) - 1_800) * 1_000,
          };
          return j.access_token;
        }
      }
    } catch {
      // Fall through to password grant
    }
  }

  if (email && password) {
    try {
      const body = new URLSearchParams({
        username: email,
        password,
        grant_type: 'password',
        client_id: 'acled',
        scope: 'authenticated',
      });
      const resp = await fetch(ACLED_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(8_500),
      });
      if (resp.ok) {
        const j = (await resp.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        };
        if (j.access_token) {
          cachedAcledAuth = {
            accessToken: j.access_token,
            refreshToken: j.refresh_token,
            expiresAt: now + Math.max(3_600, (j.expires_in ?? 86_400) - 1_800) * 1_000,
          };
          return j.access_token;
        }
      }
    } catch {
      // Fall through to static token
    }
  }

  return staticToken || null;
}

export interface AcledEventRow {
  event_id_cnty?: string;
  event_date?: string;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  country?: string;
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  fatalities?: string | number;
  notes?: string;
}

export interface AcledReadPayload {
  data?: AcledEventRow[];
}

export function normalizeAcledEvents(payload: AcledReadPayload, now = Date.now()): GeoPointFeature[] {
  const rows = payload?.data;
  if (!Array.isArray(rows)) return [];

  const out: GeoPointFeature[] = [];
  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      continue;
    }

    const evType = String(row.event_type ?? 'Conflict Event').trim();
    const subType = String(row.sub_event_type ?? '').trim();
    const fatalities = Math.max(0, Number(row.fatalities ?? 0) || 0);
    const isCombat =
      /battle|explosion|remote violence|violence against civilians/i.test(evType);
    const severity: SeverityLevel =
      fatalities >= 3 || /explosion|remote violence|air\/drone/i.test(`${evType} ${subType}`)
        ? 'critical'
        : isCombat
          ? 'high'
          : 'medium';

    const parsedTs = row.event_date ? Date.parse(row.event_date) : now;
    const locationLabel = [row.location, row.country].filter(Boolean).join(', ') || 'Global Conflict';

    out.push({
      id: `acled:${row.event_id_cnty ?? `${lat.toFixed(3)}:${lon.toFixed(3)}`}`,
      layer: 'geopolitics',
      title: `${locationLabel} — ${subType || evType}`,
      subtitle: `ACLED Verified${fatalities > 0 ? ` · ${fatalities} thương vong` : ''} · ${row.actor1 ?? ''}`,
      category: isCombat ? 'conflict' : 'unrest',
      severity,
      lat,
      lon,
      timestamp: Number.isFinite(parsedTs) ? parsedTs : now,
      source: 'ACLED Armed Conflict Database',
      url: 'https://acleddata.com/explorer/',
      magnitude: Math.max(3, fatalities * 2 + 4),
      meta: {
        location: locationLabel,
        eventType: evType,
        subEventType: subType || null,
        actor1: row.actor1 ?? null,
        actor2: row.actor2 ?? null,
        fatalities,
        notes: row.notes ? row.notes.slice(0, 220) : null,
      },
    });
  }

  return out;
}

async function fetchAcledConflictEvents(now: number): Promise<GeoPointFeature[]> {
  const token = await getValidAcledAccessToken(now);
  if (!token) return [];
  try {
    const payload = await fetchJsonWithTimeout<AcledReadPayload>(ACLED_READ_URL, {
      timeoutMs: 9_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return normalizeAcledEvents(payload, now);
  } catch {
    return [];
  }
}

export async function fetchGeopoliticsGdelt(): Promise<GeoPointFeature[]> {
  const now = Date.now();
  const acledPromise = fetchAcledConflictEvents(now);

  // Primary: fast attempt on GDELT Geo 2.0 JSON API; Fallback: authoritative GDELT v2 15-min GCS Event Stream
  try {
    const [{ text }, acledEvents] = await Promise.all([
      fetchTextWithTimeout(GDELT_GEO_URL, {
        timeoutMs: 6_500,
        retries: 0,
        userAgent: DEFAULT_BROWSER_UA,
        headers: { Accept: 'application/json' },
      }),
      acledPromise,
    ]);
    const geoPoints = normalizeGdeltGeoJson(text, now);
    if (geoPoints.length > 0 || acledEvents.length > 0) {
      return [...acledEvents, ...geoPoints];
    }
  } catch {
    // Fall through to GDELT v2 15-min bulk event table (koala73 _conflict-gdelt-bulk pattern)
  }

  const [bulkEvents, acledEvents] = await Promise.all([
    fetchGdeltBulkLastUpdate(now),
    acledPromise,
  ]);
  return [...acledEvents, ...bulkEvents];
}
