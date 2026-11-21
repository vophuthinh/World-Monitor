import type { GeoPointFeature, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout, fetchTextWithTimeout } from '../lib/http';

const FEODO_BLOCKLIST_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';
const C2_INTEL_CSV_URL =
  'https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s-30day.csv';
const SANS_TOP_ATTACKERS_URL = 'https://isc.sans.edu/api/sources/attacks/30?json';
const FIREHOL_LEVEL1_URL =
  'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset';
const BLOCKLIST_DE_SSH_URL = 'https://lists.blocklist.de/lists/ssh.txt';
const IP_API_BATCH_URL =
  'http://ip-api.com/batch?fields=status,country,countryCode,city,lat,lon,isp,org,as,query';

export interface RawCyberIocCandidate {
  ip: string;
  iocLabel: string;
  sourceName: string;
  severity: SeverityLevel;
  port?: number;
  attackVolume?: number;
}

export interface IpGeoRecord {
  lat: number;
  lon: number;
  country: string;
  countryCode?: string;
  city: string;
  org: string;
}

const ipGeoCache = new Map<string, IpGeoRecord>();

export const APT_THREAT_GROUP_FEATURES: readonly GeoPointFeature[] = [
  {
    id: 'apt:volt-typhoon',
    layer: 'cyberThreats',
    title: 'Volt Typhoon & Salt Typhoon (Critical Infra APT)',
    subtitle: 'Nhóm APT nhắm vào hạ tầng viễn thông, năng lượng, cảng biển Ấn Độ Dương - Thái Bình Dương & Mỹ',
    category: 'apt_group',
    severity: 'critical',
    lat: 30.5728,
    lon: 104.0668,
    timestamp: 0,
    source: 'MITRE ATT&CK / CISA Advisory',
    url: 'https://attack.mitre.org/groups/G1017/',
    meta: {
      shortName: 'Volt Typhoon',
      threatType: 'APT State-Sponsored',
      targets: 'Telecom, Maritime Ports, Power Grids',
      country: 'CN',
    },
  },
  {
    id: 'apt:apt41',
    layer: 'cyberThreats',
    title: 'APT41 / Winnti (Supply-Chain & Tech Espionage)',
    subtitle: 'Tấn công chuỗi cung ứng phần mềm, bán dẫn, viễn thông và tài chính Châu Á',
    category: 'apt_group',
    severity: 'high',
    lat: 31.2304,
    lon: 121.4737,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0096/',
    meta: {
      shortName: 'APT41',
      threatType: 'APT Supply-Chain',
      targets: 'Semiconductors, Telecom, Healthcare',
      country: 'CN',
    },
  },
  {
    id: 'apt:mustang-panda',
    layer: 'cyberThreats',
    title: 'Mustang Panda / Bronze President (East Sea / ASEAN Focus)',
    subtitle: 'Chiến dịch gián điệp mạng nhắm vào ngoại giao & hàng hải khu vực ASEAN / Biển Đông',
    category: 'apt_group',
    severity: 'high',
    lat: 22.5431,
    lon: 114.0579,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0129/',
    meta: {
      shortName: 'Mustang Panda',
      threatType: 'APT Maritime/Diplomatic',
      targets: 'ASEAN Governments, South China Sea Ops',
      country: 'CN',
    },
  },
  {
    id: 'apt:lazarus',
    layer: 'cyberThreats',
    title: 'Lazarus Group / HIDDEN COBRA (Crypto & Financial Heist)',
    subtitle: 'Tấn công sàn tiền số, cầu nối DeFi, ngân hàng SWIFT & chuỗi cung ứng phần mềm',
    category: 'apt_group',
    severity: 'critical',
    lat: 39.0194,
    lon: 125.7381,
    timestamp: 0,
    source: 'MITRE ATT&CK / CISA',
    url: 'https://attack.mitre.org/groups/G0032/',
    meta: {
      shortName: 'Lazarus Group',
      threatType: 'APT Financial & Defense',
      targets: 'Crypto Exchanges, Banks, Aerospace',
      country: 'KP',
    },
  },
  {
    id: 'apt:kimsuky',
    layer: 'cyberThreats',
    title: 'Kimsuky / Velvet Chollima (Nuclear & Policy Recon)',
    subtitle: 'Thu thập tình báo chiến lược về hạt nhân, quốc phòng và ngoại giao Đông Bắc Á',
    category: 'apt_group',
    severity: 'high',
    lat: 39.08,
    lon: 125.82,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0094/',
    meta: {
      shortName: 'Kimsuky',
      threatType: 'APT Espionage',
      targets: 'Think Tanks, Nuclear Policy, Defense',
      country: 'KP',
    },
  },
  {
    id: 'apt:apt28',
    layer: 'cyberThreats',
    title: 'APT28 / Fancy Bear (Military & NATO Cyber Ops)',
    subtitle: 'Chiến dịch khai thác lỗ hổng Zero-Day nhắm vào bộ quốc phòng, hậu cần và vệ tinh Châu Âu',
    category: 'apt_group',
    severity: 'critical',
    lat: 55.7887,
    lon: 37.525,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0007/',
    meta: {
      shortName: 'APT28 Fancy Bear',
      threatType: 'APT Military Intel',
      targets: 'Defense Ministries, Rail/Logistics, NATO',
      country: 'RU',
    },
  },
  {
    id: 'apt:sandworm',
    layer: 'cyberThreats',
    title: 'Sandworm Team (Grid & ICS Wiper Attacks)',
    subtitle: 'Tác chiến phá hoại lưới điện công nghiệp SCADA/ICS, viễn thông vệ tinh Viasat & hạ tầng thiết yếu',
    category: 'apt_group',
    severity: 'critical',
    lat: 55.71,
    lon: 37.65,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0034/',
    meta: {
      shortName: 'Sandworm ICS',
      threatType: 'APT Destructive ICS/OT',
      targets: 'Power Grids, Satcom, Critical Infra',
      country: 'RU',
    },
  },
  {
    id: 'apt:apt29',
    layer: 'cyberThreats',
    title: 'APT29 / Midnight Blizzard (Cloud & OAuth Intrusion)',
    subtitle: 'Xâm nhập đám mây doanh nghiệp, hệ thống thư điện tử chính phủ và chuỗi cung ứng (SolarWinds)',
    category: 'apt_group',
    severity: 'high',
    lat: 59.9343,
    lon: 30.3351,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0016/',
    meta: {
      shortName: 'APT29 Cozy Bear',
      threatType: 'APT Cloud Espionage',
      targets: 'Cloud Providers, Ministries, Embassies',
      country: 'RU',
    },
  },
  {
    id: 'apt:charming-kitten',
    layer: 'cyberThreats',
    title: 'APT35 / Charming Kitten & MuddyWater',
    subtitle: 'Tấn công mạng nhắm vào năng lượng, vận tải biển Trung Đông và cơ sở nước/công nghiệp',
    category: 'apt_group',
    severity: 'high',
    lat: 35.6892,
    lon: 51.389,
    timestamp: 0,
    source: 'MITRE ATT&CK Threat Intel',
    url: 'https://attack.mitre.org/groups/G0059/',
    meta: {
      shortName: 'APT35 / MuddyWater',
      threatType: 'APT Regional Cyber',
      targets: 'Energy, Maritime Shipping, Water Systems',
      country: 'IR',
    },
  },
];

