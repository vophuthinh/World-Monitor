import { formatCompactUsd } from '../shared';
import type { MarketSnapshot } from '@shared/types';

export function WorldBankSection({ markets }: {
  markets: MarketSnapshot;
}) {
  const anyRetained = markets.macro.some((r) => r.retained);
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
          VĨ MÔ 8 NỀN KINH TẾ · SỐ LIỆU NĂM (WORLD BANK)
        </h2>
        <span className={`font-mono text-[9px] ${anyRetained ? 'text-amber-300' : 'text-slate-500'}`}>
          {anyRetained ? '⟳ Giữ từ cache' : 'Chu kỳ năm'}
        </span>
      </div>
      <div className="mt-1.5 overflow-x-auto rounded border border-slate-800/95 bg-[#0d1524]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 font-mono text-[10px] text-slate-400">
              <th className="px-2.5 py-1.5">QUỐC GIA</th>
              <th className="px-1.5 py-1.5 text-right">GDP %</th>
              <th className="px-1.5 py-1.5 text-right">CPI %</th>
              <th className="px-1.5 py-1.5 text-right">TN %</th>
              <th className="px-2.5 py-1.5 text-right">QUY MÔ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/75 font-mono text-[11px] tabular-nums">
            {markets.macro.map((row) => (
              <tr
                key={row.countryCode}
                className={row.isVietnam ? 'bg-emerald-500/12 text-emerald-200' : 'text-slate-200'}
              >
                <td className="px-2.5 py-1.5 font-sans">
                  <div>
                    <span className="font-semibold">{row.countryName}</span>
                    <span className="ml-1 font-mono text-[9.5px] text-slate-400">
                      {row.countryCode}
                    </span>
                  </div>
                  {row.manufacturingGrowthPct !== null &&
                    row.manufacturingGrowthPct !== undefined && (
                      <div className="font-mono text-[9px] text-slate-400">
                        Chế tạo: {row.manufacturingGrowthPct >= 0 ? '+' : ''}
                        {row.manufacturingGrowthPct.toFixed(1)}%
                        {row.fdiPctGdp !== null && row.fdiPctGdp !== undefined
                          ? ` · FDI ${row.fdiPctGdp.toFixed(1)}%`
                          : ''}
                      </div>
                    )}
                </td>
                <td
                  className={`px-1.5 py-1.5 text-right font-semibold ${
                    (row.gdpGrowthPct ?? 0) >= 5
                      ? 'text-emerald-400'
                      : (row.gdpGrowthPct ?? 0) < 0
                        ? 'text-rose-400'
                        : 'text-slate-100'
                  }`}
                >
                  <div>{row.gdpGrowthPct !== null ? `${row.gdpGrowthPct.toFixed(1)}%` : '—'}</div>
                  {row.gdpGrowthYear && (
                    <div className="text-[8.5px] font-normal text-slate-500">{row.gdpGrowthYear}</div>
                  )}
                </td>
                <td className="px-1.5 py-1.5 text-right text-amber-300">
                  <div>{row.cpiInflationPct !== null ? `${row.cpiInflationPct.toFixed(1)}%` : '—'}</div>
                  {row.cpiYear && (
                    <div className="text-[8.5px] font-normal text-slate-500">{row.cpiYear}</div>
                  )}
                </td>
                <td className="px-1.5 py-1.5 text-right text-slate-300">
                  <div>
                    {row.unemploymentPct !== null && row.unemploymentPct !== undefined
                      ? `${row.unemploymentPct.toFixed(1)}%`
                      : '—'}
                  </div>
                  {row.unemploymentYear && (
                    <div className="text-[8.5px] font-normal text-slate-500">{row.unemploymentYear}</div>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-right text-slate-300">
                  <div>{formatCompactUsd(row.gdpCurrentUsd)}</div>
                  {row.gdpCurrentYear && (
                    <div className="text-[8.5px] font-normal text-slate-500">{row.gdpCurrentYear}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
