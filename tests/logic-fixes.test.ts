import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramAlertEngine } from '../server/lib/telegram-alerter';
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
  it('reports failed refreshes as failures even when returning retained data', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'wm-logic-fixes-')));
    const calls: boolean[] = [];
    let fail = false;
    const scheduler = new CollectorScheduler(store, (_id, _data, succeeded) => calls.push(succeeded));
    scheduler.registerCollector({
      id: 'military-flights', label: 'x', intervalMs: 1000, retainMs: 1_000_000,
      countItems: (data: number[]) => data.length,
      fetcher: async () => { if (fail) throw new Error('offline'); return [1]; },
    });
    await scheduler.refreshCollector('military-flights');
    fail = true;
    expect(await scheduler.refreshCollector('military-flights')).toEqual([1]);
    expect(calls).toEqual([true, false]);
    expect(store.getHealth('military-flights')?.status).toBe('stale');
  });

  it('does not reject refreshCollector when the hook throws and still stores the snapshot', async () => {
    const store = new SnapshotStore(mkdtempSync(join(tmpdir(), 'wm-logic-fixes-')));
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

describe('macro helper edge cases', () => {
  it('computeFedNetLiquidity returns null when TGA or RRP is missing instead of overstating liquidity', async () => {
    const { computeFedNetLiquidity } = await import('../shared/macro-health');
    expect(computeFedNetLiquidity({ walclMillions: 6_700_000 })).toBeNull();
    expect(computeFedNetLiquidity({ walclMillions: 6_700_000, wtregenMillions: 800_000 })).toBeNull();
    const full = computeFedNetLiquidity({ walclMillions: 6_700_000, wtregenMillions: 800_000, rrpBillions: 200 });
    expect(full?.netLiquidityBillions).toBe(5_700);
    expect(full?.delta4wBillions).toBeUndefined();
    const withFourWeekChanges = computeFedNetLiquidity({
      walclMillions: 6_700_000,
      wtregenMillions: 800_000,
      rrpBillions: 200,
      walclDelta4wMillions: 28_000,
      wtregenDelta4wMillions: -22_000,
      rrpDelta4wBillions: -5,
    });
    expect(withFourWeekChanges?.delta4wBillions).toBe(55);
  });

  it('uses the declared neutral prior when no weighted inputs exist', async () => {
    const { weightedMean } = await import('../shared/macro-health');
    expect(weightedMean([])).toBe(52);
  });

  it('computeVn30MarketBreadth does not report 0% or reuse MA50 as MA200 when a moving average is missing', async () => {
    const { computeVn30MarketBreadth } = await import('../shared/macro-health');
    const stock = (i: number, extra: Record<string, number>) =>
      ({ symbol: `S${i}`, name: `S${i}`, priceThousandVnd: 100, changePercent24h: 0, updatedAt: 1, source: 't', ...extra }) as never;
    const onlyMa200 = Array.from({ length: 6 }, (_, i) => stock(i, { ma200: 90 }));
    const onlyMa50 = Array.from({ length: 6 }, (_, i) => stock(i, { ma50: 90 }));
    expect(computeVn30MarketBreadth(onlyMa200)).toBeNull();
    expect(computeVn30MarketBreadth(onlyMa50)).toBeNull();
    const both = Array.from({ length: 6 }, (_, i) => stock(i, { ma50: 90, ma200: 110 }));
    expect(computeVn30MarketBreadth(both)).toMatchObject({ aboveMa50Pct: 100, aboveMa200Pct: 0 });
  });

  it('treats a "no Fed rate cuts" market as neutral, not as a hike', async () => {
    const { extractPolymarketMacroInsight } = await import('../shared/macro-health');
    const p = {
      id: 'p1',
      title: 'No Fed rate cuts in 2026?',
      outcomeLabel: 'Yes',
      yesPercent: 80,
      volumeUsd: 5_000_000,
    } as never;
    expect(extractPolymarketMacroInsight([p])?.bias).toBe('neutral_hold');
  });
});

describe('computeDynamicPortfolioAllocation', () => {
  it('always keeps cash/bonds >= 10%, weights non-negative integers summing to exactly 100', async () => {
    const { computeDynamicPortfolioAllocation } = await import('../shared/macro-health');
    const stances = ['defensive_recession', 'cautious', 'selective_growth', 'risk_on'] as const;
    const duals = [undefined, 'confirmed_bull', 'macro_bull_trend_weak'] as const;
    for (const stance of stances)
      for (const dualConfirmation of duals)
        for (const vnErpPct of [undefined, 0.1, 2, 4.5])
          for (const highInflationPressure of [false, true])
            for (const liquidityExpanding of [false, true]) {
              const w = computeDynamicPortfolioAllocation({
                stance,
                riskAppetiteScore: 85,
                vnErpPct,
                dualConfirmation,
                capitulationSignal: false,
                highInflationPressure,
                liquidityExpanding,
              });
              const label = JSON.stringify({ stance, dualConfirmation, vnErpPct, highInflationPressure, liquidityExpanding });
              expect(w.reduce((a, s) => a + s.weightPct, 0), label).toBe(100);
              for (const s of w) {
                expect(Number.isInteger(s.weightPct), label).toBe(true);
                expect(s.weightPct, label).toBeGreaterThanOrEqual(0);
              }
              expect(w.find((s) => s.id === 'cash_bonds')?.weightPct, label).toBeGreaterThanOrEqual(10);
            }
  });
});

describe('Investment compass without macro data', () => {
  it('cannot claim a macro-confirmed bull when liquidity, credit and valuation have no data', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const q = (symbol: string, price: number, ma200: number) => ({
      symbol, name: symbol, group: 'index', price, changePercent24h: 0, updatedAt: 1, source: 't', ma200, ma50: ma200 * 0.98,
    });
    const report = evaluateInvestmentCompass({
      quotes: [q('VN-Index', 1700, 1500), q('S&P 500', 6000, 5500)],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [{ id: 'FEDFUNDS', label: 'f', subtitle: 'f', value: 4, change: 0, unit: '%', date: 'x', sparkline: [4] }],
      updatedAt: 1,
    } as never, []);
    expect(report).not.toBeNull();
    expect(report?.dualConfirmation).toBeUndefined();
    expect(report?.sectorRotation).toBeUndefined();
    const pillar = (id: string) => report?.factorPillars?.find((p) => p.id === id)?.score;
    for (const id of ['liquidity', 'credit_recession', 'valuation_erp']) {
      expect(pillar(id), id).toBeLessThanOrEqual(52);
    }
  });

  it('does not confirm a macro bull from valuation data alone', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const report = evaluateInvestmentCompass({
      quotes: [{
        symbol: 'VN-Index',
        name: 'VN-Index',
        group: 'index',
        price: 1700,
        changePercent24h: 0,
        ma200: 1500,
        ma50: 1600,
        peRatio: 10,
        updatedAt: 1,
        source: 'test',
      }],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [],
      updatedAt: 1,
    } as never);

    expect(report?.dualConfirmation).toBeUndefined();
  });

  it('does not call an oversold market a capitulation when recession indicators are missing', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const report = evaluateInvestmentCompass({
      quotes: [
        { symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 100, changePercent24h: 0, rsi14: 30, updatedAt: 1, source: 'test' },
        { symbol: 'S&P 500', name: 'S&P 500', group: 'index', price: 100, changePercent24h: 0, rsi14: 25, updatedAt: 1, source: 'test' },
        { symbol: 'VIX 3M', name: 'VIX 3M', group: 'index', price: 20, changePercent24h: 0, updatedAt: 1, source: 'test' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [{
        id: 'VIXCLS',
        label: 'VIX',
        subtitle: 'VIX',
        value: 30,
        change: 0,
        unit: 'pts',
        date: '2026-11-20',
        sparkline: [],
      }],
      updatedAt: 1,
    } as never);

    expect(report?.capitulationSignal).toBeUndefined();
  });
});

describe('TelegramAlertEngine delivery logic', () => {
  afterEach(() => vi.restoreAllMocks());

  const item = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: `Tin ${id}`,
    category: 'press_social',
    badge: 'B',
    source: 'S',
    publishedAt: Date.now(),
    url: `https://example.com/${id}`,
    sentiment: 'neutral',
    ...over,
  });
  const snap = (items: unknown[]) =>
    ({ stock: null, items, sourceCount: 1, aiSentimentEnabled: false, updatedAt: Date.now() }) as never;
  const creds = { botToken: '123456789:AAHtesttoken1234', chatId: '999' };

  it('alerts on items published while the server was down (persisted seen list), instead of re-seeding them as seen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-restart-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 1, seenIds: ['hpt:old-1'] }));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snap([item('old-1'), item('new-2')]), 60_000, 2);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain('Tin new-2');
  });

  it('encodes double quotes in the link URL so they cannot break the HTML message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-quote-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snap([item('q1', { url: 'https://example.com/a"b' })]), 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(sent[0]).toContain('href="https://example.com/a%22b"');
  });

  it('does not send the same item twice when two evaluations overlap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-overlap-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snap([item('dup-1')]), 60_000, 1);
    await Promise.all([tg.evaluateCollectorUpdate('hpt-intel', store), tg.evaluateCollectorUpdate('hpt-intel', store)]);
    expect(calls).toBe(1);
  });
});

