import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { fetchJsonWithTimeout } from '../lib/http';

const ADSB_MIL_PROVIDERS = [
  { name: 'adsb.fi /v2/mil', url: 'https://opendata.adsb.fi/api/v2/mil' },
  { name: 'adsb.lol /v2/mil', url: 'https://api.adsb.lol/v2/mil' },
] as const;

let adsbProviderCursor = 0;

export type MilitaryRole =
  | 'vip'
  | 'bomber'
  | 'awacs'
  | 'recon'
  | 'drone'
  | 'tanker'
  | 'fighter'
  | 'special_ops'
  | 'patrol'
  | 'helicopter'
  | 'transport'
  | 'military';

export interface HexMatch {
  operator: string;
  country: string;
  exact?: boolean;
  aircraftType?: MilitaryRole;
  aircraftModel?: string;
}

const HEX_RANGES: ReadonlyArray<{ start: string; end: string; operator: string; country: string }> = [
  { start: 'ADF7C8', end: 'AFFFFF', operator: 'usaf', country: 'USA' },
  { start: '400000', end: '40003F', operator: 'raf', country: 'UK' },
  { start: '43C000', end: '43CFFF', operator: 'raf', country: 'UK' },
  { start: '3AA000', end: '3AFFFF', operator: 'faf', country: 'France' },
  { start: '3B7000', end: '3BFFFF', operator: 'faf', country: 'France' },
  { start: '3EA000', end: '3EBFFF', operator: 'gaf', country: 'Germany' },
  { start: '3F4000', end: '3FBFFF', operator: 'gaf', country: 'Germany' },
  { start: '738A00', end: '738BFF', operator: 'iaf', country: 'Israel' },
  { start: '4D0000', end: '4D03FF', operator: 'nato', country: 'NATO' },
  { start: '33FF00', end: '33FFFF', operator: 'other', country: 'Italy' },
  { start: '350000', end: '3503FF', operator: 'other', country: 'Spain' },
  { start: '480000', end: '480FFF', operator: 'other', country: 'Netherlands' },
  { start: '4B8200', end: '4B82FF', operator: 'other', country: 'Turkey' },
  { start: '710258', end: '71028F', operator: 'other', country: 'Saudi Arabia' },
  { start: '710380', end: '71039F', operator: 'other', country: 'Saudi Arabia' },
  { start: '896800', end: '896BFF', operator: 'other', country: 'UAE' },
  { start: '06A200', end: '06A3FF', operator: 'other', country: 'Qatar' },
  { start: '706000', end: '706FFF', operator: 'other', country: 'Kuwait' },
  { start: '7CF800', end: '7CFAFF', operator: 'other', country: 'Australia' },
  { start: 'C2D000', end: 'C2DFFF', operator: 'other', country: 'Canada' },
  { start: '800200', end: '8002FF', operator: 'other', country: 'India' },
  { start: '010070', end: '01008F', operator: 'other', country: 'Egypt' },
  { start: '48D800', end: '48D87F', operator: 'other', country: 'Poland' },
  { start: '468000', end: '4683FF', operator: 'other', country: 'Greece' },
  { start: '478100', end: '4781FF', operator: 'other', country: 'Norway' },
  { start: '444000', end: '446FFF', operator: 'other', country: 'Austria' },
  { start: '44F000', end: '44FFFF', operator: 'other', country: 'Belgium' },
  { start: '4B7000', end: '4B7FFF', operator: 'other', country: 'Switzerland' },
  { start: 'E40000', end: 'E41FFF', operator: 'other', country: 'Brazil' },
];

const EXACT_MILITARY_AIRCRAFT = new Map<string, HexMatch>([
  ['7A4262', { operator: 'plaaf', country: 'China', exact: true, aircraftType: 'recon', aircraftModel: 'Y-8G' }],
  ['7A444F', { operator: 'plaaf', country: 'China', exact: true, aircraftType: 'tanker', aircraftModel: 'YY-20' }],
  ['7A446F', { operator: 'plaaf', country: 'China', exact: true, aircraftType: 'transport', aircraftModel: 'Y-20A' }],
  ['7A4403', { operator: 'plaaf', country: 'China', exact: true, aircraftType: 'transport', aircraftModel: 'Y-20A' }],
]);

