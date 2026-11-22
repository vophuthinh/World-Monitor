import { XMLParser } from 'fast-xml-parser';
import type {
  AqiBand,
  GeoPointFeature,
  SeverityLevel,
  VietnamEnvLocation,
  VietnamEnvSnapshot,
} from '@shared/types';
import { DEFAULT_BROWSER_UA, NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';
import { matchGeoLocation } from './polymarket-news';

interface VietnamStationDef {
  id: string;
  name: string;
  region: 'mainland' | 'maritime';
  lat: number;
  lon: number;
}

const VIETNAM_STATIONS: readonly VietnamStationDef[] = [
  { id: 'vn-hcmc', name: 'TP.HCM', region: 'mainland', lat: 10.7769, lon: 106.7009 },
  { id: 'vn-hanoi', name: 'Hà Nội', region: 'mainland', lat: 21.0285, lon: 105.8542 },
  { id: 'vn-danang', name: 'Đà Nẵng', region: 'mainland', lat: 16.0544, lon: 108.2022 },
  { id: 'vn-hoang-sa', name: 'QĐ. Hoàng Sa', region: 'maritime', lat: 16.53, lon: 111.62 },
  { id: 'vn-truong-sa', name: 'QĐ. Trường Sa', region: 'maritime', lat: 8.64, lon: 111.92 },
];

export interface OpenMeteoForecastEntry {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    wind_gusts_10m?: number;
    weather_code?: number;
  };
}

export interface OpenMeteoAqiEntry {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
  };
}

function kmhToBeaufort(kmh: number): number {
  if (kmh < 2) return 0;
  if (kmh < 6) return 1;
  if (kmh < 12) return 2;
  if (kmh < 20) return 3;
  if (kmh < 29) return 4;
  if (kmh < 39) return 5;
  if (kmh < 50) return 6;
  if (kmh < 62) return 7;
  if (kmh < 75) return 8;
  if (kmh < 89) return 9;
  if (kmh < 103) return 10;
  if (kmh < 118) return 11;
  return 12;
}

function classifyWeatherCodeVi(code: number): string {
  if (code === 0) return 'Quang mây';
  if (code <= 3) return 'Ít mây';
  if (code >= 45 && code <= 48) return 'Sương mù';
  if (code >= 51 && code <= 67) return 'Mưa rào';
  if (code >= 80 && code <= 82) return 'Mưa lớn';
  if (code >= 95) return 'Dông / Áp thấp';
  return 'Có mây';
}

function classifyUsAqiBand(aqi: number): AqiBand {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'sensitive';
  if (aqi <= 200) return 'unhealthy';
  return 'hazardous';
}

export function normalizeVietnamEnvLocations(
  forecasts: OpenMeteoForecastEntry[],
  aqis: OpenMeteoAqiEntry[],
): VietnamEnvLocation[] {
  const out: VietnamEnvLocation[] = [];

  for (let idx = 0; idx < VIETNAM_STATIONS.length; idx++) {
    const st = VIETNAM_STATIONS[idx];
    const fc = forecasts[idx]?.current;
    if (!fc) continue;

    const tempC = Number((Number(fc.temperature_2m) || 0).toFixed(1));
    const windKmh = Math.round(Number(fc.wind_speed_10m) || 0);
    const windGustKmh = Math.round(Number(fc.wind_gusts_10m) || windKmh);
    const weatherCode = Number(fc.weather_code ?? 1);
    const beaufortScale = kmhToBeaufort(Math.max(windKmh, windGustKmh * 0.8));
    const stormWarning = windGustKmh >= 50 || weatherCode >= 95;

    let usAqi: number | undefined;
    let pm25: number | undefined;
    let aqiBand: AqiBand | undefined;

    if (st.region === 'mainland' && aqis[idx]?.current) {
      const rawAqi = Number(aqis[idx].current?.us_aqi);
      const rawPm25 = Number(aqis[idx].current?.pm2_5);
      if (Number.isFinite(rawAqi) && rawAqi >= 0) {
        usAqi = Math.round(rawAqi);
        aqiBand = classifyUsAqiBand(usAqi);
      }
      if (Number.isFinite(rawPm25) && rawPm25 >= 0) {
        pm25 = Number(rawPm25.toFixed(1));
      }
    }

    out.push({
      id: st.id,
      name: st.name,
      region: st.region,
      lat: st.lat,
      lon: st.lon,
      tempC,
      windKmh,
      windGustKmh,
      beaufortScale,
      weatherCode,
      weatherLabel: classifyWeatherCodeVi(weatherCode),
      stormWarning,
      usAqi,
      pm25,
      aqiBand,
    });
  }

  return out;
}

