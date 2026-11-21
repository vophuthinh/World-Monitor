import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BootstrapResponse, LiveFastResponse, SourceHealth } from '../shared/types';
import { createApp } from '../server/app';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';

describe('Hono Backend API Routes', () => {
  let cacheDir: string;
  let store: SnapshotStore;
  let scheduler: CollectorScheduler;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'wm-api-test-'));
    store = new SnapshotStore(cacheDir);
    scheduler = new CollectorScheduler(store);

    scheduler.registerCollector({
      id: 'earthquakes',
      label: 'USGS Earthquakes',
      intervalMs: 180_000,
      retainMs: 21_600_000,
      countItems: (d) => d.length,
      fetcher: async () => [
        {
          id: 'eq:test1',
          layer: 'earthquakes',
          title: 'M5.2 Test Quake',
          category: 'seismic',
          severity: 'high',
          lat: 15.0,
          lon: 112.0,
          timestamp: Date.now(),
          source: 'USGS',
          meta: {},
        },
      ],
    });

    scheduler.registerCollector({
      id: 'macro-worldbank',
      label: 'World Bank Macro',
      intervalMs: 21_600_000,
      retainMs: 604_800_000,
      countItems: (d) => d.length,
      fetcher: async () => [
        {
          countryCode: 'VNM',
          countryName: 'Việt Nam',
          regionLabel: 'ASEAN',
          isVietnam: true,
          gdpGrowthPct: 6.8,
          gdpGrowthYear: 2025,
          gdpCurrentUsd: 476_000_000_000,
          gdpCurrentYear: 2025,
          cpiInflationPct: 3.5,
          cpiYear: 2025,
        },
      ],
    });

    await scheduler.refreshCollector('earthquakes');
    await scheduler.refreshCollector('macro-worldbank');
  });

  afterEach(async () => {
    scheduler.stopAll();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('serves GET /api/bootstrap with hydrated layers, staticGeo, macro, theaters, and health', async () => {
    const app = createApp(scheduler);
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);

    const body = (await res.json()) as BootstrapResponse;
    expect(body.layers.earthquakes).toHaveLength(1);
    expect(body.staticGeo.chokepoints).toHaveLength(13);
    expect(body.markets.macro).toHaveLength(1);
    expect(body.markets.macro[0].countryCode).toBe('VNM');
    expect(body.theaters.some((t) => t.id === 'east-sea-vn')).toBe(true);
    expect(body.health.length).toBeGreaterThanOrEqual(2);
  });

  it('serves GET /api/live-fast and GET /api/health', async () => {
    const app = createApp(scheduler);
    const fastRes = await app.request('/api/live-fast');
    expect(fastRes.status).toBe(200);
    const fastBody = (await fastRes.json()) as LiveFastResponse;
    expect(fastBody.earthquakes).toHaveLength(1);

    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    const healthBody = (await healthRes.json()) as SourceHealth[];
    expect(Array.isArray(healthBody)).toBe(true);
    expect(healthBody.find((h) => h.id === 'earthquakes')?.status).toBe('ok');
  });

  it('enforces 10s rate limit on POST /api/refresh/:collectorName and returns 404 for unknown collector', async () => {
    const app = createApp(scheduler);

    const unknownRes = await app.request('/api/refresh/nonexistent', { method: 'POST' });
    expect(unknownRes.status).toBe(404);

    const okRes = await app.request('/api/refresh/earthquakes', { method: 'POST' });
    expect(okRes.status).toBe(200);

    const throttledRes = await app.request('/api/refresh/earthquakes', { method: 'POST' });
    expect(throttledRes.status).toBe(429);
  });
});