export interface RawFeodoEntry {
  ip_address?: string;
  port?: number;
  status?: string;
  malware?: string;
  as_name?: string;
  country?: string;
}

export function parseFeodoBlocklist(entries: unknown): RawCyberIocCandidate[] {
  if (!Array.isArray(entries)) return [];
  const out: RawCyberIocCandidate[] = [];
  for (const item of entries as RawFeodoEntry[]) {
    const ip = (item?.ip_address ?? '').trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
    const malware = (item?.malware ?? 'Botnet').trim();
    const online = item?.status === 'online';
    out.push({
      ip,
      iocLabel: `${malware} Botnet C2${item?.port ? ` :${item.port}` : ''}`,
      sourceName: 'abuse.ch Feodo Tracker',
      severity: online ? 'critical' : 'high',
      port: item?.port,
    });
  }
  return out;
}

export function parseC2IntelCsv(csvText: string): RawCyberIocCandidate[] {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/);
  const out: RawCyberIocCandidate[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.toLowerCase().startsWith('ip,')) continue;
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;
    const ip = line.slice(0, commaIdx).trim();
    const label = line.slice(commaIdx + 1).replace(/^"|"$/g, '').trim() || 'Active C2 Server';
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;

    out.push({
      ip,
      iocLabel: label,
      sourceName: 'C2IntelFeeds Live',
      severity: /cobaltstrike|sliver|bruteratel|havoc/i.test(label) ? 'critical' : 'high',
    });
    if (out.length >= 55) break;
  }
  return out;
}

