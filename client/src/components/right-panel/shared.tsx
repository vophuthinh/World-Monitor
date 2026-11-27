import type { ReactNode } from 'react';
import type { CiiBand, IntelTopicId, PostureLevel } from '@shared/intelligence';
import type {
  AqiBand,
  NewsCategory,
  NewsItem,
  PolicyLegalItem,
  RegimeHistoryPoint,
  TechCyberItem,
} from '@shared/types';

export type RightTabId = 'intel' | 'techCyber' | 'news' | 'policy' | 'markets' | 'hpt';
export type NewsFilterId = 'all' | 'bbc' | NewsCategory;

export function formatCompactUsd(val: number | null): string {
  if (val === null || !Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1_000_000_000_000) return `$${(val / 1_000_000_000_000).toFixed(2)}T`;
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(0)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export function formatRelativeTime(ts: number): string {
  if (!ts || ts <= 0) return 'Cố định';
  const diffSec = Math.max(1, Math.round((Date.now() - ts) / 1_000));
  if (diffSec < 60) return `${diffSec}s trước`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}p trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h trước`;
  return `${Math.round(diffHr / 24)}d trước`;
}

export function sourceBadgeStyle(item: NewsItem): string {
  if (item.source.startsWith('BBC ')) {
    return 'border border-red-500/45 bg-red-600/20 text-red-200';
  }
  if (item.streamSource === 'wikimedia') {
    return 'border border-purple-500/40 bg-purple-500/15 text-purple-300';
  }
  if (item.streamSource === 'gdelt') {
    return 'border border-rose-500/40 bg-rose-500/15 text-rose-300';
  }
  if (item.streamSource === 'reddit') {
    return 'border border-orange-500/45 bg-orange-600/20 text-orange-200';
  }
  if (item.streamSource === 'snapi') {
    return 'border border-indigo-500/45 bg-indigo-500/20 text-indigo-200';
  }
  if (item.streamSource === 'hackernews') {
    return 'border border-orange-500/40 bg-orange-500/15 text-orange-300';
  }
  if (item.category === 'vietnam') {
    return 'bg-emerald-500/15 text-emerald-300';
  }
  if (item.category === 'finance') {
    return 'bg-amber-500/15 text-amber-300';
  }
  return 'bg-slate-800 text-slate-300';
}

export function techBadgeStyle(item: TechCyberItem): string {
  if (item.subCategory === 'github_release') {
    return 'border border-emerald-500/45 bg-emerald-500/18 text-emerald-200';
  }
  if (item.subCategory === 'cyber') {
    return item.severity === 'critical'
      ? 'border border-rose-500/50 bg-rose-500/20 text-rose-200'
      : 'border border-amber-500/40 bg-amber-500/15 text-amber-300';
  }
  if (item.subCategory === 'ai') {
    return 'border border-violet-500/40 bg-violet-500/15 text-violet-300';
  }
  if (item.subCategory === 'vn_tech') {
    return 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  }
  return 'border border-cyan-500/35 bg-cyan-500/12 text-cyan-300';
}

export const POSTURE_BADGE: Record<PostureLevel, string> = {
  CRITICAL: 'border-rose-500/55 bg-rose-500/20 text-rose-200',
  ELEVATED: 'border-amber-500/50 bg-amber-500/18 text-amber-200',
  NORMAL: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

export const CII_BAND_STYLE: Record<CiiBand, { badge: string; bar: string }> = {
  CRITICAL: { badge: 'text-rose-300 bg-rose-500/20 border-rose-500/45', bar: '#f43f5e' },
  HIGH: { badge: 'text-orange-300 bg-orange-500/20 border-orange-500/45', bar: '#f97316' },
  ELEVATED: { badge: 'text-amber-300 bg-amber-500/20 border-amber-500/45', bar: '#f59e0b' },
  MODERATE: { badge: 'text-sky-300 bg-sky-500/15 border-sky-500/35', bar: '#38bdf8' },
  LOW: { badge: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40', bar: '#10b981' },
};

export const INTEL_TOPIC_TABS: ReadonlyArray<{ id: IntelTopicId | 'c2_ioc'; label: string }> = [
  { id: 'cyber', label: '🔓 Cyber Threats' },
  { id: 'c2_ioc', label: '🌐 Live C2 IOCs' },
  { id: 'military', label: '⚔️ Quân sự' },
  { id: 'maritime', label: '🚢 Hàng hải' },
  { id: 'nuclear', label: '☢️ Hạt nhân' },
  { id: 'sanctions', label: '🚫 Trừng phạt' },
  { id: 'intelligence', label: '🕵️ Tình báo' },
];

export function legalBadgeStyle(item: PolicyLegalItem): string {
  if (item.docType === 'nq_tw_cp') {
    return 'border border-amber-400/50 bg-red-600/25 text-amber-200';
  }
  if (item.docType === 'nghi_dinh') {
    return 'border border-emerald-500/45 bg-emerald-500/18 text-emerald-200';
  }
  if (item.docType === 'luat_qh') {
    return 'border border-yellow-500/45 bg-yellow-500/18 text-yellow-200';
  }
  if (item.docType === 'quyet_dinh_tt') {
    return 'border border-sky-500/40 bg-sky-500/15 text-sky-200';
  }
  return 'border border-slate-700 bg-slate-800 text-slate-300';
}

export const AQI_BADGE_STYLE: Record<AqiBand, { label: string; cls: string }> = {
  good: { label: 'Tốt', cls: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300' },
  moderate: { label: 'TB', cls: 'border-yellow-500/45 bg-yellow-500/15 text-yellow-200' },
  sensitive: { label: 'Kém', cls: 'border-orange-500/50 bg-orange-500/20 text-orange-200' },
  unhealthy: { label: 'Xấu', cls: 'border-rose-500/50 bg-rose-500/20 text-rose-200' },
  hazardous: { label: 'Nguy hại', cls: 'border-fuchsia-500/60 bg-fuchsia-500/25 text-fuchsia-100' },
};

export const VN_ENV_DISPLAY_ORDER: Record<string, number> = {
  'vn-hcmc': 0,
  'vn-hanoi': 1,
  'vn-danang': 2,
  'vn-haiphong': 3,
  'vn-hoang-sa': 4,
  'vn-truong-sa': 5,
};

export function MiniSparkline({ values, positive }: { values?: number[]; positive: boolean }) {
  if (!values || values.length < 2) return null;
  const w = 52;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
      <polyline
        fill="none"
        stroke={positive ? '#34d399' : '#fb7185'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

export function RegimeHistoryTimelineChart({ history }: { history: readonly RegimeHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="mt-2 text-xs text-slate-400">
        Chưa đủ 2 ngày ghi nhận thực để hiển thị lịch sử.
      </p>
    );
  }
  const w = 310;
  const h = 54;
  const padX = 4;
  const padY = 6;
  const compassVals = history.map((p) => p.compassScore);
  const hasFullVnMacro = history.every((p) => typeof p.vnMacroScore === 'number');
  const macroVals = hasFullVnMacro ? history.map((p) => p.vnMacroScore as number) : [];
  const allVals = [...compassVals, ...macroVals];
  const minVal = Math.max(10, Math.min(...allVals) - 5);
  const maxVal = Math.min(98, Math.max(...allVals) + 5);
  const span = Math.max(8, maxVal - minVal);

  const toPoints = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = padX + (i / (vals.length - 1)) * (w - padX * 2);
        const y = h - padY - ((v - minVal) / span) * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const first = history[0];
  const latest = history[history.length - 1];
  const deltaCompass = latest.compassScore - first.compassScore;
  // First day scored with the latest formula, when older rows used another one.
  const formulaChange = history.findIndex((p, i) => i > 0 && p.scoringVersion !== history[i - 1].scoringVersion);
  const changeX = padX + (formulaChange / (history.length - 1)) * (w - padX * 2);
  const reconstructedCount = history.filter((p) => p.reconstructed).length;
  const observedCount = history.length - reconstructedCount;

  return (
    <div className="mt-2 rounded border border-slate-800/90 bg-[#08101d] p-2 font-mono">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="flex flex-wrap items-center gap-1 font-bold text-emerald-300">
          <span>
            {reconstructedCount > 0
              ? `ƯỚC TÍNH DAO ĐỘNG NGẮN HẠN (${observedCount} ngày ghi thực · ${reconstructedCount} phiên ước tính)`
              : `NHẬT KÝ ĐIỂM GHI NHẬN HÀNG NGÀY (${observedCount} NGÀY)`}
          </span>
          {reconstructedCount > 0 && (
            <span className="rounded border border-amber-500/45 bg-amber-500/15 px-1 py-0.1 text-xs font-bold text-amber-200">
              KHÔNG DÙNG BACKTEST
            </span>
          )}
        </span>
        <span
          className={`font-semibold tabular-nums ${
            deltaCompass >= 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          Khẩu vị {deltaCompass >= 0 ? '+' : ''}
          {deltaCompass}đ ({first.date.slice(5)} → {latest.date.slice(5)})
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[52px] w-full overflow-visible">
        <line
          x1={padX}
          y1={h / 2}
          x2={w - padX}
          y2={h / 2}
          stroke="#1e293b"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
        {formulaChange > 0 && (
          <line x1={changeX} y1={0} x2={changeX} y2={h} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth="1" />
        )}
        {hasFullVnMacro && (
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.65"
            strokeWidth="1.25"
            strokeDasharray="3 2"
            strokeLinecap="round"
            points={toPoints(macroVals)}
          />
        )}
        <polyline
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPoints(compassVals)}
        />
      </svg>
      <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400 tabular-nums">
        <span className="flex items-center gap-2">
          <span className="text-emerald-300">━ Khẩu vị rủi ro ({latest.compassScore})</span>
          {latest.vnMacroScore !== undefined && (
            <span className="text-sky-300">┄ Vĩ mô VN ({latest.vnMacroScore})</span>
          )}
        </span>
        {latest.vnIndexPrice && (
          <span className="text-slate-300">
            VN-Index {Math.round(latest.vnIndexPrice).toLocaleString('en-US')}
          </span>
        )}
      </div>
      {formulaChange > 0 && (
        <p className="mt-1 text-xs leading-snug text-amber-200">
          ┆ Công thức chấm điểm đổi từ {history[formulaChange].date.slice(5)}: điểm trước và sau mốc này không so sánh trực tiếp được.
        </p>
      )}
      <p className="mt-1 text-xs leading-snug text-slate-500">
        {reconstructedCount > 0
          ? 'Các phiên ước tính dựng lại từ giá đóng cửa chỉ số và giữ cố định số vĩ mô hiện hành; không phải lịch sử vĩ mô thực.'
          : 'Ghi nhận điểm tổng hợp mỗi ngày khi ứng dụng chạy; không thay thế chuỗi dữ liệu kinh tế gốc theo kỳ thống kê.'}
      </p>
    </div>
  );
}