export async function fetchVietnamEnvironment(): Promise<VietnamEnvSnapshot> {
  const now = Date.now();
  const lats = VIETNAM_STATIONS.map((s) => s.lat).join(',');
  const lons = VIETNAM_STATIONS.map((s) => s.lon).join(',');

  const mainlandStations = VIETNAM_STATIONS.filter((s) => s.region === 'mainland');
  const mLats = mainlandStations.map((s) => s.lat).join(',');
  const mLons = mainlandStations.map((s) => s.lon).join(',');

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code&wind_speed_unit=kmh`;
  const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${mLats}&longitude=${mLons}&current=us_aqi,pm2_5`;

  const [fcRaw, aqiRaw] = await Promise.all([
    fetchJsonWithTimeout<OpenMeteoForecastEntry[] | OpenMeteoForecastEntry>(forecastUrl, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }),
    fetchJsonWithTimeout<OpenMeteoAqiEntry[] | OpenMeteoAqiEntry>(aqiUrl, {
      timeoutMs: 8_000,
      retries: 1,
      userAgent: NAMED_APP_UA,
    }).catch(() => [] as OpenMeteoAqiEntry[]),
  ]);

  const fcArray = Array.isArray(fcRaw) ? fcRaw : [fcRaw];
  const aqiArray = Array.isArray(aqiRaw) ? aqiRaw : [aqiRaw];

  const locations = normalizeVietnamEnvLocations(fcArray, aqiArray);
  if (locations.length === 0) {
    throw new Error('Open-Meteo Vietnam environment feed returned no stations');
  }

  const maxSeaGustKmh = locations
    .filter((l) => l.region === 'maritime')
    .reduce((mx, l) => Math.max(mx, l.windGustKmh), 0);

  const mainlandByAqi = locations
    .filter((l) => l.usAqi !== undefined)
    .sort((a, b) => (b.usAqi ?? 0) - (a.usAqi ?? 0));

  return {
    locations,
    maxSeaGustKmh,
    worstAqiCity: mainlandByAqi[0]?.name,
    worstAqi: mainlandByAqi[0]?.usAqi,
    updatedAt: now,
  };
}

// ============================================================================
// Live GNSS / GPS Jamming (ADS-B NIC<=4) & BGP Routing / Cloud Outages Layer
// ============================================================================

export interface EwTheaterProbe {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const EW_THEATER_PROBES: readonly EwTheaterProbe[] = [
  { id: 'ew-east-sea', name: 'Biển Đông (Hoàng Sa – Hải Nam)', lat: 16.4, lon: 111.5 },
  { id: 'ew-taiwan', name: 'Eo biển Đài Loan', lat: 24.3, lon: 119.8 },
  { id: 'ew-baltic', name: 'Baltic / Kaliningrad', lat: 54.7, lon: 20.5 },
  { id: 'ew-black-sea', name: 'Biển Đen / Crimea', lat: 44.2, lon: 34.0 },
  { id: 'ew-levant', name: 'Đông Địa Trung Hải / Levant', lat: 34.0, lon: 35.0 },
  { id: 'ew-hormuz', name: 'Eo biển Hormuz / Vùng Vịnh', lat: 26.2, lon: 55.5 },
  { id: 'ew-red-sea', name: 'Biển Đỏ / Bab el-Mandeb', lat: 14.5, lon: 42.5 },
  { id: 'ew-korea', name: 'Bán đảo Triều Tiên / DMZ', lat: 37.9, lon: 126.8 },
];

export interface AdsbRawPointAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  nic?: number;
  nac_p?: number;
}

