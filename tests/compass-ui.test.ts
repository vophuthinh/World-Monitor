import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InvestmentCompassSection } from '../client/src/components/right-panel/InvestmentCompassSection';
import { RegimeHistoryTimelineChart } from '../client/src/components/right-panel/shared';

describe('risk appetite presentation', () => {
  it('shows signals but no portfolio weights or untested asset lists', () => {
    const history = [26, 27].map((day) => ({ date: `2026-11-${day}`, compassScore: 55, vnIndexPrice: 1650, stance: 'cautious' as const, equitiesWeightPct: 31 }));
    const html = renderToStaticMarkup(createElement(InvestmentCompassSection, {
      investmentCompass: {
        riskAppetiteScore: 55, stance: 'cautious', stanceLabel: 'THẬN TRỌNG', summary: 'Tóm tắt',
        allocations: [{ id: 'equities', label: 'Cổ phiếu chất lượng', weightPct: 31, note: 'n', colorHex: '#000' }],
        favoredAssets: ['Nhóm A'], watchAssets: ['Nhóm B'], avoidAssets: ['Nhóm C'],
        signals: [{ id: 's', label: 'Tín hiệu A', category: 'liquidity', valueDisplay: '1', subtext: 'x', signalBadge: 'B', tone: 'neutral' }],
      },
      regimeHistory: history,
    })) + renderToStaticMarkup(createElement(RegimeHistoryTimelineChart, { history }));

    expect(html).toContain('Tín hiệu A');
    expect(html).toContain('VN-Index 1,650');
    expect(html).not.toMatch(/TỶ TRỌNG|Cổ phiếu chất lượng|31%|CP 31|Nhóm [ABC]|NHÓM/);
  });
});

describe('markets tab layout', () => {
  it('folds the reference sections below the two key panels, closed by default', async () => {
    const { default: MarketsMacroTab } = await import('../client/src/components/right-panel/MarketsMacroTab');
    const html = renderToStaticMarkup(createElement(MarketsMacroTab, {
      markets: { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: 1,
        vn30: [{ symbol: 'FPT', name: 'FPT', sector: 'x', priceThousandVnd: 45, changePercent: 1, volume: 1, sparkline: [], updatedAt: 1 }] },
      predictions: [], regimeHistory: [], military: [], vessels: [], geopolitics: [], priceFlashes: {},
      streamConnected: true, onFlyToLocation: () => {}, translateVi: true,
    }));
    expect(html).toMatch(/<details(?![^>]*open)[^>]*><summary[^>]*>Cổ phiếu VN30<\/summary>[\s\S]*FPT/);
    // A section without data gets no empty fold.
    expect(html).not.toContain('>Vàng trong nước</summary>');
  });
});
