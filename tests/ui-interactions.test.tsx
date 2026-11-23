// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MacroHealthSection } from '../client/src/components/right-panel/MacroHealthSection';
import { RightIntelPanel } from '../client/src/components/RightIntelPanel';
import { CryptoSentimentSection } from '../client/src/components/right-panel/markets/CryptoSentimentSection';
import { IndicesCommoditiesSection } from '../client/src/components/right-panel/markets/IndicesCommoditiesSection';
import { VnGoldSection } from '../client/src/components/right-panel/markets/VnGoldSection';
import { Vn30Section } from '../client/src/components/right-panel/markets/Vn30Section';
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
  it('shows unknown changes rather than invented zero percentages', async () => {
    await act(async () => root.render(<>
      <IndicesCommoditiesSection indexAndCommodityQuotes={[{ symbol: 'VN-Index', name: 'VN', group: 'index', price: 1200, changePercent24h: null, updatedAt: 1, source: 'HOSE' }]} priceFlashes={{}} />
      <Vn30Section markets={{ ...markets, vn30: [{ symbol: 'VCB', name: 'VCB', sector: 'bank', priceThousandVnd: 80, changePercent: null, volume: null, sparkline: [80], updatedAt: 1 }] }} />
    </>));
    expect(container.textContent?.match(/không rõ/g)?.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain('0.00%');
  });

  it('displays missing market cap and warns when price or gold comparison freshness is unknown', async () => {
    const coin = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: null, volume24hUsd: null, updatedAt: 1 };
    const quote = { symbol: 'Gold', name: 'Gold', group: 'commodity' as const, price: 2500, changePercent24h: 0, updatedAt: 1, source: 'Yahoo Finance Chart v8' };
    const gold = { code: 'SJC', name: 'SJC', buyPerLuongMillionVnd: 80, sellPerLuongMillionVnd: 81, spreadMillionVnd: 1, changeBuyPercent: 0, changeSellPercent: 0, worldParityPerLuongMillionVnd: 70, premiumVsWorldMillionVnd: 11, worldParityRetained: true, updatedAt: 1, source: 'test' };
    await act(async () => root.render(<>
      <CryptoSentimentSection markets={markets} priceFlashes={{}} volatileCrypto={[coin]} />
      <IndicesCommoditiesSection indexAndCommodityQuotes={[quote]} priceFlashes={{}} />
      <VnGoldSection markets={{ ...markets, vnGold: [gold] }} />
    </>));
    expect(container.textContent).toContain('MCap —');
    expect(container.textContent).toContain('Giá lúc: không rõ');
    expect(container.textContent).toContain('tham chiếu cũ hoặc chưa rõ');
  });

  it('marks sentiment stale when its observation expires while the tab remains open', async () => {
    const old = Date.now() - 8 * 86_400_000;
    await act(async () => root.render(
      <CryptoSentimentSection markets={{ ...markets, fearGreed: { value: 70, classification: 'Greed', updatedAt: old } }} priceFlashes={{}} volatileCrypto={[]} />,
    ));
    expect(container.textContent).toContain('F&G: 70/100 (Greed) · dữ liệu cũ');
  });

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
