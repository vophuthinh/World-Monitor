import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExpiredMacroNotices } from '../client/src/components/right-panel/MacroHealthSection';
import { normalizeWorldBankIndicators } from '../server/collectors/macro-worldbank';
import {
  mergeFredWithPrevious,
  mergeVietnamMacroPulse,
  markMarketSnapshotRetained,
  parseTradingEconomicsVietnamHtml,
  parseVietnamOfficialYtdContext,
} from '../server/collectors/markets-crypto';
import { RegimeHistoryLedger } from '../server/lib/regime-ledger';
import {
  collectExpiredMacroNotices,
  evaluateInvestmentCompass,
  evaluateMacroHealth,
} from '../shared/macro-health';
import { collectObservationWarnings } from '../shared/macro/observation-freshness';
import type { FredMacroMetric, MarketSnapshot } from '../shared/types';

describe('observation freshness', () => {
  it('warns about old observations and unknown periods without excluding fresh fetches', () => {
    const now = Date.UTC(2026, 10, 23);
    const market: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now,
      fred: [
        { id: 'CPIAUCSL', label: 'CPI', subtitle: 'CPI Mỹ', value: 3, change: 0, unit: '%', date: '2025-01-01', fetchedAt: now, retained: false, sparkline: [] },
        { id: 'A191RL1Q225SBEA', label: 'GDP', subtitle: 'GDP Mỹ', value: 2, change: 0, unit: '%', date: '2026-07-01', fetchedAt: now, retained: false, sparkline: [] },
      ],
      vnMacroPulse: {
        manufacturingPmi: 50, quarterlyGdpPct: 6, updatedAt: now,
        fieldMeta: {
          manufacturingPmi: { source: 'TE', period: 'T1/2026', fetchedAt: now },
          quarterlyGdpPct: { source: 'TE', period: 'Q3/2026', fetchedAt: now },
        },
      },
    };
    const warnings = collectObservationWarnings(market, now);
    expect(warnings.us).toEqual(['CPI Mỹ: 2025-01-01']);
    expect(warnings.vn).toEqual(['PMI sản xuất: T1/2026']);
    expect(evaluateMacroHealth(market, [], now).us?.pillars.flatMap((pillar) => pillar.metrics).some((m) => m.id === 'CPIAUCSL')).toBe(true);
    market.vnMacroPulse!.fieldMeta!.manufacturingPmi!.period = undefined;
    expect(collectObservationWarnings(market, now).vn).toContain('PMI sản xuất: không rõ kỳ');
    market.vnMacroPulse!.fieldMeta!.quarterlyGdpPct!.period = 'Q4/2026';
    expect(collectObservationWarnings(market, now).vn).not.toContain('GDP quý: Q4/2026');
    market.vnMacroPulse!.fieldMeta!.quarterlyGdpPct!.period = 'Q1/2027';
    expect(collectObservationWarnings(market, now).vn).toContain('GDP quý: Q1/2027');
  });

  it('marks retained VN30 quotes without changing their fetch time', () => {
    const market: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: 10,
      vn30: [{ symbol: 'AAA', name: 'A', sector: 'A', priceThousandVnd: 1, changePercent: 0, volume: 1, sparkline: [], updatedAt: 10 }],
    };
    expect(markMarketSnapshotRetained(market, 20).vn30?.[0]).toMatchObject({ retained: true, updatedAt: 10 });
  });
});

