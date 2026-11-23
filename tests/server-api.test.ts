import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BootstrapResponse, LiveFastResponse, MarketSnapshot, SourceHealth } from '../shared/types';
import { createApp } from '../server/app';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import { evaluateMacroHealth } from '../shared/macro-health';

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

  it('marks market data retained on bootstrap and fast poll after a whole collector failure', async () => {
    const now = Date.now();
    const markets: MarketSnapshot = {
      quotes: [{ symbol: 'USD/VND', name: 'FX', group: 'fx', price: 25000,
        changePercent24h: 0, updatedAt: now, source: 'FX' }],
      crypto: [], fearGreed: null, macro: [],
      fred: [{ id: 'FEDFUNDS', label: 'Fed', subtitle: 'Fed', value: 4, change: 0,
        unit: '%', date: '2026-10-01', sparkline: [4], fetchedAt: now, retained: false }],
      vnMacroPulse: { manufacturingPmi: 52, updatedAt: now, fieldMeta: {
        manufacturingPmi: { source: 'TE', period: 'T10/2026', fetchedAt: now, retained: false },
      } },
      updatedAt: now,
    };
    scheduler.registerCollector({
      id: 'markets-crypto', label: 'Markets', intervalMs: 60_000, retainMs: 3_600_000,
      countItems: () => 1,
      fetcher: async () => { throw new Error('market outage'); },
    });
    store.set('markets-crypto', markets, 3_600_000);
    await scheduler.refreshCollector('markets-crypto');

    const app = createApp(scheduler);
    const body = await (await app.request('/api/bootstrap')).json() as BootstrapResponse;
    expect(body.markets.fred?.[0].retained).toBe(true);
    expect(body.markets.fred?.[0].fetchedAt).toBe(now);
    expect(body.markets.vnMacroPulse?.fieldMeta?.manufacturingPmi?.retained).toBe(true);
    expect(body.markets.quotes[0].retained).toBe(true);
    const fast = await (await app.request('/api/live-fast')).json() as LiveFastResponse;
    expect(fast.quotes[0].retained).toBe(true);
    expect(fast.fred[0].retained).toBe(true);
    expect(fast.vnMacroPulse?.fieldMeta?.manufacturingPmi?.retained).toBe(true);
    expect(store.get<MarketSnapshot>('markets-crypto')?.fred?.[0].retained).toBe(false);
  });

  it('preserves expired market diagnostics across an outage and restart without restoring score inputs', async () => {
    const now = Date.now();
    const fetchedAt = now - 8 * 86_400_000;
    const markets: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: fetchedAt,
      fred: [{ id: 'CPIAUCSL', label: 'CPI', subtitle: 'CPI Mỹ', value: 3, change: 0,
        unit: '%', date: '2026-10-01', sparkline: [3], fetchedAt, retained: false }],
      vnMacroPulse: { ytdCoreCpiPct: 4, updatedAt: fetchedAt, fieldMeta: {
        ytdCoreCpiPct: { source: 'NSO', period: '10T/2026', fetchedAt, retained: false },
      } },
    };
    const registration = {
      id: 'markets-crypto' as const, label: 'Markets', intervalMs: 60_000, retainMs: 6 * 3_600_000,
      retainExpiredForDiagnostics: true, countItems: () => 1,
      fetcher: async (): Promise<MarketSnapshot> => { throw new Error('market outage'); },
    };
    scheduler.registerCollector(registration);
    await store.refresh('markets-crypto', async () => markets, fetchedAt);
    await scheduler.refreshCollector('markets-crypto');
    expect(store.get('markets-crypto')).toBeNull();

    const coldStore = new SnapshotStore(cacheDir);
    const coldScheduler = new CollectorScheduler(coldStore);
    coldScheduler.registerCollector(registration);
    await coldStore.hydrateFromDisk(now);
    expect(coldStore.get('markets-crypto')).toBeNull();
    for (const app of [createApp(scheduler), createApp(coldScheduler)]) {
      const body = await (await app.request('/api/bootstrap')).json() as BootstrapResponse;
      expect(body.markets.fred).toEqual([]);
      expect(body.markets.vnMacroPulse).toBeUndefined();
      expect(body.markets.expiredMacroNotices?.us).toContainEqual(expect.objectContaining({ id: 'CPIAUCSL' }));
      expect(body.markets.expiredMacroNotices?.vn).toContainEqual(expect.objectContaining({ id: 'ytdCoreCpiPct' }));
      const evaluated = evaluateMacroHealth({ ...body.markets, macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
        gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
        cpiInflationPct: null, cpiYear: null,
      }] }, [], now);
      expect(evaluated.us).toBeNull();
      expect(evaluated.vn?.expiredMetrics).toContainEqual(expect.objectContaining({ id: 'ytdCoreCpiPct' }));
      expect(evaluated.vn?.pillars.flatMap((pillar) => pillar.metrics)
        .find((metric) => metric.id === 'vn-cpi')).toBeUndefined();
      const fast = await (await app.request('/api/live-fast')).json() as LiveFastResponse;
      expect(fast.fred).toEqual([]);
      expect(fast.expiredMacroNotices?.us).toContainEqual(expect.objectContaining({ id: 'CPIAUCSL' }));
    }

    await store.refresh('markets-crypto', async () => ({ ...markets, fred: [], vnMacroPulse: undefined, updatedAt: now }));
    const recovered = await (await createApp(scheduler).request('/api/bootstrap')).json() as BootstrapResponse;
    expect(recovered.markets.expiredMacroNotices).toBeUndefined();
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

  it('restricts CORS to trusted local/configured origins instead of wildcard *', async () => {
    const app = createApp(scheduler);

    const trustedRes = await app.request('/api/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(trustedRes.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const untrustedRes = await app.request('/api/health', {
      headers: { Origin: 'https://evil-attacker.example.com' },
    });
    expect(untrustedRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rate-limits POST /api/ai-sitrep/refresh and POST /api/policy-summarize to protect AI quota', async () => {
    const app = createApp(scheduler);

    const sitrep1 = await app.request('/api/ai-sitrep/refresh', { method: 'POST' });
    expect(sitrep1.status).toBe(200);

    const sitrep2 = await app.request('/api/ai-sitrep/refresh', { method: 'POST' });
    expect(sitrep2.status).toBe(429);

    for (let i = 0; i < 6; i++) {
      const r = await app.request('/api/policy-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `doc-${i}`, title: `Nghị quyết ${i}` }),
      });
      expect([200, 400, 404]).toContain(r.status);
    }

    const throttledPolicy = await app.request('/api/policy-summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'doc-overflow', title: 'Nghị quyết tràn hạn mức' }),
    });
    expect(throttledPolicy.status).toBe(429);
  });

  it('blocks cross-origin writes (CSRF) and unknown Host names (DNS rebinding)', async () => {
    const app = createApp(scheduler);

    const evilOrigin = await app.request('/api/refresh/earthquakes', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(evilOrigin.status).toBe(403);

    const crossSite = await app.request('/api/refresh/earthquakes', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);

    const rebinding = await app.request('http://evil.example.com:8787/api/health');
    expect(rebinding.status).toBe(403);

    const trusted = await app.request('/api/refresh/earthquakes', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(trusted.status).toBe(200);
  });

  it('ignores spoofed X-Forwarded-For for rate limits and never trusts client-supplied policy title', async () => {
    const app = createApp(scheduler);
    const post = (i: number) =>
      app.request('/api/policy-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `1.2.3.${i}` },
        body: JSON.stringify({ id: `missing-${i}`, title: 'injected title' }),
      });
    for (let i = 0; i < 6; i++) expect((await post(i)).status).toBe(404);
    expect((await post(99)).status).toBe(429);
  });

  it('shares the AI sitrep cooldown between /api/ai-sitrep/refresh and /api/refresh/ai-sitrep, and caps body size', async () => {
    scheduler.registerCollector({
      id: 'ai-sitrep',
      label: 'AI Sitrep',
      intervalMs: 900_000,
      retainMs: 7_200_000,
      countItems: () => 1,
      fetcher: async () => ({ bullets: ['x'] }) as never,
    });
    const app = createApp(scheduler);

    expect((await app.request('/api/ai-sitrep/refresh', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/api/refresh/ai-sitrep', { method: 'POST' })).status).toBe(429);

    const big = await app.request('/api/ai-ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'x'.repeat(40_000) }),
    });
    expect(big.status).toBe(413);
  });
});