describe('headingKnown for AIS vessels (both sources)', () => {
  it('Digitraffic: flags a vessel with neither heading nor cog as unknown, not heading 0', async () => {
    const { normalizeDigitrafficVessels } = await import('../server/collectors/maritime-vessels');
    const now = 1_700_000_000_000;
    const run = (props: Record<string, unknown>) =>
      (normalizeDigitrafficVessels as (p: unknown, n: number) => GeoPointFeature[])(
        {
          type: 'FeatureCollection',
          features: [
            { mmsi: 230123456, geometry: { type: 'Point', coordinates: [24.9, 60.1] }, properties: { mmsi: 230123456, sog: 12, timestampExternal: now, ...props } },
          ],
        },
        now,
      )[0]?.meta.headingKnown;
    expect(run({})).toBe(false);
    expect(run({ heading: 511 })).toBe(false);
    expect(run({ cog: 90 })).toBe(true);
    expect(run({ heading: 511, cog: 45 })).toBe(true);
    expect(run({ heading: 200 })).toBe(true);
  });

  it('AISStream: TrueHeading 511 with Cog 360 (both "not available") is unknown; a valid Cog makes it known', async () => {
    const { parseAisStreamMessage } = await import('../server/collectors/maritime-vessels');
    const msg = (pos: Record<string, unknown>) =>
      JSON.stringify({
        MetaData: { MMSI: 574000001, latitude: 10.5, longitude: 107.5, ShipName: 'TEST', time_utc: new Date().toISOString() },
        Message: { PositionReport: { Sog: 12, ...pos } },
      });
    const known = (pos: Record<string, unknown>) =>
      (parseAisStreamMessage as (j: string) => GeoPointFeature | null)(msg(pos))?.meta.headingKnown;
    expect(known({ Cog: 360, TrueHeading: 511 })).toBe(false);
    expect(known({ Cog: 90, TrueHeading: 511 })).toBe(true);
    expect(known({ Cog: 360, TrueHeading: 180 })).toBe(true);
  });
});

