import type { DataCrossCheck } from '@shared/types';

const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const viDate = (iso: string) => iso.split('-').reverse().join('/');

export function CrossCheckNotice({ checks }: { checks?: readonly DataCrossCheck[] }) {
  if (!checks || checks.length === 0) return null;
  const flagged = checks.filter((c) => c.mismatch);
  if (flagged.length === 0) {
    return <p className="mt-1 text-xs text-slate-400">✓ {checks.length} chỉ số khớp với nguồn đối chiếu thứ hai.</p>;
  }
  return (
    <div className="mt-1.5 rounded border border-amber-500/45 bg-amber-950/35 px-2 py-1.5 text-xs text-amber-200">
      <div className="font-semibold">⚠️ {flagged.length}/{checks.length} chỉ số cần kiểm tra lại (hai nguồn lệch hoặc số liệu cũ)</div>
      <ul className="mt-0.5 space-y-0.5">
        {flagged.map((c) => (
          <li key={c.id}>
            • {c.label}: {c.primary.source} {format(c.primary.value)} · {c.secondary.source} {format(c.secondary.value)}
            {c.secondary.asOf ? ` (ngày ${viDate(c.secondary.asOf)})` : ''} · lệch {c.diffPct}%
            {c.stale ? ' · nguồn đối chiếu tính từ kỳ cũ' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
