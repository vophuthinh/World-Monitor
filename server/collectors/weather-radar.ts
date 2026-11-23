import { inflateSync } from 'node:zlib';
import type { WeatherRadarFrame, WeatherRadarSnapshot } from '@shared/types';
import { setBounded } from '../lib/bounded-map';
import { DEFAULT_BROWSER_UA, fetchJsonWithTimeout } from '../lib/http';

const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export interface RainViewerPayload {
  host?: string;
  generated?: number;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
    nowcast?: Array<{ time?: number; path?: string }>;
  };
}

export function normalizeRainViewerRadar(
  payload: RainViewerPayload,
  now = Date.now(),
): WeatherRadarSnapshot {
  const host = (payload?.host || 'https://tilecache.rainviewer.com').replace(/\/+$/, '');
  const pastRaw = payload?.radar?.past;
  if (!Array.isArray(pastRaw) || pastRaw.length === 0) {
    throw new Error('RainViewer payload missing radar.past frames');
  }

  const pastFrames: WeatherRadarFrame[] = pastRaw
    .filter((f): f is { time: number; path: string } => typeof f?.time === 'number' && typeof f?.path === 'string' && f.path.length > 0)
    .map((f) => ({
      time: f.time,
      path: f.path,
      tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/6/1_1.png`,
      isForecast: false,
    }));

  if (pastFrames.length === 0) {
    throw new Error('RainViewer radar.past contained no valid frames');
  }

  const nowcastFrames: WeatherRadarFrame[] = (payload?.radar?.nowcast ?? [])
    .filter((f): f is { time: number; path: string } => typeof f?.time === 'number' && typeof f?.path === 'string' && f.path.length > 0)
    .slice(0, 3)
    .map((f) => ({
      time: f.time,
      path: f.path,
      tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/6/1_1.png`,
      isForecast: true,
    }));

  const latest = pastFrames[pastFrames.length - 1];
  const timelineFrames = [...pastFrames.slice(-8), ...nowcastFrames];

  return {
    host,
    path: latest.path,
    tileUrlTemplate: latest.tileUrlTemplate,
    frameTime: latest.time,
    generatedAt: payload.generated ? payload.generated * 1000 : now,
    pastFrames: timelineFrames,
  };
}

// ---------------------------------------------------------------------------------------------
// Glitch guard. RainViewer composites occasionally contain a frame where one radar's processing
// error paints a solid, straight-edged block of the top-of-scale colour (a ~500 km dark-red slab
// over Thailand/Cambodia on 2026-11-23 13:00 UTC, gone in the next frame). Real echoes of that
// intensity are small, ragged cores, never wide solid blocks, so such frames are dropped.
// ---------------------------------------------------------------------------------------------

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Decode an 8-bit RGBA, non-interlaced PNG (what RainViewer serves). Returns null for anything else. */
export function decodePngRgba(png: Uint8Array): RgbaImage | null {
  const buf = Buffer.from(png);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let width = 0;
  let height = 0;
  let supported = false;
  const idat: Buffer[] = [];
  for (let i = 8; i + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR' && body.length >= 13) {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      supported = body[8] === 8 && body[9] === 6 && body[12] === 0; // 8-bit, RGBA, no interlace
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    i += 12 + len;
  }
  if (!supported || idat.length === 0 || width <= 0 || height <= 0 || width * height > 4_000_000) return null;
  const stride = width * 4;
  const expectedRawBytes = (stride + 1) * height;
  let raw: Buffer;
  try {
    // Cap the output at the declared geometry so a tiny IDAT cannot inflate into hundreds of MB.
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedRawBytes });
  } catch {
    return null;
  }
  if (raw.length < expectedRawBytes) return null;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[dst + x - 4] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[dst - stride + x - 4] : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = a;
          break;
        case 2:
          predictor = b;
          break;
        case 3:
          predictor = (a + b) >> 1;
          break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          return null;
      }
      out[dst + x] = (raw[src + x] + predictor) & 255;
    }
  }
  return { width, height, data: out };
}

/** RainViewer colour scheme 6 (NEXRAD): the top-of-scale dark red, RGB (93, 0, 0). */
function isTopOfScale(r: number, g: number, b: number, a: number): boolean {
  return a > 200 && r >= 85 && r <= 101 && g <= 8 && b <= 8;
}

/**
 * True when the image has a solid block of the top-of-scale colour: at least `minRows` consecutive
 * rows that each contain a horizontal run of `minRun` such pixels. Calibrated on zoom-4 tiles:
 * over 156 clean tiles the longest natural run was 5 px, the glitch had 58 px over 4 rows.
 */
