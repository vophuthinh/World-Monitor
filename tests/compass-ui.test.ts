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