describe('US growth/inflation z-scores with missing series', () => {
  it('contribute exactly 0 (neutral) when no growth or inflation series exist', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const m = (id: string, value: number) => ({ id, label: id, subtitle: id, value, change: 0, unit: '%', date: '2026-10-01', sparkline: [value] });
    const us = evaluateMacroHealth({ quotes: [], crypto: [], fearGreed: null, macro: [], fred: [m('FEDFUNDS', 4.0), m('T10Y2Y', 0.3)], updatedAt: 1 } as never).us;
    expect(us?.growthZ).toBe(0);
    expect(us?.inflationZ).toBe(0);
  });
});

describe('review follow-up coverage', () => {
  const fred = (id: string, value: number) => ({ id, label: id, subtitle: id, value, change: 0, unit: '%', date: '2026-10-01', sparkline: [value] });
  const usOf = async (series: ReturnType<typeof fred>[]) => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    return evaluateMacroHealth({ quotes: [], crypto: [], fearGreed: null, macro: [], fred: series, updatedAt: 1 } as never).us;
  };

  it('AISStream keeps a known heading when a later report has neither TrueHeading nor Cog, and keeps unknown as unknown', async () => {
    const { parseAisStreamMessage } = await import('../server/collectors/maritime-vessels');
    const parse = (pos: Record<string, unknown>, existing?: GeoPointFeature) =>
      (parseAisStreamMessage as (j: string, n: number, c: undefined, e?: GeoPointFeature) => GeoPointFeature | null)(
        JSON.stringify({ MetaData: { MMSI: 574000002, latitude: 10.5, longitude: 107.5, ShipName: 'T', time_utc: new Date().toISOString() }, Message: { PositionReport: { Sog: 12, ...pos } } }),
        Date.now(),
        undefined,
        existing,
      );
    const knownFirst = parse({ TrueHeading: 180, Cog: 180 });
    expect(knownFirst?.meta.headingKnown).toBe(true);
    const carried = parse({}, knownFirst ?? undefined);
    expect(carried?.meta.headingKnown).toBe(true);
    expect(carried?.heading).toBe(180);
    const unknownFirst = parse({ TrueHeading: 511, Cog: 360 });
    expect(parse({}, unknownFirst ?? undefined)?.meta.headingKnown).toBe(false);
  });

  it('Vietnam regime without PMI or manufacturing data is decided by GDP alone', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const now = Date.UTC(2026, 10, 22);
    const vnWith = (gdp: number) =>
      evaluateMacroHealth({
        quotes: [], crypto: [], fearGreed: null, updatedAt: now,
        macro: [{ countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN', isVietnam: true, gdpGrowthPct: gdp, gdpGrowthYear: 2025, gdpCurrentUsd: 4.7e11, gdpCurrentYear: 2025, cpiInflationPct: 3.5, cpiYear: 2025 }],
        vnMacroPulse: {
          ytdAvgCpiPct: 3.5,
          updatedAt: now,
          fieldMeta: {
            ytdAvgCpiPct: { source: 'Cục Thống kê (NSO)', period: '10T/2026', fetchedAt: now, retained: false },
          },
        },
      } as never, [], now).vn;
    expect(vnWith(7)?.regime).toBe('soft_landing');
    expect(vnWith(3.5)?.regime).toBe('early_slowdown');
  });

  it('US inverted curve still raises a warning but does not classify the regime without growth data', async () => {
    const us = await usOf([fred('FEDFUNDS', 4), fred('T10Y2Y', -0.4), fred('CPIAUCSL', 3.5)]);
    expect(us?.warningFlags.some((f) => f.severity === 'critical' && f.text.includes('đảo ngược'))).toBe(true);
    expect(us?.regime).toBeUndefined();
  });

  it('US with only CPI (no core PCE, no PPI) judges inflation from CPI alone', async () => {
    const us = await usOf([fred('FEDFUNDS', 4), fred('CPIAUCSL', 2.5)]);
    expect(us?.inflationZ).toBeGreaterThan(0);
    expect(us?.regime).toBeUndefined();
  });

  it('does not estimate the NY Fed 10Y-3M probability from a 10Y-2Y spread', async () => {
    const us = await usOf([fred('FEDFUNDS', 4), fred('T10Y2Y', -0.4)]);
    expect(us?.recessionProb12m).toBeUndefined();
  });

  it('does not classify Vietnam from a monthly CPI print against the annual target or use stale WB CPI', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const now = Date.UTC(2026, 10, 22);
    const vn = evaluateMacroHealth({
      quotes: [], crypto: [], fearGreed: null, updatedAt: now,
      macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN', isVietnam: true,
        gdpGrowthPct: 8, gdpGrowthYear: 2025, gdpCurrentUsd: 4.7e11, gdpCurrentYear: 2025,
        cpiInflationPct: 3.5, cpiYear: 2025,
      }],
      vnMacroPulse: {
        monthlyCpiPct: 5.1,
        monthlyCpiPrevPct: 5.0,
        updatedAt: now,
        fieldMeta: {
          monthlyCpiPct: { source: 'GSO / TradingEconomics', period: 'T10/2026', fetchedAt: now, retained: false },
        },
      },
    } as never, [], now).vn;
    const cpi = vn?.pillars.find((p) => p.id === 'inflation')?.metrics.find((m) => m.id === 'vn-cpi');
    expect(cpi?.name).toContain('CPI Tháng');
    expect(cpi?.periodLabel).toBe('T10/2026');
    expect(cpi?.trendLabel).toContain('vs tháng trước');
    expect(vn?.regime).toBeUndefined();
    expect(vn?.warningFlags.some((f) => f.text.includes('chưa đủ kết luận'))).toBe(true);
  });

  it('omits Vietnam CPI conclusions and quadrant when no current CPI source exists', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const vn = evaluateMacroHealth({
      quotes: [], crypto: [], fearGreed: null, updatedAt: 1,
      macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN', isVietnam: true,
        gdpGrowthPct: 6.5, gdpGrowthYear: 2025, gdpCurrentUsd: 4.7e11, gdpCurrentYear: 2025,
        cpiInflationPct: null, cpiYear: null,
      }],
    } as never).vn;
    const inflationMetrics = vn?.pillars.find((p) => p.id === 'inflation')?.metrics ?? [];
    expect(inflationMetrics.some((m) => m.id === 'vn-cpi')).toBe(false);
    expect(vn?.regime).toBeUndefined();
    expect(vn?.quadrant).toBeUndefined();
    expect(vn?.warningFlags.some((f) => f.text.includes('CPI'))).toBe(false);
  });

  it('TelegramAlertEngine releases its evaluation lock after a failed pass', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-lock-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const tg = new TelegramAlertEngine(dir, { botToken: '123456789:AAHtesttoken1234', chatId: '999' });
    const broken = { get: () => { throw new Error('store boom'); } } as never;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(tg.evaluateCollectorUpdate('hpt-intel', broken)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    const store = new SnapshotStore(dir);
    store.set('hpt-intel', { stock: null, items: [{ id: 'after-1', title: 'Tin after-1', category: 'press_social', badge: 'B', source: 'S', publishedAt: Date.now(), url: 'https://example.com/x', sentiment: 'neutral' }], sourceCount: 1, aiSentimentEnabled: false, updatedAt: Date.now() } as never, 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(sent.length).toBe(1);
    vi.restoreAllMocks();
  });
});

