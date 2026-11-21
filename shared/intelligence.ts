import type { GeoPointFeature, NewsItem, PredictionItem, TechCyberItem } from './types';

export type PostureLevel = 'NORMAL' | 'ELEVATED' | 'CRITICAL';

export interface TheaterPostureSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  posture: PostureLevel;
  score: number;
  airCount: number;
  seaCount: number;
  conflictCount: number;
  cyberCount: number;
}

interface TheaterBoxSpec {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  bbox: [number, number, number, number]; // [latMin, lonMin, latMax, lonMax]
}

const THEATER_SPECS: readonly TheaterBoxSpec[] = [
  {
    id: 'east-sea',
    name: 'Biển Đông & Việt Nam',
    lat: 14.5,
    lon: 111.5,
    zoom: 4.8,
    bbox: [3.0, 102.0, 23.2, 121.2],
  },
  {
    id: 'taiwan-strait',
    name: 'Eo biển Đài Loan',
    lat: 24.2,
    lon: 120.5,
    zoom: 5.8,
    bbox: [21.0, 116.5, 27.5, 124.5],
  },
  {
    id: 'hormuz-gulf',
    name: 'Eo biển Hormuz & Vịnh Ba Tư',
    lat: 26.2,
    lon: 55.2,
    zoom: 5.3,
    bbox: [22.0, 47.5, 31.5, 60.5],
  },
  {
    id: 'red-sea-levant',
    name: 'Biển Đỏ · Bab el-Mandeb · Levant',
    lat: 21.5,
    lon: 39.2,
    zoom: 4.6,
    bbox: [11.0, 31.0, 36.5, 45.5],
  },
  {
    id: 'eastern-europe',
    name: 'Đông Âu & Biển Đen',
    lat: 47.8,
    lon: 33.5,
    zoom: 4.7,
    bbox: [41.0, 21.0, 56.5, 42.5],
  },
  {
    id: 'korean-peninsula',
    name: 'Bán đảo Triều Tiên & Nhật Bản',
    lat: 37.5,
    lon: 128.5,
    zoom: 5.2,
    bbox: [32.0, 123.5, 43.0, 141.5],
  },
];

function inBbox(pt: { lat: number; lon: number }, bbox: [number, number, number, number]): boolean {
  return pt.lat >= bbox[0] && pt.lat <= bbox[2] && pt.lon >= bbox[1] && pt.lon <= bbox[3];
}

export function computeTheaterPostures(input: {
  military: readonly GeoPointFeature[];
  vessels: readonly GeoPointFeature[];
  geopolitics: readonly GeoPointFeature[];
  cyberThreats: readonly GeoPointFeature[];
}): TheaterPostureSummary[] {
  return THEATER_SPECS.map((spec) => {
    const airInBox = input.military.filter((f) => inBbox(f, spec.bbox));
    const seaInBox = input.vessels.filter((f) => inBbox(f, spec.bbox));
    const conflictInBox = input.geopolitics.filter((f) => inBbox(f, spec.bbox));
    const cyberInBox = input.cyberThreats.filter((f) => inBbox(f, spec.bbox));

    let specialAirBoost = 0;
    for (const f of airInBox) {
      if (f.category === 'bomber' || f.category === 'awacs' || f.category === 'recon' || f.category === 'drone') {
        specialAirBoost += 7;
      }
    }
    const navalPatrolCount = seaInBox.filter((s) => s.category === 'naval_patrol').length;
    const criticalConflictCount = conflictInBox.filter((c) => c.severity === 'critical' || c.severity === 'high').length;

    const rawScore =
      airInBox.length * 3.5 +
      specialAirBoost +
      navalPatrolCount * 8 +
      Math.min(18, seaInBox.length * 0.08) +
      conflictInBox.length * 4.5 +
      criticalConflictCount * 5 +
      cyberInBox.length * 2.5;

    const score = Math.min(98, Math.max(12, Math.round(rawScore)));
    const posture: PostureLevel = score >= 65 ? 'CRITICAL' : score >= 36 ? 'ELEVATED' : 'NORMAL';

    return {
      id: spec.id,
      name: spec.name,
      lat: spec.lat,
      lon: spec.lon,
      zoom: spec.zoom,
      posture,
      score,
      airCount: airInBox.length,
      seaCount: seaInBox.length,
      conflictCount: conflictInBox.length,
      cyberCount: cyberInBox.length,
    };
  });
}

