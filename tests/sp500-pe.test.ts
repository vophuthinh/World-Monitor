import { describe, expect, it } from 'vitest';
import { parseSsgaIndexPe } from '../server/collectors/markets/vn-valuation-macro';

const page = (asOf: string, pe: string) => `
<section><h2>Fund Characteristics <span>as of ${asOf}</span></h2><table>
<tr><th> Price/Earnings Ratio FY1 </th><td>18.72</td></tr></table></section>
<section><h2 class="comp-title"> Index Characteristics <span class="date">as of ${asOf}</span></h2><table>
<tr><th class="label"> Price/Earnings </th> <td class="data">${pe}</td></tr>
<tr><th class="label"> Price/Earnings Ratio FY1 </th> <td class="data">18.71</td></tr></table></section>`;
const now = Date.parse('2026-11-27T03:00:00Z');

describe('S&P 500 P/E from the SPY issuer page', () => {
  it('reads the dated index figure, not the forward or fund ratios', () => {
    expect(parseSsgaIndexPe(page('Nov 25 2026', '21.91'), now)).toEqual({ pe: 21.91, period: '25/11/2026' });
  });

  it('rejects an old, future, implausible or missing figure', () => {
    for (const html of [page('Oct 01 2026', '21.91'), page('Dec 25 2026', '21.91'), page('Nov 25 2026', '2.1'), '<html></html>']) {
      expect(parseSsgaIndexPe(html, now)).toBeUndefined();
    }
  });
});

describe('S&P 500 P/E second source', () => {
  it('reads the dated estimate', async () => {
    const { parseWorldPeRatio } = await import('../server/collectors/markets/cross-check');
    expect(parseWorldPeRatio('<p>The estimated <b>Price-to-Earnings (P/E) Ratio</b> for <b>S&amp;P 500 Index</b> is <b>23.43</b>, calculated on 25 November 2026.</p>'))
      .toEqual({ value: 23.43, source: 'worldperatio', asOf: '2026-11-25' });
  });
});