describe('Telegram red-team follow-ups', () => {
  afterEach(() => vi.restoreAllMocks());
  const mkItem = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `Tin ${id}`, category: 'press_social', badge: 'B', source: 'S', publishedAt: Date.now(),
    url: `https://example.com/${id}`, sentiment: 'neutral', ...over,
  });
  const snapOf = (items: unknown[]) => ({ stock: null, items, sourceCount: 1, aiSentimentEnabled: false, updatedAt: Date.now() }) as never;
  const creds = { botToken: '123456789:AAHtesttoken1234', chatId: '999' };

  it('never rejects, even when an item has undefined fields (no unhandled rejection from `void` callers)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-undef-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([mkItem('u1', { title: undefined, url: undefined, source: undefined, badge: undefined })]), 60_000, 1);
    await expect(tg.evaluateCollectorUpdate('hpt-intel', store)).resolves.toBeUndefined();
  });

  it('gives up on an item Telegram keeps rejecting so later items still get delivered', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-poison-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    const delivered: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      const text: string = JSON.parse(String(init?.body)).text;
      if (text.includes('poison')) return new Response(JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }), { status: 400 });
      delivered.push(text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([mkItem('poison1'), mkItem('poison2'), mkItem('poison3'), mkItem('poison4'), mkItem('good5')]), 60_000, 5);
    for (let pass = 0; pass < 5; pass += 1) await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(delivered.some((t) => t.includes('good5'))).toBe(true);
  });

  it.each([400, 401, 403])('retries alerts after Telegram configuration error %i recovers', async (status) => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-auth-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    let authorized = false;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(authorized ? { ok: true } : { ok: false, error_code: status, description: 'chat not found' }), { status: authorized ? 200 : status }));
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([mkItem('auth1')]), 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    authorized = true;
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends distinct filings even when their first 42 title characters match', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-filings-'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([]), 60_000, 0);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    const prefix = 'Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT công bố báo cáo quý ';
    store.set('hpt-intel', snapOf([mkItem('q1', { title: `${prefix}1` })]), 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    store.set('hpt-intel', snapOf([mkItem('q2', { title: `${prefix}2` })]), 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits the link for non-http(s) URLs instead of putting them in href', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-scheme-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([mkItem('s1', { url: 'javascript:alert(1)' })]), 60_000, 1);
    await tg.evaluateCollectorUpdate('hpt-intel', store);
    expect(sent.length).toBe(1);
    expect(sent[0]).not.toContain('href');
  });

  it('persists an explicit baselineDone flag so an empty first run does not re-baseline on the next boot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-baseline-'));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    store.set('hpt-intel', snapOf([]), 60_000, 0);
    await new TelegramAlertEngine(dir, creds).evaluateCollectorUpdate('hpt-intel', store); // first run: silent baseline
    store.set('hpt-intel', snapOf([mkItem('gap1')]), 60_000, 1);
    await new TelegramAlertEngine(dir, creds).evaluateCollectorUpdate('hpt-intel', store); // new boot, item appeared in the gap
    expect(sent.length).toBe(1);
  });

  it('re-runs once when a pass was requested while another was in flight', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-tg-pending-'));
    writeFileSync(join(dir, 'telegram-alerts.json'), JSON.stringify({ sentCount: 0, seenIds: ['hpt:seed'] }));
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      await new Promise((r) => setTimeout(r, 20));
      sent.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const store = new SnapshotStore(dir);
    const tg = new TelegramAlertEngine(dir, creds);
    store.set('hpt-intel', snapOf([mkItem('a1')]), 60_000, 1);
    const first = tg.evaluateCollectorUpdate('hpt-intel', store);
    store.set('hpt-intel', snapOf([mkItem('a1'), mkItem('b2')]), 60_000, 2); // newer snapshot lands mid-send
    await tg.evaluateCollectorUpdate('hpt-intel', store); // overlaps: must not be dropped
    await first;
    expect(sent.some((t) => t.includes('b2'))).toBe(true);
  });
});

