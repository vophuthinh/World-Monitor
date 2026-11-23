import type { WeatherSatelliteFrame, WeatherSatelliteSnapshot } from '@shared/types';
import { fetchJsonWithTimeout } from '../lib/http';

const JMA_BASE = 'https://www.jma.go.jp/bosai/himawari/data/satimg';
const TARGET_TIMES_URL = `${JMA_BASE}/targetTimes_fd.json`;
/** JMA serves band 13 (clean infrared, brightness temperature) up to zoom 5; MapLibre overscales beyond. */
const MAX_ZOOM = 5;
const FRAME_COUNT = 6;
const STALE_AFTER_MS = 90 * 60_000;
const STAMP = /^\d{14}$/;

function parseStampUtc(stamp: string): number {
  return (
    Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(stamp.slice(8, 10)),
      Number(stamp.slice(10, 12)),
      Number(stamp.slice(12, 14)),
    ) / 1000
  );
}

/** Build the snapshot from JMA's `targetTimes_fd.json` (list of {basetime, validtime}, oldest first). */
export function normalizeHimawariTargetTimes(payload: unknown, now = Date.now()): WeatherSatelliteSnapshot {
  const entries = Array.isArray(payload) ? payload : [];
  const frames: WeatherSatelliteFrame[] = [];
  for (const entry of entries) {
    const e = entry as { basetime?: unknown; validtime?: unknown } | null;
    // Times are interpolated into a URL: accept digits only.
    if (typeof e?.basetime !== 'string' || typeof e.validtime !== 'string') continue;
    if (!STAMP.test(e.basetime) || !STAMP.test(e.validtime)) continue;
    frames.push({
      time: parseStampUtc(e.validtime),
      tileUrlTemplate: `${JMA_BASE}/${e.basetime}/fd/${e.validtime}/B13/TBB/{z}/{x}/{y}.jpg`,
    });
  }
  if (frames.length === 0) {
    throw new Error('JMA Himawari target times contained no valid frames');
  }
  frames.sort((a, b) => a.time - b.time);
  const recent = frames.slice(-FRAME_COUNT);
  const latest = recent[recent.length - 1];
  if (now - latest.time * 1000 > STALE_AFTER_MS) {
    throw new Error('JMA Himawari newest frame is stale');
  }
  return {
    product: 'Himawari-9 B13 hồng ngoại (JMA)',
    maxZoom: MAX_ZOOM,
    attribution: 'JMA / Himawari-9',
    frameTime: latest.time,
    tileUrlTemplate: latest.tileUrlTemplate,
    generatedAt: now,
    frames: recent,
  };
}

export async function fetchWeatherSatellite(): Promise<WeatherSatelliteSnapshot> {
  const payload = await fetchJsonWithTimeout<unknown>(TARGET_TIMES_URL, { timeoutMs: 10_000, retries: 1 });
  return normalizeHimawariTargetTimes(payload, Date.now());
}
