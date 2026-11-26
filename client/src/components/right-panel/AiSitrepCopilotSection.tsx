import { ArrowsClockwise, PaperPlaneRight, Sparkle } from '@phosphor-icons/react';
import { FormattedAiMarkdown, renderInlineMarkdown } from './shared';
import type { AiAskResponse, AiSitrepSnapshot } from '@shared/types';

export function AiSitrepCopilotSection({ effectiveSitrep, sitrepRefreshing, refreshAiSitrep, askInput, setAskInput, askLoading, askError, askReply, setAskReply, submitAiQuestion }: {
  effectiveSitrep: AiSitrepSnapshot | null;
  sitrepRefreshing: boolean;
  refreshAiSitrep: () => Promise<void>;
  askInput: string;
  setAskInput: (value: string) => void;
  askLoading: boolean;
  askError: string | null;
  askReply: AiAskResponse | null;
  setAskReply: (value: AiAskResponse | null) => void;
  submitAiQuestion: (overridePrompt?: string) => Promise<void>;
}) {
  return (
    <section className="rounded border border-emerald-500/35 bg-gradient-to-b from-[#0d1829] to-[#0a1220] p-2.5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-emerald-200">
          <Sparkle size={13} className="text-emerald-400" weight="fill" />
          <span>AI SITREP &amp; TRỢ LÝ TÌNH BÁO</span>
          <span className="rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[11px] font-bold uppercase text-emerald-300">
            {effectiveSitrep?.provider === 'groq-lpu'
              ? `GROQ LPU · ${effectiveSitrep.latencyMs}ms`
              : effectiveSitrep?.provider === 'gemini'
                ? 'GEMINI AI'
                : 'LIVE BRIEF'}
          </span>
        </h2>

        <button
          type="button"
          onClick={() => void refreshAiSitrep()}
          disabled={sitrepRefreshing}
          title="Tổng hợp lại Bản tin AI Sitrep từ dữ liệu mới nhất"
          className="inline-flex items-center gap-1 rounded border border-slate-700/90 bg-slate-900/90 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 transition hover:border-emerald-400/50 hover:text-emerald-200 disabled:opacity-50"
        >
          <ArrowsClockwise
            size={10}
            className={sitrepRefreshing ? 'animate-spin text-emerald-300' : ''}
          />
          <span>{sitrepRefreshing ? 'Đang phân tích...' : 'Làm mới AI'}</span>
        </button>
      </div>

      {effectiveSitrep ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="text-xs font-semibold leading-snug text-slate-100">
            {renderInlineMarkdown(effectiveSitrep.headline)}
          </div>
          <ul className="space-y-1 rounded border border-slate-800/85 bg-[#080e19]/90 p-2 text-[11px] leading-snug text-slate-200">
            {effectiveSitrep.bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 rounded border border-emerald-500/35 bg-emerald-500/12 px-1 py-0.1 font-mono text-[11px] font-bold text-emerald-300">
                  {b.tag}
                </span>
                <span className="text-slate-200">{renderInlineMarkdown(b.text)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-1.5 py-2 text-center text-[11px] text-slate-400">
          Đang khởi tạo Bản tin Tình báo AI trên Groq LPU...
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitAiQuestion();
        }}
        className="mt-2 flex items-center gap-1.5"
      >
        <input
          type="text"
          value={askInput}
          onChange={(e) => setAskInput(e.target.value)}
          placeholder="Hỏi AI: Tình hình Biển Đông, Vàng SJC, NQ 57..."
          className="min-w-0 flex-1 rounded border border-slate-700/95 bg-[#070b12] px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={askLoading}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
        >
          <PaperPlaneRight size={11} weight="fill" />
          <span>{askLoading ? 'Đang trả lời...' : 'Hỏi AI'}</span>
        </button>
      </form>

      <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[11px]">
        {[
          'Tình hình Biển Đông & Gió Hoàng Sa?',
          'Giá vàng SJC, USD/VND & VN30?',
          'Tin cổ tức & cổ phiếu HPT?',
          'Tóm tắt NQ 57 & Bộ KH&CN mới?',
        ].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void submitAiQuestion(chip)}
            className="rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 text-slate-300 transition hover:border-emerald-500/45 hover:text-emerald-200"
          >
            {chip}
          </button>
        ))}
      </div>

      {askError && (
        <div className="mt-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-200">
          {askError}
        </div>
      )}

      {askReply && (
        <div className="mt-2 rounded border border-emerald-500/40 bg-[#070d17] p-2.5 text-[11px] leading-relaxed text-slate-100">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 font-mono text-[11px] text-emerald-300">
            <span>
              TRẢ LỜI TRỰC TIẾP ({askReply.model} · {askReply.latencyMs}ms)
            </span>
            <button
              type="button"
              onClick={() => setAskReply(null)}
              className="text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <FormattedAiMarkdown text={askReply.answer} />
        </div>
      )}
    </section>
  );
}
