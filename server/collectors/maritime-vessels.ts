import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';
import type { RealtimeHub } from '../realtime/hub';

const DIGITRAFFIC_AIS_URL = 'https://meri.digitraffic.fi/api/ais/v1/locations';
const AISSTREAM_WS_URL = 'wss://stream.aisstream.io/v0/stream';

// Strategic maritime bounding boxes [[latMin, lonMin], [latMax, lonMax]] for AISStream.io
const STRATEGIC_AIS_BOXES = [
  [[4.0, 103.0], [23.0, 121.0]],   // Biển Đông & Việt Nam (Hoàng Sa, Trường Sa, Vịnh Bắc Bộ)
  [[0.5, 98.0], [6.5, 105.0]],     // Eo biển Malacca & Singapore
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
  '636': 'Liberia',
  '538': 'Marshall Islands',
  '477': 'Hong Kong',
  '248': 'Malta',
  '256': 'Malta',
  '311': 'Bahamas',
  '422': 'Iran',
  '419': 'India',
};

export function classifyMmsiCountry(mmsi: number | string): string {
  const str = String(mmsi).trim();
  if (str.length < 3) return 'International';
  const mid = str.slice(0, 3);
  return MID_COUNTRY_MAP[mid] ?? `MID-${mid}`;
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
    /\b(NAVY|WARSHIP|COAST GUARD|HAI CANH|KIEM NGU|PATROL|USS |HMS |CCG )\b/.test(upper)
  ) {
    return { category: 'naval_patrol', roleLabel: 'Hải quân / Tuần duyên', severity: 'high' };
  }
  if ((shipType !== undefined && shipType >= 80 && shipType <= 89) || /\b(TANKER|CRUDE|LNG|LPG|OIL)\b/.test(upper)) {
    return { category: 'tanker', roleLabel: 'Tàu chở Dầu / LNG', severity: 'medium' };
  }
  if (shipType !== undefined && shipType >= 70 && shipType <= 79) {
    return { category: 'cargo', roleLabel: 'Tàu Hàng / Container', severity: 'info' };
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

    const sog = Number(item.properties?.sog ?? 0);
    const cog = Number(item.properties?.cog ?? 0);
    const rawHeading = Number(item.properties?.heading ?? cog);
    const validHeading =
      Number.isFinite(rawHeading) && rawHeading >= 0 && rawHeading < 360
        ? Math.round(rawHeading)
        : Number.isFinite(cog)
          ? Math.round(cog) % 360
          : 0;

    const ts = Number(item.properties?.timestampExternal) || now;
    // Skip stale AIS reports older than 30 minutes
    if (now - ts > 30 * 60_000) continue;

    const flag = classifyMmsiCountry(mmsi);
    const speedKt = Number.isFinite(sog) ? Number(sog.toFixed(1)) : 0;

    candidates.push({
      sog: speedKt,
      feature: {
        id: `ais:${mmsi}`,
        layer: 'vessels',
        title: `MMSI ${mmsi} (${flag})`,
        subtitle: `Tàu AIS trực tiếp · ${speedKt} kn · Hướng ${validHeading}°`,
        category: speedKt >= 12 ? 'cargo' : 'vessel',
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
          headingDeg: validHeading,
          onGround: speedKt < 0.5,
          corridor: 'Baltic / Northern Maritime',
        },
      },
    });
  }

  // Prioritize underway moving vessels so real-time dead-reckoning is vivid
  candidates.sort((a, b) => b.sog - a.sog);
  return candidates.slice(0, 220).map((c) => c.feature);
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
  };
}

export function parseAisStreamMessage(rawJson: string, now = Date.now()): GeoPointFeature | null {
  try {
    const msg = JSON.parse(rawJson) as AisStreamEnvelope;
    const meta = msg?.MetaData;
    const mmsi = Number(meta?.MMSI ?? 0);
    const lat = Number(meta?.latitude);
    const lon = Number(meta?.longitude);

    if (!mmsi || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null;
    }

    const pos = msg.Message?.PositionReport ?? msg.Message?.StandardClassBPositionReport;
    const sog = Number(pos?.Sog ?? 0);
    const cog = Number(pos?.Cog ?? 0);
    const rawHdg = Number(pos?.TrueHeading ?? cog);
    const heading =
      Number.isFinite(rawHdg) && rawHdg >= 0 && rawHdg < 360
        ? Math.round(rawHdg)
        : Number.isFinite(cog)
          ? Math.round(cog) % 360
          : 0;

    const shipName = (meta?.ShipName ?? '').trim() || `MMSI ${mmsi}`;
    const flag = classifyMmsiCountry(mmsi);
    const { category, roleLabel, severity } = classifyVesselRole(shipName);
    const speedKt = Number.isFinite(sog) ? Number(sog.toFixed(1)) : 0;

    return {
      id: `ais:${mmsi}`,
      layer: 'vessels',
      title: `${shipName} (${flag})`,
      subtitle: `${roleLabel} · ${speedKt} kn · Hướng ${heading}°`,
      category,
      severity,
      lat,
      lon,
      timestamp: now,
      source: 'AISStream.io Live WebSocket',
      url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`,
      heading,
      meta: {
        mmsi: String(mmsi),
        vesselName: shipName,
        country: flag,
        roleLabel,
        speedKt,
        headingDeg: heading,
        onGround: speedKt < 0.5,
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
  private openAisVessels: GeoPointFeature[] = [];

  constructor(
    private readonly hub: RealtimeHub,
    private readonly apiKey?: string,
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
        this.hub.ingestForAlerts('maritime-ws', combined);
        this.hub.publish({
          type: 'vessels_update',
          vessels: combined,
          ts: Date.now(),
        });
      }, 3_000);
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
    const now = Date.now();
    try {
      const payload = await fetchJsonWithTimeout<DigitrafficAisPayload>(DIGITRAFFIC_AIS_URL, {
        timeoutMs: 10_000,
        retries: 1,
        userAgent: NAMED_APP_UA,
        headers: {
          'Digitraffic-User': 'WorldMonitorVN/1.0',
        },
      });
      this.openAisVessels = normalizeDigitrafficVessels(payload, now);
    } catch (err) {
      if (this.wsVessels.size === 0 && this.openAisVessels.length === 0) {
        throw err;
      }
    }
    return this.getCombinedVessels(now);
  }

  getCombinedVessels(now = Date.now()): GeoPointFeature[] {
    // Prune WS vessels older than 20 minutes
    for (const [key, v] of this.wsVessels) {
      if (now - v.timestamp > 20 * 60_000) {
        this.wsVessels.delete(key);
      }
    }
    const merged = new Map<string, GeoPointFeature>();
    for (const v of this.openAisVessels) merged.set(v.id, v);
    for (const [k, v] of this.wsVessels) merged.set(k, v);
    return [...merged.values()].slice(0, 400);
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
            FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport'],
          }),
        );
      };

      ws.onmessage = (event) => {
        const parsed = parseAisStreamMessage(String(event.data));
        if (parsed) {
          this.wsVessels.set(parsed.id, parsed);
          this.dirty = true;
          if (this.wsVessels.size > 350) {
            const oldestKey = this.wsVessels.keys().next().value;
            if (oldestKey) this.wsVessels.delete(oldestKey);
          }
        }
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
