import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SnapshotStore } from '../server/cache/snapshot-store';

describe('SnapshotStore (2-Tier RAM + Atomic Disk with selectSourceSnapshot)', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'wm-cache-test-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('stores fresh data in RAM and persists atomically to disk with status ok', async () => {
    const store = new SnapshotStore(cacheDir);
    store.register({
      id: 'earthquakes',
      label: 'USGS Earthquakes',
      intervalMs: 180_000,
      retainMs: 21_600_000,
      countItems: (items: string[]) => items.length,
    });

    expect(store.getHealth('earthquakes')?.status).toBe('warming');

    const now = 1_700_000_000_000;
    const data = await store.refresh('earthquakes', async () => ['eq-1', 'eq-2'], now);
    expect(data).toEqual(['eq-1', 'eq-2']);

    const health = store.getHealth('earthquakes', now);
    expect(health?.status).toBe('ok');
    expect(health?.itemCount).toBe(2);
    expect(health?.consecutiveFailures).toBe(0);
    expect(health?.lastSuccessAt).toBe(now);
    expect(health?.retainedUntil).toBe(now + 21_600_000);

    // Cold-start another store from the same cacheDir
    const coldStore = new SnapshotStore(cacheDir);
    coldStore.register({
      id: 'earthquakes',
      label: 'USGS Earthquakes',
      intervalMs: 180_000,
      retainMs: 21_600_000,
      countItems: (items: string[]) => items.length,
    });
    await coldStore.hydrateFromDisk(now + 5_000);
    expect(coldStore.get<string[]>('earthquakes', now + 5_000)).toEqual(['eq-1', 'eq-2']);
    expect(coldStore.getHealth('earthquakes', now + 5_000)?.status).toBe('ok');
  });

  it('preserves previous valid snapshot as stale when upstream fails without extending fetchedAt or retainedUntil', async () => {
    const store = new SnapshotStore(cacheDir);
    store.register({
      id: 'military-flights',
      label: 'Military ADS-B',
      intervalMs: 30_000,
      retainMs: 1_800_000,
      countItems: (items: number[]) => items.length,
    });

    const t0 = 1_700_000_000_000;
    await store.refresh('military-flights', async () => [101, 102, 103], t0);

    const t1 = t0 + 60_000;
    const fallback = await store.refresh(
      'military-flights',
      async () => {
        throw new Error('adsb.lol HTTP 503');
      },
      t1,
    );

    expect(fallback).toEqual([101, 102, 103]);
    const h1 = store.getHealth('military-flights', t1);
    expect(h1?.status).toBe('stale');
    expect(h1?.consecutiveFailures).toBe(1);
    expect(h1?.firstFailureAt).toBe(t1);
    expect(h1?.lastSuccessAt).toBe(t0);
    expect(h1?.retainedUntil).toBe(t0 + 1_800_000);
    expect(h1?.lastError).toContain('adsb.lol HTTP 503');

    // Second consecutive failure keeps original firstFailureAt and fetchedAt
    const t2 = t0 + 90_000;
    await store.refresh(
      'military-flights',
      async () => {
        throw new Error('adsb.lol timeout');
      },
      t2,
    );
    const h2 = store.getHealth('military-flights', t2);
    expect(h2?.consecutiveFailures).toBe(2);
    expect(h2?.firstFailureAt).toBe(t1);
    expect(h2?.lastSuccessAt).toBe(t0);
    expect(h2?.retainedUntil).toBe(t0 + 1_800_000);
  });

  it('transitions to error and drops data once retainedUntil expires during prolonged outage', async () => {
    const store = new SnapshotStore(cacheDir);
    store.register({
      id: 'weather-radar',
      label: 'RainViewer Radar',
      intervalMs: 300_000,
      retainMs: 7_200_000,
      countItems: () => 1,
    });

    const t0 = 1_700_000_000_000;
    await store.refresh('weather-radar', async () => ({ path: '/v2/radar/123' }), t0);

    const expiredNow = t0 + 7_200_001;
    const result = await store.refresh(
      'weather-radar',
      async () => {
        throw new Error('RainViewer unreachable');
      },
      expiredNow,
    );

    expect(result).toBeNull();
    expect(store.get('weather-radar', expiredNow)).toBeNull();
    expect(store.getHealth('weather-radar', expiredNow)?.status).toBe('error');
  });

  it('deduplicates concurrent in-flight refresh calls for the same collector', async () => {
    const store = new SnapshotStore(cacheDir);
    store.register({
      id: 'polymarket',
      label: 'Polymarket',
      intervalMs: 180_000,
      retainMs: 21_600_000,
      countItems: (items: string[]) => items.length,
    });

    let calls = 0;
    const slowFetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return ['mkt-1'];
    };

    const [r1, r2, r3] = await Promise.all([
      store.refresh('polymarket', slowFetcher),
      store.refresh('polymarket', slowFetcher),
      store.refresh('polymarket', slowFetcher),
    ]);

    expect(calls).toBe(1);
    expect(r1).toEqual(['mkt-1']);
    expect(r2).toEqual(['mkt-1']);
    expect(r3).toEqual(['mkt-1']);
  });

  it('enforces 10s force-refresh cooldown and tolerates corrupted disk JSON safely', async () => {
    await writeFile(join(cacheDir, 'rss-news.json'), '{not-valid-json', 'utf8');

    const store = new SnapshotStore(cacheDir);
    store.register({
      id: 'rss-news',
      label: 'Curated RSS',
      intervalMs: 300_000,
      retainMs: 21_600_000,
      countItems: (items: string[]) => items.length,
    });

    await store.hydrateFromDisk();
    expect(store.get('rss-news')).toBeNull();

    const t0 = 1_700_000_000_000;
    expect(store.tryClaimForceRefresh('rss-news', t0)).toEqual({ allowed: true, retryAfterMs: 0 });
    const blocked = store.tryClaimForceRefresh('rss-news', t0 + 4_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(6_000);
    expect(store.tryClaimForceRefresh('rss-news', t0 + 10_001)).toEqual({ allowed: true, retryAfterMs: 0 });
  });
});
