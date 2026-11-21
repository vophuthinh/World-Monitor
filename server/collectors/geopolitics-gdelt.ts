import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchTextWithTimeout } from '../lib/http';

const GDELT_GEO_URL =
  'https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict%20OR%20missile%20OR%20military%20OR%20sanctions%20OR%20protest)&mode=PointData&format=GeoJSON&timespan=24h';

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
  const headline = anchorMatch[2]
    ?.replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

export async function fetchGeopoliticsGdelt(): Promise<GeoPointFeature[]> {
  const { text } = await fetchTextWithTimeout(GDELT_GEO_URL, {
    timeoutMs: 18_000,
    retries: 1,
    userAgent: DEFAULT_BROWSER_UA,
    headers: { Accept: 'application/json' },
  });
  return normalizeGdeltGeoJson(text, Date.now());
}
