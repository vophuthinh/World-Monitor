import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGeopoliticsGdelt, gdeltBulkCandidateUrls } from '../server/collectors/geopolitics-gdelt';

const LISTED = 'http://data.gdeltproject.org/gdeltv2/20261123124500.export.CSV.zip';

/** Minimal "stored" (no compression) single-file ZIP, enough for the collector's own unzip. */
function storedZip(name: string, text: string): Buffer {
  const data = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(0, 8); // method: stored
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  return Buffer.concat([header, Buffer.from(name), data]);
}

function eventRow(): string {
  const cols = new Array(61).fill('');
  cols[0] = '123456789';
  cols[6] = 'IRAN';
  cols[16] = 'UNITED STATES';
  cols[26] = '190';
  cols[28] = '19';
  cols[30] = '-10.0';
  cols[31] = '18';
  cols[52] = 'Strait of Hormuz, Iran';
  cols[56] = '26.56';
  cols[57] = '56.25';
  cols[60] = 'https://example.com/hormuz';
  return cols.join('\t');
}

describe('gdeltBulkCandidateUrls', () => {
  it('lists the newest file first (as https), then earlier 15-minute slots', () => {
    expect(gdeltBulkCandidateUrls(LISTED, 3)).toEqual([
      'https://data.gdeltproject.org/gdeltv2/20261123124500.export.CSV.zip',
      'https://data.gdeltproject.org/gdeltv2/20261123123000.export.CSV.zip',
      'https://data.gdeltproject.org/gdeltv2/20261123121500.export.CSV.zip',
      'https://data.gdeltproject.org/gdeltv2/20261123120000.export.CSV.zip',
    ]);
  });

  it('rolls over midnight and falls back to the single listed URL when the name is unexpected', () => {
    expect(gdeltBulkCandidateUrls('http://data.gdeltproject.org/gdeltv2/20261123000000.export.CSV.zip', 1)[1]).toBe(
      'https://data.gdeltproject.org/gdeltv2/20261122234500.export.CSV.zip',
    );
    expect(gdeltBulkCandidateUrls('http://example.com/odd-name.zip', 5)).toEqual(['https://example.com/odd-name.zip']);
  });
});

describe('fetchGeopoliticsGdelt bulk fallback', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockFetch = (zipStatus: (url: string) => number) => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('api.gdeltproject.org')) return new Response(null, { status: 404 }); // dead primary API
      if (url.endsWith('lastupdate.txt')) return new Response(`70588 abc ${LISTED}\n`, { status: 200 });
      const status = zipStatus(url);
      if (status !== 200) return new Response(null, { status });
      return new Response(new Uint8Array(storedZip('x.export.CSV', eventRow())), { status: 200 });
    });
    return calls;
  };

  it('walks back to an earlier slot when the newest files are 404 for this network', async () => {
    const calls = mockFetch((url) => (url.includes('1245') || url.includes('1230') ? 404 : 200));
    const events = await fetchGeopoliticsGdelt();
    expect(events).toHaveLength(1);
    const zips = calls.filter((u) => u.endsWith('.export.CSV.zip'));
    expect(zips.map((u) => u.match(/(\d{14})/)![1])).toEqual(['20261123124500', '20261123123000', '20261123121500']);
  });

  it('still fails with an HTTP 404 message when every recent slot is missing', async () => {
    mockFetch(() => 404);
    await expect(fetchGeopoliticsGdelt()).rejects.toThrow(/GDELT export CSV HTTP 404/);
  });

  it('does not walk back on a server error (only 404 means "not available here")', async () => {
    const calls = mockFetch(() => 503);
    await expect(fetchGeopoliticsGdelt()).rejects.toThrow(/HTTP 503/);
    expect(calls.filter((u) => u.endsWith('.export.CSV.zip'))).toHaveLength(1);
  });
});