describe('RegimeHistoryLedger data integrity (no mixed-frequency fake history)', () => {
  it('records only observed days when sparkline dates are unavailable', () => {
    const nowMs = Date.UTC(2026, 10, 22, 10, 0, 0);
    const snap: MarketSnapshot = {
      quotes: [
        {
          symbol: 'VN-Index',
          name: 'VN-Index',
          group: 'index',
          price: 1650,
          changePercent24h: -0.4,
          ma50: 1700,
          ma200: 1720,
          peRatio: 12.0,
          sparkline: [1680, 1675, 1668, 1660, 1650],
          updatedAt: nowMs,
          source: 'HOSE',
        },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      // Monthly/quarterly FRED series whose sparkline spans quarters/months, NOT days:
      fred: [
        {
          id: 'WALCL',
          label: 'Fed Assets',
          subtitle: 'Fed Assets',
          value: 7_000_000,
          change: 0,
          unit: 'M$',
          date: '2026-11-18',
          pillar: 'leading',
          sparkline: [1_000_000, 2_000_000, 3_000_000, 4_000_000, 7_000_000],
        },
        {
          id: 'WTREGEN',
          label: 'TGA',
          subtitle: 'TGA',
          value: 800_000,
          change: 0,
          unit: 'M$',
          date: '2026-11-18',
          pillar: 'leading',
          sparkline: [800_000, 800_000, 800_000, 800_000, 800_000],
        },
        {
          id: 'RRPONTSYD',
          label: 'RRP',
          subtitle: 'RRP',
          value: 200,
          change: 0,
          unit: 'B$',
          date: '2026-11-18',
          pillar: 'leading',
          sparkline: [200, 200, 200, 200, 200],
        },
      ],
      updatedAt: nowMs,
    };

    const tempDir = mkdtempSync(join(tmpdir(), 'wm-ledger-pure-'));
    try {
      const ledger = new RegimeHistoryLedger(tempDir);
      const timeline = ledger.recordSnapshot(snap, [], [], nowMs);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].reconstructed).toBe(false);
      expect(timeline[0].vnMacroScore).toBeUndefined();
      expect(timeline[0].usMacroScore).toBeUndefined();

      // Disk file must ONLY contain observed daily snapshots, never reconstructed ones
      const persisted = JSON.parse(readFileSync(join(tempDir, 'regime-history.json'), 'utf8')) as Array<{
        date: string;
        reconstructed?: boolean;
        observedAt?: number;
      }>;
      expect(persisted).toHaveLength(1);
      expect(persisted[0].date).toBe('2026-11-22');
      expect(persisted[0].reconstructed).not.toBe(true);
      expect(typeof persisted[0].observedAt).toBe('number');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Macro indicator source, period, and retained-on-failure tracking', () => {
  it('only uses monthly CPI with a verifiable recent observation period', () => {
    const now = Date.UTC(2026, 10, 22);
    const vn = {
      countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
      gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
      cpiInflationPct: null, cpiYear: null,
    };
    const cpiFor = (period: string) => {
      const html = `<tr><td><a href="/vietnam/inflation-cpi">CPI</a></td><td>9</td><td>8</td><td>pct</td><td>${period}</td></tr>`;
      const pulse = parseTradingEconomicsVietnamHtml(html, '', now);
      const snapshot: MarketSnapshot = {
        quotes: [], crypto: [], fearGreed: null, macro: [vn], updatedAt: now,
        vnMacroPulse: { ...pulse, updatedAt: now },
      };
      return evaluateMacroHealth(snapshot, [], now).vn?.pillars
        .flatMap((pillar) => pillar.metrics).find((metric) => metric.id === 'vn-cpi');
    };
    expect(cpiFor('2026-03-01')).toBeUndefined();
    expect(cpiFor('unknown')).toBeUndefined();
    expect(cpiFor('2026-08-01')?.actual).toBe(9);
    expect(cpiFor('Oct/26')?.actual).toBe(9);
    expect(cpiFor('2026-12-01')).toBeUndefined();
    expect(cpiFor('2026-11-30')).toBeUndefined();
  });

  it('reports an expired core CPI even when headline CPI is fresh', () => {
    const now = Date.UTC(2026, 10, 22);
    const snapshot: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, updatedAt: now,
      macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
        gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
        cpiInflationPct: null, cpiYear: null,
      }],
      vnMacroPulse: {
        ytdAvgCpiPct: 4, ytdCoreCpiPct: 6, updatedAt: now,
        fieldMeta: {
          ytdAvgCpiPct: { source: 'NSO', period: '10T/2026', fetchedAt: now, retained: false },
          ytdCoreCpiPct: { source: 'NSO', period: '10T/2026', fetchedAt: now - 8 * 86_400_000, retained: true },
        },
      },
    };
    const report = evaluateMacroHealth(snapshot, [], now).vn;
    const cpi = report?.pillars.flatMap((pillar) => pillar.metrics).find((metric) => metric.id === 'vn-cpi');
    expect(cpi?.trendLabel ?? '').not.toContain('Lõi');
    expect(report?.expiredMetrics).toContainEqual(expect.objectContaining({
      id: 'ytdCoreCpiPct', periodLabel: '10T/2026', lastValueLabel: '6.00%',
    }));
    const markup = renderToStaticMarkup(createElement(ExpiredMacroNotices, { notices: report?.expiredMetrics ?? [] }));
    expect(markup).toContain('CPI Lõi Bình quân Lũy kế');
    expect(markup).toContain('10T/2026');
    expect(markup).toContain('6.00%');
  });

  it('uses CPI core only when its period matches headline CPI and does not treat prior-year CPI as current', () => {
    const now = Date.UTC(2026, 2, 1);
    const meta = (period: string) => ({ source: 'NSO', period, fetchedAt: now, retained: false });
    const snapshot: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null,
      macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
        gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
        cpiInflationPct: null, cpiYear: null,
      }],
      vnMacroPulse: {
        ytdAvgCpiPct: 4, ytdCoreCpiPct: 2, ytdCpiMonths: 2, updatedAt: now,
        fieldMeta: { ytdAvgCpiPct: meta('2T/2026'), ytdCoreCpiPct: meta('10T/2025') },
      },
      updatedAt: now,
    };
    const cpi = (s: MarketSnapshot) => evaluateMacroHealth(s, [], now).vn?.pillars
      .flatMap((p) => p.metrics).find((m) => m.id === 'vn-cpi');
    expect(cpi(snapshot)?.trendLabel).toBeUndefined();
    const samePeriod = {
      ...snapshot,
      vnMacroPulse: { ...snapshot.vnMacroPulse!, fieldMeta: {
        ytdAvgCpiPct: meta('2T/2026'), ytdCoreCpiPct: meta('2T/2026'),
      } },
    };
    expect(cpi(samePeriod)?.trendLabel).toContain('Lõi BQ 2.00%');
    const previousYear = {
      ...snapshot,
      vnMacroPulse: { ...snapshot.vnMacroPulse!, fieldMeta: {
        ytdAvgCpiPct: meta('10T/2025'), ytdCoreCpiPct: meta('10T/2025'),
      } },
    };
    expect(cpi(previousYear)).toBeUndefined();
    const newYearInVietnam = Date.UTC(2026, 11, 31, 17);
    expect(evaluateMacroHealth(samePeriod, [], newYearInVietnam).vn?.pillars
      .flatMap((p) => p.metrics).find((m) => m.id === 'vn-cpi')).toBeUndefined();

    const retainedCore = {
      ...samePeriod,
      vnMacroPulse: { ...samePeriod.vnMacroPulse, fieldMeta: {
        ytdAvgCpiPct: meta('2T/2026'),
        ytdCoreCpiPct: { ...meta('2T/2026'), retained: true },
      } },
    };
    expect(cpi(retainedCore)?.retained).toBe(true);
  });

  it('excludes retained series older than seven days from both macro health and compass', () => {
    const now = Date.UTC(2026, 10, 22);
    const sevenDays = 7 * 86_400_000;
    const fred: FredMacroMetric = {
      id: 'FEDFUNDS', label: 'Fed', subtitle: 'Fed', value: 4, change: 0, unit: '%',
      date: '2026-10-01', sparkline: [4], retained: true, fetchedAt: now - sevenDays,
    };
    const snapshot: MarketSnapshot = {
      quotes: [], crypto: [], fearGreed: null, macro: [], fred: [fred], updatedAt: now,
    };
    expect(evaluateMacroHealth(snapshot, [], now).us).not.toBeNull();
    expect(evaluateMacroHealth({ ...snapshot, fred: [{ ...fred, fetchedAt: now - sevenDays - 1 }] }, [], now).us).toBeNull();
    const liquidity = { ...fred, id: 'M2SL', value: 5 };
    expect(evaluateInvestmentCompass({ ...snapshot, fred: [liquidity] }, [], now)).not.toBeNull();
    expect(evaluateInvestmentCompass({
      ...snapshot, fred: [{ ...liquidity, fetchedAt: now - sevenDays - 1 }],
    }, [], now)).toBeNull();
    expect(evaluateMacroHealth({
      ...snapshot, fred: [{ ...fred, fetchedAt: undefined }],
    }, [], now).us).toBeNull();

    const vnSnapshot: MarketSnapshot = {
      ...snapshot,
      macro: [{
        countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
        gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
        cpiInflationPct: null, cpiYear: null,
      }],
      vnMacroPulse: {
        monthlyCpiPct: 3, ytdAvgCpiPct: 4, ytdCoreCpiPct: 2, ytdCpiMonths: 10, updatedAt: now,
        fieldMeta: {
          monthlyCpiPct: { source: 'TE', period: 'T10/2026', fetchedAt: now, retained: false },
          ytdAvgCpiPct: { source: 'NSO', period: '10T/2026', fetchedAt: now - sevenDays - 1, retained: true },
          ytdCoreCpiPct: { source: 'NSO', period: '10T/2026', fetchedAt: now, retained: false },
        },
      },
    };
    const cpi = evaluateMacroHealth(vnSnapshot, [], now).vn?.pillars
      .flatMap((p) => p.metrics).find((m) => m.id === 'vn-cpi');
    expect(cpi?.actual).toBe(3);
    expect(cpi?.name).toContain('CPI Tháng');
    expect(cpi?.trendLabel ?? '').not.toContain('Lõi');
    expect(vnSnapshot.vnMacroPulse?.ytdAvgCpiPct).toBe(4);
  });

  it('omits expired bond yields and valuation rather than substituting a yield for ERP', () => {
    const now = Date.UTC(2026, 10, 22);
    const expired = now - 7 * 86_400_000 - 1;
    const snapshot: MarketSnapshot = {
      quotes: [{ symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1500,
        changePercent24h: 0, peRatio: 12, valuationFetchedAt: now, updatedAt: now, source: 'HOSE' }],
      crypto: [], fearGreed: null,
      macro: [{ countryCode: 'VNM', countryName: 'Việt Nam', regionLabel: 'ASEAN',
        gdpGrowthPct: 6, gdpGrowthYear: 2025, gdpCurrentUsd: null, gdpCurrentYear: null,
        cpiInflationPct: null, cpiYear: null }],
      vnMacroPulse: { vn10yYieldPct: 4, updatedAt: now, fieldMeta: {
        vn10yYieldPct: { source: 'TE', fetchedAt: expired, retained: true },
      } },
      updatedAt: now,
    };
    const vnMetrics = (s: MarketSnapshot) => evaluateMacroHealth(s, [], now).vn?.pillars
      .flatMap((pillar) => pillar.metrics);
    expect(vnMetrics(snapshot)?.find((metric) => metric.id === 'vn-erp')).toBeUndefined();
    expect(evaluateInvestmentCompass(snapshot, [], now)?.vnErpPct).toBeUndefined();

    const freshBond = { ...snapshot, vnMacroPulse: { ...snapshot.vnMacroPulse!, fieldMeta: {
      vn10yYieldPct: { source: 'TE', fetchedAt: now, retained: false },
    } } };
    expect(vnMetrics(freshBond)?.find((metric) => metric.id === 'vn-erp')).toBeDefined();
    expect(evaluateInvestmentCompass(freshBond, [], now)?.vnErpPct).toBeDefined();

    const expiredValuation = { ...freshBond, quotes: [{
      ...freshBond.quotes[0], valuationRetained: true, valuationFetchedAt: expired,
    }] };
    expect(vnMetrics(expiredValuation)?.find((metric) => metric.id === 'vn-erp')).toBeUndefined();
    expect(evaluateInvestmentCompass(expiredValuation, [], now)?.vnErpPct).toBeUndefined();
  });

  it('omits VN30 breadth when its last successful collection is more than seven days old', () => {
    const now = Date.UTC(2026, 10, 22);
    const snapshot: MarketSnapshot = {
      quotes: [{ symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1500,
        changePercent24h: 0, updatedAt: now, source: 'HOSE' }],
      crypto: [], fearGreed: null, macro: [], updatedAt: now,
      vn30: ['AAA', 'BBB', 'CCC', 'DDD'].map((symbol) => ({ symbol, name: symbol, sector: 'test', priceThousandVnd: 20,
        changePercent: 0, volume: 1, sparkline: [], ma50: 15, ma200: 15,
        updatedAt: now - 7 * 86_400_000 })),
    };
    expect(evaluateInvestmentCompass(snapshot, [], now)?.signals.some((s) => s.id === 'vn30-breadth')).toBe(true);
    const expired = { ...snapshot, vn30: snapshot.vn30!.map((quote) => ({
      ...quote, updatedAt: now - 7 * 86_400_000 - 1,
    })) };
    expect(evaluateInvestmentCompass(expired, [], now)?.signals.some((s) => s.id === 'vn30-breadth')).toBe(false);
  });

  it('extracts reference periods & sources for VN macro pulse and marks retained fields when an upstream fails', () => {
    const t1 = Date.UTC(2026, 10, 22, 8, 0, 0);
    const t2 = Date.UTC(2026, 10, 22, 10, 0, 0);

    const teParsed = parseTradingEconomicsVietnamHtml(
      `<table>
        <tr><td><a href='/vietnam/manufacturing-pmi'>Manufacturing PMI</a></td><td>52.3</td><td>51.9</td><td>pts</td><td>Oct/26</td></tr>
        <tr><td><a href='/vietnam/gdp-growth-annual'>GDP Annual Growth Rate</a></td><td>7.40</td><td>6.93</td><td>%</td><td>Sep/26</td></tr>
      </table>`,
      `<meta name="description" content="The yield on Vietnam 10Y Bond Yield held steady at 4.57% on November 20, 2026." />`,
      t1,
    );

    expect(teParsed.fieldMeta?.manufacturingPmi?.period).toBe('T10/2026');
    expect(teParsed.fieldMeta?.manufacturingPmi?.source).toContain('S&P Global');
    expect(teParsed.fieldMeta?.vn10yYieldPct?.period).toBe('20/11/2026');

    const nsoParsed = parseVietnamOfficialYtdContext({
      nsoPostsJson: JSON.stringify([
        {
          date: '2026-11-06T09:00:00',
          title: { rendered: 'Thông cáo báo chí tình hình kinh tế - xã hội tháng Mười và 10 tháng năm 2026' },
          content: {
            rendered:
              'Bình quân mười tháng năm 2026, CPI tăng 4,57% so với cùng kỳ năm trước; lạm phát cơ bản tăng 4,24%.',
          },
        },
      ]),
      now: t1,
    });

    expect(nsoParsed.fieldMeta?.ytdAvgCpiPct?.source).toBe('Cục Thống kê (NSO)');
    expect(nsoParsed.fieldMeta?.ytdAvgCpiPct?.period).toBe('10T/2026');

    const initialPulse = mergeVietnamMacroPulse(
      {
        ...teParsed,
        ...nsoParsed,
        fieldMeta: { ...teParsed.fieldMeta, ...nsoParsed.fieldMeta },
        updatedAt: t1,
      },
      undefined,
      t1,
    );
    expect(initialPulse?.fieldMeta?.manufacturingPmi?.retained).toBe(false);
    expect(initialPulse?.fieldMeta?.ytdAvgCpiPct?.retained).toBe(false);

    // Cycle t2: TradingEconomics fails (no PMI/GDP/10Y in fresh), while NSO still succeeds
    const partialFresh = {
      ...nsoParsed,
      updatedAt: t2,
    };
    const mergedAfterFailure = mergeVietnamMacroPulse(partialFresh, initialPulse, t2);
    expect(mergedAfterFailure?.manufacturingPmi).toBe(52.3);
    expect(mergedAfterFailure?.fieldMeta?.manufacturingPmi?.retained).toBe(true);
    expect(mergedAfterFailure?.fieldMeta?.manufacturingPmi?.fetchedAt).toBe(t1);
    expect(mergedAfterFailure?.fieldMeta?.ytdAvgCpiPct?.retained).toBe(false);
    expect(mergedAfterFailure?.fieldMeta?.ytdAvgCpiPct?.fetchedAt).toBe(t2);
  });

  it('retains individual failed FRED series with retained=true and preserves World Bank per-indicator years in MacroHealth', () => {
    const t1 = Date.UTC(2026, 10, 22, 8, 0, 0);
    const t2 = Date.UTC(2026, 10, 22, 10, 0, 0);

    const prevFred: FredMacroMetric[] = [
      {
        id: 'FEDFUNDS',
        label: 'Fed Funds',
        subtitle: 'Lãi suất Điều hành Fed',
        value: 3.88,
        change: 0,
        unit: '%',
        date: '2026-10-01',
        pillar: 'monetary',
        source: 'FRED',
        fetchedAt: t1,
        retained: false,
        sparkline: [3.88, 3.88],
      },
      {
        id: 'CPIAUCSL',
        label: 'US CPI YoY',
        subtitle: 'Lạm phát Tiêu dùng CPI (YoY)',
        value: 2.6,
        change: 0.1,
        unit: '%',
        date: '2026-10-01',
        pillar: 'inflation',
        source: 'FRED',
        fetchedAt: t1,
        retained: false,
        sparkline: [2.5, 2.6],
      },
    ];

    // Cycle t2: CPIAUCSL batch failed, only FEDFUNDS returned fresh
    const mergedFred = mergeFredWithPrevious([prevFred[0]], prevFred, t2);
    const fedOut = mergedFred.find((m) => m.id === 'FEDFUNDS');
    const cpiOut = mergedFred.find((m) => m.id === 'CPIAUCSL');
    expect(fedOut?.retained).toBe(false);
    expect(fedOut?.fetchedAt).toBe(t2);
    expect(cpiOut?.retained).toBe(true);
    expect(cpiOut?.fetchedAt).toBe(t1);

    // World Bank: GDP is 2025 while Private Credit/GDP is lagged at 2023
    const wbRows = normalizeWorldBankIndicators(
      [{}, [{ countryiso3code: 'VNM', date: '2025', value: 6.5 }]],
      [{}, [{ countryiso3code: 'VNM', date: '2025', value: 460_000_000_000 }]],
      [{}, [{ countryiso3code: 'VNM', date: '2025', value: 3.6 }]],
      {
        creditRaw: [{}, [{ countryiso3code: 'VNM', date: '2023', value: 125.4 }]],
      },
    );
    const vnRow = wbRows.find((r) => r.countryCode === 'VNM');
    expect(vnRow?.gdpGrowthYear).toBe(2025);
    expect(vnRow?.creditYear).toBe(2023);

    // Propagate sourceLabel, exact periodLabel, and retained flag into EconomyHealthReport metrics
    const health = evaluateMacroHealth(
      {
        quotes: [],
        crypto: [],
        fearGreed: null,
        macro: wbRows,
        fred: mergedFred,
        vnMacroPulse: {
          manufacturingPmi: 52.3,
          updatedAt: t2,
          fieldMeta: {
            manufacturingPmi: {
              source: 'S&P Global / TE',
              period: 'T10/2026',
              fetchedAt: t1,
              retained: true,
            },
          },
        },
        updatedAt: t2,
      },
      [],
      t2,
    );

    const vnPmiMetric = health.vn?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'vn-pmi');
    const vnCreditMetric = health.vn?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'vn-credit');
    expect(vnPmiMetric?.sourceLabel).toBe('S&P Global / TE');
    expect(vnPmiMetric?.periodLabel).toBe('T10/2026');
    expect(vnPmiMetric?.retained).toBe(true);
    expect(vnCreditMetric?.sourceLabel).toBe('World Bank');
    expect(vnCreditMetric?.periodLabel).toBe('Năm 2023');

    const usCpiMetric = health.us?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'CPIAUCSL');
    const usFedMetric = health.us?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'FEDFUNDS');
    expect(usCpiMetric?.sourceLabel).toBe('FRED');
    expect(usCpiMetric?.periodLabel).toBe('2026-10');
    expect(usCpiMetric?.retained).toBe(true);
    expect(usFedMetric?.retained).toBe(false);
  });

  it('rejects legacy CPI/trade missing metadata, drops prior-year YTD trade at new year, and surfaces >7d expired notices on UI reports', () => {
    const now = Date.UTC(2026, 10, 22, 9, 0, 0);
    const eightDaysAgo = now - 8 * 86_400_000;

    // 1. Legacy cached vnMacroPulse without fieldMeta (or missing period on YTD CPI/trade, or >3m stale monthly CPI)
    const legacyNoMeta: MarketSnapshot = {
      quotes: [],
      crypto: [],
      fearGreed: null,
      macro: [{
        countryCode: 'VNM',
        countryName: 'Việt Nam',
        regionLabel: 'ASEAN',
        isVietnam: true,
        gdpGrowthPct: 7.5,
        gdpGrowthYear: 2025,
        gdpCurrentUsd: null,
        gdpCurrentYear: null,
        cpiInflationPct: 3.4,
        cpiYear: 2025,
      }],
      vnMacroPulse: {
        ytdAvgCpiPct: 4.57,
        ytdCoreCpiPct: 4.24,
        ytdCpiMonths: 10,
        monthlyCpiPct: 5.09,
        tradeBalanceBillionUsd: 2.1,
        ytdTradeBalanceBillionUsd: -12.07,
        updatedAt: now,
      },
      updatedAt: now,
    };

    const legacyHealth = evaluateMacroHealth(legacyNoMeta, [], now);
    const legacyMetrics = legacyHealth.vn?.pillars.flatMap((p) => p.metrics) ?? [];
    expect(legacyMetrics.find((m) => m.id === 'vn-cpi')).toBeUndefined();
    expect(legacyHealth.vn?.expiredMetrics).toContainEqual(expect.objectContaining({ id: 'monthlyCpiPct' }));
    expect(legacyHealth.vn?.regime).toBeUndefined();
    expect(legacyHealth.vn?.quadrant).toBeUndefined();
    expect(legacyMetrics.find((m) => m.id === 'vn-trade')?.trendLabel ?? '').not.toContain('-12.07');

    // Missing period on fieldMeta.ytdAvgCpiPct & stale >3m monthly CPI ('T6/2026' in Nov 2026) are also rejected
    const missingPeriodAndStaleMonthly: MarketSnapshot = {
      ...legacyNoMeta,
      vnMacroPulse: {
        ytdAvgCpiPct: 4.1,
        monthlyCpiPct: 4.9,
        updatedAt: now,
        fieldMeta: {
          ytdAvgCpiPct: { source: 'NSO', fetchedAt: now, retained: false },
          monthlyCpiPct: { source: 'TE', period: 'T6/2026', fetchedAt: now, retained: false },
        },
      },
    };
    expect(
      evaluateMacroHealth(missingPeriodAndStaleMonthly, [], now).vn?.pillars
        .flatMap((p) => p.metrics)
        .find((m) => m.id === 'vn-cpi'),
    ).toBeUndefined();

    // 2. At Vietnam New Year (2027-01-01 00:00 ICT), 2026 YTD trade ('12T/2026') is dropped synchronously with 2026 YTD CPI
    const newYearVn = Date.UTC(2026, 11, 31, 17, 0, 0);
    const crossYearTradeSnap: MarketSnapshot = {
      ...legacyNoMeta,
      vnMacroPulse: {
        tradeBalanceBillionUsd: 1.8,
        ytdTradeBalanceBillionUsd: -12.07,
        updatedAt: newYearVn,
        fieldMeta: {
          tradeBalanceBillionUsd: { source: 'Hải quan / TE', period: 'T12/2026', fetchedAt: newYearVn, retained: false },
          ytdTradeBalanceBillionUsd: { source: 'Cục Thống kê (NSO)', period: '12T/2026', fetchedAt: newYearVn, retained: false },
        },
      },
    };
    const nyHealth = evaluateMacroHealth(crossYearTradeSnap, [], newYearVn);
    const nyTradeMetric = nyHealth.vn?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'vn-trade');
    expect(nyTradeMetric).toBeDefined();
    expect(nyTradeMetric?.trendLabel ?? '').not.toContain('-12.07');
    expect(nyHealth.vn?.warningFlags.some((f) => f.text.includes('-12.07'))).toBe(false);

    // 3. Retained indicators > 7 days are excluded from scoring BUT surfaced via expiredMetrics / collectExpiredMacroNotices
    const expiredSnap: MarketSnapshot = {
      ...legacyNoMeta,
      fred: [
        {
          id: 'FEDFUNDS',
          label: 'Fed Funds',
          subtitle: 'Lãi suất Điều hành Fed',
          value: 3.88,
          change: 0,
          unit: '%',
          date: '2026-10-01',
          pillar: 'monetary',
          source: 'FRED',
          fetchedAt: now,
          retained: false,
          sparkline: [3.88],
        },
        {
          id: 'CPIAUCSL',
          label: 'US CPI',
          subtitle: 'Lạm phát Tiêu dùng CPI (YoY)',
          value: 2.6,
          change: 0,
          unit: '%',
          date: '2026-10-01',
          pillar: 'inflation',
          source: 'FRED',
          fetchedAt: eightDaysAgo,
          retained: true,
          sparkline: [2.6],
        },
      ],
      vnMacroPulse: {
        manufacturingPmi: 52.3,
        updatedAt: now,
        fieldMeta: {
          manufacturingPmi: {
            source: 'S&P Global / TE',
            period: 'T10/2026',
            fetchedAt: eightDaysAgo,
            retained: true,
          },
        },
      },
    };

    const expHealth = evaluateMacroHealth(expiredSnap, [], now);
    expect(expHealth.vn?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'vn-pmi')).toBeUndefined();
    expect(expHealth.vn?.expiredMetrics).toHaveLength(1);
    expect(expHealth.vn?.expiredMetrics?.[0]).toMatchObject({
      id: 'manufacturingPmi',
      sourceLabel: 'S&P Global / TE',
      periodLabel: 'T10/2026',
    });

    expect(expHealth.us?.pillars.flatMap((p) => p.metrics).find((m) => m.id === 'CPIAUCSL')).toBeUndefined();
    expect(expHealth.us?.expiredMetrics).toHaveLength(1);
    expect(expHealth.us?.expiredMetrics?.[0]).toMatchObject({
      id: 'CPIAUCSL',
      sourceLabel: 'FRED',
      periodLabel: '2026-10-01',
    });

    // Even when 100% of US FRED series expire so health.us is null, collectExpiredMacroNotices still reports them for UI banner
    const allUsExpired: MarketSnapshot = {
      ...expiredSnap,
      fred: expiredSnap.fred!.map((m) => ({ ...m, retained: true, fetchedAt: eightDaysAgo })),
    };
    expect(evaluateMacroHealth(allUsExpired, [], now).us).toBeNull();
    expect(collectExpiredMacroNotices(allUsExpired, now).us).toHaveLength(2);
  });

  it('marks empty compass factor pillars with hasData=false instead of disguising the 52 neutral prior as measured data', () => {
    const now = Date.UTC(2026, 10, 22, 9, 0, 0);
    const compass = evaluateInvestmentCompass(
      {
        quotes: [
          {
            symbol: 'VN-Index',
            name: 'VN-Index',
            group: 'index',
            price: 1650,
            changePercent24h: -0.2,
            ma50: 1680,
            ma200: 1700,
            updatedAt: now,
            source: 'HOSE',
          },
        ],
        crypto: [],
        fearGreed: null,
        macro: [],
        updatedAt: now,
      },
      [],
      now,
    );

    expect(compass).not.toBeNull();
    const byId = new Map((compass?.factorPillars ?? []).map((p) => [p.id, p]));
    expect(byId.get('liquidity')?.hasData).toBe(false);
    expect(byId.get('liquidity')?.inputCount).toBe(0);
    expect(byId.get('liquidity')?.score).toBe(52);
    expect(byId.get('credit_recession')?.hasData).toBe(false);
    expect(byId.get('valuation_erp')?.hasData).toBe(false);
    expect(byId.get('trend_breadth')?.hasData).toBe(true);
    expect(byId.get('trend_breadth')?.inputCount).toBeGreaterThan(0);
  });
});
