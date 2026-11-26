import { inflateRawSync } from 'node:zlib';
import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchTextWithTimeout } from '../lib/http';

const GDELT_GEO_URL =
  'https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict%20OR%20missile%20OR%20military%20OR%20sanctions%20OR%20protest)&mode=pointdata&format=geojson&timespan=1d';
const GDELT_LASTUPDATE_URL = 'https://data.gdeltproject.org/gdeltv2/lastupdate.txt';
const GDELT_SLOT_MS = 15 * 60_000;
/** How many earlier 15-minute files to try when the newest ones are not available. */
const GDELT_LOOKBACK_SLOTS = 8;

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

const ARMED_ACTOR_TYPES = new Set(['MIL', 'REB', 'INS', 'SEP', 'UAF', 'SPY']);

/** CAMEO 18-20 also covers street crime; military labels need an armed actor or two different states. */
function isMilitaryEvent(cols: string[]): boolean {
  const [country1, country2] = [cols[7]?.trim(), cols[17]?.trim()];
  return ARMED_ACTOR_TYPES.has(cols[12]?.trim()) || ARMED_ACTOR_TYPES.has(cols[22]?.trim()) ||
    Boolean(country1 && country2 && country1 !== country2);
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
    if (cameo.category === 'conflict' && !isMilitaryEvent(cols)) continue;

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

/**
 * Candidate export files: the newest listed one first, then earlier 15-minute slots (https).
 * Some networks see the newest files as 404 for a while after `lastupdate.txt` lists them,
 * while older slots are already served, so a single listed URL is not reliable.
 */
export function gdeltBulkCandidateUrls(listedUrl: string, lookbackSlots = GDELT_LOOKBACK_SLOTS): string[] {
  const httpsUrl = listedUrl.replace(/^http:/, 'https:');
  const m = httpsUrl.match(/^(.*\/)(\d{14})(\.export\.CSV\.zip)$/);
  if (!m) return [httpsUrl];
  const [, dir, stamp, suffix] = m;
  const t = Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
    Number(stamp.slice(8, 10)),
    Number(stamp.slice(10, 12)),
    Number(stamp.slice(12, 14)),
  );
  const urls = [httpsUrl];
  for (let k = 1; k <= lookbackSlots; k += 1) {
    const slot = new Date(t - k * GDELT_SLOT_MS).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    urls.push(`${dir}${slot}${suffix}`);
  }
  return urls;
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

  const candidates = gdeltBulkCandidateUrls(zipUrl);
  for (const url of candidates) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': NAMED_APP_UA },
      signal: AbortSignal.timeout(12_000),
    });
    // Only 404 means "not available here yet": try the previous slot. Anything else is a real failure.
    if (resp.status === 404) continue;
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
  throw new Error(`GDELT export CSV HTTP 404 for the newest ${candidates.length} 15-minute files`);
}

export async function fetchGeopoliticsGdelt(): Promise<GeoPointFeature[]> {
  const now = Date.now();
  // Primary: fast attempt on GDELT Geo 2.0 JSON API; Fallback: authoritative GDELT v2 15-min GCS Event Stream
  try {
    const { text } = await fetchTextWithTimeout(GDELT_GEO_URL, {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
      headers: { Accept: 'application/json' },
    });
    const geoPoints = normalizeGdeltGeoJson(text, now);
    if (geoPoints.length > 0) return geoPoints;
  } catch {
    // Fall through to GDELT v2 15-min bulk event table (koala73 _conflict-gdelt-bulk pattern)
  }

  return fetchGdeltBulkLastUpdate(now);
}
