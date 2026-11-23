// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';

it('removes consecutive unsafe attributes from third-party map attribution', async () => {
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:test') }));
  const { AttributionControl } = await import('maplibre-gl');
  const control = new AttributionControl({ compact: false });
  const map = {
    style: {
      tileManagers: {
        external: {
          used: true,
          getSource: () => ({ attribution: '<a href="javascript:alert(1)" onclick="alert(2)" onmouseover="alert(3)">Source</a>' }),
        },
      },
    },
    _getUIString: () => 'Attribution',
    getCanvasContainer: () => document.createElement('div'),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MapLibreMap;
  const container = control.onAdd(map);
  const link = container.querySelector('a');
  expect(link?.textContent).toBe('Source');
  expect(link?.hasAttribute('href')).toBe(false);
  expect(link?.hasAttribute('onclick')).toBe(false);
  expect(link?.hasAttribute('onmouseover')).toBe(false);
  control.onRemove();
  vi.unstubAllGlobals();
});
