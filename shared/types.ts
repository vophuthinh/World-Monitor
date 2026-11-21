export type MapLayerId =
  | 'military'
  | 'vessels'
  | 'earthquakes'
  | 'natural'
  | 'geopolitics'
  | 'chokepoints'
  | 'nuclear'
  | 'financeCenters'
  | 'cables'
  | 'weatherRadar';

export type PointLayerId = Exclude<MapLayerId, 'cables' | 'weatherRadar'> | 'sovereignty';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical' | 'info';

export type TimeWindow = '6h' | '24h' | '7d' | 'all';

export type BasemapTheme = 'dark-matter' | 'voyager' | 'positron';

export type CollectorId =
  | 'military-flights'
  | 'maritime-vessels'
  | 'earthquakes'
  | 'natural-events'
  | 'geopolitics-gdelt'
  | 'weather-radar'
  | 'markets-crypto'
  | 'macro-worldbank'
  | 'polymarket'
  | 'rss-news';

export interface GeoPointFeature {
  id: string;
  layer: PointLayerId;
  title: string;
  subtitle?: string;
  category: string;
  severity: SeverityLevel;
  lat: number;
  lon: number;
  timestamp: number; // Unix ms (0 for timeless static registries)
  source: string;
  url?: string;
  heading?: number;
  magnitude?: number;
  meta: Record<string, string | number | boolean | null>;
}

export interface CableLandingPoint {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface GeoLineFeature {
  id: string;
  layer: 'cables';
  name: string;
  category: string;
  severity: SeverityLevel;
  /** Antimeridian-safe MultiLineString segments: array of [lon, lat][] polylines */
  coordinates: [number, number][][];
  rfsYear?: number;
  owners: string[];
  landingPoints: CableLandingPoint[];
  vietnamConnected: boolean;
  source: string;
}

export type InspectableFeature =
  | { kind: 'point'; feature: GeoPointFeature }
  | { kind: 'cable'; feature: GeoLineFeature };

export interface VietnamArchipelagoZone {
  id: string;
  name: string;
  province: string;
  labelLat: number;
  labelLon: number;
  /** Closed [lon, lat][] polygon ring */
  polygon: [number, number][];
}

export interface VietnamSeaLabel {
  id: string;
  name: string;
  subtitle?: string;
  lat: number;
  lon: number;
  minZoom: number;
}

export interface StaticGeoBundle {
  chokepoints: GeoPointFeature[];
  nuclear: GeoPointFeature[];
  financeCenters: GeoPointFeature[];
  cables: GeoLineFeature[];
  vietnamSovereignty: GeoPointFeature[];
  vietnamZones: VietnamArchipelagoZone[];
  vietnamSeaLabels: VietnamSeaLabel[];
}

export interface WeatherRadarFrame {
  time: number; // Unix seconds
  path: string;
  tileUrlTemplate: string;
}

export interface WeatherRadarSnapshot {
  host: string;
  path: string;
  tileUrlTemplate: string;
  frameTime: number; // Unix seconds
  generatedAt: number; // Unix ms
  pastFrames: WeatherRadarFrame[];
}

export interface MarketQuote {
  symbol: string;
  name: string;
  group: 'index' | 'commodity' | 'fx';
  price: number;
  changePercent24h: number;
  unit?: string;
  updatedAt: number;
  source: string;
}

export interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  changePercent24h: number;
  marketCapUsd: number;
  volume24hUsd: number;
  updatedAt: number;
}

export interface FearGreedSnapshot {
  value: number;
  classification: string;
  updatedAt: number;
}

export interface MacroCountryIndicator {
  countryCode: string;
  countryName: string;
  regionLabel: string;
  isVietnam?: boolean;
  gdpGrowthPct: number | null;
  gdpGrowthYear: number | null;
  gdpCurrentUsd: number | null;
  gdpCurrentYear: number | null;
  cpiInflationPct: number | null;
  cpiYear: number | null;
}

export interface MarketSnapshot {
  quotes: MarketQuote[];
  crypto: CryptoQuote[];
  fearGreed: FearGreedSnapshot | null;
  macro: MacroCountryIndicator[];
  updatedAt: number;
}

export type PredictionCategory = 'geopolitics' | 'finance' | 'crypto_tech';

export interface PredictionItem {
  id: string;
  title: string;
  category: PredictionCategory;
  yesPercent: number;
  volumeUsd: number;
  liquidityUsd: number;
  endDate: string | null;
  url: string;
}

export type NewsCategory = 'world' | 'finance' | 'vietnam';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: NewsCategory;
  publishedAt: number;
  url: string;
  matchedLat?: number;
  matchedLon?: number;
  matchedLocation?: string;
}

export type SourceHealthStatus = 'ok' | 'stale' | 'warming' | 'error';

export interface SourceHealth {
  id: CollectorId;
  label: string;
  status: SourceHealthStatus;
  itemCount: number;
  intervalMs: number;
  retainMs: number;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  retainedUntil: number | null;
  consecutiveFailures: number;
  firstFailureAt: number | null;
  lastError: string | null;
}

export interface TheaterViewPreset {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  zoom: number;
  highlight?: boolean;
  description: string;
}

export interface LiveDynamicLayers {
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes: GeoPointFeature[];
  natural: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
}

export interface BootstrapResponse {
  serverTime: number;
  layers: LiveDynamicLayers;
  staticGeo: StaticGeoBundle;
  weatherRadar: WeatherRadarSnapshot | null;
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  news: NewsItem[];
  theaters: TheaterViewPreset[];
  health: SourceHealth[];
  aisStreamConfigured?: boolean;
}

export interface LiveFastResponse {
  serverTime: number;
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes: GeoPointFeature[];
  weatherRadar: WeatherRadarSnapshot | null;
  quotes: MarketQuote[];
  crypto: CryptoQuote[];
  fearGreed: FearGreedSnapshot | null;
  health: SourceHealth[];
}

export interface LivePriceTick {
  symbol: string; // e.g. 'BTC', 'ETH', 'SOL', 'Gold'
  price: number;
  changePercent24h: number;
  volume24hUsd?: number;
}

export interface BreakingAlertItem {
  id: string;
  severity: 'high' | 'critical';
  badge: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  timestamp: number;
}

export type RealtimeServerEvent =
  | {
      type: 'connected';
      serverTime: number;
      aisStreamConfigured: boolean;
    }
  | {
      type: 'price_tick';
      ticks: LivePriceTick[];
      ts: number;
    }
  | {
      type: 'military_update';
      military: GeoPointFeature[];
      ts: number;
    }
  | {
      type: 'vessels_update';
      vessels: GeoPointFeature[];
      ts: number;
    }
  | {
      type: 'collector_sync';
      collectorId: CollectorId;
      health: SourceHealth[];
      ts: number;
    }
  | {
      type: 'breaking_alert';
      alert: BreakingAlertItem;
    };