export interface RawSansAttacker {
  ip?: string;
  attacks?: number | string;
  count?: number | string;
  lastseen?: string;
}

export function parseSansTopAttackers(entries: unknown): RawCyberIocCandidate[] {
  if (!Array.isArray(entries)) return [];
  const out: RawCyberIocCandidate[] = [];
  for (const row of entries as RawSansAttacker[]) {
    const ip = (row?.ip ?? '').trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
    const packets = Number(row?.count ?? 0);
    const targets = Number(row?.attacks ?? 0);
    out.push({
      ip,
      iocLabel: `Mass Exploit Scanner (${targets.toLocaleString('en-US')} mục tiêu · ${packets.toLocaleString('en-US')} gói)`,
      sourceName: 'SANS ISC DShield',
      severity: packets >= 20_000 ? 'critical' : 'high',
      attackVolume: packets,
    });
    if (out.length >= 25) break;
  }
  return out;
}

function isPublicIpv4Host(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  if (
    ip.startsWith('0.') ||
    ip.startsWith('10.') ||
    ip.startsWith('127.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('224.') ||
    ip.startsWith('240.')
  ) {
    return false;
  }
  return true;
}

export function parseFireholNetset(rawText: string, maxItems = 18): RawCyberIocCandidate[] {
  if (!rawText) return [];
  const out: RawCyberIocCandidate[] = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.includes('/')) continue;
    if (!isPublicIpv4Host(line)) continue;
    out.push({
      ip: line,
      iocLabel: 'FireHOL Botnet / Malicious Host',
      sourceName: 'FireHOL Level-1 IPSet',
      severity: 'high',
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseBlocklistDeIps(rawText: string, maxItems = 18): RawCyberIocCandidate[] {
  if (!rawText) return [];
  const out: RawCyberIocCandidate[] = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!isPublicIpv4Host(line)) continue;
    out.push({
      ip: line,
      iocLabel: 'SSH Brute-Force Attacker :22',
      sourceName: 'Blocklist.de Live SSH',
      severity: 'high',
      port: 22,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function buildCyberThreatFeatures(
  candidates: readonly RawCyberIocCandidate[],
  geoLookup: ReadonlyMap<string, IpGeoRecord>,
  now = Date.now(),
): GeoPointFeature[] {
  const seenIps = new Set<string>();
  const dynamicFeatures: GeoPointFeature[] = [];

  for (const cand of candidates) {
    if (seenIps.has(cand.ip)) continue;
    const geo = geoLookup.get(cand.ip);
    if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) continue;
    seenIps.add(cand.ip);

    dynamicFeatures.push({
      id: `ioc:${cand.ip}`,
      layer: 'cyberThreats',
      title: `${cand.iocLabel} — ${cand.ip}`,
      subtitle: `${geo.city ? `${geo.city}, ` : ''}${geo.country} · Mạng ${geo.org}`,
      category: 'c2_ioc',
      severity: cand.severity,
      lat: geo.lat,
      lon: geo.lon,
      timestamp: now,
      source: cand.sourceName,
      url: `https://isc.sans.edu/ipinfo/${encodeURIComponent(cand.ip)}`,
      meta: {
        shortName: cand.ip,
        ipAddress: cand.ip,
        threatClass: cand.iocLabel,
        country: geo.countryCode ?? geo.country,
        city: geo.city || '—',
        asnOrg: geo.org || '—',
        ...(cand.port ? { port: cand.port } : {}),
        ...(cand.attackVolume ? { attackPackets: cand.attackVolume } : {}),
      },
    });
  }

  return [...APT_THREAT_GROUP_FEATURES, ...dynamicFeatures];
}

interface IpApiBatchResponseItem {
  status?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
  as?: string;
  query?: string;
}

async function resolveIpGeolocations(ips: readonly string[]): Promise<Map<string, IpGeoRecord>> {
  const uncached = ips.filter((ip) => !ipGeoCache.has(ip)).slice(0, 90);

  if (uncached.length > 0) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6_500);
      const resp = await fetch(IP_API_BATCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': NAMED_APP_UA,
        },
        body: JSON.stringify(uncached),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const rows = (await resp.json()) as IpApiBatchResponseItem[];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row?.status === 'success' && row.query && Number.isFinite(row.lat) && Number.isFinite(row.lon)) {
              ipGeoCache.set(row.query, {
                lat: Number(row.lat),
                lon: Number(row.lon),
                country: row.country ?? 'Unknown',
                countryCode: row.countryCode,
                city: row.city ?? '',
                org: row.org || row.isp || row.as || 'Autonomous System',
              });
            }
          }
        }
      }
    } catch {
      // Keep cached entries if ip-api batch temporarily throttles
    }

    if (ipGeoCache.size > 1_500) {
      const oldest = ipGeoCache.keys().next().value;
      if (oldest) ipGeoCache.delete(oldest);
    }
  }

  return ipGeoCache;
}