const COMMERCIAL_CALLSIGNS = new Set([
  'CCA', 'CSN', 'CHH', 'SVA', 'THY', 'THK', 'TUR', 'ELY', 'ELAL',
  'UAE', 'QTR', 'ETH', 'SAA', 'PAK', 'AME', 'RED',
]);

const COMMERCIAL_CALLSIGN_PATTERNS: readonly RegExp[] = [
  /^CLX\d/i,
  /^QTR/i,
  /^QR\d/i,
  /^UAE\d/i,
  /^ETH\d/i,
  /^THY\d/i,
  /^SVA\d/i,
  /^CCA\d/i,
  /^CSN\d/i,
  /^CHH\d/i,
  /^ELY\d/i,
  /^ELAL/i,
];

const TRUSTED_HEX_OPERATORS = new Set(['usaf', 'raf', 'faf', 'gaf', 'iaf', 'nato', 'plaaf', 'plan', 'vks']);

const CALLSIGN_PATTERNS: ReadonlyArray<{ re: RegExp; operator: string; role: MilitaryRole | null }> = [
  { re: /^SAM\d{2,}/i, operator: 'usaf', role: 'vip' },
  { re: /^AF[12]\d?/i, operator: 'usaf', role: 'vip' },
  { re: /^EXEC\d/i, operator: 'usaf', role: 'vip' },
  { re: /^HMX/i, operator: 'usmc', role: 'vip' },
  { re: /^AIR INDIA ONE/i, operator: 'other', role: 'vip' },
  { re: /^(BONE|DEATH|DOOM)\d/i, operator: 'usaf', role: 'bomber' },
  { re: /^(SNTRY|SENTRY|AWACS|MAGIC|DISCO|DARKSTAR)/i, operator: 'usaf', role: 'awacs' },
  { re: /^NATO\d/i, operator: 'nato', role: 'awacs' },
  { re: /^(RIVET|COBRA|DRAGN|OLIVE|JAKE|HOMER)/i, operator: 'usaf', role: 'recon' },
  { re: /^(FORTE|HAWK\d|REAPER|PREDATOR)/i, operator: 'usaf', role: 'drone' },
  { re: /^(KING|SHELL|TEAL|TEXACO|ARCO|ESSO|STRAT)/i, operator: 'usaf', role: 'tanker' },
  { re: /^TARTAN/i, operator: 'raf', role: 'tanker' },
  { re: /^(BOLT|VIPER|RAPTOR|EAGLE|HORNET|FALCON|STRIKE|FURY)/i, operator: 'usaf', role: 'fighter' },
  { re: /^BRONCO/i, operator: 'usn', role: 'fighter' },
  { re: /^(GOLD\d|NCHO|SHADOW\d)/i, operator: 'usaf', role: 'special_ops' },
  { re: /^TRIDENT/i, operator: 'usn', role: 'patrol' },
  { re: /^(COAST GUARD|CG\d{3,})/i, operator: 'other', role: 'patrol' },
  { re: /^DUSTOFF/i, operator: 'usa', role: 'helicopter' },
  { re: /^(RCH\d|REACH\d|DUKE\d|EVAC\d|MOOSE\d|HERKY)/i, operator: 'usaf', role: 'transport' },
  { re: /^(CNV\d|VRC\d)/i, operator: 'usn', role: 'transport' },
  { re: /^PAT\d{2,}/i, operator: 'usa', role: 'transport' },
  { re: /^(ASCOT|RAFAIR|RRR\d)/i, operator: 'raf', role: 'transport' },
  { re: /^CTM\d/i, operator: 'faf', role: 'transport' },
  { re: /^CANFORCE/i, operator: 'other', role: 'transport' },
  { re: /^NAVY\d/i, operator: 'usn', role: null },
  { re: /^MARINE/i, operator: 'usmc', role: null },
  { re: /^ARMY\d/i, operator: 'usa', role: null },
  { re: /^FAF\d/i, operator: 'faf', role: null },
  { re: /^GAF\d/i, operator: 'gaf', role: null },
  { re: /^IAF\d{2,}/i, operator: 'iaf', role: null },
  { re: /^(TURAF|TRKAF)/i, operator: 'other', role: null },
  { re: /^RSAF\d/i, operator: 'other', role: null },
  { re: /^(JASDF|ROKAF|RAAF\d|AUSSIE\d|PLF\d|HAF\d)/i, operator: 'other', role: null },
  { re: /^(RFF\d|RSD\d|RUSSIAN)/i, operator: 'vks', role: null },
  { re: /^(PLAAF|PLA\d)/i, operator: 'plaaf', role: null },
];

