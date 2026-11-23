import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('macro narrative wording', () => {
  it('does not assert policy stance or OMO behaviour the data cannot support', () => {
    for (const f of ['shared/macro/core.ts', 'shared/macro/vietnam.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/kênh OMO|ưu tiên kiểm soát giá cả|căng cục bộ/);
    }
  });
});
