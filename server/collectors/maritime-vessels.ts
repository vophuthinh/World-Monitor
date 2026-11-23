import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';
import type { RealtimeHub } from '../realtime/hub';

const DIGITRAFFIC_AIS_URL = 'https://meri.digitraffic.fi/api/ais/v1/locations';
const AISSTREAM_WS_URL = 'wss://stream.aisstream.io/v0/stream';

// Strategic maritime bounding boxes [[latMin, lonMin], [latMax, lonMax]] for AISStream.io
const STRATEGIC_AIS_BOXES = [
  [[3.0, 102.0], [23.5, 121.5]],   // Biển Đông & Việt Nam (Hoàng Sa, Trường Sa, Vịnh Bắc Bộ, Vịnh Thái Lan)
  [[0.5, 98.0], [6.8, 105.5]],     // Eo biển Malacca & Singapore
  [[21.5, 117.0], [26.5, 123.0]],  // Eo biển Đài Loan
  [[23.5, 53.0], [28.0, 59.0]],    // Eo biển Hormuz & Vịnh Ba Tư
  [[11.0, 31.5], [32.0, 45.5]],    // Bab el-Mandeb, Biển Đỏ & Kênh đào Suez
];

const MID_COUNTRY_MAP: Record<string, string> = {
  '574': 'Vietnam',
  '412': 'China',
  '413': 'China',
  '414': 'China',
  '416': 'Taiwan',
  '431': 'Japan',
  '440': 'South Korea',
  '441': 'South Korea',
  '525': 'Indonesia',
  '533': 'Malaysia',
  '548': 'Philippines',
  '563': 'Singapore',
  '564': 'Singapore',
  '565': 'Singapore',
  '566': 'Singapore',
  '567': 'Thailand',
  '338': 'USA',
  '366': 'USA',
  '367': 'USA',
  '368': 'USA',
  '369': 'USA',
  '232': 'UK',
  '235': 'UK',
  '226': 'France',
  '211': 'Germany',
  '230': 'Finland',
  '265': 'Sweden',
  '257': 'Norway',
  '219': 'Denmark',
  '273': 'Russia',
  '351': 'Panama',
  '352': 'Panama',
  '353': 'Panama',
  '354': 'Panama',
  '355': 'Panama',
  '356': 'Panama',
  '357': 'Panama',
  '370': 'Panama',
  '371': 'Panama',
  '372': 'Panama',
  '373': 'Panama',
  '374': 'Panama',
  '636': 'Liberia',
  '538': 'Marshall Islands',
  '477': 'Hong Kong',
  '248': 'Malta',
  '249': 'Malta',
  '256': 'Malta',
  '311': 'Bahamas',
  '422': 'Iran',
  '419': 'India',
  '466': 'Qatar',
  '470': 'UAE',
  '403': 'Saudi Arabia',
  '576': 'Vanuatu',
};

/** AIS uses 511 (heading) and 360 (course) for "not available"; absent fields are unknown too. */
function isCompassValue(v: unknown): boolean {
  return v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 360;
}

function aisSpeed(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 102.2
    ? Number(value.toFixed(1)) : null;
}

export function classifyMmsiCountry(mmsi: number | string): string {
  const str = String(mmsi).trim();
  if (str.length < 3) return 'International';
  const mid = str.slice(0, 3);
  return MID_COUNTRY_MAP[mid] ?? `MID-${mid}`;
}

export async function extractWsPayloadText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  if (data && typeof (data as Blob).text === 'function') {
    return (data as Blob).text();
  }
  return String(data ?? '');
}

function classifyVesselRole(shipName: string, shipType?: number): {
  category: string;
  roleLabel: string;
  severity: SeverityLevel;
} {
  const upper = shipName.toUpperCase();
  if (
    shipType === 35 ||
    shipType === 55 ||
    /\b(NAVY|WARSHIP|COAST GUARD|HAI CANH|KIEM NGU|CANH SAT BIEN|PATROL|USS |HMS |CCG )\b/.test(upper)
  ) {
    return { category: 'naval_patrol', roleLabel: 'Hải quân / Tuần duyên', severity: 'high' };
  }
  if ((shipType !== undefined && shipType >= 80 && shipType <= 89) || /\b(TANKER|CRUDE|LNG|LPG|OIL)\b/.test(upper)) {
    return { category: 'tanker', roleLabel: 'Tàu chở Dầu / LNG', severity: 'medium' };
  }
  if ((shipType !== undefined && shipType >= 70 && shipType <= 79) || /\b(CARGO|CONTAINER|BULK|CARRIER)\b/.test(upper)) {
    return { category: 'cargo', roleLabel: 'Tàu Hàng / Container', severity: 'info' };
  }
  if (shipType === 30) {
    return { category: 'vessel', roleLabel: 'Tàu Cá / Thủy sản', severity: 'info' };
  }
  return { category: 'vessel', roleLabel: 'Tàu Hàng hải AIS', severity: 'info' };
}