export function renderInlineMarkdown(raw: string): ReactNode[] {
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`|\*(?!\s)[^*\n]+(?<!\s)\*)/g;
  const parts = raw.split(tokenRe);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded border border-slate-700/80 bg-slate-800/90 px-1 py-0.2 font-mono text-xs text-cyan-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-slate-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part.replace(/\*\*/g, '');
  });
}

export function FormattedAiMarkdown({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-slate-200">
      {lines.map((line, idx) => {
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch) {
          return (
            <div
              key={idx}
              className="pt-0.5 font-mono text-xs font-bold uppercase tracking-wider text-emerald-300"
            >
              {renderInlineMarkdown(headingMatch[1])}
            </div>
          );
        }

        const bulletMatch = line.match(/^(?:[-*•+]|\d+[.)])\s+(.+)$/);
        if (bulletMatch) {
          const content = bulletMatch[1].trim();
          const tagMatch = content.match(/^\[([^\]]{2,34})\]\s*:?\s*(.+)$/);
          if (tagMatch) {
            return (
              <div key={idx} className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 rounded border border-emerald-500/35 bg-emerald-500/12 px-1 py-0.1 font-mono text-xs font-bold text-emerald-300">
                  {tagMatch[1]}
                </span>
                <span className="min-w-0 flex-1">{renderInlineMarkdown(tagMatch[2])}</span>
              </div>
            );
          }

          return (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="min-w-0 flex-1">{renderInlineMarkdown(content)}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed text-slate-200">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}
