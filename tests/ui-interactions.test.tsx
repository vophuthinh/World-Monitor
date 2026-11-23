// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MacroHealthSection } from '../client/src/components/right-panel/MacroHealthSection';
import { RightIntelPanel } from '../client/src/components/RightIntelPanel';
import type { EconomyHealthReport, MarketSnapshot } from '../shared/types';

vi.mock('../client/src/components/right-panel/LiveIntelTab', () => ({ LiveIntelTab: () => <div>Intel content</div> }));
vi.mock('../client/src/components/right-panel/MarketsMacroTab', () => ({ default: () => <div>Markets content</div> }));

const report: EconomyHealthReport = {
  id: 'VN', title: 'Việt Nam', subtitle: 'Dữ liệu', compositeScore: 60,
  regimeLabel: 'Theo dõi', regimeSummary: 'Tóm tắt', pillars: [], warningFlags: [],
};
const markets: MarketSnapshot = { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: 0 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('market UI interactions', () => {
  it('switches the macro region and pressed state', async () => {
    const us = { ...report, id: 'US' as const, title: 'Mỹ' };
    function Wrapper() {
      const [region, setRegion] = useState<'VN' | 'US'>('VN');
      return <MacroHealthSection activeMacroReport={region === 'VN' ? report : us} macroHealth={{ vn: report, us }} setMacroRegion={setRegion} />;
    }
    await act(async () => root.render(<Wrapper />));
    const usButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Mỹ'));
    expect(usButton?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => usButton?.click());
    expect(usButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches tabs and invokes the mobile close control', async () => {
    const onClose = vi.fn();
    await act(async () => root.render(
      <RightIntelPanel markets={markets} predictions={[]} news={[]} military={[]} vessels={[]} geopolitics={[]} cyberThreats={[]} priceFlashes={{}} streamConnected={false} onFlyToLocation={vi.fn()} onClose={onClose} />,
    ));
    const marketButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Thị trường'));
    await act(async () => marketButton?.click());
    expect(marketButton?.getAttribute('aria-pressed')).toBe('true');
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Đóng bảng Intel"]');
    expect(close).not.toBeNull();
    await act(async () => close?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