export interface DigitrafficAisPayload {
  features?: Array<{
    mmsi?: number;
    geometry?: {
      type?: string;
      coordinates?: number[];
    };
    properties?: {
      mmsi?: number;
      sog?: number;
      cog?: number;
      heading?: number;
      navStat?: number;
      timestampExternal?: number;
    };
  }>;
}

export function normalizeDigitrafficVessels(
  payload: DigitrafficAisPayload,
  now = Date.now(),
): GeoPointFeature[] {
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error('Malformed Digitraffic AIS FeatureCollection');
  }

  const candidates: Array<{ sog: number; feature: GeoPointFeature }> = [];

  for (const item of payload.features) {
    const coords = item.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      continue;
    }

    const mmsi = Number(item.mmsi ?? item.properties?.mmsi ?? 0);
    if (!mmsi) continue;

    const speedKt = aisSpeed(item.properties?.sog);
    const cog = isCompassValue(item.properties?.cog) ? Number(item.properties?.cog) : NaN;
    const rawHeading = Number(item.properties?.heading ?? cog);
    const validHeading =
      Number.isFinite(rawHeading) && rawHeading >= 0 && rawHeading < 360
        ? Math.round(rawHeading)
        : Number.isFinite(cog)
          ? Math.round(cog) % 360
          : 0;

    // `cog` defaults to 0 above, so judge from the raw properties.
    const headingKnown = isCompassValue(item.properties?.heading) || isCompassValue(item.properties?.cog);

    const ts = Number(item.properties?.timestampExternal);
    if (!Number.isFinite(ts) || ts <= 0 || ts > now || now - ts > 30 * 60_000) continue;

    const flag = classifyMmsiCountry(mmsi);
    candidates.push({
      sog: speedKt ?? -1,
      feature: {
        id: `ais:${mmsi}`,
        layer: 'vessels',
        title: `MMSI ${mmsi} (${flag})`,
        subtitle: `Tàu AIS trực tiếp · ${speedKt === null ? 'Tốc độ không rõ' : `${speedKt} kn`} · ${headingKnown ? `Hướng ${validHeading}°` : 'Hướng không rõ'}`,
        category: speedKt !== null && speedKt >= 12 ? 'cargo' : 'vessel',
        severity: flag === 'Russia' ? 'medium' : 'info',
        lat,
        lon,
        timestamp: ts,
        source: 'Open Maritime AIS Live',
        url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`,
        heading: validHeading,
        meta: {
          mmsi: String(mmsi),
          country: flag,
          speedKt,
          courseDeg: Number.isFinite(cog) ? cog : null,
          headingDeg: validHeading,
          headingKnown,
          onGround: speedKt !== null && speedKt < 0.5,
          corridor: 'Baltic / Northern Maritime',
        },
      },
    });
  }

  candidates.sort((a, b) => b.sog - a.sog);
  return candidates.slice(0, 200).map((c) => c.feature);
}

interface AisStreamEnvelope {
  MessageType?: string;
  MetaData?: {
    MMSI?: number;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: {
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      NavigationalStatus?: number;
    };
    StandardClassBPositionReport?: {
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
    };
    ExtendedClassBPositionReport?: {
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      Type?: number;
      Name?: string;
    };
    ShipStaticData?: {
      Type?: number;
      Name?: string;
      Destination?: string;
      CallSign?: string;
    };
  };
}

export interface CachedShipStatic {
  shipType?: number;
  shipName?: string;
  destination?: string;
}

export function parseAisStreamMessage(
  rawJson: string,
  now = Date.now(),
  staticCache?: Map<number, CachedShipStatic>,
  existingVessel?: GeoPointFeature,
): GeoPointFeature | null {
  try {
    const msg = JSON.parse(rawJson) as AisStreamEnvelope;
    const meta = msg?.MetaData;
    const mmsi = Number(meta?.MMSI ?? 0);
    if (!mmsi) return null;

    const staticMsg = msg.Message?.ShipStaticData;
    const extClassB = msg.Message?.ExtendedClassBPositionReport;

    const incomingType = staticMsg?.Type ?? extClassB?.Type;
    const incomingDest = staticMsg?.Destination?.trim() || undefined;
    const rawName = (meta?.ShipName ?? staticMsg?.Name ?? extClassB?.Name ?? '').trim();

    if (staticCache && (incomingType !== undefined || rawName || incomingDest)) {
      const prevStatic = staticCache.get(mmsi);
      staticCache.set(mmsi, {
        shipType: incomingType ?? prevStatic?.shipType,
        shipName: rawName || prevStatic?.shipName,
        destination: incomingDest ?? prevStatic?.destination,
      });
    }

    const cached = staticCache?.get(mmsi);
    const effectiveType = incomingType ?? cached?.shipType;
    const shipName = rawName || cached?.shipName || `MMSI ${mmsi}`;
    const destination = incomingDest ?? cached?.destination ?? (existingVessel?.meta.destination as string | undefined);

    const pos =
      msg.Message?.PositionReport ??
      msg.Message?.StandardClassBPositionReport ??
      msg.Message?.ExtendedClassBPositionReport;
    if (!pos && (!staticMsg || !existingVessel)) return null;
    const lat = pos ? Number(meta?.latitude) : existingVessel!.lat;
    const lon = pos ? Number(meta?.longitude) : existingVessel!.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    const sentAt = typeof meta?.time_utc === 'string' ? Date.parse(meta.time_utc) : NaN;
    if (pos && (!Number.isFinite(sentAt) || sentAt <= 0 || sentAt > now ||
      now - sentAt > 25 * 60_000 || (existingVessel && sentAt < existingVessel.timestamp))) return null;

    const speedKt = pos ? aisSpeed(pos.Sog) : aisSpeed(existingVessel?.meta.speedKt);
    const course = pos
      ? (isCompassValue(pos.Cog) ? Number(pos.Cog) : null)
      : (typeof existingVessel?.meta.courseDeg === 'number' ? existingVessel.meta.courseDeg : null);
    const carryHeading = pos?.TrueHeading === undefined && pos?.Cog === undefined &&
      existingVessel?.meta.headingKnown === true;
    const headingKnown = pos
      ? isCompassValue(pos.TrueHeading) || course !== null || carryHeading
      : existingVessel?.meta.headingKnown === true;
    const heading = pos
      ? Math.round(isCompassValue(pos.TrueHeading) ? Number(pos.TrueHeading) : course ?? (carryHeading ? existingVessel?.heading ?? 0 : 0)) % 360
      : existingVessel!.heading ?? 0;

    const flag = classifyMmsiCountry(mmsi);
    const { category, roleLabel, severity } = classifyVesselRole(shipName, effectiveType);
    return {
      id: `ais:${mmsi}`,
      layer: 'vessels',
      title: `${shipName} (${flag})`,
      subtitle: `${roleLabel} · ${speedKt === null ? 'Tốc độ không rõ' : `${speedKt} kn`} · ${headingKnown ? `Hướng ${heading}°` : 'Hướng không rõ'}${destination ? ` · Đích ${destination}` : ''}`,
      category,
      severity,
      lat,
      lon,
      timestamp: pos ? sentAt : existingVessel!.timestamp,
      source: 'AISStream.io Live WebSocket',
      url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`,
      heading,
      meta: {
        mmsi: String(mmsi),
        vesselName: shipName,
        country: flag,
        roleLabel,
        speedKt,
        courseDeg: course,
        positionTimeBasis: pos ? 'source-message-time' : existingVessel!.meta.positionTimeBasis ?? 'unknown',
        headingDeg: heading,
        headingKnown,
        destination: destination ?? null,
        onGround: speedKt !== null && speedKt < 0.5,
        corridor:
          lat >= 3 && lat <= 23.5 && lon >= 102 && lon <= 121.5
            ? 'Biển Đông / Việt Nam'
            : lat >= 0.5 && lat <= 6.8 && lon >= 98 && lon <= 105.5
              ? 'Eo biển Malacca / Singapore'
              : 'Hành lang Chiến lược AISStream',
      },
    };
  } catch {
    return null;
  }
}