export type CiiBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export interface CountryInstabilityEntry {
  code: string;
  name: string;
  lat: number;
  lon: number;
  score: number;
  band: CiiBand;
  isVietnam?: boolean;
  conflictComponent: number;
  militaryComponent: number;
  cyberComponent: number;
  newsComponent: number;
}

interface CountryRiskSeed {
  code: string;
  name: string;
  baseline: number;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  keywords: RegExp;
  isVietnam?: boolean;
}

const COUNTRY_RISK_SEEDS: readonly CountryRiskSeed[] = [
  {
    code: 'VN',
    name: 'Việt Nam',
    baseline: 16,
    lat: 16.0,
    lon: 108.0,
    bbox: [8.0, 102.0, 23.5, 115.0],
    keywords: /\b(việt nam|vietnam|hà nội|hanoi)\b/i,
    isVietnam: true,
  },
  {
    code: 'UA',
    name: 'Ukraine',
    baseline: 82,
    lat: 49.0,
    lon: 31.4,
    bbox: [44.0, 22.0, 52.5, 40.5],
    keywords: /\b(ukraine|kyiv|kharkiv|odesa|donetsk)\b/i,
  },
  {
    code: 'IL',
    name: 'Israel / Levant',
    baseline: 76,
    lat: 31.8,
    lon: 35.0,
    bbox: [29.5, 34.0, 34.5, 36.5],
    keywords: /\b(israel|gaza|tel aviv|jerusalem|hezbollah|lebanon)\b/i,
  },
  {
    code: 'IR',
    name: 'Iran',
    baseline: 71,
    lat: 32.4,
    lon: 53.7,
    bbox: [25.0, 44.0, 39.8, 63.3],
    keywords: /\b(iran|tehran|hormuz|natanz|irgc)\b/i,
  },
  {
    code: 'RU',
    name: 'Nga (Russia)',
    baseline: 68,
    lat: 55.75,
    lon: 37.62,
    bbox: [41.2, 27.0, 70.0, 145.0],
    keywords: /\b(russia|moscow|kremlin|nga)\b/i,
  },
  {
    code: 'MM',
    name: 'Myanmar',
    baseline: 69,
    lat: 19.76,
    lon: 96.07,
    bbox: [9.8, 92.2, 28.5, 101.2],
    keywords: /\b(myanmar|yangon|mandalay)\b/i,
  },
  {
    code: 'KP',
    name: 'Triều Tiên (DPRK)',
    baseline: 64,
    lat: 39.03,
    lon: 125.75,
    bbox: [37.7, 124.2, 43.0, 130.7],
    keywords: /\b(north korea|dprk|pyongyang|triều tiên|lazarus)\b/i,
  },
  {
    code: 'TW',
    name: 'Đài Loan (Taiwan)',
    baseline: 48,
    lat: 23.8,
    lon: 121.0,
    bbox: [21.8, 119.5, 25.5, 122.3],
    keywords: /\b(taiwan|taipei|đài loan|tsmc)\b/i,
  },
  {
    code: 'CN',
    name: 'Trung Quốc',
    baseline: 38,
    lat: 35.86,
    lon: 104.19,
    bbox: [18.2, 73.5, 53.5, 134.8],
    keywords: /\b(china|beijing|trung quốc|pla|bắc kinh)\b/i,
  },
  {
    code: 'PH',
    name: 'Philippines',
    baseline: 36,
    lat: 14.6,
    lon: 120.98,
    bbox: [5.0, 117.0, 19.5, 126.6],
    keywords: /\b(philippines|manila|luzon)\b/i,
  },
  {
    code: 'US',
    name: 'Hoa Kỳ',
    baseline: 29,
    lat: 38.9,
    lon: -77.04,
    bbox: [24.5, -125.0, 49.5, -66.9],
    keywords: /\b(united states|pentagon|washington|white house|fed\b|hoa kỳ)\b/i,
  },
  {
    code: 'SG',
    name: 'Singapore',
    baseline: 12,
    lat: 1.35,
    lon: 103.82,
    bbox: [1.15, 103.6, 1.48, 104.1],
    keywords: /\b(singapore)\b/i,
  },
];

