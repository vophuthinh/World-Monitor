import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachEnsembles,
  fetchMultiModelForecasts,
  resetForecastEnsembleCache,
  summarizeMultiModelForecast,
} from '../server/collectors/forecast-ensemble';

type Entry = { hourly: Record<string, Array<number | null> | string[]>; utc_offset_seconds: number };
const DATA = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'open-meteo-multimodel.json'), 'utf8')) as Entry[];
const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'jma_seamless', 'ukmo_seamless', 'cma_grapes_global'];
const OFFSET_S = DATA[0].utc_offset_seconds;
/** A "now" whose local time (UTC+7) is the given local ISO hour. */
const nowAtLocal = (isoHour: string) => Date.parse(`${isoHour}:00:00Z`) - OFFSET_S * 1000;
const START = String((DATA[0].hourly.time as string[])[0]).slice(0, 10); // local date of index 0

// expected values computed independently, straight from the fixture arrays
function expected(entry: Entry, from: number) {
  const per = MODELS.map((m) => {
    const t = (entry.hourly[`temperature_2m_${m}`] as number[]).slice(from, from + 24);
    const r = (entry.hourly[`precipitation_${m}`] as number[]).slice(from, from + 24);
    return { tMax: Math.max(...t), tMin: Math.min(...t), rain: r.reduce((a, b) => a + b, 0) };
  });
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    per,
    tMaxMean: mean(per.map((p) => p.tMax)),
    tMaxMin: Math.min(...per.map((p) => p.tMax)),
    tMaxMax: Math.max(...per.map((p) => p.tMax)),
    rainMean: mean(per.map((p) => p.rain)),
    rainMin: Math.min(...per.map((p) => p.rain)),
    rainMax: Math.max(...per.map((p) => p.rain)),
    wet: per.filter((p) => p.rain >= 1).length,
  };
}

const near = (actual: number, expectedValue: number) => expect(Math.abs(actual - expectedValue)).toBeLessThanOrEqual(0.1);

describe('summarizeMultiModelForecast (real Open-Meteo data)', () => {
  it('aggregates the next 24 h across all models, starting at the current local hour', () => {
    for (const [entryIdx, hour] of [[0, 0], [0, 10], [1, 13], [4, 7]] as const) {
      const s = summarizeMultiModelForecast(DATA[entryIdx] as never, nowAtLocal(`${START}T${String(hour).padStart(2, '0')}`))!;
      const e = expected(DATA[entryIdx], hour);
      expect(s.models).toBe(6);
      near(s.tempMaxMeanC, e.tMaxMean);
      near(s.tempMaxMinC, e.tMaxMin);
      near(s.tempMaxMaxC, e.tMaxMax);
      near(s.rainMeanMm, e.rainMean);
      near(s.rainMinMm, e.rainMin);
      near(s.rainMaxMm, e.rainMax);
      expect(s.wetModels).toBe(e.wet);
      expect(s.perModel.map((p) => p.model)).toEqual(MODELS);
      expect(s.tempMaxMinC).toBeLessThanOrEqual(s.tempMaxMeanC);
      expect(s.tempMaxMeanC).toBeLessThanOrEqual(s.tempMaxMaxC);
    }
  });

  it('returns null with fewer than 3 usable models', () => {
    const two = { utc_offset_seconds: OFFSET_S, hourly: { time: DATA[0].hourly.time } as Record<string, unknown> };
    for (const m of MODELS.slice(0, 2)) {
      two.hourly[`temperature_2m_${m}`] = DATA[0].hourly[`temperature_2m_${m}`];
      two.hourly[`precipitation_${m}`] = DATA[0].hourly[`precipitation_${m}`];
    }
    expect(summarizeMultiModelForecast(two as never, nowAtLocal(`${START}T00`))).toBeNull();
    expect(summarizeMultiModelForecast(null as never, Date.now())).toBeNull();
    expect(summarizeMultiModelForecast({} as never, Date.now())).toBeNull();
  });

  it('ignores a model whose values are null and keeps the rest', () => {
    const copy = JSON.parse(JSON.stringify(DATA[0])) as Entry;
    copy.hourly['temperature_2m_gfs_seamless'] = (copy.hourly['temperature_2m_gfs_seamless'] as number[]).map(() => null);
    const s = summarizeMultiModelForecast(copy as never, nowAtLocal(`${START}T00`))!;
    expect(s.models).toBe(5);
    expect(s.perModel.some((p) => p.model === 'gfs_seamless')).toBe(false);
  });

  it('returns null when fewer than 24 hours remain in the response', () => {
    expect(summarizeMultiModelForecast(DATA[0] as never, nowAtLocal(`${START}T00`) + 40 * 3_600_000)).toBeNull();
  });
});

describe('attachEnsembles', () => {
  it('attaches each summary to the location with the same station id and leaves others alone', () => {
    const locs = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ] as never[];
    const summaries = [{ models: 6 }, null, { models: 4 }] as never[];
    const out = attachEnsembles(locs, ['a', 'b', 'c'], summaries) as unknown as Array<{ id: string; ensemble?: { models: number } }>;
    expect(out[0].ensemble?.models).toBe(6);
    expect(out[1].ensemble).toBeUndefined();
    expect(out[2].ensemble?.models).toBe(4);
  });
});

describe('fetchMultiModelForecasts', () => {
  beforeEach(() => resetForecastEnsembleCache());
  afterEach(() => vi.restoreAllMocks());
  const stations = [
    { id: 's0', lat: 10.7769, lon: 106.7009 },
    { id: 's1', lat: 21.0285, lon: 105.8542 },
  ];

  it('requests all stations and models in ONE call and caches the result for 30 minutes', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(DATA.slice(0, 2)), { status: 200 });
    });
    const now = nowAtLocal(`${START}T08`);
    const first = await fetchMultiModelForecasts(stations, now);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('models=ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless,ukmo_seamless,cma_grapes_global');
    expect(urls[0]).toContain('latitude=10.7769,21.0285');
    expect(first).toHaveLength(2);
    expect(first[0]?.models).toBe(6);
    await fetchMultiModelForecasts(stations, now + 20 * 60_000);
    expect(urls).toHaveLength(1); // cached
    await fetchMultiModelForecasts(stations, now + 31 * 60_000);
    expect(urls).toHaveLength(2); // expired
  });

  it('returns no ensembles (never throws) when the API fails, and keeps the last good result', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(DATA.slice(0, 2)), { status: 200 }));
    const now = nowAtLocal(`${START}T08`);
    const good = await fetchMultiModelForecasts(stations, now);
    spy.mockImplementation(async () => new Response('x', { status: 503 }));
    const afterFailure = await fetchMultiModelForecasts(stations, now + 40 * 60_000);
    expect(afterFailure[0]?.models).toBe(good[0]?.models);
    resetForecastEnsembleCache();
    const cold = await fetchMultiModelForecasts(stations, now + 80 * 60_000);
    expect(cold).toEqual([null, null]);
  });
});