export function normalizeAdsbGpsJammingZone(
  zone: EwTheaterProbe,
  aircraft: AdsbRawPointAircraft[],
  now = Date.now(),
): GeoPointFeature | null {
  const airborne = aircraft.filter(
    (a) =>
      typeof a.lat === 'number' &&
      typeof a.lon === 'number' &&
      Number(a.alt_baro) >= 3_000,
  );
  if (airborne.length === 0) return null;

  const jammed = airborne.filter(
    (a) =>
      (typeof a.nic === 'number' && a.nic <= 4) ||
      (typeof a.nac_p === 'number' && a.nac_p <= 4),
  );
  if (jammed.length === 0) return null;

  const ratioPct = Math.round((jammed.length * 100) / airborne.length);
  const severity: SeverityLevel =
    ratioPct >= 25 || jammed.length >= 12
      ? 'critical'
      : ratioPct >= 10 || jammed.length >= 4
        ? 'high'
        : 'medium';

  // Compute centroid of jammed aircraft for exact spatial pinpointing
  const avgLat = jammed.reduce((s, a) => s + (a.lat ?? zone.lat), 0) / jammed.length;
  const avgLon = jammed.reduce((s, a) => s + (a.lon ?? zone.lon), 0) / jammed.length;

  return {
    id: `gpsjam:${zone.id}`,
    layer: 'gpsOutages',
    title: `Nhiễu GPS/GNSS: ${zone.name}`,
    subtitle: `${jammed.length}/${airborne.length} máy bay mất độ chính xác định vị (${ratioPct}% NIC≤4)`,
    category: 'gps_jamming',
    severity,
    lat: Number(avgLat.toFixed(4)),
    lon: Number(avgLon.toFixed(4)),
    timestamp: now,
    source: 'ADS-B Live GNSS Integrity (NIC≤4)',
    url: 'https://gpsjam.org/',
    magnitude: Math.max(2, jammed.length),
    meta: {
      theater: zone.name,
      jammedAircraft: jammed.length,
      airborneSampled: airborne.length,
      jammedRatioPct: ratioPct,
      signalType: 'GNSS / GPS Spoofing & Jamming (NIC ≤ 4)',
    },
  };
}

