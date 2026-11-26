import { CalendarBlank } from '@phosphor-icons/react';
import type { buildMarketCatalystCalendar } from '@shared/catalysts-and-chokepoints';

export function CatalystCalendarSection({ catalystCalendar }: {
  catalystCalendar: ReturnType<typeof buildMarketCatalystCalendar>;
}) {
  if (!(catalystCalendar.length > 0)) return null;
  return (
    <section className="rounded-md border border-amber-500/30 bg-[#0b1322] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-amber-300">
          <CalendarBlank size={13} weight="fill" className="text-amber-400" />
          <span>LỊCH SỰ KIỆN XÚC TÁC &amp; ĐÁO HẠN SẮP TỚI</span>
        </h2>
        <span className="font-mono text-[11px] text-slate-300">Giờ VN</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {catalystCalendar.slice(0, 5).map((ev) => {
          const badgeCls =
            ev.urgency === 'imminent'
              ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
              : ev.urgency === 'soon'
                ? 'border-amber-500/45 bg-amber-500/18 text-amber-200'
                : 'border-slate-700 bg-slate-800/90 text-slate-300';
          return (
            <div
              key={ev.id}
              className="flex items-center justify-between gap-2 rounded border border-slate-800/85 bg-[#070d18] px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]">{ev.region === 'VN' ? '🇻🇳' : '🇺🇸'}</span>
                  <span className="text-xs font-semibold text-slate-100">
                    {ev.title}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  {ev.impactNote}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-bold ${badgeCls}`}
                >
                  {ev.daysUntil === 0 ? 'HÔM NAY' : `Còn ${ev.daysUntil} ngày`}
                </span>
                <div className="mt-0.5 text-[11px] text-slate-300">
                  {ev.dateLabel}{ev.estimated ? ' · Ước tính' : ' · Lịch tĩnh'}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-amber-200">
                Ngày ước tính và lịch tĩnh có thể thay đổi; kiểm tra lịch chính thức trước khi giao dịch. Không hiển thị FOMC khi hết lịch tĩnh.
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
