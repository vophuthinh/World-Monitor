import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRegionalWarnings,
  parseBmkgNowcastRss,
  parseHkoWarningSummary,
} from '../server/collectors/regional-warnings';

const BMKG_XML = readFileSync(join(__dirname, 'fixtures', 'bmkg-nowcast-rss.xml'), 'utf8');
// The fixture was captured 2026-11-23 ~17:31 UTC; items are issued up to a few hours before.
const NOW = Date.parse('2026-11-23T17:40:00Z');

describe('parseBmkgNowcastRss (real BMKG feed)', () => {
  const items = parseBmkgNowcastRss(BMKG_XML, NOW);

  it('parses every current alert with title, area, time, description and a bmkg.go.id link', () => {
    expect(items.length).toBeGreaterThanOrEqual(15);
    const first = items.find((w) => w.title === 'Thunderstorm Tonight in Kalimantan Tengah')!;
    expect(first).toBeDefined();
    expect(first.source).toBe('BMKG');
    expect(first.area).toBe('Kalimantan Tengah');
    expect(first.issuedAt).toBe(Date.parse('2026-11-24T00:10:00+07:00'));
    expect(first.description).toContain('Thunderstorms and heavy rainfall');
    expect(first.description!.length).toBeLessThanOrEqual(260);
    expect(first.url).toMatch(/^https:\/\/www\.bmkg\.go\.id\//);
    expect(first.id).toBe('bmkg:2.49.0.1.360.0.2026.11.23.17.62.011');
    expect(first.severity).toBe('medium');
  });

  it('has unique ids, sorts newest first and never links outside bmkg.go.id', () => {
    expect(new Set(items.map((w) => w.id)).size).toBe(items.length);
    const times = items.map((w) => w.issuedAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const w of items) expect(w.url).toMatch(/^https:\/\/([a-z0-9-]+\.)*bmkg\.go\.id\//);
  });

  it('drops alerts older than 12 hours and malformed items', () => {
    expect(parseBmkgNowcastRss(BMKG_XML, NOW + 20 * 3_600_000)).toEqual([]);
    expect(parseBmkgNowcastRss('<rss><channel><item><title>x</title></item></channel></rss>', NOW)).toEqual([]);
    expect(parseBmkgNowcastRss('not xml at all', NOW)).toEqual([]);
    expect(parseBmkgNowcastRss('', NOW)).toEqual([]);
  });

  it('rates extreme / flood wording as high and refuses a link to another host', () => {
    const xml = `<rss><channel>
      <item><title>Extreme Weather in Jawa Barat</title><link>https://evil.example.com/a.xml</link>
        <pubDate>Mon, 23 Nov 2026 17:30:00 +0000</pubDate><guid>g1</guid><description>Flash flood risk</description></item>
      <item><title>Heavy Rain in Bali</title><link>https://www.bmkg.go.id/alerts/nowcast/en/x.xml</link>
        <pubDate>Mon, 23 Nov 2026 17:20:00 +0000</pubDate><guid>g2</guid><description>Heavy rain</description></item>
    </channel></rss>`;
    const out = parseBmkgNowcastRss(xml, NOW);
    expect(out.find((w) => w.id === 'bmkg:g1')!.severity).toBe('high');
    expect(out.find((w) => w.id === 'bmkg:g1')!.url).toBe('https://www.bmkg.go.id/');
    expect(out.find((w) => w.id === 'bmkg:g2')!.url).toContain('bmkg.go.id/alerts');
  });
});

describe('parseHkoWarningSummary', () => {
  it('returns nothing for "no warning in force" ({} as served live on 2026-11-23)', () => {
    expect(parseHkoWarningSummary({}, NOW)).toEqual([]);
    expect(parseHkoWarningSummary(null, NOW)).toEqual([]);
    expect(parseHkoWarningSummary('garbage', NOW)).toEqual([]);
  });

  // NOTE: the shape below follows HKO's published open-data documentation (warnsum). It was NOT observed live
  // because no warning was in force when this was written, so it is a synthetic fixture.
  it('parses documented warning entries, skips cancelled ones, rates tropical cyclone signals high', () => {
    const doc = {
      WTCSGNL: { name: 'Tropical Cyclone Warning Signal', code: 'TC8NE', type: 'No. 8 Northeast Gale or Storm Signal', actionCode: 'ISSUE', issueTime: '2026-11-23T20:00:00+08:00', updateTime: '2026-11-23T20:00:00+08:00' },
      WRAIN: { name: 'Amber Rainstorm Warning Signal', code: 'WRAINA', actionCode: 'REISSUE', issueTime: '2026-11-23T19:00:00+08:00', updateTime: '2026-11-23T19:30:00+08:00' },
      WFIREY: { name: 'Yellow Fire Danger Warning', code: 'WFIREY', actionCode: 'CANCEL', issueTime: '2026-11-23T10:00:00+08:00', updateTime: '2026-11-23T18:00:00+08:00' },
      BAD: { code: 'x' },
    };
    const out = parseHkoWarningSummary(doc, NOW);
    expect(out.map((w) => w.id).sort()).toEqual(['hko:WRAIN', 'hko:WTCSGNL']);
    const tc = out.find((w) => w.id === 'hko:WTCSGNL')!;
    expect(tc.source).toBe('HKO');
    expect(tc.severity).toBe('high');
    expect(tc.title).toContain('Tropical Cyclone');
    expect(tc.description).toContain('No. 8');
    expect(tc.issuedAt).toBe(Date.parse('2026-11-23T20:00:00+08:00'));
    expect(out.find((w) => w.id === 'hko:WRAIN')!.severity).toBe('medium');
    expect(out[0].issuedAt).toBeGreaterThanOrEqual(out[1].issuedAt);
  });
});

describe('fetchRegionalWarnings', () => {
  afterEach(() => vi.restoreAllMocks());

  const mock = (bmkg: () => Response, hko: () => Response) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = String(input);
      return u.includes('bmkg.go.id') ? bmkg() : hko();
    });

  it('merges both sources, newest first, and reports which source answered', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mock(() => new Response(BMKG_XML, { status: 200 }), () => new Response(JSON.stringify({ WRAIN: { name: 'Amber Rainstorm Warning Signal', code: 'WRAINA', actionCode: 'ISSUE', issueTime: '2026-11-24T00:30:00+08:00' } }), { status: 200 }));
    const snap = await fetchRegionalWarnings();
    expect(snap.bmkgOk).toBe(true);
    expect(snap.hkoOk).toBe(true);
    expect(snap.warnings.some((w) => w.source === 'HKO')).toBe(true);
    expect(snap.warnings.some((w) => w.source === 'BMKG')).toBe(true);
    const t = snap.warnings.map((w) => w.issuedAt);
    expect([...t].sort((a, b) => b - a)).toEqual(t);
    expect(snap.warnings.length).toBeLessThanOrEqual(12);
  });

  it('still works when one source is down and fails only when both are down', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mock(() => new Response('x', { status: 503 }), () => new Response('{}', { status: 200 }));
    const onlyHko = await fetchRegionalWarnings();
    expect(onlyHko.bmkgOk).toBe(false);
    expect(onlyHko.hkoOk).toBe(true);
    expect(onlyHko.warnings).toEqual([]);
    mock(() => new Response('x', { status: 503 }), () => new Response('x', { status: 503 }));
    await expect(fetchRegionalWarnings()).rejects.toThrow();
  });
});
