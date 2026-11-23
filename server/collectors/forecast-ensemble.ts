import type { VietnamEnvEnsemble, VietnamEnvLocation } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';

/**
 * Next-24h forecast from several weather models at once (Open-Meteo multi-model). Picking one model is a
 * gamble: in a spot check against Singapore's NEA stations no model was consistently best, and the ranking
 * changed between analysis and a 1-day-old forecast. The spread across models is the honest uncertainty signal.
 */
export const ENSEMBLE_MODELS = [
  'ecmwf_ifs025',
  'gfs_seamless',
  'icon_seamless',
  'jma_seamless',
  'ukmo_seamless',
  'cma_grapes_global',
] as const;

const MIN_MODELS = 3;
const WINDOW_HOURS = 24;
const CACHE_TTL_MS = 30 * 60_000;

interface MultiModelEntry {
  utc_offset_seconds?: number;
  hourly?: Record<string, unknown>;
}

function numericSeries(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const nums = value.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

const round1 = (n: number) => Number(n.toFixed(1));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Summarize one location's response. `null` when fewer than 3 models are usable or the window is incomplete. */
export function summarizeMultiModelForecast(entry: MultiModelEntry | null, nowMs: number): VietnamEnvEnsemble | null {
  const hourly = entry?.hourly;
  const times = hourly?.time;
  if (!hourly || !Array.isArray(times) || times.length === 0) return null;

  // `time` is local time (the request sets the timezone); find the current local hour in it.
  const offsetMs = (entry?.utc_offset_seconds ?? 0) * 1000;
  const localHour = new Date(nowMs + offsetMs).toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const start = (times as string[]).findIndex((t) => typeof t === 'string' && t.startsWith(localHour));
  if (start < 0 || start + WINDOW_HOURS > times.length) return null;

  const perModel: VietnamEnvEnsemble['perModel'] = [];
  for (const model of ENSEMBLE_MODELS) {
    const temps = numericSeries(hourly[`temperature_2m_${model}`]);
    const rain = numericSeries(hourly[`precipitation_${model}`]);
    if (!temps || !rain) continue;
    const t = temps.slice(start, start + WINDOW_HOURS);
    const r = rain.slice(start, start + WINDOW_HOURS);
    if (t.length < WINDOW_HOURS || r.length < WINDOW_HOURS) continue;
    perModel.push({
      model,
      tempMaxC: round1(Math.max(...t)),
      tempMinC: round1(Math.min(...t)),
      rainMm: round1(r.reduce((a, b) => a + b, 0)),
    });
  }
  if (perModel.length < MIN_MODELS) return null;

  const tMax = perModel.map((p) => p.tempMaxC);
  const rain = perModel.map((p) => p.rainMm);
  return {
    models: perModel.length,
    tempMaxMeanC: round1(mean(tMax)),
    tempMaxMinC: Math.min(...tMax),
    tempMaxMaxC: Math.max(...tMax),
    tempMinMeanC: round1(mean(perModel.map((p) => p.tempMinC))),
    rainMeanMm: round1(mean(rain)),
    rainMinMm: Math.min(...rain),
    rainMaxMm: Math.max(...rain),
    wetModels: rain.filter((r) => r >= 1).length,
    perModel,
  };
}

/** Attach summaries (aligned with `stationIds`) to the locations that have the same id. */
export function attachEnsembles(
  locations: VietnamEnvLocation[],
  stationIds: readonly string[],
  summaries: ReadonlyArray<VietnamEnvEnsemble | null>,
): VietnamEnvLocation[] {
  const byId = new Map<string, VietnamEnvEnsemble>();
  stationIds.forEach((id, i) => {
    const s = summaries[i];
    if (s) byId.set(id, s);
  });
  return locations.map((l) => (byId.has(l.id) ? { ...l, ensemble: byId.get(l.id) } : l));
}

let cache: { at: number; result: Array<VietnamEnvEnsemble | null> } | null = null;

export function resetForecastEnsembleCache(): void {
  cache = null;
}

/**
 * One request for every station and every model; cached for 30 minutes (model runs change a few times a
 * day). Never throws: on failure the last good result is reused, otherwise there are simply no ensembles.
 */
export async function fetchMultiModelForecasts(
  stations: ReadonlyArray<{ id: string; lat: number; lon: number }>,
  now = Date.now(),
): Promise<Array<VietnamEnvEnsemble | null>> {
  if (cache && now - cache.at < CACHE_TTL_MS && cache.result.length === stations.length) return cache.result;
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${stations.map((s) => s.lat).join(',')}` +
      `&longitude=${stations.map((s) => s.lon).join(',')}` +
      '&hourly=temperature_2m,precipitation' +
      `&models=${ENSEMBLE_MODELS.join(',')}` +
      '&forecast_days=2&timezone=Asia%2FHo_Chi_Minh';
    const raw = await fetchJsonWithTimeout<MultiModelEntry[] | MultiModelEntry>(url, {
      timeoutMs: 12_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    });
    const entries = Array.isArray(raw) ? raw : [raw];
    const result = stations.map((_, i) => summarizeMultiModelForecast(entries[i] ?? null, now));
    cache = { at: now, result };
    return result;
  } catch {
    return cache && cache.result.length === stations.length ? cache.result : stations.map(() => null);
  }
}
