import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTropicalCyclones,
  isAllowedGdacsUrl,
  normalizeGdacsTropicalCyclone,
} from '../server/collectors/tropical-cyclones';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const LIST = fx('gdacs-tc-list.json');
const AKVAN_GEOM = fx('gdacs-tc-geometry-akvan.json');
const CHAMPI_GEOM = fx('gdacs-tc-geometry-champi.json');
const listFeature = (name: string) => LIST.features.find((f: { properties: { name: string } }) => f.properties.name.includes(name));

describe('normalizeGdacsTropicalCyclone (real GDACS data)', () => {
  it('maps an active cyclone: identity, intensity, position, track and forecast cone', () => {
    const tc = normalizeGdacsTropicalCyclone(listFeature('AKVAN'), AKVAN_GEOM);
    expect(tc).not.toBeNull();
    expect(tc!.id).toBe('tc:1001351');
    expect(tc!.name).toBe('AKVAN-26');
    expect(tc!.alertLevel).toBe('Green');
    expect(tc!.windKmh).toBeCloseTo(83.3, 0);
    expect(tc!.lat).toBeCloseTo(17.2, 1);
    expect(tc!.lon).toBeCloseTo(84.7, 1);
    expect(tc!.source).toBe('JTWC');
    expect(tc!.reportUrl).toMatch(/^https:\/\/www\.gdacs\.org\//);
    expect(tc!.track.length).toBeGreaterThan(5);
    expect(new Set(tc!.track.map((s) => s.category))).toEqual(new Set(['TD', 'TS']));
    for (const seg of tc!.track) {
      expect(seg.coordinates.length).toBeGreaterThanOrEqual(2);
      for (const [lon, lat] of seg.coordinates) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      }
    }
    expect(tc!.cone).not.toBeNull();
    expect(tc!.cone![0].length).toBeGreaterThan(10);
  });

  it('keeps hurricane-strength segments for a West Pacific typhoon', () => {
    const tc = normalizeGdacsTropicalCyclone(listFeature('CHAMPI'), CHAMPI_GEOM)!;
    expect(tc.name).toBe('CHAMPI-26');
    expect(tc.alertLevel).toBe('Red');
    expect(tc.track.some((s) => s.category === 'HU')).toBe(true);
    expect(tc.countries).toContain('Philippines');
  });

  it('still returns the cyclone (position only) when the geometry is missing', () => {
    const tc = normalizeGdacsTropicalCyclone(listFeature('AKVAN'), null)!;
    expect(tc.track).toEqual([]);
    expect(tc.cone).toBeNull();
    expect(tc.lat).toBeCloseTo(17.2, 1);
  });

  it('rejects malformed features', () => {
    expect(normalizeGdacsTropicalCyclone({ properties: {} }, null)).toBeNull();
    expect(normalizeGdacsTropicalCyclone({ properties: { eventid: 1, name: 'x' }, geometry: { type: 'Point', coordinates: ['a', 'b'] } }, null)).toBeNull();
    expect(normalizeGdacsTropicalCyclone(null, null)).toBeNull();
  });
});

describe('isAllowedGdacsUrl', () => {
  it('only allows https on gdacs.org hosts', () => {
    expect(isAllowedGdacsUrl('https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=1&episodeid=1')).toBe(true);
    for (const bad of ['http://www.gdacs.org/x', 'https://evil.example.com/x', 'https://gdacs.org.evil.com/x', 'https://169.254.169.254/x', 'https://u:p@www.gdacs.org/x', 'nope']) {
      expect(isAllowedGdacsUrl(bad), bad).toBe(false);
    }
  });
});

describe('fetchTropicalCyclones', () => {
  afterEach(() => vi.restoreAllMocks());

  const mock = (opts: { geometryHost?: string } = {}) => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('geteventlist')) {
        const list = JSON.parse(JSON.stringify(LIST));
        if (opts.geometryHost) {
          for (const f of list.features) f.properties.url.geometry = f.properties.url.geometry.replace('www.gdacs.org', opts.geometryHost);
        }
        return new Response(JSON.stringify(list), { status: 200 });
      }
      return new Response(JSON.stringify(AKVAN_GEOM), { status: 200 });
    });
    return calls;
  };

  it('returns only currently active cyclones and fetches each geometry once', async () => {
    const calls = mock();
    const snap = await fetchTropicalCyclones();
    expect(snap.cyclones.map((c) => c.name).sort()).toEqual(['AKVAN-26', 'XAVIER-26']);
    expect(calls.filter((u) => u.includes('getgeometry'))).toHaveLength(2);
    expect(snap.updatedAt).toBeGreaterThan(0);
  });

  it('does not request a geometry URL outside gdacs.org (SSRF) but keeps the cyclone', async () => {
    const calls = mock({ geometryHost: '169.254.169.254' });
    const snap = await fetchTropicalCyclones();
    expect(calls.filter((u) => u.includes('169.254.169.254'))).toHaveLength(0);
    expect(snap.cyclones).toHaveLength(2);
    expect(snap.cyclones.every((c) => c.track.length === 0)).toBe(true);
  });

  it('returns an empty snapshot (not an error) when no cyclone is active', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }));
    const snap = await fetchTropicalCyclones();
    expect(snap.cyclones).toEqual([]);
  });

  it('fails (so the cached snapshot is kept) when the event list is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('nope', { status: 503 }));
    await expect(fetchTropicalCyclones()).rejects.toThrow();
  });
});
