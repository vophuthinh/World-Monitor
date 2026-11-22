import { describe, expect, it } from 'vitest';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import { normalizeMilitaryFlights } from '../server/collectors/military-flights';
import { advanceDeadReckoning } from '../shared/dead-reckoning';
import type { GeoPointFeature } from '../shared/types';

const base = (over: Partial<GeoPointFeature> & { meta?: Record<string, unknown> }): GeoPointFeature =>
  ({
    id: 'x',
    layer: 'military',
    title: 't',
    category: 'c',
    severity: 'info',
    lat: 10,
    lon: 100,
    timestamp: 1_000,
    source: 's',
    ...over,
    meta: { speedKt: 400, onGround: false, ...(over.meta ?? {}) },
  }) as GeoPointFeature;

describe('dead-reckoning heading handling', () => {
  it('does not move a feature whose heading is unknown', () => {
    const f = base({ heading: 0, meta: { headingKnown: false } });
    expect(advanceDeadReckoning([f], 21_000)[0]).toEqual(f);
  });

  it('moves east for heading 90 and north for heading 0 when heading is known', () => {
    const east = advanceDeadReckoning([base({ heading: 90, meta: { headingKnown: true } })], 21_000)[0];
    expect(east.lon).toBeGreaterThan(100);
    expect(Math.abs(east.lat - 10)).toBeLessThan(1e-6);
    const north = advanceDeadReckoning([base({ heading: 0 })], 21_000)[0];
    expect(north.lat).toBeGreaterThan(10);
  });

  it('flags ADS-B aircraft without a track as headingKnown=false', () => {
    const payload = {
      now: 1_700_000_000_000,
      ac: [
        { hex: 'AE5420', flight: 'RCH412', lat: 10, lon: 100, gs: 400, alt_baro: 30000 },
        { hex: 'AE5421', flight: 'RCH413', lat: 11, lon: 101, gs: 400, alt_baro: 30000, track: 90 },
      ],
    };
    const out = normalizeMilitaryFlights(payload as never, 1_700_000_000_000);
    const byHex = Object.fromEntries(out.map((f) => [String(f.meta.icaoHex).toUpperCase(), f]));
    expect(byHex.AE5420.meta.headingKnown).toBe(false);
    expect(byHex.AE5421.meta.headingKnown).toBe(true);
  });
});

describe('CollectorScheduler onSync hook', () => {
  it('does not reject refreshCollector when the hook throws and still stores the snapshot', async () => {
    const store = new SnapshotStore('/tmp/wm-logic-fixes');
    const scheduler = new CollectorScheduler(store, () => {
      throw new Error('hook boom');
    });
    scheduler.registerCollector({
      id: 'earthquakes',
      label: 'x',
      intervalMs: 1_000_000,
      retainMs: 1_000_000,
      countItems: () => 1,
      fetcher: async () => [] as never,
    });
    await expect(scheduler.refreshCollector('earthquakes')).resolves.toBeDefined();
    expect(store.get('earthquakes')).not.toBeNull();
  });
});