function scoreToBand(score: number): CiiBand {
  if (score >= 75) return 'CRITICAL';
  if (score >= 58) return 'HIGH';
  if (score >= 40) return 'ELEVATED';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

export function computeCountryInstabilityScores(input: {
  geopolitics: readonly GeoPointFeature[];
  military: readonly GeoPointFeature[];
  cyberThreats: readonly GeoPointFeature[];
  news: readonly NewsItem[];
}): CountryInstabilityEntry[] {
  const rows = COUNTRY_RISK_SEEDS.map((seed) => {
    const conflicts = input.geopolitics.filter((g) => inBbox(g, seed.bbox)).length;
    const mil = input.military.filter((m) => inBbox(m, seed.bbox)).length;
    const cyber = input.cyberThreats.filter((c) => inBbox(c, seed.bbox)).length;
    const newsMentions = input.news.filter((n) =>
      seed.keywords.test(`${n.title} ${n.titleVi ?? ''} ${n.matchedLocation ?? ''}`),
    ).length;

    const conflictComponent = Math.min(100, seed.baseline + conflicts * 6);
    const militaryComponent = Math.min(100, Math.round(seed.baseline * 0.65 + Math.min(45, mil * 2.2)));
    const cyberComponent = Math.min(100, Math.round(seed.baseline * 0.5 + cyber * 5));
    const newsComponent = Math.min(100, Math.round(seed.baseline * 0.55 + newsMentions * 4));

    const eventScore =
      conflictComponent * 0.35 +
      militaryComponent * 0.25 +
      cyberComponent * 0.2 +
      newsComponent * 0.2;

    const composite = Math.min(97, Math.max(8, Math.round(seed.baseline * 0.45 + eventScore * 0.55)));

    return {
      code: seed.code,
      name: seed.name,
      lat: seed.lat,
      lon: seed.lon,
      score: composite,
      band: scoreToBand(composite),
      isVietnam: seed.isVietnam,
      conflictComponent,
      militaryComponent,
      cyberComponent,
      newsComponent,
    };
  });

  // Sort Vietnam first for quick reference, then descending by instability score
  return rows.sort((a, b) => {
    if (a.isVietnam) return -1;
    if (b.isVietnam) return 1;
    return b.score - a.score;
  });
}

export type IntelTopicId =
  | 'military'
  | 'cyber'
  | 'nuclear'
  | 'sanctions'
  | 'intelligence'
  | 'maritime';

export interface UnifiedIntelFeedItem {
  id: string;
  title: string;
  titleVi?: string;
  source: string;
  publishedAt: number;
  url: string;
  cveId?: string;
  matchedLat?: number;
  matchedLon?: number;
  matchedLocation?: string;
}

const TOPIC_MATCHERS: Record<IntelTopicId, RegExp> = {
  military:
    /\b(military|airstrike|missile|drone|troop|army|air force|artillery|pentagon|nato|defense|fighter jet|bomber|quân sự|tên lửa|tập trận|không kích|tàu sân bay)\b/i,
  cyber:
    /\b(cyber|ransomware|malware|zero-day|0-day|cve-\d{4}-\d+|apt\d*|phishing|data breach|hack|botnet|ddos|backdoor|exploit|an ninh mạng|tin tặc|mã độc|lỗ hổng)\b/i,
  nuclear:
    /\b(nuclear|uranium|enrichment|iaea|plutonium|warhead|icbm|reactor|zaporizhzhia|natanz|yongbyon|hạt nhân|phóng xạ|làm giàu uranium)\b/i,
  sanctions:
    /\b(sanction|embargo|tariff|trade war|export control|blacklist|ofac|trừng phạt|cấm vận|thuế quan|chiến tranh thương mại)\b/i,
  intelligence:
    /\b(espionage|spy|intelligence agency|cia\b|mossad|mi6|fsb|mss|reconnaissance|surveillance|covert|osint|bellingcat|gián điệp|tình báo|trinh sát)\b/i,
  maritime:
    /\b(naval|warship|tanker|strait of hormuz|south china sea|biển đông|hoàng sa|trường sa|malacca|red sea|bab el-mandeb|suez|coast guard|piracy|submarine|hải quân|tàu biển|eo biển)\b/i,
};

export function classifyLiveIntelTopics(
  news: readonly NewsItem[],
  techItems: readonly TechCyberItem[],
): Record<IntelTopicId, UnifiedIntelFeedItem[]> {
  const buckets: Record<IntelTopicId, UnifiedIntelFeedItem[]> = {
    military: [],
    cyber: [],
    nuclear: [],
    sanctions: [],
    intelligence: [],
    maritime: [],
  };

  const combined: UnifiedIntelFeedItem[] = [
    ...news.map((n) => ({
      id: n.id,
      title: n.title,
      titleVi: n.titleVi,
      source: n.source,
      publishedAt: n.publishedAt,
      url: n.url,
      matchedLat: n.matchedLat,
      matchedLon: n.matchedLon,
      matchedLocation: n.matchedLocation,
    })),
    ...techItems
      .filter((t) => t.subCategory === 'cyber' || Boolean(t.cveId))
      .map((t) => ({
        id: t.id,
        title: t.title,
        titleVi: t.titleVi,
        source: t.source,
        publishedAt: t.publishedAt,
        url: t.url,
        cveId: t.cveId,
        matchedLat: t.matchedLat,
        matchedLon: t.matchedLon,
        matchedLocation: t.matchedLocation,
      })),
  ];

  const seenByTopic: Record<IntelTopicId, Set<string>> = {
    military: new Set(),
    cyber: new Set(),
    nuclear: new Set(),
    sanctions: new Set(),
    intelligence: new Set(),
    maritime: new Set(),
  };

  for (const item of combined) {
    const hay = `${item.title} ${item.titleVi ?? ''} ${item.source} ${item.cveId ?? ''}`;
    for (const topicId of Object.keys(TOPIC_MATCHERS) as IntelTopicId[]) {
      if (TOPIC_MATCHERS[topicId].test(hay)) {
        const cleanUrl = item.url.split('?')[0];
        if (!seenByTopic[topicId].has(cleanUrl)) {
          seenByTopic[topicId].add(cleanUrl);
          buckets[topicId].push(item);
        }
      }
    }
  }

  for (const topicId of Object.keys(buckets) as IntelTopicId[]) {
    buckets[topicId] = buckets[topicId]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 35);
  }

  return buckets;
}

