import type { WeatherRadarFrame, WeatherRadarSnapshot } from '@shared/types';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout } from '../lib/http';

const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export interface RainViewerPayload {
  host?: string;
  generated?: number;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
    nowcast?: Array<{ time?: number; path?: string }>;
  };
}

export function normalizeRainViewerRadar(
  payload: RainViewerPayload,
  now = Date.now(),
): WeatherRadarSnapshot {
  const host = (payload?.host || 'https://tilecache.rainviewer.com').replace(/\/+$/, '');
  const pastRaw = payload?.radar?.past;
  if (!Array.isArray(pastRaw) || pastRaw.length === 0) {
    throw new Error('RainViewer payload missing radar.past frames');
  }

  const pastFrames: WeatherRadarFrame[] = pastRaw
    .filter((f): f is { time: number; path: string } => typeof f?.time === 'number' && typeof f?.path === 'string' && f.path.length > 0)
    .map((f) => ({
      time: f.time,
      path: f.path,
      tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/6/1_1.png`,
    }));

  if (pastFrames.length === 0) {
    throw new Error('RainViewer radar.past contained no valid frames');
  }

  const latest = pastFrames[pastFrames.length - 1];
  return {
    host,
    path: latest.path,
    tileUrlTemplate: latest.tileUrlTemplate,
    frameTime: latest.time,
    generatedAt: payload.generated ? payload.generated * 1000 : now,
    pastFrames: pastFrames.slice(-6),
  };
}

export async function fetchWeatherRadar(): Promise<WeatherRadarSnapshot> {
  const payload = await fetchJsonWithTimeout<RainViewerPayload>(RAINVIEWER_MAPS_URL, {
    timeoutMs: 10_000,
    retries: 1,
    userAgent: DEFAULT_BROWSER_UA,
  });
  return normalizeRainViewerRadar(payload, Date.now());
}
