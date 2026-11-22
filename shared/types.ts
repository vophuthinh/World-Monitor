export type MapLayerId =
  | 'military'
  | 'vessels'
  | 'cyberThreats'
  | 'cyberArcs'
  | 'gpsOutages'
  | 'earthquakes'
  | 'natural'
  | 'geopolitics'
  | 'militaryBases'
  | 'aiDatacenters'
  | 'chokepoints'
  | 'nuclear'
  | 'financeCenters'
  | 'cables'
  | 'weatherRadar';

export type PointLayerId = Exclude<MapLayerId, 'cables' | 'cyberArcs' | 'weatherRadar'> | 'sovereignty';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical' | 'info';

export type TimeWindow = '6h' | '24h' | '7d' | 'all';

export type BasemapTheme = 'dark-matter' | 'voyager' | 'positron';

export type CollectorId =
  | 'military-flights'
  | 'maritime-vessels'
  | 'cyber-threats'
  | 'gps-outages'
  | 'earthquakes'
  | 'natural-events'
  | 'geopolitics-gdelt'
  | 'weather-radar'
  | 'vietnam-env'
  | 'markets-crypto'
  | 'macro-worldbank'
  | 'polymarket'
  | 'google-trends'
  | 'rss-news'
  | 'tech-cyber'
  | 'policy-legal'
  | 'hpt-intel'
  | 'ai-sitrep';

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
  militaryBases: GeoPointFeature[];
  aiDatacenters: GeoPointFeature[];
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
  sparkline?: number[];
  updatedAt: number;
  source: string;
}

export interface VnGoldQuote {
  code: string;
  name: string;
  buyPerLuongMillionVnd: number;
  sellPerLuongMillionVnd: number;
  spreadMillionVnd: number;
  changeBuyPercent: number;
  changeSellPercent: number;
  worldParityPerLuongMillionVnd?: number;
  premiumVsWorldMillionVnd?: number;
  updatedLabel?: string;
  updatedAt: number;
  source: string;
}

export interface Vn30StockQuote {
  symbol: string;
  name: string;
  sector: string;
  priceThousandVnd: number;
  changePercent: number;
  volume: number;
  sparkline: number[];
  updatedAt: number;
}

export interface FredMacroMetric {
  id: string;
  label: string;
  subtitle: string;
  value: number;
  change: number;
  unit: string;
  date: string;
  alertBadge?: string;
  sparkline: number[];
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
  vnGold?: VnGoldQuote[];
  vn30?: Vn30StockQuote[];
  fred?: FredMacroMetric[];
  updatedAt: number;
}

export type AqiBand = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'hazardous';

export interface VietnamEnvLocation {
  id: string;
  name: string;
  region: 'mainland' | 'maritime';
  lat: number;
  lon: number;
  tempC: number;
  windKmh: number;
  windGustKmh: number;
  beaufortScale: number;
  weatherCode: number;
  weatherLabel: string;
  stormWarning: boolean;
  usAqi?: number;
  pm25?: number;
  aqiBand?: AqiBand;
}

export interface VietnamEnvSnapshot {
  locations: VietnamEnvLocation[];
  maxSeaGustKmh: number;
  worstAqiCity?: string;
  worstAqi?: number;
  updatedAt: number;
}

export interface AiSitrepBullet {
  tag: string;
  text: string;
}

export interface AiSitrepSnapshot {
  headline: string;
  bullets: AiSitrepBullet[];
  provider: 'groq-lpu' | 'gemini' | 'deterministic';
  model: string;
  latencyMs: number;
  generatedAt: number;
}

export interface AiAskResponse {
  question: string;
  answer: string;
  provider: 'groq-lpu' | 'gemini' | 'deterministic';
  model: string;
  latencyMs: number;
  answeredAt: number;
}

export type HptItemCategory =
  | 'exchange_filing' // HNX / UBCKNN / HĐQT / Cổ tức / Cổ đông nội bộ
  | 'bidding_project' // Đấu thầu (MST 0301447436 / Báo Đấu thầu / Ngân hàng / Bộ ngành)
  | 'it_press_partner' // Báo CNTT (ICT/VietNamNet/VnEconomy Số/ATTT) + VINASA/VNISA + IBM/Microsoft/Cisco
  | 'press_social'; // Bing News, Báo Mới, F319/F247/Voz, Pháp lý/Thuế/SHTT

export type HptSentiment = 'positive' | 'negative' | 'neutral';

export interface HptCompanyItem {
  id: string;
  title: string;
  category: HptItemCategory;
  badge: string;
  source: string;
  publishedAt: number;
  dateLabel?: string;
  url: string;
  pdfUrl?: string;
  sentiment: HptSentiment;
  aiSummary?: string;
  aiVerified?: boolean;
}

export interface HptFundamentals {
  taxCode: '0301447436';
  peRatio?: number;
  pbRatio?: number;
  marketCapBillionVnd?: number;
  freeFloatPct?: number;
  dividendYieldPct?: number;
  ytdChangePct?: number;
  oneYearChangePct?: number;
  ceilingThousandVnd?: number;
  floorThousandVnd?: number;
  refThousandVnd?: number;
  taSignal?: string;
}

export interface HptStockSnapshot {
  symbol: 'HPT';
  exchange: 'UPCoM · HNX';
  companyName: string;
  priceThousandVnd: number;
  changePercent: number;
  volume: number;
  highThousandVnd?: number;
  lowThousandVnd?: number;
  sparkline: number[];
  fundamentals?: HptFundamentals;
  hqLat: number;
  hqLon: number;
  updatedAt: number;
}