export function hasSolidExtremeBlock(img: RgbaImage, minRun = 20, minRows = 3): boolean {
  let streak = 0;
  for (let y = 0; y < img.height; y += 1) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < img.width; x += 1) {
      const i = (y * img.width + x) * 4;
      if (isTopOfScale(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3])) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    streak = best >= minRun ? streak + 1 : 0;
    if (streak >= minRows) return true;
  }
  return false;
}

const RADAR_TILE_HOST = /^([a-z0-9-]+\.)*rainviewer\.com$/i;
/** A real radar tile is ~1-20 KB; anything near this is not one. */
const MAX_RADAR_TILE_BYTES = 1_000_000;

/**
 * The tile host comes from RainViewer's JSON, so it is untrusted input for a server-side request:
 * only https on *.rainviewer.com (default port, no credentials) may be probed.
 */
export function isAllowedRadarTileUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && RADAR_TILE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** Zoom-4 tiles covering the monitored theatre (lon 90-146E, lat -14..48N): x 12..14, y 5..8. */
const RADAR_SAMPLE_TILES: ReadonlyArray<readonly [number, number, number]> = [12, 13, 14].flatMap((x) =>
  [5, 6, 7, 8].map((y) => [4, x, y] as const),
);

/**
 * true = glitch found, false = every sample tile checked and clean,
 * null = some tile could not be checked and none showed a glitch (inconclusive).
 */
async function radarFrameHasGlitch(frame: WeatherRadarFrame): Promise<boolean | null> {
  const results = await Promise.all(
    RADAR_SAMPLE_TILES.map(async ([z, x, y]): Promise<boolean | null> => {
      try {
        const url = frame.tileUrlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
        if (!isAllowedRadarTileUrl(url)) return null;
        const resp = await fetch(url, {
          headers: { 'User-Agent': DEFAULT_BROWSER_UA },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) return null;
        const declared = Number(resp.headers.get('content-length') ?? 0);
        if (declared > MAX_RADAR_TILE_BYTES) return null;
        const body = new Uint8Array(await resp.arrayBuffer());
        if (body.length > MAX_RADAR_TILE_BYTES) return null;
        const img = decodePngRgba(body);
        return img ? hasSolidExtremeBlock(img) : null;
      } catch {
        return null;
      }
    }),
  );
  if (results.some((r) => r === true)) return true;
  return results.every((r) => r === false) ? false : null;
}

const glitchVerdictByPath = new Map<string, boolean>();

async function cachedRadarGlitchVerdict(frame: WeatherRadarFrame): Promise<boolean | null> {
  const known = glitchVerdictByPath.get(frame.path);
  if (known !== undefined) return known;
  const verdict = await radarFrameHasGlitch(frame);
  if (verdict !== null) setBounded(glitchVerdictByPath, frame.path, verdict, 128); // inconclusive is retried next run
  return verdict;
}

/** Remove frames that fail the glitch check; the newest clean past frame becomes the "latest". */
export async function dropGlitchedRadarFrames(
  snapshot: WeatherRadarSnapshot,
  isGlitched: (frame: WeatherRadarFrame) => Promise<boolean | null>,
): Promise<WeatherRadarSnapshot> {
  // One frame at a time (its 12 tiles still load in parallel): firing every tile of every frame at
  // once starves slow links, tiles time out, and the check becomes inconclusive.
  const verdicts: Array<boolean | null> = [];
  for (const frame of snapshot.pastFrames) verdicts.push(await isGlitched(frame));
  const clean = snapshot.pastFrames.filter((_, i) => verdicts[i] !== true);
  const latest = [...clean].reverse().find((f) => !f.isForecast);
  if (!latest) {
    throw new Error('RainViewer radar: every recent frame failed the glitch check');
  }
  return {
    ...snapshot,
    path: latest.path,
    tileUrlTemplate: latest.tileUrlTemplate,
    frameTime: latest.time,
    pastFrames: clean,
  };
}

export async function fetchWeatherRadar(): Promise<WeatherRadarSnapshot> {
  const payload = await fetchJsonWithTimeout<RainViewerPayload>(RAINVIEWER_MAPS_URL, {
    timeoutMs: 10_000,
    retries: 1,
    userAgent: DEFAULT_BROWSER_UA,
  });
  return dropGlitchedRadarFrames(normalizeRainViewerRadar(payload, Date.now()), cachedRadarGlitchVerdict);
}
