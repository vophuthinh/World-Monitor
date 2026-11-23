// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import HptCorporateTab from '../client/src/components/right-panel/HptCorporateTab';
import type { HptCompanyIntelSnapshot } from '../shared/types';

it('shows missing YTD as unknown and labels retained HPT data', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: HptCompanyIntelSnapshot = {
    stock: {
      symbol: 'HPT', exchange: 'UPCoM · HNX', companyName: 'HPT',
      priceThousandVnd: 10, changePercent: 0, volume: 0, sparkline: [],
      fundamentals: { taxCode: '0301447436' }, hqLat: 0, hqLon: 0, updatedAt: 1,
    },
    stockRetained: true, itemsRetained: true, items: [],
    sourceCount: 0, aiSentimentEnabled: false, updatedAt: 1,
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<HptCorporateTab hptIntel={snapshot}
      sentimentStats={{ pos: 0, neg: 0, neu: 0, total: 0 }} onFlyToLocation={() => {}} />));
    expect(container.textContent).toContain('YTD —');
    expect(container.textContent).toContain('Giữ lại dữ liệu cũ: giá HPT, tin HPT');
    await act(async () => root.render(<HptCorporateTab hptIntel={snapshot} sourceStale
      sentimentStats={{ pos: 0, neg: 0, neu: 0, total: 0 }} onFlyToLocation={() => {}} />));
    expect(container.textContent).toContain('Nguồn HPT lỗi; dữ liệu có thể đã cũ');
    snapshot.stock = { ...snapshot.stock!, priceKind: 'reference', changePercent: undefined, volume: undefined };
    await act(async () => root.render(<HptCorporateTab hptIntel={snapshot}
      sentimentStats={{ pos: 0, neg: 0, neu: 0, total: 0 }} onFlyToLocation={() => {}} />));
    expect(container.textContent).toContain('Giá tham chiếu');
    expect(container.textContent).toContain('KL: —');
    expect(container.textContent).not.toContain('+0.00%');
  } finally {
    await act(async () => root.unmount());
  }
});