export interface RipeCountryWatch {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

const RIPE_BGP_WATCHLIST: readonly RipeCountryWatch[] = [
  { code: 'VN', name: 'Việt Nam (VNIX / Quốc tế)', lat: 21.03, lon: 105.85 },
  { code: 'TW', name: 'Đài Loan (Hạ tầng Cáp & BGP)', lat: 25.03, lon: 121.56 },
  { code: 'UA', name: 'Ukraine (Hạ tầng Viễn thông)', lat: 50.45, lon: 30.52 },
  { code: 'IR', name: 'Iran (Cổng Internet Quốc gia)', lat: 35.69, lon: 51.39 },
  { code: 'MM', name: 'Myanmar (Kiểm duyệt / Cắt mạng)', lat: 19.76, lon: 96.07 },
  { code: 'SD', name: 'Sudan (Gián đoạn Viễn thông)', lat: 15.5, lon: 32.56 },
];

export interface RipeRoutingPayload {
  data?: {
    stats?: Array<{
      v4_prefixes_ris?: number;
      v6_prefixes_ris?: number;
      asns_ris?: number;
      stats_date?: string;
    }>;
  };
}

export function normalizeRipeBgpCountryAnomaly(
  country: RipeCountryWatch,
  payload: RipeRoutingPayload,
  now = Date.now(),
): GeoPointFeature | null {
  const stats = payload?.data?.stats ?? [];
  if (stats.length < 2) return null;

  const latest = stats[stats.length - 1];
  const baseline = stats[0];
  const v4Now = Number(latest?.v4_prefixes_ris ?? 0);
  const v4Base = Number(baseline?.v4_prefixes_ris ?? v4Now);
  if (v4Now <= 0 || v4Base <= 0) return null;

  const dropPct = Number((((v4Base - v4Now) / v4Base) * 100).toFixed(2));
  const isOutage = dropPct >= 5;

  // Emit actual BGP anomalies (>= 5% drop) + always emit Vietnam national BGP telemetry node for domestic monitoring
  if (!isOutage && country.code !== 'VN') {
    return null;
  }

  const severity: SeverityLevel =
    dropPct >= 25 ? 'critical' : dropPct >= 8 ? 'high' : isOutage ? 'medium' : 'info';

  return {
    id: `bgp:${country.code}`,
    layer: 'gpsOutages',
    title: isOutage
      ? `Sụt giảm BGP Internet: ${country.name} (-${dropPct}%)`
      : `Định tuyến BGP Quốc gia: ${country.name}`,
    subtitle: `${v4Now.toLocaleString('en-US')} IPv4 prefixes · ${(latest?.asns_ris ?? 0).toLocaleString('en-US')} ASNs trên RIPE RIS`,
    category: isOutage ? 'bgp_outage' : 'bgp_watch',
    severity,
    lat: country.lat,
    lon: country.lon,
    timestamp: now,
    source: 'RIPE NCC Stat RIS BGP',
    url: `https://stat.ripe.net/app/launchpad/S1_${country.code}`,
    magnitude: isOutage ? Math.max(4, Math.round(dropPct)) : 2,
    meta: {
      countryCode: country.code,
      ipv4Prefixes: v4Now,
      ipv6Prefixes: Number(latest?.v6_prefixes_ris ?? 0),
      activeAsns: Number(latest?.asns_ris ?? 0),
      prefixDropPct: dropPct,
      status: isOutage ? 'BGP_PREFIX_DROP' : 'NOMINAL',
    },
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

async function fetchCloudflareOutagePosts(now: number): Promise<GeoPointFeature[]> {
  try {
    const { text } = await fetchTextWithTimeout('https://blog.cloudflare.com/tag/outage/rss/', {
      timeoutMs: 6_500,
      retries: 0,
      userAgent: DEFAULT_BROWSER_UA,
    });
    const parsed = xmlParser.parse(text) as Record<string, any>;
    const rawItems = parsed?.rss?.channel?.item ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    const out: GeoPointFeature[] = [];

    for (const entry of items.slice(0, 4)) {
      const title = String(entry?.title ?? '').trim();
      const link = String(entry?.link ?? '').trim();
      const pubTs = Date.parse(String(entry?.pubDate ?? ''));
      if (!title || !link) continue;
      // Only include outage reports from the last 45 days so map stays fresh
      if (Number.isFinite(pubTs) && now - pubTs > 45 * 86_400_000) continue;

      const geo = matchGeoLocation(title) ?? {
        name: 'Cloudflare Global Edge (San Francisco)',
        lat: 37.7749,
        lon: -122.4194,
      };

      out.push({
        id: `cf-outage:${link}`,
        layer: 'gpsOutages',
        title: `Sự cố Hạ tầng Internet: ${title}`,
        subtitle: `Báo cáo sự cố định tuyến / cáp / đám mây từ Cloudflare Radar`,
        category: 'bgp_outage',
        severity: 'high',
        lat: geo.lat,
        lon: geo.lon,
        timestamp: Number.isFinite(pubTs) ? pubTs : now,
        source: 'Cloudflare Outage Radar',
        url: link,
        magnitude: 5,
        meta: {
          region: geo.name,
          reportType: 'Internet / BGP / Cable Outage',
        },
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchGpsAndBgpOutages(): Promise<GeoPointFeature[]> {
  const now = Date.now();

  const [ewResults, ripeResults, cfOutages] = await Promise.all([
    Promise.allSettled(
      EW_THEATER_PROBES.map(async (zone) => {
        const url = `https://api.adsb.lol/v2/point/${zone.lat}/${zone.lon}/250`;
        const payload = await fetchJsonWithTimeout<{ ac?: AdsbRawPointAircraft[] }>(url, {
          timeoutMs: 7_000,
          retries: 0,
          userAgent: NAMED_APP_UA,
        });
        return normalizeAdsbGpsJammingZone(zone, payload.ac ?? [], now);
      }),
    ),
    Promise.allSettled(
      RIPE_BGP_WATCHLIST.map(async (country) => {
        const url = `https://stat.ripe.net/data/country-routing-stats/data.json?resource=${country.code}`;
        const payload = await fetchJsonWithTimeout<RipeRoutingPayload>(url, {
          timeoutMs: 7_000,
          retries: 0,
          userAgent: NAMED_APP_UA,
        });
        return normalizeRipeBgpCountryAnomaly(country, payload, now);
      }),
    ),
    fetchCloudflareOutagePosts(now),
  ]);

  const features: GeoPointFeature[] = [];
  for (const r of ewResults) {
    if (r.status === 'fulfilled' && r.value) features.push(r.value);
  }
  for (const r of ripeResults) {
    if (r.status === 'fulfilled' && r.value) features.push(r.value);
  }
  features.push(...cfOutages);

  return features;
}
