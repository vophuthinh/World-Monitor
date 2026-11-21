import { describe, expect, it } from 'vitest';
import {
  APT_THREAT_GROUP_FEATURES,
  buildCyberThreatFeatures,
  parseC2IntelCsv,
  parseFeodoBlocklist,
  parseSansTopAttackers,
} from '../server/collectors/cyber-threats';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';
import { TECH_CYBER_FEEDS } from '../server/collectors/tech-cyber-intel';
import {
  classifyLiveIntelTopics,
  computeCountryInstabilityScores,
  computeTheaterPostures,
  detectTrendingSpikes,
} from '../shared/intelligence';
import {
  AI_DATACENTER_FEATURES,
  MILITARY_BASE_FEATURES,
  buildStaticGeoBundle,
} from '../shared/registries/index';

describe('WorldMonitor Live Intelligence, Cyber Threats IOCs, BBC Suite & Strategic Layers', () => {
  it('parses Feodo Tracker, C2IntelFeeds CSV, SANS DShield attackers and merges geolocated Cyber Threat map points + APT groups', () => {
    const feodo = parseFeodoBlocklist([
      {
        ip_address: '50.16.16.211',
        port: 443,
        status: 'online',
        malware: 'QakBot',
        as_name: 'AMAZON-AES',
        country: 'US',
      },
    ]);
    expect(feodo).toHaveLength(1);
    expect(feodo[0].iocLabel).toContain('QakBot');

    const c2Csv = parseC2IntelCsv(
      '#ip,ioc\n1.117.74.144,Possible Cobaltstrike C2 IP\n8.8.8.8,Sliver C2 Server\n',
    );
    expect(c2Csv).toHaveLength(2);
    expect(c2Csv[0].ip).toBe('1.117.74.144');
    expect(c2Csv[0].iocLabel).toContain('Cobaltstrike');

    const sans = parseSansTopAttackers([
      { ip: '185.242.226.126', attacks: 522, count: 49643, lastseen: '2026-11-21' },
    ]);
    expect(sans).toHaveLength(1);
    expect(sans[0].severity).toBe('critical');

    const geoMap = new Map([
      [
        '50.16.16.211',
        { lat: 39.04, lon: -77.48, country: 'United States', city: 'Ashburn', org: 'AWS' },
      ],
      [
        '1.117.74.144',
        { lat: 39.9, lon: 116.4, country: 'China', city: 'Beijing', org: 'China Unicom' },
      ],
    ]);

    const features = buildCyberThreatFeatures([...feodo, ...c2Csv], geoMap, 1_700_000_000_000);
    expect(features.length).toBeGreaterThanOrEqual(2 + APT_THREAT_GROUP_FEATURES.length);
    expect(features.some((f) => f.layer === 'cyberThreats' && f.title.includes('QakBot'))).toBe(true);
    expect(features.some((f) => f.id.startsWith('apt:'))).toBe(true);
  });

  it('includes Military Bases + Spaceports (Cam Ranh, Guam, Starbase) and AI Datacenters + Rare Earths (TSMC, xAI, Viettel Hòa Lạc, Đông Pao)', () => {
    expect(MILITARY_BASE_FEATURES.length).toBeGreaterThanOrEqual(20);
    expect(AI_DATACENTER_FEATURES.length).toBeGreaterThanOrEqual(18);

    const baseIds = new Set(MILITARY_BASE_FEATURES.map((f) => f.id));
    expect(baseIds.has('base:cam-ranh')).toBe(true);
    expect(baseIds.has('spaceport:boca_chica')).toBe(true);
    expect(baseIds.has('base:guam-andersen')).toBe(true);

    const aiIds = new Set(AI_DATACENTER_FEATURES.map((f) => f.id));
    expect(aiIds.has('aidc:tsmc-hsinchu')).toBe(true);
    expect(aiIds.has('aidc:xai-colossus')).toBe(true);
    expect(aiIds.has('aidc:viettel-hoa-lac')).toBe(true);
    expect(aiIds.has('mineral:dong-pao-vn')).toBe(true);

    const bundle = buildStaticGeoBundle();
    expect(bundle.militaryBases.length).toBeGreaterThanOrEqual(20);
    expect(bundle.aiDatacenters.length).toBeGreaterThanOrEqual(18);
  });

  it('includes full BBC World & Regional/Business/Tech/Science desks across news and AI/ML catalogs', () => {
    const bbcNews = CURATED_RSS_FEEDS.filter((f) => f.name.startsWith('BBC '));
    expect(bbcNews.length).toBeGreaterThanOrEqual(5);
    const bbcTech = TECH_CYBER_FEEDS.filter((f) => f.name.startsWith('BBC '));
    expect(bbcTech.length).toBeGreaterThanOrEqual(2);
  });

  it('computes live Theater Postures, Country Instability Index (CII), 6 Intel Topics, and Trending Spikes', () => {
    const sampleFlights = [
      {
        id: 'mil:1',
        layer: 'military' as const,
        title: 'FORTE12',
        category: 'drone',
        severity: 'high' as const,
        lat: 15.2,
        lon: 112.4, // Biển Đông
        timestamp: 1_700_000_000_000,
        source: 'adsb.lol',
        meta: {},
      },
    ];
    const sampleConflicts = [
      {
        id: 'gd:1',
        layer: 'geopolitics' as const,
        title: 'Tehran, Iran — Military Alert',
        category: 'conflict',
        severity: 'critical' as const,
        lat: 26.4,
        lon: 56.2, // Hormuz
        timestamp: 1_700_000_000_000,
        source: 'GDELT',
        meta: {},
      },
    ];

    const postures = computeTheaterPostures({
      military: sampleFlights,
      vessels: [],
      geopolitics: sampleConflicts,
      cyberThreats: [],
    });
    expect(postures.length).toBeGreaterThanOrEqual(6);
    const eastSea = postures.find((p) => p.id === 'east-sea');
    expect(eastSea?.airCount).toBe(1);

    const cii = computeCountryInstabilityScores({
      geopolitics: sampleConflicts,
      military: sampleFlights,
      cyberThreats: [],
      news: [],
    });
    expect(cii.length).toBeGreaterThanOrEqual(10);
    expect(cii.some((c) => c.code === 'VN')).toBe(true);
    expect(cii.some((c) => c.code === 'IR')).toBe(true);

    const sampleNews = [
      {
        id: 'n1',
        title: 'IAEA inspects uranium enrichment facility in Natanz',
        titleVi: 'IAEA thanh sát cơ sở làm giàu uranium tại Natanz',
        source: 'BBC World',
        category: 'world' as const,
        publishedAt: 1_700_000_000_000,
        url: 'https://bbc.com/1',
      },
      {
        id: 'n2',
        title: 'Critical ransomware cyberattack hits hospital network via CVE-2026-9999',
        titleVi: 'Tấn công mạng ransomware nghiêm trọng qua CVE-2026-9999',
        source: 'Krebs on Security',
        category: 'osint_live' as const,
        publishedAt: 1_700_000_000_000,
        url: 'https://krebsonsecurity.com/2',
      },
      {
        id: 'n3',
        title: 'Patch released for CVE-2026-9999 active ransomware exploit',
        titleVi: 'Phát hành bản vá cho lỗ hổng ransomware CVE-2026-9999',
        source: 'CISA Advisories',
        category: 'osint_live' as const,
        publishedAt: 1_700_000_000_000,
        url: 'https://cisa.gov/3',
      },
    ];

    const topics = classifyLiveIntelTopics(sampleNews, []);
    expect(topics.nuclear.length).toBe(1);
    expect(topics.cyber.length).toBe(2);

    const spikes = detectTrendingSpikes(sampleNews, []);
    expect(spikes.some((s) => s.term.toUpperCase() === 'CVE-2026-9999')).toBe(true);
  });
});