export interface TrendingSpikeItem {
  term: string;
  mentions: number;
  sourceCount: number;
  kind: 'cve' | 'flashpoint' | 'tech_ai' | 'macro';
}

const WATCHED_SPIKE_ENTITIES: ReadonlyArray<{
  label: string;
  kind: TrendingSpikeItem['kind'];
  pattern: RegExp;
}> = [
  { label: 'Biển Đông', kind: 'flashpoint', pattern: /\b(biển đông|south china sea|trường sa|hoàng sa)\b/i },
  { label: 'Hormuz / Iran', kind: 'flashpoint', pattern: /\b(hormuz|iran|tehran)\b/i },
  { label: 'Ukraine / Nga', kind: 'flashpoint', pattern: /\b(ukraine|kyiv|russia|moscow)\b/i },
  { label: 'Đài Loan / TSMC', kind: 'flashpoint', pattern: /\b(taiwan|đài loan|tsmc)\b/i },
  { label: 'Biển Đỏ / Levant', kind: 'flashpoint', pattern: /\b(red sea|biển đỏ|israel|gaza|lebanon)\b/i },
  { label: 'Zero-Day / Ransomware', kind: 'cve', pattern: /\b(zero-day|0-day|ransomware|exploit)\b/i },
  { label: 'OpenAI / GPT', kind: 'tech_ai', pattern: /\b(openai|chatgpt|gpt-\d|stargate)\b/i },
  { label: 'Gemini / DeepMind', kind: 'tech_ai', pattern: /\b(gemini|deepmind|alphafold|alphagenome)\b/i },
  { label: 'NVIDIA / Chip AI', kind: 'tech_ai', pattern: /\b(nvidia|blackwell|gpu|semiconductor|bán dẫn)\b/i },
  { label: 'Thuế quan / Fed', kind: 'macro', pattern: /\b(tariff|thuế quan|federal reserve|fed\b|lãi suất)\b/i },
];