const OPERATOR_TO_COUNTRY: Record<string, string> = {
  usaf: 'USA',
  usn: 'USA',
  usmc: 'USA',
  usa: 'USA',
  raf: 'UK',
  rn: 'UK',
  faf: 'France',
  gaf: 'Germany',
  iaf: 'Israel',
  nato: 'NATO',
  plaaf: 'China',
  plan: 'China',
  vks: 'Russia',
};

export interface RawAdsbAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  t?: string;
  desc?: string;
  r?: string;
  seen?: number;
  dbFlags?: number;
}

export interface RawAdsbResponse {
  now?: number;
  ac?: RawAdsbAircraft[];
  aircraft?: RawAdsbAircraft[];
}

export function isKnownMilitaryHex(rawHex: string): HexMatch | null {
  const hex = rawHex.trim().replace(/~/g, '').toUpperCase();
  if (!hex) return null;
  const exact = EXACT_MILITARY_AIRCRAFT.get(hex);
  if (exact) return exact;
  for (const range of HEX_RANGES) {
    if (hex >= range.start && hex <= range.end) {
      return { operator: range.operator, country: range.country };
    }
  }
  return null;
}

export function identifyCommercialCallsign(rawCallsign?: string): boolean {
  if (!rawCallsign) return false;
  const cs = rawCallsign.trim().toUpperCase();
  if (!cs) return false;
  const prefix3 = cs.slice(0, 3);
  if (COMMERCIAL_CALLSIGNS.has(prefix3) || COMMERCIAL_CALLSIGNS.has(cs)) {
    return true;
  }
  return COMMERCIAL_CALLSIGN_PATTERNS.some((re) => re.test(cs));
}

function inferRoleFromTypeCode(typeCode: string, desc: string): MilitaryRole | null {
  const code = typeCode.toUpperCase().trim();
  const d = desc.toUpperCase();
  if (/^(B52|B1|B2|TU95|TU160|H6)$/.test(code) || /STRATOFORTRESS|LANCER|SPIRIT BOMBER/.test(d)) return 'bomber';
  if (/^(E3CF|E3TF|E737|E2|A50|E767|E4B)$/.test(code) || /SENTRY|WEDGETAIL|HAWKEYE|AWACS/.test(d)) return 'awacs';
  if (/^(RQ4|MQ9|MQ4C|HRON|TB2)$/.test(code) || /GLOBAL HAWK|REAPER|TRITON|DRONE|UAV/.test(d)) return 'drone';
  if (/^(R135|RC135|U2|E8|EP3)$/.test(code) || /RIVET JOINT|DRAGON LADY|COBRA BALL/.test(d)) return 'recon';
  if (/^(K35R|KC135|KC46|KC10|IL78)$/.test(code) || /STRATOTANKER|PEGASUS|MRTT|EXTENDER/.test(d)) return 'tanker';
  if (/^(VC25|C32|C37A|C37B)$/.test(code)) return 'vip';
  if (/^(P8|P3|ATLA)$/.test(code) || /POSEIDON|ORION/.test(d)) return 'patrol';
  if (/^(F15|F16|F18|FA18|F22|F35|EUFI|RFAL|T38|SU27|SU30|SU35|J10|J16|MIR2)$/.test(code) || /TYPHOON|RAFALE|FIGHTING FALCON|LIGHTNING II|RAPTOR/.test(d)) return 'fighter';
  if (/^(MC130|AC130|CV22|V22)$/.test(code) || /OSPREY/.test(d)) return 'special_ops';
  if (/^(H60|UH60|MH60|CH47|H47|AH64|NH90|EC25|MI8|MI17|MI24|AW101|H53)$/.test(code) || /BLACK HAWK|CHINOOK|APACHE|SEAHAWK/.test(d)) return 'helicopter';
  if (/^(C17|C5M|C5|C130|C30J|A400|C27J|IL76|AN124|Y20|C295|CN35|KC390)$/.test(code) || /GLOBEMASTER|HERCULES|ATLAS|GALAXY/.test(d)) return 'transport';
  return null;
}