describe('US quadrant and PCE double counting', () => {
  const m = (id: string, value: number) => ({ id, label: id, subtitle: id, value, change: 0, unit: '%', date: '2026-10-01', sparkline: [value] });
  const usOf = async (series: ReturnType<typeof m>[]) => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    return evaluateMacroHealth({ quotes: [], crypto: [], fearGreed: null, macro: [], fred: series, updatedAt: 1 } as never).us;
  };

  it('reports no quadrant when growth or inflation data is entirely missing', async () => {
    const us = await usOf([m('FEDFUNDS', 4), m('T10Y2Y', 0.3)]);
    expect(us?.quadrant).toBeUndefined();
    const withBoth = await usOf([m('A191RL1Q225SBEA', 2.5), m('CPIAUCSL', 2.4), m('FEDFUNDS', 4)]);
    expect(withBoth?.quadrant).toBeDefined();
  });

  it('does not count CPI twice through the core-PCE slot when core PCE is missing', async () => {
    const cpiOnly = await usOf([m('FEDFUNDS', 4), m('CPIAUCSL', 3.0)]);
    // CPI alone: (3.0-2.3)/0.7*0.25 = 0.25, with no extra PCE-slot contribution
    expect(cpiOnly?.inflationZ).toBeCloseTo(0.25, 2);
  });

  it('compares VIX with VIX3M only within one session, unrounded, and needs a US oversold reading', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const day = Date.parse('2026-11-26T15:00:00Z');
    const run = (vix: number, spxRsi: number, vixObservedAt = day) => evaluateInvestmentCompass({
      quotes: [
        { symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 100, changePercent24h: 0, rsi14: 25, updatedAt: day, source: 'test' },
        { symbol: 'S&P 500', name: 'S&P 500', group: 'index', price: 100, changePercent24h: 0, rsi14: spxRsi, updatedAt: day, source: 'test' },
        { symbol: 'VIX', name: 'VIX', group: 'index', price: vix, changePercent24h: 0, observedAt: vixObservedAt, updatedAt: day, source: 'test' },
        { symbol: 'VIX 3M', name: 'VIX 3M', group: 'index', price: 26.29, changePercent24h: 0, observedAt: day, updatedAt: day, source: 'test' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [
        { id: 'SAHMREALTIME', label: 'Sahm', subtitle: 'Sahm', value: 0, change: 0, unit: 'pts', date: '2026-10-01', sparkline: [] },
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5, change: 0, unit: '%', date: '2026-10-01', sparkline: [] },
      ],
      updatedAt: day,
    } as never, undefined, day);

    expect(run(26.28, 25)?.capitulationSignal).toBeUndefined(); // rounds to 1.00 but is below 1
    expect(run(27, 40)?.capitulationSignal).toBeUndefined(); // only VN-Index is oversold
    expect(run(27, 25, day - 2 * 86_400_000)?.vixTermRatio).toBeUndefined(); // different sessions
    expect(run(27, 25)?.capitulationSignal).toBe(true);
  });

  it('marks displayed metrics that do not enter a pillar score, and displays every scored one', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const now = Date.parse('2026-11-26T00:00:00Z');
    const { vn, us } = evaluateMacroHealth({
      quotes: [{ symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1600, changePercent24h: 0, peRatio: 10, updatedAt: now, source: 'test' }],
      crypto: [],
      fearGreed: null,
      macro: [{ countryCode: 'VNM', isVietnam: true, gdpGrowthPct: 8, gdpGrowthYear: 2025, unemploymentPct: 1.5, unemploymentYear: 2025, creditPctGdp: 125, creditYear: 2022, currentAccountPctGdp: 6, currentAccountYear: 2025 }],
      vnMacroPulse: { vn10yYieldPct: 4.5, sp500PeRatio: 25, updatedAt: now },
      fred: [
        { id: 'FEDFUNDS', label: 'FF', subtitle: 'FF', value: 3.9, change: 0, unit: '%', date: '2026-10-01', sparkline: [] },
        { id: 'DGS10', label: '10Y', subtitle: '10Y', value: 4.9, change: 0, unit: '%', date: '2026-11-24', sparkline: [] },
      ],
      updatedAt: now,
    } as never, undefined, now);
    const unscored = (r: typeof vn) => r!.pillars.flatMap((p) => p.metrics).filter((m) => m.scored === false).map((m) => m.id);

    expect(vn!.pillars[2].metrics.map((m) => m.id)).toContain('vn-uem');
    expect(unscored(vn)).toEqual(['vn-10y', 'vn-cab', 'vn-credit']);
    expect(unscored(us)).toEqual([]);
  });
});