export function detectTrendingSpikes(
  news: readonly NewsItem[],
  techItems: readonly TechCyberItem[],
): TrendingSpikeItem[] {
  const allDocs = [
    ...news.map((n) => ({ text: `${n.title} ${n.titleVi ?? ''}`, source: n.source })),
    ...techItems.map((t) => ({ text: `${t.title} ${t.titleVi ?? ''} ${t.cveId ?? ''}`, source: t.source })),
  ];

  const cveMap = new Map<string, { mentions: number; sources: Set<string> }>();
  for (const doc of allDocs) {
    const matches = doc.text.match(/\bCVE-\d{4}-\d{4,7}\b/gi);
    if (!matches) continue;
    for (const raw of matches) {
      const cve = raw.toUpperCase();
      const entry = cveMap.get(cve) ?? { mentions: 0, sources: new Set<string>() };
      entry.mentions += 1;
      entry.sources.add(doc.source);
      cveMap.set(cve, entry);
    }
  }

  const out: TrendingSpikeItem[] = [];

  for (const [cve, data] of cveMap) {
    if (data.mentions >= 1) {
      out.push({
        term: cve,
        mentions: data.mentions,
        sourceCount: data.sources.size,
        kind: 'cve',
      });
    }
  }

  for (const entity of WATCHED_SPIKE_ENTITIES) {
    let mentions = 0;
    const sources = new Set<string>();
    for (const doc of allDocs) {
      if (entity.pattern.test(doc.text)) {
        mentions += 1;
        sources.add(doc.source);
      }
    }
    if (mentions >= 2) {
      out.push({
        term: entity.label,
        mentions,
        sourceCount: sources.size,
        kind: entity.kind,
      });
    }
  }

  return out
    .sort((a, b) => b.mentions * 2 + b.sourceCount - (a.mentions * 2 + a.sourceCount))
    .slice(0, 10);
}

function getHotSeriesDedupeBucket(title: string): string | null {
  const low = title.toLowerCase();
  if (/what price will bitcoin hit/.test(low)) return 'series:btc-price-hit';
  if (/what price will ethereum hit/.test(low)) return 'series:eth-price-hit';
  if (/what price will solana hit/.test(low)) return 'series:sol-price-hit';
  return null;
}

export function selectTopHotPolymarket(
  predictions: readonly PredictionItem[],
  limit = 5,
): PredictionItem[] {
  const sorted = [...predictions].sort(
    (a, b) => (b.volume24hUsd ?? b.volumeUsd) - (a.volume24hUsd ?? a.volumeUsd),
  );

  const usedBuckets = new Set<string>();
  const picked: PredictionItem[] = [];

  for (const item of sorted) {
    const bucket = getHotSeriesDedupeBucket(item.title);
    if (bucket) {
      if (usedBuckets.has(bucket)) continue;
      usedBuckets.add(bucket);
    }
    picked.push(item);
    if (picked.length >= limit) break;
  }

  return picked;
}
