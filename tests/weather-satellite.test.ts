import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeatherSatellite, normalizeHimawariTargetTimes } from '../server/collectors/weather-satellite';

const TIMES = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'jma-himawari-target-times.json'), 'utf8')) as Array<{
  basetime: string;
  validtime: string;
}>;
const newest = TIMES[TIMES.length - 1];
const NOW = Date.UTC(
  Number(newest.validtime.slice(0, 4)),
  Number(newest.validtime.slice(4, 6)) - 1,
  Number(newest.validtime.slice(6, 8)),
  Number(newest.validtime.slice(8, 10)),
  Number(newest.validtime.slice(10, 12)) + 9, // 9 minutes after the newest frame, as observed live
);

describe('normalizeHimawariTargetTimes (real JMA data)', () => {
  it('returns the last 6 frames oldest first and points "latest" at the newest', () => {
    const snap = normalizeHimawariTargetTimes(TIMES, NOW);
    expect(snap.frames).toHaveLength(6);
    const times = snap.frames.map((f) => f.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(snap.frameTime).toBe(times[times.length - 1]);
    expect(snap.frameTime).toBe(Date.UTC(2026, 10, 23, 13, 30, 0) / 1000);
    expect(snap.tileUrlTemplate).toBe(snap.frames[snap.frames.length - 1].tileUrlTemplate);
    expect(snap.tileUrlTemplate).toBe(
      `https://www.jma.go.jp/bosai/himawari/data/satimg/${newest.basetime}/fd/${newest.validtime}/B13/TBB/{z}/{x}/{y}.jpg`,
    );
    expect(snap.maxZoom).toBe(5);
    expect(snap.attribution).toMatch(/JMA/);
    expect(snap.generatedAt).toBe(NOW);
  });

  it('skips malformed entries instead of building URLs from them', () => {
    const snap = normalizeHimawariTargetTimes(
      [
        { basetime: '../../etc/passwd', validtime: '20261123133000' },
        { basetime: '20261123132000', validtime: 'x/y' },
        null,
        { basetime: 20261123131000, validtime: '20261123131000' },
        TIMES[TIMES.length - 2],
        newest,
      ],
      NOW,
    );
    expect(snap.frames).toHaveLength(2);
    for (const f of snap.frames) expect(f.tileUrlTemplate).not.toMatch(/\.\.|passwd/);
  });

  it('rejects an empty payload and a stale newest frame', () => {
    expect(() => normalizeHimawariTargetTimes([], NOW)).toThrow(/no valid frames/i);
    expect(() => normalizeHimawariTargetTimes({}, NOW)).toThrow();
    expect(() => normalizeHimawariTargetTimes(TIMES, NOW + 3 * 3_600_000)).toThrow(/stale/i);
  });
});

describe('fetchWeatherSatellite', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches the JMA target-times list and normalizes it', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(TIMES), { status: 200 });
    });
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const snap = await fetchWeatherSatellite();
    expect(urls).toEqual(['https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json']);
    expect(snap.frames.length).toBe(6);
  });

  it('throws when JMA is unavailable so the cached frames are kept', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('x', { status: 503 }));
    await expect(fetchWeatherSatellite()).rejects.toThrow();
  });
});