export async function fetchCyberThreats(): Promise<GeoPointFeature[]> {
  const now = Date.now();
  const [feodoRes, c2Res, sansRes, fireholRes, sshRes] = await Promise.allSettled([
    fetchJsonWithTimeout<unknown>(FEODO_BLOCKLIST_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }),
    fetchTextWithTimeout(C2_INTEL_CSV_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }),
    fetchJsonWithTimeout<unknown>(SANS_TOP_ATTACKERS_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }),
    fetchTextWithTimeout(FIREHOL_LEVEL1_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }),
    fetchTextWithTimeout(BLOCKLIST_DE_SSH_URL, {
      timeoutMs: 7_000,
      retries: 0,
      userAgent: NAMED_APP_UA,
    }),
  ]);

  const candidates: RawCyberIocCandidate[] = [];
  if (feodoRes.status === 'fulfilled') {
    candidates.push(...parseFeodoBlocklist(feodoRes.value));
  }
  if (c2Res.status === 'fulfilled') {
    candidates.push(...parseC2IntelCsv(c2Res.value.text));
  }
  if (sansRes.status === 'fulfilled') {
    candidates.push(...parseSansTopAttackers(sansRes.value));
  }
  if (fireholRes.status === 'fulfilled') {
    candidates.push(...parseFireholNetset(fireholRes.value.text, 18));
  }
  if (sshRes.status === 'fulfilled') {
    candidates.push(...parseBlocklistDeIps(sshRes.value.text, 18));
  }

  const uniqueIps = [...new Set(candidates.map((c) => c.ip))].slice(0, 100);
  const geoLookup = await resolveIpGeolocations(uniqueIps);

  return buildCyberThreatFeatures(candidates, geoLookup, now);
}
