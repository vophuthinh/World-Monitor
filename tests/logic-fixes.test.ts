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

describe('US macro health with missing FRED series', () => {
  const metric = (id: string, value: number) => ({
    id,
    label: id,
    subtitle: id,
    value,
    change: 0,
    unit: '%',
    date: '2026-10-01',
    sparkline: [value],
  });
  const snapshotWith = (fred: ReturnType<typeof metric>[]) =>
    ({ quotes: [], crypto: [], fearGreed: null, macro: [], fred, updatedAt: 1 }) as never;

  it('does not invent growth/inflation data: regime must not be soft_landing without any growth or inflation series', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const us = evaluateMacroHealth(snapshotWith([metric('FEDFUNDS', 4.0), metric('T10Y2Y', 0.3)])).us;
    expect(us).not.toBeNull();
    expect(us?.regime).not.toBe('soft_landing');
  });

  it('only scores series that are present (no UNRATE series means unemployment is not scored)', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const base = [metric('FEDFUNDS', 4.2), metric('T10Y2Y', 0)];
    const withDefaultFriendly = evaluateMacroHealth(snapshotWith(base)).us;
    // Fed 4.2 and curve 0.0 are exactly at their scoring centers => monetary pillar must be neutral (52),
    // not pulled up by an invented 4.1% unemployment rate.
    const monetary = withDefaultFriendly?.pillars.find((p) => p.id === 'monetary');
    expect(monetary?.score).toBe(52);
  });
});

describe('US macro warning flags', () => {
  it('does not print a yield-curve statement when T10Y2Y is missing', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const m = (id: string, value: number) => ({ id, label: id, subtitle: id, value, change: 0, unit: '%', date: '2026-10-01', sparkline: [value] });
    const us = evaluateMacroHealth({ quotes: [], crypto: [], fearGreed: null, macro: [], fred: [m('FEDFUNDS', 4.0)], updatedAt: 1 } as never).us;
    expect(us?.warningFlags.some((f) => f.text.includes('Đường cong lợi suất'))).toBe(false);
  });
});

describe('Vietnam macro health with missing World Bank indicators', () => {
  it('omits FDI, exports, unemployment and manufacturing metrics instead of inventing values', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const vn = {
      countryCode: 'VNM',
      countryName: 'Việt Nam',
      regionLabel: 'ASEAN',
      isVietnam: true,
      gdpGrowthPct: 6.5,
      gdpGrowthYear: 2025,
      gdpCurrentUsd: 4.7e11,
      gdpCurrentYear: 2025,
      cpiInflationPct: 3.5,
      cpiYear: 2025,
    };
    const report = evaluateMacroHealth({ quotes: [], crypto: [], fearGreed: null, macro: [vn], updatedAt: 1 } as never).vn;
    expect(report).not.toBeNull();
    const ids = (report?.pillars ?? []).flatMap((p) => p.metrics.map((m) => m.id));
    for (const invented of ['vn-fdi', 'vn-uem', 'vn-exp', 'vn-manf']) {
      expect(ids, invented).not.toContain(invented);
    }
    expect(ids).toContain('vn-gdp');
  });
});
