import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeatherRadarSnapshot } from '../shared/types';
import {
  decodePngRgba,
  dropGlitchedRadarFrames,
  fetchWeatherRadar,
  hasSolidExtremeBlock,
  isAllowedRadarTileUrl,
  normalizeRainViewerRadar,
} from '../server/collectors/weather-radar';

const GLITCH_TILE = readFileSync(join(__dirname, 'fixtures', 'rainviewer-glitch-z6.png'));

// ---- tiny PNG encoder (RGBA8) with a chosen filter per row, to exercise the decoder ----
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}
function encodePng(width: number, height: number, rgba: Uint8Array, filterOf: (y: number) => number = () => 0): Buffer {
  const stride = width * 4;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const ft = filterOf(y);
    const row = Buffer.alloc(stride + 1);
    row[0] = ft;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      const v = rgba[y * stride + x];
      let p = 0;
      if (ft === 1) p = a;
      else if (ft === 2) p = b;
      else if (ft === 3) p = (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[1 + x] = (v - p) & 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function canvas(w: number, h: number) {
  const data = new Uint8Array(w * h * 4);
  return {
    data,
    block(x0: number, y0: number, bw: number, bh: number, rgba: [number, number, number, number]) {
      for (let y = y0; y < y0 + bh; y += 1)
        for (let x = x0; x < x0 + bw; x += 1) data.set(rgba, (y * w + x) * 4);
    },
  };
}
const EXTREME: [number, number, number, number] = [93, 0, 0, 255];

describe('decodePngRgba', () => {
  it('decodes every PNG row filter exactly (none, sub, up, average, paeth)', () => {
    const w = 37, h = 20;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 31 + (i >> 3) * 7 + 13) & 255;
    const png = encodePng(w, h, data, (y) => y % 5);
    const img = decodePngRgba(png);
    expect(img).not.toBeNull();
    expect(img!.width).toBe(w);
    expect(Array.from(img!.data)).toEqual(Array.from(data));
  });

  it('returns null (fail open) for garbage, truncated and unsupported images', () => {
    expect(decodePngRgba(Buffer.from('not a png'))).toBeNull();
    expect(decodePngRgba(GLITCH_TILE.subarray(0, 60))).toBeNull();
    const rgb = Buffer.from(encodePng(4, 4, new Uint8Array(64)));
    rgb[25] = 2; // IHDR colour type -> RGB (unsupported here)
    expect(decodePngRgba(rgb)).toBeNull();
  });

  it('decodes the real RainViewer tile', () => {
    const img = decodePngRgba(GLITCH_TILE)!;
    expect(img.width).toBe(256);
    expect(img.height).toBe(256);
  });
});

describe('hasSolidExtremeBlock', () => {
  it('flags the real glitched RainViewer tile', () => {
    expect(hasSolidExtremeBlock(decodePngRgba(GLITCH_TILE)!)).toBe(true);
  });

  it('flags a wide, tall block of the top-of-scale colour', () => {
    const c = canvas(256, 256);
    c.block(20, 100, 60, 6, EXTREME);
    expect(hasSolidExtremeBlock({ width: 256, height: 256, data: c.data })).toBe(true);
  });

  it('does not flag small cores, thin lines, scattered pixels or other colours', () => {
    const small = canvas(256, 256);
    small.block(10, 10, 12, 12, EXTREME); // 12px wide core
    const thin = canvas(256, 256);
    thin.block(0, 50, 256, 2, EXTREME); // only 2 rows tall
    const scattered = canvas(256, 256);
    for (let i = 0; i < 400; i += 1) scattered.block((i * 37) % 250, (i * 53) % 250, 1, 1, EXTREME);
    const otherColour = canvas(256, 256);
    otherColour.block(10, 100, 100, 10, [200, 0, 0, 255]); // heavy but not the extreme colour
    const faint = canvas(256, 256);
    faint.block(10, 100, 100, 10, [93, 0, 0, 80]); // semi-transparent
    for (const c of [small, thin, scattered, otherColour, faint]) {
      expect(hasSolidExtremeBlock({ width: 256, height: 256, data: c.data })).toBe(false);
    }
  });
});

const snapshot = (): WeatherRadarSnapshot =>
  normalizeRainViewerRadar({
    host: 'https://tilecache.rainviewer.com',
    generated: 1_700_000_000,
    radar: {
      past: [
        { time: 100, path: '/v2/radar/a' },
        { time: 200, path: '/v2/radar/b' },
        { time: 300, path: '/v2/radar/c' },
      ],
      nowcast: [{ time: 400, path: '/v2/radar/n1' }],
    },
  });

describe('dropGlitchedRadarFrames', () => {
  it('uses the newest clean frame as "latest" when the newest frame is glitched', async () => {
    const out = await dropGlitchedRadarFrames(snapshot(), async (f) => f.path.endsWith('/c'));
    expect(out.path).toBe('/v2/radar/b');
    expect(out.frameTime).toBe(200);
    expect(out.tileUrlTemplate).toContain('/v2/radar/b/');
    expect(out.pastFrames.map((f) => f.path)).toEqual(['/v2/radar/a', '/v2/radar/b', '/v2/radar/n1']);
  });

  it('drops a glitched nowcast frame but keeps the real latest', async () => {
    const out = await dropGlitchedRadarFrames(snapshot(), async (f) => Boolean(f.isForecast));
    expect(out.path).toBe('/v2/radar/c');
    expect(out.pastFrames.some((f) => f.isForecast)).toBe(false);
  });

  it('keeps frames whose check is inconclusive (null) instead of dropping them', async () => {
    const out = await dropGlitchedRadarFrames(snapshot(), async () => null);
    expect(out.pastFrames).toHaveLength(4);
    expect(out.path).toBe('/v2/radar/c');
  });

  it('checks frames one at a time so a slow link is not flooded with every tile at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await dropGlitchedRadarFrames(snapshot(), async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return false;
    });
    expect(maxInFlight).toBe(1);
  });

  it('throws when no clean past frame is left', async () => {
    await expect(dropGlitchedRadarFrames(snapshot(), async () => true)).rejects.toThrow(/glitch/i);
  });
});