export interface HptCompanyIntelSnapshot {
  stock: HptStockSnapshot | null;
  items: HptCompanyItem[];
  sourceCount: number;
  aiSentimentEnabled: boolean;
  updatedAt: number;
}

export type PredictionCategory = 'geopolitics' | 'finance' | 'crypto_tech';

export interface PredictionItem {
  id: string;
  title: string;
  titleVi?: string;
  category: PredictionCategory;
  yesPercent: number;
  outcomeLabel?: string;
  volumeUsd: number;
  volume24hUsd?: number;
  change24hPct?: number;
  clobTokenId?: string;
  liquidityUsd: number;
  endDate: string | null;
  url: string;
  updatedAt?: number;
}

export type GoogleTrendGeo = 'VN' | 'GLOBAL';

export interface GoogleTrendItem {
  id: string;
  rank: number;
  query: string;
  approxTraffic: string;
  trafficScore: number;
  geo: GoogleTrendGeo;
  publishedAt: number;
  trendUrl: string;
  pictureUrl?: string;
  topNewsTitle?: string;
  topNewsTitleVi?: string;
  topNewsSource?: string;
  topNewsUrl?: string;
  matchedLat?: number;
  matchedLon?: number;
  matchedLocation?: string;
}

export interface GoogleTrendsSnapshot {
  vn: GoogleTrendItem[];
  global: GoogleTrendItem[];
  updatedAt: number;
}

export type NewsCategory = 'world' | 'finance' | 'vietnam' | 'tech' | 'osint_live';

export type NewsStreamSource =
  | 'rss'
  | 'gdelt'
  | 'wikimedia'
  | 'hackernews'
  | 'reddit'
  | 'snapi';

export interface NewsItem {
  id: string;
  title: string;
  titleVi?: string;
  source: string;
  category: NewsCategory;
  streamSource?: NewsStreamSource;
  isLiveStream?: boolean;
  publishedAt: number;
  url: string;
  matchedLat?: number;
  matchedLon?: number;
  matchedLocation?: string;
}

export interface NewsStreamStats {
  wikimediaConnected: boolean;
  wikimediaCount: number;
  gdeltCount: number;
  hnCount: number;
  redditCount: number;
  snapiCount: number;
  rssCount: number;
}

export type TechSubCategory = 'ai' | 'github_release' | 'cyber' | 'tech_infra' | 'vn_tech';

export interface MitreTechniqueTag {
  id: string; // e.g. 'T1190'
  name: string; // e.g. 'Exploit Public App'
}

export interface TechCyberItem {
  id: string;
  title: string;
  titleVi?: string;
  source: string;
  subCategory: TechSubCategory;
  severity?: SeverityLevel;
  cveId?: string;
  cvssScore?: number;
  mitreTtps?: MitreTechniqueTag[];
  publishedAt: number;
  url: string;
  matchedLat?: number;
  matchedLon?: number;
  matchedLocation?: string;
}

export interface IocLookupResult {
  kind: 'ip' | 'cve';
  query: string;
  riskLevel: SeverityLevel;
  // IP fields (Shodan InternetDB + Geo/ASN)
  ports?: number[];
  vulns?: string[];
  cpes?: string[];
  hostnames?: string[];
  tags?: string[];
  country?: string;
  city?: string;
  org?: string;
  // CVE fields (NIST NVD 2.0)
  cvssScore?: number;
  cvssSeverity?: string;
  vectorString?: string;
  description?: string;
  descriptionVi?: string;
  publishedAt?: string;
  referenceUrl: string;
}

export type InfraStatusLevel = 'operational' | 'degraded' | 'outage';

export interface TechInfraStatus {
  name: string;
  level: InfraStatusLevel;
  description: string;
  url: string;
}

export interface TechCyberSnapshot {
  items: TechCyberItem[];
  infraStatus: TechInfraStatus[];
  activeSourceCount: number;
  updatedAt: number;
}

export type LegalDocType =
  | 'nq_tw_cp'
  | 'nghi_dinh'
  | 'luat_qh'
  | 'quyet_dinh_tt'
  | 'phan_tich';

export interface PolicyLegalItem {
  id: string;
  title: string;
  docCode?: string;
  docType: LegalDocType;
  typeBadge: string;
  sector: string;
  source: string;
  issuedDate?: string;
  publishedAt: number;
  url: string;
  pdfUrl?: string;
  isMost?: boolean;
  pillarResolution?: '57' | '59' | '66' | '68';
  highlights: string[];
}

export interface PolicyLegalSnapshot {
  items: PolicyLegalItem[];
  activeSourceCount: number;
  aiSummaryEnabled: boolean;
  updatedAt: number;
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
  cyberThreats: GeoPointFeature[];
  gpsOutages?: GeoPointFeature[];
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
  newsStreamStats?: NewsStreamStats;
  techCyber?: TechCyberSnapshot;
  policyLegal?: PolicyLegalSnapshot;
  googleTrends?: GoogleTrendsSnapshot;
  vietnamEnv?: VietnamEnvSnapshot;
  hptIntel?: HptCompanyIntelSnapshot;
  aiSitrep?: AiSitrepSnapshot;
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
  predictions?: PredictionItem[];
  googleTrends?: GoogleTrendsSnapshot | null;
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
    }
  | {
      type: 'news_prepend';
      items: NewsItem[];
      stats: NewsStreamStats;
      ts: number;
    }
  | {
      type: 'polymarket_update';
      predictions: PredictionItem[];
      flashedIds?: Record<string, 'up' | 'down'>;
      ts: number;
    }
  | {
      type: 'google_trends_update';
      googleTrends: GoogleTrendsSnapshot;
      ts: number;
    };
