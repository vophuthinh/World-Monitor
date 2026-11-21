import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';

const USGS_WEEK_M25_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';

interface UsgsFeature {
  id?: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    url?: string | null;
    tsunami?: number | null;
    felt?: number | null;
    title?: string | null;
  };
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
}

export interface UsgsGeoJsonPayload {
  type?: string;
  features?: UsgsFeature[];
}

function severityForMagnitude(mag: number): SeverityLevel {
  if (mag >= 6.0) return 'critical';
  if (mag >= 5.0) return 'high';
  if (mag >= 4.0) return 'medium';
  return 'low';
}

export function normalizeUsgsEarthquakes(payload: UsgsGeoJsonPayload): GeoPointFeature[] {
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error('Malformed USGS GeoJSON response');
  }

  const results: GeoPointFeature[] = [];
  for (const item of payload.features) {
    const coords = item.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    const depthKm = coords.length >= 3 && Number.isFinite(Number(coords[2])) ? Number(coords[2]) : 0;
    const mag = Number(item.properties?.mag ?? 0);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      continue;
    }
    if (!Number.isFinite(mag) || mag <= 0) continue;

    const id = item.id ? `eq:${item.id}` : `eq:${lat.toFixed(3)}:${lon.toFixed(3)}:${item.properties?.time ?? 0}`;
    const place = item.properties?.place || 'Unknown region';
    const ts = Number(item.properties?.time) || Date.now();
    const tsunami = Boolean(item.properties?.tsunami);

    results.push({
      id,
      layer: 'earthquakes',
      title: `M${mag.toFixed(1)} — ${place}`,
      subtitle: `Độ sâu ${depthKm.toFixed(1)} km${tsunami ? ' · CẢNH BÁO SÓNG THẦN' : ''}`,
      category: mag >= 5.5 ? 'major_quake' : 'seismic',
      severity: tsunami ? 'critical' : severityForMagnitude(mag),
      lat,
      lon,
      timestamp: ts,
      source: 'USGS Earthquake Hazards Program',
      url: item.properties?.url ?? undefined,
      magnitude: Number(mag.toFixed(1)),
      meta: {
        magnitude: Number(mag.toFixed(1)),
        depthKm: Number(depthKm.toFixed(1)),
        place,
        tsunami,
        feltReports: item.properties?.felt ?? 0,
      },
    });
  }

  return results.sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchEarthquakes(): Promise<GeoPointFeature[]> {
  const payload = await fetchJsonWithTimeout<UsgsGeoJsonPayload>(USGS_WEEK_M25_URL, {
    timeoutMs: 12_000,
    retries: 1,
    userAgent: NAMED_APP_UA,
  });
  return normalizeUsgsEarthquakes(payload);
}
