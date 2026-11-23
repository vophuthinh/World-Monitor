import { WarningOctagon } from '@phosphor-icons/react';
import type { RegionalWarning, RegionalWarningsSnapshot } from '@shared/types';
import { safeHref } from '../../lib/safe-href';

const SEVERITY_STYLE: Record<RegionalWarning['severity'], string> = {
  high: 'border-rose-500/50 bg-rose-500/15 text-rose-200',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-slate-600 bg-slate-800/60 text-slate-300',
};

const timeLabel = (ms: number) =>
  new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/** Official warnings from neighbouring agencies (BMKG Indonesia, HKO Hong Kong). */
export function RegionalWarningsSection({ regionalWarnings }: { regionalWarnings?: RegionalWarningsSnapshot }) {
  if (!regionalWarnings) return null;
  const { warnings, bmkgOk, hkoOk } = regionalWarnings;
  const down = [!bmkgOk && 'BMKG', !hkoOk && 'HKO'].filter(Boolean) as string[];
  if (warnings.length === 0 && down.length === 0) return null;

  return (
    <section className="rounded border border-amber-500/30 bg-[#0a1322] px-2.5 py-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[9.5px]">
        <span className="flex items-center gap-1 font-bold text-amber-300">
          <WarningOctagon size={12} weight="fill" /> CẢNH BÁO KHU VỰC (BMKG INDONESIA · HKO HỒNG KÔNG)
        </span>
        <span className="text-slate-400">{warnings.length} bản tin</span>
      </div>
      {down.length > 0 && (
        <div className="mb-1 text-[9px] text-slate-400">
          {down.join(', ')} không phản hồi, danh sách có thể chưa đầy đủ.
        </div>
      )}
      <div className="divide-y divide-slate-800/75">
        {warnings.slice(0, 6).map((warning) => (
          <a
            key={warning.id}
            href={safeHref(warning.url)}
            target="_blank"
            rel="noreferrer"
            className="block py-1.5 transition hover:bg-slate-800/40"
          >
            <div className="flex items-start gap-1.5">
              <span className={`mt-0.5 shrink-0 rounded border px-1 font-mono text-[8.5px] font-bold ${SEVERITY_STYLE[warning.severity]}`}>
                {warning.source}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold leading-snug text-slate-100">{warning.title}</div>
                {warning.description && (
                  <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-slate-400">{warning.description}</div>
                )}
                <div className="mt-0.5 font-mono text-[8.5px] text-slate-500">
                  {warning.area ? `${warning.area} · ` : ''}
                  {timeLabel(warning.issuedAt)}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
