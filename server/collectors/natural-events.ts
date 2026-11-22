import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100';
const GDACS_MAP_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';
const NASA_FIRMS_SEA_MODIS_URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_24h.csv';
const WILDFIRE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface EonetEvent {
  id?: string;
  title?: string;
  categories?: Array<{ id?: string; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: Array<{
    date?: string;
    type?: string;
    coordinates?: unknown;
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
  }>;
}

export interface EonetPayload {
  events?: EonetEvent[];
}

interface GdacsFeature {
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
  properties?: {
    eventtype?: string;
    eventid?: string | number;
    name?: string;
    description?: string;
    alertlevel?: string;
    country?: string;
    fromdate?: string;
    todate?: string;
    url?: { report?: string } | string;
    severitydata?: { severity?: number; severitytext?: string; severityunit?: string };
  };
}

export interface GdacsPayload {
  features?: GdacsFeature[];
}

function extractCoordinates(type?: string, rawCoords?: unknown): [number, number] | null {
  if (type === 'Point' && Array.isArray(rawCoords) && rawCoords.length >= 2) {
    const lon = Number(rawCoords[0]);
    const lat = Number(rawCoords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [lon, lat];
    }
  }
  if (type === 'Polygon' && Array.isArray(rawCoords) && Array.isArray(rawCoords[0])) {
    const ring = rawCoords[0] as unknown[];
    let sumLon = 0;
    let sumLat = 0;
    let count = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lon = Number(pt[0]);
        const lat = Number(pt[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          sumLon += lon;
          sumLat += lat;
          count += 1;
        }
      }
    }
    if (count > 0) {
      const lon = sumLon / count;
      const lat = sumLat / count;
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return [lon, lat];
    }
  }
  return null;
}

function severityForEonetCategory(catId: string, magVal?: number | null): SeverityLevel {
  if (catId === 'volcanoes') return 'high';
  if (catId === 'severeStorms') return (magVal ?? 0) >= 64 ? 'critical' : 'high';
  if (catId === 'floods' || catId === 'landslides') return 'medium';
  if (catId === 'wildfires') return 'medium';
  return 'low';
}

export function normalizeEonetEvents(payload: EonetPayload, now = Date.now()): GeoPointFeature[] {
  if (!payload || !Array.isArray(payload.events)) {
    throw new Error('Malformed NASA EONET payload');
  }

  const out: GeoPointFeature[] = [];
  for (const ev of payload.events) {
    const cat = ev.categories?.[0];
    const catId = String(cat?.id ?? 'natural').trim();
    // Earthquakes are served by USGS feed with higher fidelity
    if (catId === 'earthquakes') continue;

    const latestGeo = ev.geometry?.[ev.geometry.length - 1];
    if (!latestGeo) continue;
    const coords = extractCoordinates(latestGeo.type, latestGeo.coordinates);
    if (!coords) continue;

    const ts = latestGeo.date ? Date.parse(latestGeo.date) : now;
    const validTs = Number.isFinite(ts) ? ts : now;
    if (catId === 'wildfires' && now - validTs > WILDFIRE_MAX_AGE_MS) {
      continue;
    }

    const [lon, lat] = coords;
    const mag = typeof latestGeo.magnitudeValue === 'number' ? latestGeo.magnitudeValue : undefined;
    const unit = latestGeo.magnitudeUnit ?? '';

    out.push({
      id: `eonet:${ev.id ?? `${lat.toFixed(2)}-${lon.toFixed(2)}`}`,
      layer: 'natural',
      title: ev.title || cat?.title || 'Natural Event',
      subtitle: `NASA EONET · ${cat?.title ?? catId}${mag ? ` (${mag} ${unit})` : ''}`,
      category: catId,
      severity: severityForEonetCategory(catId, mag),
      lat,
      lon,
      timestamp: validTs,
      source: 'NASA EONET v3',
      url: ev.sources?.[0]?.url ?? undefined,
      magnitude: mag,
      meta: {
        eventCategory: cat?.title ?? catId,
        magnitudeValue: mag ?? null,
        magnitudeUnit: unit || null,
        provider: 'NASA EONET',
      },
    });
  }

  return out;
}

const GDACS_TYPE_MAP: Record<string, { category: string; label: string }> = {
  TC: { category: 'severeStorms', label: 'Bão nhiệt đới / Siêu bão' },
  FL: { category: 'floods', label: 'Lũ lụt lớn' },
  VO: { category: 'volcanoes', label: 'Núi lửa phun trào' },
  WF: { category: 'wildfires', label: 'Cháy rừng quy mô lớn' },
  DR: { category: 'drought', label: 'Hạn hán nghiêm trọng' },
  EQ: { category: 'earthquakes', label: 'Động đất' },
};