function severityForRole(role: MilitaryRole, squawk?: string): SeverityLevel {
  if (squawk === '7700' || squawk === '7600' || squawk === '7500') return 'critical';
  if (role === 'bomber' || role === 'vip' || role === 'awacs' || role === 'recon' || role === 'drone' || role === 'special_ops') {
    return 'high';
  }
  if (role === 'fighter' || role === 'tanker' || role === 'patrol') {
    return 'medium';
  }
  return 'low';
}

const ROLE_LABELS: Record<MilitaryRole, string> = {
  vip: 'VIP / Command',
  bomber: 'Strategic Bomber',
  awacs: 'AWACS / Airborne Early Warning',
  recon: 'ISR / Reconnaissance',
  drone: 'UAV / Unmanned ISR',
  tanker: 'Aerial Refueling Tanker',
  fighter: 'Fighter / Tactical Jet',
  special_ops: 'Special Operations',
  patrol: 'Maritime Patrol',
  helicopter: 'Military Rotary-Wing',
  transport: 'Strategic / Tactical Airlift',
  military: 'Military Aircraft',
};

export function classifyMilitaryAircraft(
  ac: RawAdsbAircraft,
  timestampMs = Date.now(),
): GeoPointFeature | null {
  const hex = (ac.hex ?? '').trim().replace(/~/g, '').toUpperCase();
  const lat = Number(ac.lat);
  const lon = Number(ac.lon);
  if (!hex || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  const callsign = (ac.flight ?? '').trim().toUpperCase();
  const hexMatch = isKnownMilitaryHex(hex);
  const isCommercial = identifyCommercialCallsign(callsign);

  // Reject commercial airline callsigns unless tied to an authoritative military hex operator
  if (isCommercial && (!hexMatch || !TRUSTED_HEX_OPERATORS.has(hexMatch.operator))) {
    return null;
  }

  let matchedCallsign: { operator: string; role: MilitaryRole | null } | null = null;
  if (callsign) {
    for (const p of CALLSIGN_PATTERNS) {
      if (p.re.test(callsign)) {
        matchedCallsign = { operator: p.operator, role: p.role };
        break;
      }
    }
  }

  const typeCode = (ac.t ?? '').trim().toUpperCase();
  const desc = (ac.desc ?? hexMatch?.aircraftModel ?? '').trim();
  const role: MilitaryRole =
    hexMatch?.aircraftType ??
    matchedCallsign?.role ??
    inferRoleFromTypeCode(typeCode, desc) ??
    'military';

  const operator = hexMatch?.operator ?? matchedCallsign?.operator ?? 'military';
  const country = hexMatch?.country ?? OPERATOR_TO_COUNTRY[operator] ?? 'Military / Allied';

  const onGround = ac.alt_baro === 'ground';
  const altitudeFt = typeof ac.alt_baro === 'number' && Number.isFinite(ac.alt_baro) ? Math.round(ac.alt_baro) : 0;
  const speedKt = typeof ac.gs === 'number' && Number.isFinite(ac.gs) ? Math.round(ac.gs) : 0;
  const headingKnown = typeof ac.track === 'number' && Number.isFinite(ac.track);
  const heading = headingKnown ? Math.round(ac.track as number) % 360 : 0;

  const displayCallsign = callsign || ac.r?.trim() || hex;
  const modelText = desc || typeCode || ROLE_LABELS[role];

  return {
    id: `mil:${hex}`,
    layer: 'military',
    title: `${displayCallsign}${typeCode ? ` · ${typeCode}` : ''}`,
    subtitle: `${country} · ${ROLE_LABELS[role]}${desc ? ` (${desc})` : ''}`,
    category: role,
    severity: severityForRole(role, ac.squawk),
    lat,
    lon,
    timestamp: timestampMs,
    source: 'adsb.lol /v2/mil',
    url: `https://globe.adsbexchange.com/?icao=${hex.toLowerCase()}`,
    heading,
    meta: {
      icaoHex: hex,
      callsign: callsign || null,
      registration: ac.r ?? null,
      country,
      operator: operator.toUpperCase(),
      roleLabel: ROLE_LABELS[role],
      aircraftType: typeCode || null,
      aircraftModel: modelText,
      altitudeFt: onGround ? 0 : altitudeFt,
      onGround,
      speedKt,
      headingDeg: heading,
      headingKnown,
      squawk: ac.squawk ?? null,
    },
  };
}

export function normalizeMilitaryFlights(
  payload: RawAdsbResponse,
  fallbackNowMs = Date.now(),
  providerLabel = 'adsb.lol /v2/mil',
): GeoPointFeature[] {
  const list = payload?.ac ?? payload?.aircraft;
  if (!payload || !Array.isArray(list)) {
    throw new Error('ADS-B military response missing ac[]/aircraft[] array');
  }

  const rawNow = Number(payload.now);
  const baseNowMs =
    Number.isFinite(rawNow) && rawNow > 0
      ? rawNow < 1_000_000_000_000
        ? rawNow * 1000
        : rawNow
      : fallbackNowMs;

  const seenHex = new Set<string>();
  const features: GeoPointFeature[] = [];

  for (const ac of list) {
    const cleanHex = (ac.hex ?? '').trim().replace(/~/g, '').toUpperCase();
    if (!cleanHex || seenHex.has(cleanHex)) continue;

    const seenSec = typeof ac.seen === 'number' && Number.isFinite(ac.seen) ? Math.max(0, ac.seen) : 0;
    const itemTs = Math.round(baseNowMs - seenSec * 1000);
    const classified = classifyMilitaryAircraft(ac, itemTs);
    if (!classified) continue;

    seenHex.add(cleanHex);
    features.push({
      ...classified,
      source: providerLabel,
    });
  }

  return features;
}

export async function fetchMilitaryFlights(): Promise<GeoPointFeature[]> {
  const startIdx = adsbProviderCursor++ % ADSB_MIL_PROVIDERS.length;
  const ordered = [
    ADSB_MIL_PROVIDERS[startIdx],
    ADSB_MIL_PROVIDERS[(startIdx + 1) % ADSB_MIL_PROVIDERS.length],
  ];

  let lastErr: unknown;
  for (const provider of ordered) {
    try {
      const payload = await fetchJsonWithTimeout<RawAdsbResponse>(provider.url, {
        timeoutMs: 10_000,
        // Never retry against the same rate-limited ADS-B host; fail over immediately to sibling provider
        retries: 0,
        userAgent: 'Mozilla/5.0',
      });
      const normalized = normalizeMilitaryFlights(payload, Date.now(), provider.name);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All ADS-B military providers failed');
}
