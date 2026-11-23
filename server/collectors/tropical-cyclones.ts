import type {
  TropicalCyclone,
  TropicalCycloneCategory,
  TropicalCycloneSnapshot,
  TropicalCycloneTrackSegment,
} from '@shared/types';
import { fetchJsonWithTimeout } from '../lib/http';

/**
 * Active tropical cyclones from GDACS, which republishes JTWC warnings (`source: "JTWC"`) together with the
 * past track, the forecast track and the forecast cone for every basin, including the West Pacific / East Sea.
 */
const GDACS_EVENT_LIST_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
const LOOKBACK_DAYS = 10;
const MAX_CYCLONES = 8;

interface GdacsFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

const GDACS_HOST = /^([a-z0-9-]+\.)*gdacs\.org$/i;

/** Geometry URLs come from GDACS JSON, so only https on gdacs.org (no credentials, default port) may be fetched. */
export function isAllowedGdacsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && GDACS_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

function isLonLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function segmentCategory(label: unknown): TropicalCycloneCategory {
  return label === 'TD' || label === 'TS' || label === 'HU' ? label : 'other';
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isCurrent(props: Record<string, unknown>): boolean {
  return props.iscurrent === true || props.iscurrent === 'true';
}

export function normalizeGdacsTropicalCyclone(feature: unknown, geometry: unknown): TropicalCyclone | null {
  const f = feature as GdacsFeature | null;
  const props = f?.properties;
  if (!props || typeof props.eventid !== 'number') return null;
  const coords = f?.geometry?.coordinates;
  if (!isLonLat(coords)) return null;
  const [lon, lat] = coords;

  const track: TropicalCycloneTrackSegment[] = [];
  let cone: Array<Array<[number, number]>> | null = null;
  const parts = (geometry as { features?: GdacsFeature[] } | null)?.features;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const cls = str(part.properties?.Class);
      const g = part.geometry;
      if (g?.type === 'LineString' && cls.startsWith('Line_') && Array.isArray(g.coordinates)) {
        const pts = g.coordinates.filter(isLonLat);
        if (pts.length >= 2) {
          track.push({ category: segmentCategory(part.properties?.polygonlabel), coordinates: pts });
        }
      } else if (g?.type === 'Polygon' && cls === 'Poly_Cones' && Array.isArray(g.coordinates)) {
        const rings = (g.coordinates as unknown[])
          .map((ring) => (Array.isArray(ring) ? ring.filter(isLonLat) : []))
          .filter((ring) => ring.length >= 3);
        if (rings.length > 0) cone = rings;
      }
    }
  }

  const severity = props.severitydata as { severity?: unknown; severitytext?: unknown } | undefined;
  const alert = str(props.alertlevel);
  const urls = props.url as { report?: unknown } | undefined;
  const modified = Date.parse(str(props.datemodified));
  const eventName = str(props.eventname) || str(props.name).replace(/^Tropical Cyclone\s+/i, '');

  return {
    id: `tc:${props.eventid}`,
    eventId: props.eventid,
    episodeId: typeof props.episodeid === 'number' ? props.episodeid : 0,
    name: eventName || `TC ${props.eventid}`,
    alertLevel: alert === 'Orange' || alert === 'Red' ? alert : 'Green',
    windKmh: typeof severity?.severity === 'number' ? Number(severity.severity.toFixed(1)) : null,
    intensityText: typeof severity?.severitytext === 'string' ? severity.severitytext : null,
    lat,
    lon,
    fromDate: str(props.fromdate),
    toDate: str(props.todate),
    updatedAt: Number.isFinite(modified) ? modified : Date.now(),
    countries: str(props.country),
    source: str(props.source, 'GDACS'),
    reportUrl: typeof urls?.report === 'string' && isAllowedGdacsUrl(urls.report) ? urls.report : 'https://www.gdacs.org/',
    track,
    cone,
  };
}

export async function fetchTropicalCyclones(): Promise<TropicalCycloneSnapshot> {
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const list = await fetchJsonWithTimeout<{ features?: GdacsFeature[] }>(
    `${GDACS_EVENT_LIST_URL}?eventlist=TC&fromdate=${from}&todate=${to}&alertlevel=green;orange;red`,
    { timeoutMs: 15_000, retries: 1 },
  );
  if (!Array.isArray(list?.features)) {
    throw new Error('GDACS TC event list is malformed');
  }

  const active = list.features
    .filter((f) => f.properties && isCurrent(f.properties))
    .slice(0, MAX_CYCLONES);

  const cyclones = (
    await Promise.all(
      active.map(async (feature) => {
        const geometryUrl = (feature.properties?.url as { geometry?: unknown } | undefined)?.geometry;
        let geometry: unknown = null;
        if (typeof geometryUrl === 'string' && isAllowedGdacsUrl(geometryUrl)) {
          try {
            geometry = await fetchJsonWithTimeout<unknown>(geometryUrl, { timeoutMs: 15_000, retries: 1 });
          } catch {
            geometry = null; // keep the cyclone with its position even if the track fails
          }
        }
        return normalizeGdacsTropicalCyclone(feature, geometry);
      }),
    )
  ).filter((c): c is TropicalCyclone => c !== null);

  return { cyclones, updatedAt: Date.now() };
}