function severityForGdacsAlert(alert?: string): SeverityLevel {
  const level = (alert ?? '').toLowerCase();
  if (level === 'red') return 'critical';
  if (level === 'orange') return 'high';
  return 'medium';
}

export function normalizeGdacsEvents(payload: GdacsPayload, now = Date.now()): GeoPointFeature[] {
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error('Malformed GDACS GeoJSON payload');
  }

  const seenIds = new Set<string>();
  const out: GeoPointFeature[] = [];

  for (const feat of payload.features) {
    const props = feat.properties;
    if (!props) continue;
    const evType = String(props.eventtype ?? '').toUpperCase();
    // Skip EQ duplicates since USGS handles earthquakes
    if (!evType || evType === 'EQ') continue;

    const coords = extractCoordinates(feat.geometry?.type, feat.geometry?.coordinates);
    if (!coords) continue;

    const key = `gdacs:${evType}:${props.eventid ?? ''}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);

    const [lon, lat] = coords;
    const typeMeta = GDACS_TYPE_MAP[evType] ?? { category: 'natural', label: evType };
    const ts = props.todate ? Date.parse(props.todate) : props.fromdate ? Date.parse(props.fromdate) : now;
    const reportUrl =
      typeof props.url === 'string'
        ? props.url
        : typeof props.url?.report === 'string'
          ? props.url.report
          : undefined;
    const sevText = props.severitydata?.severitytext ?? '';

    out.push({
      id: key,
      layer: 'natural',
      title: props.name || `${typeMeta.label}${props.country ? ` — ${props.country}` : ''}`,
      subtitle: `GDACS ${String(props.alertlevel ?? 'Green').toUpperCase()} · ${typeMeta.label}${sevText ? ` · ${sevText}` : ''}`,
      category: typeMeta.category,
      severity: severityForGdacsAlert(props.alertlevel),
      lat,
      lon,
      timestamp: Number.isFinite(ts) ? ts : now,
      source: 'UN / EC GDACS',
      url: reportUrl,
      meta: {
        alertLevel: props.alertlevel ?? 'Green',
        eventType: typeMeta.label,
        country: props.country ?? null,
        severityDetail: sevText || null,
        provider: 'GDACS',
      },
    });
  }

  return out;
}

export function parseNasaFirmsCsv(
  csvText: string,
  now = Date.now(),
  maxHotspots = 38,
  regionLabel = 'ĐNÁ',
): GeoPointFeature[] {
  if (!csvText) return [];
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const isViirs = header.includes('bright_ti4') || header.includes('instrument');

  const cellBest = new Map<string, { feat: GeoPointFeature; frp: number }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 12) continue;
    const lat = Number(cols[0]);
    const lon = Number(cols[1]);
    const brightness = Number(cols[2]);
    const acqDate = cols[5]?.trim() ?? '';
    const acqTime = cols[6]?.trim().padStart(4, '0') ?? '0000';
    const satellite = cols[7]?.trim() || (isViirs ? 'N20' : 'MODIS');
    const instrument = isViirs ? (cols[8]?.trim() || 'VIIRS') : 'MODIS';

    let confidencePct = 0;
    let frp = 0;
    if (isViirs) {
      const confCode = (cols[9]?.trim() ?? '').toLowerCase();
      confidencePct =
        confCode === 'h'
          ? 92
          : confCode === 'n'
            ? 75
            : confCode === 'l'
              ? 35
              : Number(confCode) || 70;
      frp = Number(cols[12]);
    } else {
      confidencePct = Number(cols[8]);
      frp = Number(cols[11]);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const minFrp = isViirs ? 12 : 25;
    if (confidencePct < 70 && (Number.isFinite(frp) ? frp : 0) < minFrp) {
      continue;
    }

    // Deduplicate dense 375m/1km satellite fire pixels into 0.25° (~27km) regional clusters
    const gridKey = `${Math.round(lat * 4) / 4}:${Math.round(lon * 4) / 4}`;
    const parsedTs = acqDate
      ? Date.parse(`${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}:00Z`)
      : now;
    const validTs = Number.isFinite(parsedTs) ? parsedTs : now;
    const frpVal = Number.isFinite(frp) ? Math.round(frp * 10) / 10 : 10;
    const severity: SeverityLevel = frpVal >= 90 ? 'critical' : frpVal >= 25 ? 'high' : 'medium';

    const candidate: GeoPointFeature = {
      id: `firms:${gridKey}`,
      layer: 'natural',
      title: `Điểm nhiệt Vệ tinh ${regionLabel} (${frpVal} MW FRP)`,
      subtitle: `NASA FIRMS ${instrument} (${satellite}) · Độ tin cậy ${confidencePct}% · Độ sáng ${Math.round(brightness)}K`,
      category: 'wildfires',
      severity,
      lat,
      lon,
      timestamp: validTs,
      source: isViirs ? 'NASA FIRMS VIIRS 375m NRT' : 'NASA FIRMS MODIS (24h)',
      url: 'https://firms.modaps.eosdis.nasa.gov/map/',
      magnitude: frpVal,
      meta: {
        provider: isViirs ? 'NASA FIRMS VIIRS 375m' : 'NASA FIRMS MODIS',
        instrument,
        satellite,
        fireRadiativePowerMW: frpVal,
        confidencePct,
        region: regionLabel,
      },
    };

    const existing = cellBest.get(gridKey);
    if (!existing || frpVal > existing.frp) {
      cellBest.set(gridKey, { feat: candidate, frp: frpVal });
    }
  }

  return [...cellBest.values()]
    .sort((a, b) => b.frp - a.frp)
    .slice(0, maxHotspots)
    .map((x) => x.feat);
}

async function fetchNasaFirmsHotspots(now: number): Promise<GeoPointFeature[]> {
  const firmsKey = process.env.NASA_FIRMS_API_KEY?.trim();
  if (firmsKey) {
    try {
      const seaUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(firmsKey)}/VIIRS_NOAA20_NRT/92,0,126,25/2`;
      const conflictUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(firmsKey)}/VIIRS_NOAA20_NRT/28,12,58,52/1`;

      const [seaRes, confRes] = await Promise.allSettled([
        fetchTextWithTimeout(seaUrl, { timeoutMs: 10_000, retries: 0, userAgent: NAMED_APP_UA }),
        fetchTextWithTimeout(conflictUrl, { timeoutMs: 10_000, retries: 0, userAgent: NAMED_APP_UA }),
      ]);

      const merged: GeoPointFeature[] = [];
      if (seaRes.status === 'fulfilled') {
        merged.push(...parseNasaFirmsCsv(seaRes.value.text, now, 32, 'ĐNÁ / Biển Đông'));
      }
      if (confRes.status === 'fulfilled') {
        merged.push(...parseNasaFirmsCsv(confRes.value.text, now, 22, 'Đông Âu / Trung Đông'));
      }
      if (merged.length > 0) return merged;
    } catch {
      // Fall back to public MODIS 24h CSV
    }
  }

  const res = await fetchTextWithTimeout(NASA_FIRMS_SEA_MODIS_URL, {
    timeoutMs: 9_000,
    retries: 0,
    userAgent: NAMED_APP_UA,
  });
  return parseNasaFirmsCsv(res.text, now, 36, 'ĐNÁ');
}

export async function fetchNaturalEvents(): Promise<GeoPointFeature[]> {
  const now = Date.now();
  const [eonetRes, gdacsRes, firmsRes] = await Promise.allSettled([
    fetchJsonWithTimeout<EonetPayload>(EONET_URL, {
      timeoutMs: 12_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).then((data) => normalizeEonetEvents(data, now)),
    fetchJsonWithTimeout<GdacsPayload>(GDACS_MAP_URL, {
      timeoutMs: 35_000,
      retries: 1,
      // Named application UA avoids GDACS F5 HTML challenge
      userAgent: NAMED_APP_UA,
    }).then((data) => normalizeGdacsEvents(data, now)),
    fetchNasaFirmsHotspots(now),
  ]);

  if (eonetRes.status === 'rejected' && gdacsRes.status === 'rejected' && firmsRes.status === 'rejected') {
    throw new Error(
      `Natural event sources failed: EONET=${eonetRes.reason?.message ?? eonetRes.reason}; GDACS=${gdacsRes.reason?.message ?? gdacsRes.reason}`,
    );
  }

  const merged = [
    ...(gdacsRes.status === 'fulfilled' ? gdacsRes.value : []),
    ...(eonetRes.status === 'fulfilled' ? eonetRes.value : []),
    ...(firmsRes.status === 'fulfilled' ? firmsRes.value : []),
  ];

  return merged.sort((a, b) => b.timestamp - a.timestamp);
}
