// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import MarketsMacroTab from '../client/src/components/right-panel/MarketsMacroTab';

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
