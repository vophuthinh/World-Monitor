import { describe, expect, it } from 'vitest';
import { advanceCyberArcPackets, buildCyberAttackArcs } from '../shared/cyber-arcs';
import { computeGlobalThreatLevel, detectMitreTechniques } from '../shared/intelligence';
import { parseBlocklistDeIps, parseFireholNetset } from '../server/collectors/cyber-threats';
import { parseNasaFirmsCsv } from '../server/collectors/natural-events';
import { normalizeNvdCveLookup, normalizeShodanInternetDb } from '../server/lib/ioc-scanner';

describe('OSINT & Cyber Ecosystem Upgrades (Attack Arcs, MITRE ATT&CK, Shodan/NVD Scanner, NASA FIRMS, FireHOL)', () => {
  it('builds antimeridian-safe geodesic Cyber Attack Arcs and animates live attack packets', () => {
    const arcs = buildCyberAttackArcs([
      {
        id: 'apt:mustang-panda',
        layer: 'cyberThreats',
        title: 'Mustang Panda',
        category: 'apt_group',
        severity: 'high',
        lat: 22.54,
        lon: 114.05,
        timestamp: 0,
        source: 'MITRE ATT&CK',
        meta: { shortName: 'Mustang Panda', country: 'CN', targets: 'ASEAN Maritime' },
      },
      {
        id: 'ioc:45.148.10.240',
        layer: 'cyberThreats',
        title: 'CobaltStrike C2 — 45.148.10.240',
        category: 'c2_ioc',
        severity: 'critical',
        lat: 52.37,
        lon: 4.89,
        timestamp: Date.now(),
        source: 'C2IntelFeeds',
        meta: { ipAddress: '45.148.10.240', threatClass: 'CobaltStrike C2', country: 'NL' },
      },
      // Cross-Pacific arc test (Russia Far East / KP -> US West/East) to verify antimeridian safety
      {
        id: 'apt:lazarus',
        layer: 'cyberThreats',
        title: 'Lazarus Group',
        category: 'apt_group',
        severity: 'critical',
        lat: 39.02,
        lon: 125.74,
        timestamp: 0,
        source: 'MITRE ATT&CK',
        meta: { shortName: 'Lazarus Group', country: 'KP', targets: 'Crypto & SWIFT' },
      },
    ]);

    expect(arcs.length).toBeGreaterThanOrEqual(3);
    for (const arc of arcs) {
      expect(arc.coordinates.length).toBeGreaterThan(0);
      for (const seg of arc.coordinates) {
        for (let i = 1; i < seg.length; i++) {
          expect(Math.abs(seg[i][0] - seg[i - 1][0])).toBeLessThan(180);
        }
      }
    }

    const packets = advanceCyberArcPackets(arcs, 1_700_000_002_500);
    expect(packets).toHaveLength(arcs.length);
    expect(Math.abs(packets[0].lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(packets[0].lon)).toBeLessThanOrEqual(180);
  });

  it('parses FireHOL Level 1 netset and Blocklist.de live SSH brute-force feeds cleanly', () => {
    const firehol = parseFireholNetset(
      `# FireHOL Level 1
       10.0.0.0/8
       185.220.101.45
       91.214.124.0/24
       193.142.146.35`,
      10,
    );
    expect(firehol).toHaveLength(2);
    expect(firehol[0].ip).toBe('185.220.101.45');
    expect(firehol[0].sourceName).toContain('FireHOL');

    const sshBrute = parseBlocklistDeIps(`45.155.205.233\ninvalid\n103.153.76.18\n`, 10);
    expect(sshBrute).toHaveLength(2);
    expect(sshBrute[0].iocLabel).toContain('SSH');
  });

  it('parses NASA FIRMS Southeast Asia 24h MODIS CSV and deduplicates nearby fire clusters', () => {
    const csv = [
      'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight',
      '14.8210,107.9520,338.4,1.1,1.0,2026-11-21,0645,Terra,88,6.1NRT,298.1,46.5,D',
      '14.8300,107.9600,325.0,1.1,1.0,2026-11-21,0645,Terra,82,6.1NRT,296.0,31.2,D',
      '19.7500,96.1200,349.1,1.2,1.1,2026-11-21,0710,Aqua,94,6.1NRT,301.2,82.4,D',
      '12.1000,105.1000,304.0,1.0,1.0,2026-11-21,0710,Aqua,30,6.1NRT,290.0,4.1,D',
    ].join('\n');

    const hotspots = parseNasaFirmsCsv(csv, 1_700_000_000_000);
    // Low confidence (30, frp 4.1) dropped; two adjacent Central Highlands points merged into strongest cluster
    expect(hotspots).toHaveLength(2);
    expect(hotspots[0].source).toContain('NASA FIRMS');
    expect(hotspots[0].severity).toBe('high');
  });

  it('detects MITRE ATT&CK TTPs on cyber headlines and computes Global Threat Level (DEFCON)', () => {
    const ttps = detectMitreTechniques(
      'APT group deploys LockBit ransomware after spear-phishing campaign and Cobalt Strike C2 beacon',
    );
    const ids = ttps.map((t) => t.id);
    expect(ids).toContain('T1486'); // Data Encrypted for Impact (Ransomware)
    expect(ids).toContain('T1566'); // Phishing
    expect(ids).toContain('T1071'); // C2 Application Layer Protocol

    const threat = computeGlobalThreatLevel({
      theaterPostures: [
        {
          id: 'east-europe',
          name: 'Đông Âu',
          lat: 49,
          lon: 32,
          zoom: 4,
          posture: 'CRITICAL',
          score: 82,
          airCount: 14,
          seaCount: 4,
          conflictCount: 18,
          cyberCount: 9,
        },
      ],
      cyberCount: 95,
      earthquakeMajorCount: 3,
      geopoliticsCriticalCount: 12,
    });
    expect(threat.defcon).toBeLessThanOrEqual(3);
    expect(threat.score).toBeGreaterThanOrEqual(55);
  });

  it('normalizes Shodan InternetDB IP recon and NIST NVD CVE 2.0 lookup payloads', () => {
    const ipResult = normalizeShodanInternetDb(
      '45.148.10.240',
      {
        ip: '45.148.10.240',
        ports: [22, 80, 443],
        vulns: ['CVE-2024-38477', 'CVE-2021-40438'],
        cpes: ['cpe:/a:apache:http_server:2.4.29'],
        hostnames: ['edge.example.net'],
        tags: ['scanner'],
      },
      { country: 'Netherlands', city: 'Amsterdam', org: 'Serverius ASN' },
    );
    expect(ipResult.kind).toBe('ip');
    expect(ipResult.ports).toEqual([22, 80, 443]);
    expect(ipResult.vulns).toContain('CVE-2024-38477');
    expect(ipResult.riskLevel).toBe('critical');

    const cveResult = normalizeNvdCveLookup('CVE-2024-38477', {
      vulnerabilities: [
        {
          cve: {
            id: 'CVE-2024-38477',
            published: '2024-07-01T18:15:00.000',
            descriptions: [
              {
                lang: 'en',
                value: 'Null pointer dereference in mod_proxy in Apache HTTP Server allows remote DoS.',
              },
            ],
            metrics: {
              cvssMetricV31: [
                {
                  cvssData: {
                    baseScore: 7.5,
                    baseSeverity: 'HIGH',
                    vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
                  },
                },
              ],
            },
          },
        },
      ],
    });
    expect(cveResult?.kind).toBe('cve');
    expect(cveResult?.cvssScore).toBe(7.5);
    expect(cveResult?.cvssSeverity).toBe('HIGH');
  });
});
