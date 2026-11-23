// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { RegionalWarningsSection } from '../client/src/components/right-panel/RegionalWarningsSection';
import type { RegionalWarning, RegionalWarningsSnapshot } from '../shared/types';

const w = (over: Partial<RegionalWarning> = {}): RegionalWarning => ({
  id: 'bmkg:1',
  source: 'BMKG',
  title: 'Thunderstorm Tonight in Kalimantan Tengah',
  area: 'Kalimantan Tengah',
  severity: 'medium',
  issuedAt: Date.parse('2026-11-23T17:10:00Z'),
  description: 'Thunderstorms and heavy rainfall are forecasted.',
  url: 'https://www.bmkg.go.id/alerts/nowcast/en/x.xml',
  ...over,
});
const snap = (over: Partial<RegionalWarningsSnapshot> = {}): RegionalWarningsSnapshot => ({
  warnings: [w()],
  bmkgOk: true,
  hkoOk: true,
  updatedAt: 1,
  ...over,
});

async function render(value: RegionalWarningsSnapshot | undefined) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<RegionalWarningsSection regionalWarnings={value} />));
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); } };
}

it('lists warnings with source, area and a safe external link', async () => {
  const { container, cleanup } = await render(
    snap({ warnings: [w({ severity: 'high', source: 'HKO', id: 'hko:WTCSGNL', title: 'Tropical Cyclone Warning Signal', area: 'Hồng Kông', url: 'https://www.hko.gov.hk/en/wxinfo/currwx/wxwarnsum.htm' }), w()] }),
  );
  try {
    const text = container.textContent ?? '';
    expect(text).toContain('Tropical Cyclone Warning Signal');
    expect(text).toContain('HKO');
    expect(text).toContain('BMKG');
    expect(text).toContain('Kalimantan Tengah');
    const links = [...container.querySelectorAll('a')];
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a.getAttribute('rel')).toContain('noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    }
  } finally {
    await cleanup();
  }
});

it('neutralises an unsafe URL instead of linking it', async () => {
  const { container, cleanup } = await render(snap({ warnings: [w({ url: 'javascript:alert(1)' })] }));
  try {
    const a = container.querySelector('a');
    expect(a?.getAttribute('href') ?? '').not.toContain('javascript');
  } finally {
    await cleanup();
  }
});

it('renders nothing when there is no snapshot or no warning and both sources are healthy', async () => {
  for (const value of [undefined, snap({ warnings: [] })]) {
    const { container, cleanup } = await render(value);
    try {
      expect(container.textContent ?? '').toBe('');
    } finally {
      await cleanup();
    }
  }
});

it('tells the user when a source is not responding, so an empty list is not read as "all clear"', async () => {
  const { container, cleanup } = await render(snap({ warnings: [], bmkgOk: false }));
  try {
    expect(container.textContent).toContain('BMKG');
    expect(container.textContent).toMatch(/không phản hồi/);
  } finally {
    await cleanup();
  }
});
