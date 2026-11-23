import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MacroHealthSection } from '../client/src/components/right-panel/MacroHealthSection';
import type { EconomyHealthReport } from '../shared/types';

const report: EconomyHealthReport = {
  id: 'VN',
  title: 'Việt Nam',
  subtitle: 'Dữ liệu vĩ mô',
  compositeScore: 60,
  regimeLabel: 'Theo dõi',
  regimeSummary: 'Tóm tắt',
  quadrant: 'Q2_REFLATION',
  pillars: [],
  expiredMetrics: [{ id: 'cpi', label: 'CPI', sourceLabel: 'NSO' }],
  warningFlags: [
    { severity: 'good', text: 'Tín hiệu tích cực' },
    { severity: 'critical', text: 'Cảnh báo quan trọng' },
  ],
};

describe('macro health presentation', () => {
  it('keeps critical and expired data visible while placing supplementary details in disclosures', () => {
    const html = renderToStaticMarkup(createElement(MacroHealthSection, {
      activeMacroReport: report,
      macroHealth: { vn: report, us: null },
      setMacroRegion: vi.fn(),
    }));

    expect(html).toContain('aria-pressed="true"');
    expect(html.indexOf('Cảnh báo quan trọng')).toBeLessThan(html.indexOf('Xem 1 tín hiệu bổ sung'));
    expect(html).toContain('Không dùng 1 chỉ báo');
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Xem 1 tín hiệu bổ sung<\/summary>/);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Xem chi tiết các chỉ báo vĩ mô<\/summary>/);
  });

  it('exposes which region is selected', () => {
    const usReport: EconomyHealthReport = { ...report, id: 'US', title: 'Mỹ' };
    const html = renderToStaticMarkup(createElement(MacroHealthSection, {
      activeMacroReport: usReport,
      macroHealth: { vn: report, us: usReport },
      setMacroRegion: vi.fn(),
    }));

    expect(html).toMatch(/aria-pressed="false"[^>]*>🇻🇳 Việt Nam/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>🇺🇸 Mỹ/);
  });
});