describe('threshold cliffs', () => {
  const base = { highInflationPressure: false, liquidityExpanding: true };

  it('moves equity weight gradually with the score, across every stance boundary', async () => {
    const { computeDynamicPortfolioAllocation: alloc } = await import('../shared/macro-health');
    const equity = (score: number, dualConfirmation?: 'confirmed_bull', riskOnBlocked = false) => {
      const stance = score < 42 ? 'defensive_recession' : score < 55 ? 'cautious' : score >= 74 && !riskOnBlocked ? 'risk_on' : 'selective_growth';
      return alloc({ ...base, stance, riskAppetiteScore: score, dualConfirmation, riskOnBlocked })[0].weightPct;
    };
    for (let score = 11; score <= 98; score++) {
      for (const [dual, blocked] of [[undefined, false], [undefined, true], ['confirmed_bull', false]] as const) {
        const step = equity(score, dual, blocked) - equity(score - 1, dual, blocked);
        expect(step, `score ${score}`).toBeGreaterThanOrEqual(0);
        expect(step, `score ${score}`).toBeLessThanOrEqual(4);
      }
    }
    expect(equity(95, undefined, true)).toBe(52);
  });

  it('adds no cheap-valuation equity bonus while an index is below MA200', async () => {
    const { computeDynamicPortfolioAllocation: alloc } = await import('../shared/macro-health');
    const equity = (trendWeakness: number) =>
      alloc({ ...base, stance: 'selective_growth', riskAppetiteScore: 64, vnErpPct: 5, trendWeakness })[0].weightPct;
    expect(equity(0)).toBe(59);
    expect(equity(1)).toBe(52);
  });

  it('labels a small CPI overshoot as mild instead of overheating', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const now = Date.parse('2026-11-26T00:00:00Z');
    const label = (cpi: number) => evaluateMacroHealth({
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now,
      vnMacroPulse: { quarterlyGdpPct: 9, manufacturingPmi: 52, ytdAvgCpiPct: cpi, updatedAt: now,
        fieldMeta: { ytdAvgCpiPct: { source: 'test', period: '10T/2026', fetchedAt: now, retained: false } } },
    } as never, undefined, now).vn!.regimeLabel;
    expect(label(4.57)).toContain('VƯỢT NHẸ');
    expect(label(5.2)).toContain('TĂNG TRƯỞNG NÓNG');
    expect(label(4.5)).toContain('HẠ CÁNH MỀM');
  });
});

