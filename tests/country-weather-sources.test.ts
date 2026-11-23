import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import { createApp } from '../server/app';
import { fetchVietnamEnvironment, normalizeRiverDischarge } from '../server/collectors/vietnam-env-outages';
import { resetForecastEnsembleCache } from '../server/collectors/forecast-ensemble';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetForecastEnsembleCache();
});

describe('country reference source', () => {
  it('uses a server-side key, validates input and caches identical country searches', async () => {
    vi.stubEnv('RESTCOUNTRIES_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({ data: { objects: [
      { names: { common: 'Canada' }, codes: { alpha_3: 'CAN' }, capitals: [{ name: 'Ottawa' }], population: 40000000, currencies: [{ code: 'CAD' }] },
    ] } })));
    vi.stubGlobal('fetch', fetchMock);
    const app = createApp(new CollectorScheduler(new SnapshotStore('/tmp/wm-country-unused')));
    expect((await app.request('/api/countries?q=x')).status).toBe(400);
    const response = await app.request('/api/countries?q=canada-test');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ countries: [{ code: 'CAN', capital: 'Ottawa', population: 40000000, currencies: ['CAD'] }] });
    await app.request('/api/countries?q=canada-test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('does not present demo results or missing keys as live data', async () => {
    const app = createApp(new CollectorScheduler(new SnapshotStore('/tmp/wm-country-unused')));
    vi.stubEnv('RESTCOUNTRIES_API_KEY', '');
    expect((await app.request('/api/countries?q=unique-missing-key')).status).toBe(503);
    vi.stubEnv('RESTCOUNTRIES_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { _demo: {}, objects: [] } }))));
    expect((await app.request('/api/countries?q=unique-demo-test')).status).toBe(502);
  });
});

describe('Open-Meteo additional data', () => {
  it('keeps only valid river forecasts for the requested city grids', () => {
    const data = normalizeRiverDischarge([
      { latitude: 10.775, longitude: 106.725, daily: { time: ['2026-11-24', '2026-11-25'], river_discharge: [421.67, null] } },
      { latitude: 21.025, longitude: 105.875, daily: { time: ['2026-11-24'], river_discharge: [0.64] } },
    ]);
    expect(data).toMatchObject([
      { city: 'TP.HCM', forecast: [{ date: '2026-11-24', dischargeM3s: 421.67 }] },
      { city: 'Hà Nội', forecast: [{ date: '2026-11-24', dischargeM3s: 0.64 }] },
    ]);
    expect(normalizeRiverDischarge([{ latitude: 0, longitude: 0, daily: { time: [], river_discharge: [] } }])).toEqual([]);
  });

  it('attaches marine, hourly and river model data without replacing missing numbers with zero', async () => {
    const now = Date.parse('2026-11-23T19:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const forecast = Array.from({ length: 6 }, () => ({
      current: { temperature_2m: 25, wind_speed_10m: 5 },
      hourly: { time: ['2026-11-24T02:00', '2026-11-24T03:00'], precipitation: [0, null], wind_speed_10m: [10, 12] },
    }));
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('api.open-meteo.com/v1/forecast') && !target.includes('models=')) return new Response(JSON.stringify(forecast));
      if (target.includes('marine-api.open-meteo.com')) return new Response(JSON.stringify([
        { current: { sea_surface_temperature: 28, ocean_current_velocity: 0.6, ocean_current_direction: 214, swell_wave_height: 1.2 } }, { current: {} },
      ]));
      if (target.includes('flood-api.open-meteo.com')) return new Response(JSON.stringify([
        { latitude: 10.775, longitude: 106.725, daily: { time: ['2026-11-24'], river_discharge: [421] } },
        { latitude: 21.025, longitude: 105.875, daily: { time: ['2026-11-24'], river_discharge: [0.64] } },
      ]));
      return new Response('unavailable', { status: 404 });
    }));
    const result = await fetchVietnamEnvironment();
    expect(result.locations[0].hourlyForecast).toEqual([
      { time: '2026-11-24T02:00', rainMm: 0, windKmh: 10 },
      { time: '2026-11-24T03:00', rainMm: null, windKmh: 12 },
    ]);
    expect(result.locations[4]).toMatchObject({ seaSurfaceTempC: 28, oceanCurrentKmh: 0.6, oceanCurrentDirectionDeg: 214, swellHeightM: 1.2 });
    expect(result.riverDischarge).toHaveLength(2);
  });
});
