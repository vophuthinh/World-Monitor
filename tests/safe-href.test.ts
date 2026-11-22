import { describe, expect, it } from 'vitest';
import { safeHref } from '../client/src/lib/safe-href';

describe('safeHref', () => {
  it('keeps http(s) and relative links', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('/relative/path')).toBe('/relative/path');
  });

  it('drops script-capable and malformed schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      '  JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'http://',
    ]) {
      expect(safeHref(bad), bad).toBeUndefined();
    }
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
  });
});