describe('national trade balance from press headlines', () => {
  const now = Date.parse('2026-11-26T00:00:00Z');
  const parse = async (title: string) => {
    const { parseVietnamOfficialYtdContext } = await import('../server/collectors/markets/vn-valuation-macro');
    return parseVietnamOfficialYtdContext({
      tradeRssXml: `<rss><item><title>${title}</title><pubDate>Thu, 26 Nov 2026 01:00:00 GMT</pubDate></item></rss>`,
      now,
    }).ytdTradeBalanceBillionUsd;
  };

  it('rejects bilateral, sector, partial-month and forecast figures', async () => {
    for (const title of [
      'Việt Nam nhập siêu 48,6 tỉ USD từ Hàn Quốc sau 10 tháng - Vietnam.vn',
      'Việt Nam nhập siêu gần 17 tỉ USD từ ASEAN sau 10 tháng 2026 - Báo Văn Hóa',
      '10 tháng, Việt Nam nhập siêu Trung Quốc 99,5 tỷ USD - Báo A',
      'Khu vực kinh tế trong nước nhập siêu 30,2 tỷ USD sau 10 tháng - Báo A',
      'Nhập siêu cả năm có thể thu hẹp còn 7,5 tỷ USD - nguoiquansat.vn',
      'Nửa đầu tháng 11, nhập siêu 1,2 tỷ USD - Báo A',
    ]) expect(await parse(title), title).toBeUndefined();
  });

  it('keeps a national cumulative headline, whatever the publisher is called', async () => {
    expect(await parse('10 tháng, Việt Nam nhập siêu 12,07 tỷ USD - Sputnik Việt Nam')).toBe(-12.07);
    expect(await parse('Xuất nhập khẩu 10 tháng: nhập siêu 12,07 tỷ USD - Tin nhanh Mỹ Thuật')).toBe(-12.07);
  });
});

describe('momentum-aware compass inputs', () => {
  const now = Date.parse('2026-11-26T00:00:00Z');
  const compass = async (copper: number, hyDelta: number) => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const quote = (symbol: string, price: number, ma50: number) =>
      ({ symbol, name: symbol, group: 'commodity', price, ma50, changePercent24h: 0, updatedAt: now, source: 'test' });
    return evaluateInvestmentCompass({
      quotes: [quote('Copper', copper, 5), quote('Gold', 3500, 3500)],
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
      fred: [{ id: 'BAMLH0A0HYM2', label: 'HY', subtitle: 'HY', value: 3.7, change: 0, delta4w: hyDelta, unit: '%', date: '2026-11-24', sparkline: [] }],
    } as never, undefined, now)!;
  };

  it('scores copper/gold on the ratio against its 50-day average', async () => {
    expect((await compass(5.4, 0)).signals.find((s) => s.id === 'copper-gold')?.tone).toBe('bullish');
    expect((await compass(4.6, 0)).signals.find((s) => s.id === 'copper-gold')?.tone).toBe('bearish');
  });

  it('lowers the credit pillar when high-yield spreads are widening', async () => {
    const credit = async (d: number) => (await compass(5, d)).factorPillars!.find((p) => p.id === 'credit_recession')!.score;
    expect(await credit(0.8)).toBeLessThan(await credit(0));
  });
});

