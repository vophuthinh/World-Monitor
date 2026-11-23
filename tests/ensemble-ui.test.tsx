// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { describeEnsemble } from '../client/src/lib/ensemble-format';
import { VietnamEnvSection } from '../client/src/components/right-panel/VietnamEnvSection';
import type { VietnamEnvEnsemble, VietnamEnvLocation } from '../shared/types';

const ens = (over: Partial<VietnamEnvEnsemble> = {}): VietnamEnvEnsemble => ({
  models: 6,
  tempMaxMeanC: 31.2,
  tempMaxMinC: 30.1,
  tempMaxMaxC: 32.4,
  tempMinMeanC: 25.3,
  rainMeanMm: 4.2,
  rainMinMm: 0,
  rainMaxMm: 12.4,
  wetModels: 4,
  perModel: [
    { model: 'ecmwf_ifs025', tempMaxC: 31.0, tempMinC: 25.0, rainMm: 3.1 },
    { model: 'gfs_seamless', tempMaxC: 32.4, tempMinC: 25.9, rainMm: 12.4 },
  ],
  ...over,
});

it('describeEnsemble reports the range, rain and agreement level', () => {
  const d = describeEnsemble(ens());
  expect(d.summary).toContain('6 mô hình');
  expect(d.summary).toContain('31.2');
  expect(d.summary).toContain('30.1');
  expect(d.summary).toContain('32.4');
  expect(d.summary).toContain('4.2');
  expect(d.summary).toContain('4/6');
  expect(d.tooltip).toContain('ecmwf_ifs025');
  expect(d.tooltip).toContain('gfs_seamless');
});

it('describeEnsemble grades agreement from temperature spread and rain disagreement', () => {
  expect(describeEnsemble(ens({ tempMaxMinC: 30.5, tempMaxMaxC: 31.5, wetModels: 0, rainMaxMm: 0.4, rainMeanMm: 0.1 })).agreement).toBe('high');
  expect(describeEnsemble(ens({ tempMaxMinC: 29, tempMaxMaxC: 32, wetModels: 0, rainMaxMm: 0, rainMeanMm: 0 })).agreement).toBe('medium');
  expect(describeEnsemble(ens({ tempMaxMinC: 28, tempMaxMaxC: 33, wetModels: 0, rainMaxMm: 0, rainMeanMm: 0 })).agreement).toBe('low');
  // every model says it rains, but the amounts differ hugely (Truong Sa live data: 4.0-31.5 mm) -> not "high"
  const allWetHugeSpread = { wetModels: 6, rainMinMm: 4, rainMaxMm: 31.5, rainMeanMm: 17.1, tempMaxMinC: 28.5, tempMaxMaxC: 29.7 };
  expect(describeEnsemble(ens(allWetHugeSpread)).agreement).toBe('low');
  expect(describeEnsemble(ens({ ...allWetHugeSpread, rainMinMm: 1.3, rainMaxMm: 15.8 })).agreement).toBe('medium');
  expect(describeEnsemble(ens({ ...allWetHugeSpread, rainMinMm: 6, rainMaxMm: 9 })).agreement).toBe('high');
  // models split on whether it rains and by how much -> low
  expect(describeEnsemble(ens({ wetModels: 3, rainMinMm: 0, rainMaxMm: 25, tempMaxMinC: 30.5, tempMaxMaxC: 31.5 })).agreement).toBe('low');
});

const loc = (over: Partial<VietnamEnvLocation> = {}): VietnamEnvLocation => ({
  id: 'vn-hcmc', name: 'TP.HCM', region: 'mainland', lat: 10.8, lon: 106.7, tempC: 29, windKmh: 10, windGustKmh: 20,
  beaufortScale: 3, weatherCode: 1, weatherLabel: 'Quang mây', stormWarning: false, ...over,
});

async function render(locations: VietnamEnvLocation[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <VietnamEnvSection
        vietnamEnv={{ locations, updatedAt: 1 } as never}
        onFlyToLocation={vi.fn()}
        onForceRefresh={vi.fn()}
        onOpenWindy={vi.fn()}
        refreshingIds={new Set()}
      />,
    ),
  );
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); } };
}

it('shows the multi-model line on a location that has an ensemble, and nothing on one that does not', async () => {
  const { container, cleanup } = await render([
    loc({ ensemble: ens() }),
    loc({ id: 'vn-hanoi', name: 'Hà Nội' }),
  ]);
  try {
    const cards = [...container.querySelectorAll('button')].filter((b) => b.textContent?.includes('TP.HCM') || b.textContent?.includes('Hà Nội'));
    const hcm = cards.find((b) => b.textContent?.includes('TP.HCM'))!;
    const hanoi = cards.find((b) => b.textContent?.includes('Hà Nội'))!;
    expect(hcm.textContent).toContain('6 mô hình');
    expect(hcm.textContent).toContain('31.2');
    expect(hanoi.textContent).not.toContain('mô hình');
  } finally {
    await cleanup();
  }
});