describe('fetchWeatherRadar with a glitched newest frame', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves the previous clean frame and checks each frame only once', async () => {
    const clean = encodePng(256, 256, new Uint8Array(256 * 256 * 4));
    const tileCalls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('weather-maps.json')) {
        return new Response(
          JSON.stringify({
            host: 'https://tilecache.rainviewer.com',
            generated: 1_700_000_000,
            radar: { past: [{ time: 1_000, path: '/v2/radar/zz1' }, { time: 1_600, path: '/v2/radar/zz2' }], nowcast: [] },
          }),
          { status: 200 },
        );
      }
      tileCalls.push(url);
      const body = url.includes('/zz2/') ? GLITCH_TILE : clean;
      return new Response(new Uint8Array(body), { status: 200 });
    });

    const first = await fetchWeatherRadar();
    expect(first.path).toBe('/v2/radar/zz1');
    expect(first.pastFrames.map((f) => f.path)).toEqual(['/v2/radar/zz1']);
    const callsAfterFirst = tileCalls.length;
    expect(callsAfterFirst).toBe(24); // 2 frames x 12 sample tiles

    await fetchWeatherRadar();
    expect(tileCalls.length).toBe(callsAfterFirst); // verdicts are cached per frame
  });
});

describe('radar probe hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses a decompression bomb: IDAT that inflates far beyond the declared image size', () => {
    const w = 4, h = 4;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const bomb = deflateSync(Buffer.alloc(50_000_000)); // 50 MB of zeros compresses to ~50 KB
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', bomb),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    expect(png.length).toBeLessThan(100_000);
    expect(decodePngRgba(png)).toBeNull();
  });

  it('only probes https tiles on rainviewer.com hosts', () => {
    expect(isAllowedRadarTileUrl('https://tilecache.rainviewer.com/v2/radar/a/256/4/12/7/6/1_1.png')).toBe(true);
    for (const bad of [
      'http://tilecache.rainviewer.com/v2/radar/a/256/4/12/7/6/1_1.png',
      'https://evil.example.com/v2/radar/a.png',
      'https://rainviewer.com.evil.example.com/a.png',
      'https://tilecache.rainviewer.com@evil.example.com/a.png',
      'https://user:pw@tilecache.rainviewer.com/a.png',
      'https://tilecache.rainviewer.com:8443/a.png',
      'https://127.0.0.1/a.png',
      'https://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      expect(isAllowedRadarTileUrl(bad), bad).toBe(false);
    }
  });

  it('does not fetch a tile from a non-allowlisted host and keeps the frame (inconclusive)', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('weather-maps.json')) {
        return new Response(
          JSON.stringify({
            host: 'https://169.254.169.254',
            generated: 1_700_000_000,
            radar: { past: [{ time: 5_000, path: '/v2/radar/ssrf1' }], nowcast: [] },
          }),
          { status: 200 },
        );
      }
      return new Response('secret', { status: 200 });
    });
    const out = await fetchWeatherRadar();
    expect(out.path).toBe('/v2/radar/ssrf1'); // inconclusive never drops a frame
    expect(calls.filter((u) => u.includes('169.254.169.254'))).toHaveLength(0);
  });

  it('treats an oversized tile body as inconclusive', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('weather-maps.json')) {
        return new Response(
          JSON.stringify({
            host: 'https://tilecache.rainviewer.com',
            generated: 1_700_000_000,
            radar: { past: [{ time: 6_000, path: '/v2/radar/big1' }], nowcast: [] },
          }),
          { status: 200 },
        );
      }
      return new Response(new Uint8Array(2_000_000), { status: 200, headers: { 'content-length': '2000000' } });
    });
    const out = await fetchWeatherRadar();
    expect(out.path).toBe('/v2/radar/big1');
  });
});
