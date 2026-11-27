import { ChartBar } from '@phosphor-icons/react';
import { formatCompactUsd } from '../shared';
import type { PredictionItem } from '@shared/types';
import { safeHref } from '../../../lib/safe-href';

export function PredictionOddsSection({ topMacroGeopoliticsPredictions, translateVi }: {
  topMacroGeopoliticsPredictions: PredictionItem[];
  translateVi: boolean;
}) {
  if (!(topMacroGeopoliticsPredictions.length > 0)) return null;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-slate-300">
          <ChartBar size={13} className="text-cyan-400" />
          <span>KỲ VỌNG HÀM Ý THỊ TRƯỜNG · VĨ MÔ &amp; ĐỊA CHÍNH TRỊ</span>
        </h2>
        <span className="font-mono text-xs text-slate-500">Polymarket</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Xác suất quy đổi từ giá hợp đồng trên Polymarket, không phải dự báo do hệ thống tự xây.
      </p>

      <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
        {topMacroGeopoliticsPredictions.map((item) => {
          const label = translateVi ? item.titleVi || item.title : item.title;
          return (
            <a
              key={item.id}
              href={safeHref(item.url)}
              target="_blank"
              rel="noreferrer"
              className="block px-2.5 py-2 transition hover:bg-[#111c30]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-medium leading-snug text-slate-100">
                    {label}
                  </span>
                  {item.outcomeLabel && (
                    <span className="ml-1.5 inline-block rounded border border-cyan-500/35 bg-cyan-500/12 px-1 py-0.2 font-mono text-xs text-cyan-200">
                      {item.outcomeLabel}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[13px] font-bold text-cyan-300 tabular-nums">
                  {item.yesPercent}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400"
                    style={{ width: `${Math.max(2, Math.min(98, item.yesPercent))}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                  Vol {formatCompactUsd(item.volumeUsd)}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
