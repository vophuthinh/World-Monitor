import { describe, expect, it } from 'vitest';
import { compareSources } from '../server/collectors/markets/cross-check';
import { parseGdeltExportTsv } from '../server/collectors/geopolitics-gdelt';
import { matchGeoLocation } from '../server/collectors/polymarket-news';
import { RegimeHistoryLedger, SCORING_VERSION } from '../server/lib/regime-ledger';

const side = (value: number, asOf?: string) => ({ value, source: 'S', ...(asOf ? { asOf } : {}) });
const now = Date.parse('2026-11-26T00:00:00Z');

describe('two-source cross-check', () => {
  it('flags a gap above tolerance and accepts one inside it', () => {
    expect(compareSources('pb', 'P/B', side(0.88), side(1.81, '2026-11-25'), 10, now)).toMatchObject({ mismatch: true, diffPct: 51.4 });
    expect(compareSources('pe', 'P/E', side(10.11), side(10.61, '2026-11-25'), 10, now)?.mismatch).toBe(false);
  });

  it('flags a matching figure whose reference data is more than 400 days old', () => {
    expect(compareSources('pe', 'P/E', side(3.98), side(3.98, '2023-12-31'), 10, now))
      .toMatchObject({ mismatch: true, stale: true });
  });

  it('returns nothing when either side has no usable number', () => {
    expect(compareSources('x', 'X', side(Number.NaN), side(1), 1, now)).toBeNull();
    expect(compareSources('x', 'X', side(1), side(0), 1, now)).toBeNull();
  });
});

describe('conflict map noise', () => {
  const row = (id: string, root: string, lat: number, a1: [string, string], a2: [string, string]) => {
    const c = Array(61).fill('');
    c[0] = id; c[28] = root; c[26] = `${root}0`; c[31] = '5'; c[52] = 'Place'; c[56] = String(lat); c[57] = '10';
    c[6] = 'A'; c[7] = a1[0]; c[12] = a1[1]; c[16] = 'B'; c[17] = a2[0]; c[22] = a2[1];
    return c.join('\t');
  };

  it('keeps military-labelled events only with an armed actor or two different countries', () => {
    const tsv = [
      row('crime', '19', 1, ['USA', 'CVL'], ['USA', '']),
      row('noise', '19', 2, ['', ''], ['', '']),
      row('army', '19', 3, ['', 'MIL'], ['', '']),
      row('interstate', '19', 4, ['RUS', ''], ['UKR', '']),
      row('protest', '14', 5, ['', ''], ['', '']),
    ].join('\n');
    expect(parseGdeltExportTsv(tsv, now).map((e) => e.id).sort()).toEqual(['gdelt:army', 'gdelt:interstate', 'gdelt:protest']);
  });
});

describe('news geotagging', () => {
  it('does not pin sports stories on the map', () => {
    for (const title of ['U17 Trung Quốc thắng đậm U17 Fiji', 'Taekwondo TP.HCM giành 3 HCV', 'Bảng xếp hạng U17 World Cup: Việt Nam'])
      expect(matchGeoLocation(title), title).toBeNull();
    expect(matchGeoLocation('Trung Quốc điều tra quan chức Thượng Hải')?.name).toBe('Trung Quốc');
  });
});

describe('score history', () => {
  it('stamps each new entry with the scoring version', () => {
    const ledger = new RegimeHistoryLedger(`${process.env.TMPDIR ?? '.'}/wm-ledger-${process.pid}`);
    const history = ledger.recordSnapshot({
      quotes: [{ symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1600, changePercent24h: 0, updatedAt: now, source: 'test' }],
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
      fred: [{ id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5, change: 0, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [] }],
    }, [], [], now);
    expect(history.at(-1)?.scoringVersion).toBe(SCORING_VERSION);
  });
});

describe('server payloads', () => {
  it('keeps cross-checks in the bootstrap response and drops future-dated cached news', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('server/app.ts', 'utf8')).toContain('crossChecks: rawMarkets.crossChecks');
    const { UnifiedNewsStreamService } = await import('../server/realtime/news-stream');
    const stream = new UnifiedNewsStreamService({} as never, { get: () => null } as never);
    const item = (id: string, publishedAt: number) =>
      ({ id, title: `Headline ${id}`, source: 'S', category: 'vietnam' as const, streamSource: 'rss' as const, publishedAt, url: `https://example.com/${id}` });
    stream.ingestBatchItems([item('future', Date.now() + 6 * 3_600_000), item('past', Date.now() - 60_000)]);
    expect(stream.getUnifiedNews().map((n) => n.id)).toEqual(['past']);
  });
});
