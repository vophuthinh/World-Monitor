// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import MarketsMacroTab from '../client/src/components/right-panel/MarketsMacroTab';
import * as macroHealth from '../shared/macro-health';
import type { MarketSnapshot } from '../shared/types';

it('updates the calendar when the Vietnam calendar day changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 10, 23, 16, 59, 30));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <MarketsMacroTab
        markets={{ quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: 0 }}
        predictions={[]} regimeHistory={[]} military={[]} vessels={[]} geopolitics={[]}
        priceFlashes={{}} streamConnected={false} onFlyToLocation={vi.fn()} translateVi={false}
      />,
    ));
    const fomc = () => [...container.querySelectorAll('span')].find((span) => span.textContent?.includes('Họp Lãi suất FOMC'))?.parentElement?.parentElement?.parentElement?.textContent;
    expect(fomc()).toContain('Còn 16 ngày');
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(fomc()).toContain('Còn 15 ngày');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('does not recalculate macro reports for crypto or PAXG ticks', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const healthSpy = vi.spyOn(macroHealth, 'evaluateMacroHealth');
  const compassSpy = vi.spyOn(macroHealth, 'evaluateInvestmentCompass');
  const markets: MarketSnapshot = {
    quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: Date.now(),
  };
  const props = {
    predictions: [], regimeHistory: [], military: [], vessels: [], geopolitics: [],
    priceFlashes: {}, streamConnected: true, onFlyToLocation: vi.fn(), translateVi: false,
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MarketsMacroTab {...props} markets={markets} />));
    const healthCount = healthSpy.mock.calls.length;
    const compassCount = compassSpy.mock.calls.length;
    await act(async () => root.render(<MarketsMacroTab {...props} markets={{
      ...markets,
      crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: null, volume24hUsd: null, updatedAt: markets.updatedAt + 1 }],
      quotes: [{ symbol: 'PAXG', name: 'PAXG', group: 'commodity', price: 2000, changePercent24h: 0, updatedAt: markets.updatedAt + 1, source: 'Binance' }],
    }} />));
    expect(healthSpy).toHaveBeenCalledTimes(healthCount);
    expect(compassSpy).toHaveBeenCalledTimes(compassCount);
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
  }
});
