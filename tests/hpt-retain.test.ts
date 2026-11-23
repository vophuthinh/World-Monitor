import { describe, expect, it } from 'vitest';
import { mergeRetainedHptItems } from '../server/collectors/hpt-company-intel';
import type { HptCompanyItem } from '@shared/types';

const NOW = Date.parse('2026-11-24T00:00:00Z');
const item = (id: string, ageH: number): HptCompanyItem => ({
  id,
  title: `Tin ${id} khác biệt hoàn toàn ${id}${id}`,
  category: 'it_press_partner',
  badge: 'x',
  source: 'vnexpress.net',
  publishedAt: NOW - ageH * 3_600_000,
  url: `https://example.com/${id}`,
  sentiment: 'neutral',
} as HptCompanyItem);

describe('mergeRetainedHptItems', () => {
  it('keeps recent items that dropped out of the fresh results, drops >7d', () => {
    const out = mergeRetainedHptItems([item('a', 1)], [item('b', 5), item('old', 24 * 8)], NOW);
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });
  it('caps at 60', () => {
    const many = Array.from({ length: 80 }, (_, i) => item(`n${i}`, i + 1));
    expect(mergeRetainedHptItems(many, [], NOW)).toHaveLength(60);
  });
});