export class MaritimeVesselStreamManager {
  private ws: WebSocket | null = null;
  private pushTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private dirty = false;
  private readonly wsVessels = new Map<string, GeoPointFeature>();
  private readonly staticCache = new Map<number, CachedShipStatic>();
  private openAisVessels: GeoPointFeature[] = [];

  constructor(
    private readonly hub: RealtimeHub,
    private readonly apiKey?: string,
    private readonly onStreamFlush?: (combined: GeoPointFeature[]) => void,
  ) {}

  isAisStreamConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  start(): void {
    this.stopped = false;
    if (this.isAisStreamConfigured()) {
      this.connectAisStream();
      this.pushTimer = setInterval(() => {
        if (!this.dirty) return;
        this.dirty = false;
        const combined = this.getCombinedVessels();
        this.onStreamFlush?.(combined);
        this.hub.ingestForAlerts('maritime-ws', combined);
        this.hub.publish({
          type: 'vessels_update',
          vessels: combined,
          ts: Date.now(),
        });
      }, 2_500);
      if (typeof this.pushTimer.unref === 'function') {
        this.pushTimer.unref();
      }
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.pushTimer) clearInterval(this.pushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {
      // Ignore
    }
    this.ws = null;
  }

  async fetchSnapshot(): Promise<GeoPointFeature[]> {
    try {
      const payload = await fetchJsonWithTimeout<DigitrafficAisPayload>(DIGITRAFFIC_AIS_URL, {
        timeoutMs: 10_000,
        retries: 1,
        userAgent: NAMED_APP_UA,
        headers: {
          'Digitraffic-User': 'WorldMonitorVN/1.0',
        },
      });
      const vessels = normalizeDigitrafficVessels(payload, Date.now());
      if (payload.features?.length && vessels.length === 0) {
        throw new Error('Digitraffic AIS returned no valid fresh positions');
      }
      this.openAisVessels = vessels;
    } catch (err) {
      this.getCombinedVessels();
      throw err;
    }
    return this.getCombinedVessels();
  }

  getCombinedVessels(now = Date.now()): GeoPointFeature[] {
    for (const [key, v] of this.wsVessels) {
      if (now - v.timestamp > 25 * 60_000) {
        this.wsVessels.delete(key);
      }
    }
    this.openAisVessels = this.openAisVessels.filter((v) => v.timestamp <= now && now - v.timestamp <= 30 * 60_000);
    const merged = new Map<string, GeoPointFeature>();
    // Put Biển Đông / Malacca / Hormuz / Red Sea AISStream WebSocket vessels FIRST so they are never truncated
    for (const [k, v] of this.wsVessels) merged.set(k, v);
    for (const v of this.openAisVessels) {
      if (!merged.has(v.id)) merged.set(v.id, v);
    }
    return [...merged.values()].slice(0, 750);
  }

  private connectAisStream(): void {
    if (this.stopped || !this.apiKey || typeof globalThis.WebSocket !== 'function') return;

    try {
      const ws = new WebSocket(AISSTREAM_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            APIKey: this.apiKey,
            BoundingBoxes: STRATEGIC_AIS_BOXES,
            FilterMessageTypes: [
              'PositionReport',
              'StandardClassBPositionReport',
              'ExtendedClassBPositionReport',
              'ShipStaticData',
            ],
          }),
        );
      };

