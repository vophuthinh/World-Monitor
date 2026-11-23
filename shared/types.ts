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
  isForecast?: boolean;
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
  ma50?: number;
  ma200?: number;
  rsi14?: number;
  peRatio?: number;
  pbRatio?: number;
  close52wLow?: number;
  close52wHigh?: number;
  volumeVs90dRatio?: number;
  valuationSource?: string;
  valuationRetained?: boolean;
  valuationFetchedAt?: number;
  retained?: boolean;
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
  ma50?: number;
  ma200?: number;
  rsi14?: number;
  updatedAt: number;
  retained?: boolean;
}

export interface FredMacroMetric {
  id: string;
  label: string;
  subtitle: string;
  value: number;
  change: number;
  delta4w?: number;
  zScore?: number;
  unit: string;
  date: string;
  frequency?: 'monthly';
  pillar?: 'growth' | 'inflation' | 'monetary' | 'market' | 'leading';
  benchmarkLabel?: string;
  benchmarkValue?: number;
  avg3Observations?: number;
  avg12Observations?: number;
  trendSlope?: number;
  alertBadge?: string;
  source?: string;
  fetchedAt?: number;
  retained?: boolean;
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
  gdpPrevPct?: number | null;
  gdpGrowthYear: number | null;
  gdpCurrentUsd: number | null;
  gdpCurrentYear: number | null;
  cpiInflationPct: number | null;
  cpiPrevPct?: number | null;
  cpiYear: number | null;
  manufacturingGrowthPct?: number | null;
  manufacturingYear?: number | null;
  exportsPctGdp?: number | null;
  exportsYear?: number | null;
  fdiPctGdp?: number | null;
  fdiYear?: number | null;
  unemploymentPct?: number | null;
  unemploymentYear?: number | null;
  currentAccountPctGdp?: number | null;
  currentAccountYear?: number | null;
  creditPctGdp?: number | null;
  creditYear?: number | null;
  realInterestRatePct?: number | null;
  realInterestYear?: number | null;
  retained?: boolean;
}

export type EconomicRegime =
  | 'soft_landing'
  | 'overheating'
  | 'early_slowdown'
  | 'stagflation_risk';

export type MacroQuadrant =
  | 'Q1_GOLDILOCKS'
  | 'Q2_REFLATION'
  | 'Q3_STAGFLATION'
  | 'Q4_DEFLATION';

export interface MacroPillarMetric {
  id: string;
  name: string;
  actual: number;
  unit: string;
  benchmarkLabel: string;
  benchmarkValue: number;
  deltaVsBenchmark: number;
  zScore?: number;
  trendSlope?: number;
  trendLabel?: string;
  periodLabel: string;
  sourceLabel?: string;
  retained?: boolean;
  fetchedAt?: number;
  status: 'good' | 'watch' | 'warn';
}

export interface MacroPillarGroup {
  id: 'growth' | 'inflation' | 'monetary';
  title: string;
  score: number;
  metrics: MacroPillarMetric[];
}

export interface ExpiredMacroMetricNotice {
  id: string;
  label: string;
  sourceLabel: string;
  periodLabel?: string;
  lastValueLabel?: string;
  fetchedAt?: number;
}

export interface EconomyHealthReport {
  id: 'VN' | 'US';
  title: string;
  subtitle: string;
  compositeScore: number;
  regime?: EconomicRegime;
  regimeLabel: string;
  regimeSummary: string;
  quadrant?: MacroQuadrant;
  quadrantLabel?: string;
  growthZ?: number;
  inflationZ?: number;
  recessionProb12m?: number;
  pillars: MacroPillarGroup[];
  expiredMetrics?: ExpiredMacroMetricNotice[];
  warningFlags: Array<{
    severity: 'critical' | 'warn' | 'good';
    text: string;
  }>;
}

export type InvestmentStance =
  | 'risk_on'
  | 'selective_growth'
  | 'cautious'
  | 'defensive_recession';

export interface LeadingCompassSignal {
  id: string;
  label: string;
  category:
    | 'liquidity'
    | 'credit_rates'
    | 'cycle_tech'
    | 'recession_watch'
    | 'market_trend'
    | 'valuation_breadth';
  valueDisplay: string;
  subtext: string;
  signalBadge: string;
  tone: 'bullish' | 'neutral' | 'bearish';
}

export interface PortfolioAllocationSlice {
  id: 'equities' | 'cash_bonds' | 'gold' | 'crypto';
  label: string;
  weightPct: number;
  note: string;
  colorHex: string;
}

export type VietnamMacroPulseFieldKey =
  | 'vn10yYieldPct'
  | 'interbankRatePct'
  | 'sbvPolicyRatePct'
  | 'monthlyCpiPct'
  | 'ytdAvgCpiPct'
  | 'ytdCoreCpiPct'
  | 'manufacturingPmi'
  | 'quarterlyGdpPct'
  | 'tradeBalanceBillionUsd'
  | 'ytdTradeBalanceBillionUsd'
  | 'vcbSellUsdVnd'
  | 'sp500PeRatio';

export interface MacroFieldMeta {
  source: string;
  period?: string;
  fetchedAt: number;
  retained?: boolean;
}