describe('US ERP, per-market confirmation and smooth macro threshold', () => {
  const now = Date.parse('2026-11-26T00:00:00Z');

  it('scores the US equity risk premium inside the monetary pillar', async () => {
    const { evaluateMacroHealth } = await import('../shared/macro-health');
    const monetary = (pe: number) => evaluateMacroHealth({
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now,
      vnMacroPulse: { sp500PeRatio: pe, updatedAt: now },
      fred: [
        { id: 'FEDFUNDS', label: 'FF', subtitle: 'FF', value: 3.9, change: 0, unit: '%', date: '2026-10-01', sparkline: [] },
        { id: 'DGS10', label: '10Y', subtitle: '10Y', value: 4.9, change: 0, unit: '%', date: '2026-11-24', sparkline: [] },
      ],
    } as never, undefined, now).us!.pillars[2].score;
    expect(monetary(35)).toBeLessThan(monetary(12));
  });

  it('moves equity weight gradually as macro strength crosses the confirmation threshold', async () => {
    const { computeDynamicPortfolioAllocation: alloc } = await import('../shared/macro-health');
    const equity = (macroStrength: number) => alloc({
      stance: 'selective_growth', riskAppetiteScore: 64, highInflationPressure: false, liquidityExpanding: true,
      dualConfirmation: macroStrength >= 0.5 ? 'macro_bull_trend_weak' : 'confirmed_bear', macroStrength,
    })[0].weightPct;
    for (let i = 1; i <= 20; i++) expect(Math.abs(equity(i / 20) - equity((i - 1) / 20))).toBeLessThanOrEqual(2);
  });

  it('reports each market against its own macro health and index trend', async () => {
    const { evaluateInvestmentCompass } = await import('../shared/macro-health');
    const quote = (symbol: string, price: number, ma200: number) =>
      ({ symbol, name: symbol, group: 'index', price, ma200, changePercent24h: 0, updatedAt: now, source: 'test' });
    const report = evaluateInvestmentCompass({
      quotes: [quote('VN-Index', 90, 100), quote('S&P 500', 110, 100)],
      crypto: [], fearGreed: null, updatedAt: now,
      macro: [{ countryCode: 'VNM', isVietnam: true, gdpGrowthPct: 8, gdpGrowthYear: 2025 }],
      fred: [{ id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5, change: 0, unit: '%', date: '2026-10-01', sparkline: [] },
        { id: 'FEDFUNDS', label: 'FF', subtitle: 'FF', value: 3.9, change: 0, unit: '%', date: '2026-10-01', sparkline: [] }],
    } as never, undefined, now)!;
    expect(report.marketConfirmations?.map((m) => [m.market, m.trendAboveMa200])).toEqual([['VN', false], ['US', true]]);
    expect(report.marketConfirmations?.[0].label).toContain('VN-Index dưới MA200');
  });
});

describe('official statistics outrank press feeds', () => {
  const t0 = Date.parse('2026-11-26T00:00:00Z');
  const day = 86_400_000;
  const run = async (source: string, period: string, value: number, now: number) => {
    const { mergeVietnamMacroPulse } = await import('../server/collectors/markets-crypto');
    const official = mergeVietnamMacroPulse({
      ytdTradeBalanceBillionUsd: -12.07,
      fieldMeta: { ytdTradeBalanceBillionUsd: { source: 'Cục Thống kê (NSO)', period: '10T/2026', fetchedAt: t0, retained: false } },
    }, undefined, t0);
    return mergeVietnamMacroPulse({
      ytdTradeBalanceBillionUsd: value,
      fieldMeta: { ytdTradeBalanceBillionUsd: { source, period, fetchedAt: now, retained: false } },
    }, official, now)!;
  };

  it('keeps the official figure when the press feed reports the same period', async () => {
    const out = await run('Hải quan / GSO (RSS)', '10T/2026', -48.6, t0 + day);
    expect(out.ytdTradeBalanceBillionUsd).toBe(-12.07);
    expect(out.fieldMeta?.ytdTradeBalanceBillionUsd).toMatchObject({ source: 'Cục Thống kê (NSO)', fetchedAt: t0, retained: true });
  });

  it('accepts a newer period, an official revision, or the press feed once the official figure has aged out', async () => {
    expect((await run('Hải quan / GSO (RSS)', '11T/2026', -11, t0 + day)).ytdTradeBalanceBillionUsd).toBe(-11);
    expect((await run('Cục Thống kê (NSO)', '10T/2026', -12.5, t0 + day)).ytdTradeBalanceBillionUsd).toBe(-12.5);
    expect((await run('Hải quan / GSO (RSS)', '10T/2026', -12, t0 + 8 * day)).ytdTradeBalanceBillionUsd).toBe(-12);
  });
});