      ws.onmessage = (event) => {
        void extractWsPayloadText(event.data).then((rawText) => {
          if (this.stopped || !rawText) return;
          let mmsiKey = '';
          try {
            const peek = JSON.parse(rawText) as { MetaData?: { MMSI?: number } };
            if (peek?.MetaData?.MMSI) mmsiKey = `ais:${peek.MetaData.MMSI}`;
          } catch {
            return;
          }
          const existing = mmsiKey ? this.wsVessels.get(mmsiKey) : undefined;
          const parsed = parseAisStreamMessage(rawText, Date.now(), this.staticCache, existing);
          if (parsed) {
            this.wsVessels.set(parsed.id, parsed);
            this.dirty = true;
            if (this.wsVessels.size > 580) {
              const oldestKey = this.wsVessels.keys().next().value;
              if (oldestKey) this.wsVessels.delete(oldestKey);
            }
          }
          if (this.staticCache.size > 1_200) {
            const oldestMmsi = this.staticCache.keys().next().value;
            if (oldestMmsi !== undefined) this.staticCache.delete(oldestMmsi);
          }
        });
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Handled in onclose
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.stopped) return;
        this.reconnectTimer = setTimeout(() => this.connectAisStream(), 5_000);
        if (typeof this.reconnectTimer.unref === 'function') {
          this.reconnectTimer.unref();
        }
      };
    } catch {
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => this.connectAisStream(), 5_000);
      }
    }
  }
}