export interface VietnamLiveMacroPulse {
  vn10yYieldPct?: number;
  interbankRatePct?: number;
  sbvPolicyRatePct?: number;
  monthlyCpiPct?: number;
  monthlyCpiPrevPct?: number;
  ytdAvgCpiPct?: number;
  ytdCoreCpiPct?: number;
  ytdCpiMonths?: number;
  manufacturingPmi?: number;
  manufacturingPmiPrev?: number;
  quarterlyGdpPct?: number;
  quarterlyGdpPrevPct?: number;
  tradeBalanceBillionUsd?: number;
  ytdTradeBalanceBillionUsd?: number;
  vcbSellUsdVnd?: number;
  sp500PeRatio?: number;
  fieldMeta?: Partial<Record<VietnamMacroPulseFieldKey, MacroFieldMeta>>;
  updatedAt: number;
}

export interface CompassFactorPillar {
  id: 'liquidity' | 'credit_recession' | 'valuation_erp' | 'trend_breadth' | 'fx_volatility';
  label: string;
  weightPct: number;
  score: number;
  hasData?: boolean;
  inputCount?: number;
}

export interface SectorRotationRecommendation {
  quadrant: MacroQuadrant;
  phaseTitle: string;
  leadingSectors: string[];
  laggingSectors: string[];
}

export interface InvestmentCompassReport {
  riskAppetiteScore: number;
  stance: InvestmentStance;
  stanceLabel: string;
  summary: string;
  netLiquidityBillions?: number;
  netLiquidityDelta4wBillions?: number;
  recessionProb12m?: number;
  vnIndexPe?: number;
  vnErpPct?: number;
  usErpPct?: number;
  vnUsYieldSpreadBps?: number;
  polymarketFedSummary?: string;
  vnBreadthMa50Pct?: number;
  vnBreadthMa200Pct?: number;
  vixTermRatio?: number;
  capitulationSignal?: boolean;
  capitulationLabel?: string;
  dualConfirmation?: 'confirmed_bull' | 'macro_bull_trend_weak' | 'macro_weak_trend_bull' | 'confirmed_bear';
  dualConfirmationLabel?: string;
  factorPillars?: CompassFactorPillar[];
  sectorRotation?: SectorRotationRecommendation;
  allocations: PortfolioAllocationSlice[];
  favoredAssets: string[];
  watchAssets: string[];
  avoidAssets: string[];
  signals: LeadingCompassSignal[];
}

export interface MarketSnapshot {
  quotes: MarketQuote[];
  crypto: CryptoQuote[];
  fearGreed: FearGreedSnapshot | null;
  macro: MacroCountryIndicator[];
  vnGold?: VnGoldQuote[];
  vn30?: Vn30StockQuote[];
  fred?: FredMacroMetric[];
  vnMacroPulse?: VietnamLiveMacroPulse;
  expiredMacroNotices?: { vn: ExpiredMacroMetricNotice[]; us: ExpiredMacroMetricNotice[] };
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
  tempMinC?: number;
  tempMaxC?: number;
  humidityPct?: number;
  precipMm?: number;
  rainProbPct?: number;
  uvIndex?: number;
  windKmh: number;
  windGustKmh: number;
  windDirDeg?: number;
  windDirLabel?: string;
  beaufortScale: number;
  waveHeightM?: number;
  wavePeriodS?: number;
  weatherCode: number;
  weatherLabel: string;
  stormWarning: boolean;
  usAqi?: number;
  pm25?: number;
  aqiBand?: AqiBand;
}

export interface VietnamWeatherAlert {
  id: string;
  title: string;
  badge: string;
  severity: 'critical' | 'high' | 'medium';
  source: string;
  publishedAt: number;
  url: string;
}

export interface VietnamEnvSnapshot {
  locations: VietnamEnvLocation[];
  alerts?: VietnamWeatherAlert[];
  maxSeaGustKmh: number;
  maxWaveHeightM?: number;
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

export type GitHubTrendingPeriod = 'daily' | 'weekly';

export interface GitHubTrendingRepo {
  id: string;
  rank: number;
  fullName: string;
  owner: string;
  repoName: string;
  description: string;
  descriptionVi?: string;
  language?: string;
  languageColor?: string;
  totalStars: number;
  forks: number;
  periodStars: number;
  period: GitHubTrendingPeriod;
  url: string;
}

export interface TechCyberSnapshot {
  items: TechCyberItem[];
  infraStatus: TechInfraStatus[];
  githubTrending?: {
    daily: GitHubTrendingRepo[];
    weekly: GitHubTrendingRepo[];
  };
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
  aiSummarized?: boolean;
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

export interface RegimeHistoryPoint {
  date: string;
  vnMacroScore?: number;
  usMacroScore?: number;
  compassScore: number;
  vnIndexPrice?: number;
  vnIndexPe?: number;
  quadrant?: MacroQuadrant;
  stance: InvestmentStance;
  equitiesWeightPct: number;
  reconstructed?: boolean;
  observedAt?: number;
}

export interface MarketCatalystEvent {
  id: string;
  title: string;
  region: 'VN' | 'US';
  category: 'fomc' | 'derivatives_etf' | 'inflation_gdp';
  dateIso: string;
  dateLabel: string;
  daysUntil: number;
  impactNote: string;
  urgency: 'imminent' | 'soon' | 'scheduled';
  estimated?: boolean;
}

export interface ChokepointMarketImpact {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  disruptionScore: number;
  status: 'critical' | 'elevated' | 'normal';
  statusLabel: string;
  airCount: number;
  seaCount: number;
  conflictCount: number;
  polymarketNote?: string;
  commodityImpact: string;
  vnStockImpact: string;
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
  regimeHistory?: RegimeHistoryPoint[];
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
  fred: FredMacroMetric[];
  vnMacroPulse?: VietnamLiveMacroPulse;
  expiredMacroNotices?: { vn: ExpiredMacroMetricNotice[]; us: ExpiredMacroMetricNotice[] };
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
