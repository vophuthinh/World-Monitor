import { describeEnsemble, type EnsembleAgreement } from '../../lib/ensemble-format';
import { ArrowsClockwise, CloudSun, Wind } from '@phosphor-icons/react';
import { AQI_BADGE_STYLE, VN_ENV_DISPLAY_ORDER, formatRelativeTime } from './shared';
import type { CollectorId, VietnamEnvEnsemble, VietnamEnvSnapshot } from '@shared/types';
import { safeHref } from '../../lib/safe-href';

const AGREEMENT_STYLE: Record<EnsembleAgreement, { label: string; cls: string }> = {
  high: { label: 'Đồng thuận cao', cls: 'text-emerald-300' },
  medium: { label: 'Khá phân tán', cls: 'text-amber-300' },
  low: { label: 'Mô hình bất đồng', cls: 'font-semibold text-rose-300' },
};

function EnsembleLine({ ensemble }: { ensemble: VietnamEnvEnsemble }) {
  const { summary, agreement, tooltip } = describeEnsemble(ensemble);
  const style = AGREEMENT_STYLE[agreement];
  return (
    <div className="mt-1 border-t border-slate-800/80 pt-1 text-[11px] leading-snug text-slate-400" title={tooltip}>
      <span>{summary}</span> · <span className={style.cls}>{style.label}</span>
    </div>
  );
}

export function VietnamEnvSection({ vietnamEnv, onFlyToLocation, onForceRefresh, onOpenWindy, refreshingIds }: {
  vietnamEnv: VietnamEnvSnapshot;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  onOpenWindy?: () => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-200">
          <CloudSun size={13} className="text-sky-400" weight="fill" />
          <span>KHÍ TƯỢNG · SÓNG BIỂN ĐÔNG &amp; AQI VN</span>
        </h2>
        <div className="flex items-center gap-1">
          {onOpenWindy && (
            <button
              type="button"
              onClick={onOpenWindy}
              title="Mở Bản đồ Dòng chảy Gió & Sóng Biển Đông trực tiếp (Windy)"
              className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-200 transition hover:bg-sky-500/25"
            >
              <Wind size={10} weight="bold" />
              <span>Gió/Bão Windy</span>
            </button>
          )}
          {onForceRefresh && (
            <button
              type="button"
              onClick={() => onForceRefresh('vietnam-env')}
              title="Làm mới Khí tượng Hoàng Sa - Trường Sa, UV, Sóng biển & Cảnh báo KTTV"
              className="inline-flex items-center rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-sky-400/50 hover:text-sky-200"
            >
              <ArrowsClockwise
                size={10}
                className={refreshingIds?.has('vietnam-env') ? 'animate-spin text-sky-300' : ''}
              />
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {[...vietnamEnv.locations]
          .sort((a, b) => (VN_ENV_DISPLAY_ORDER[a.id] ?? 99) - (VN_ENV_DISPLAY_ORDER[b.id] ?? 99))
          .map((loc) => {
            const isSea = loc.region === 'maritime';
            const aqiMeta = loc.aqiBand ? AQI_BADGE_STYLE[loc.aqiBand] : null;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => onFlyToLocation(loc.lat, loc.lon, isSea ? 6.2 : 7.5)}
                className={`rounded border p-2 text-left transition hover:border-sky-400/55 ${
                  loc.stormWarning
                    ? 'border-rose-500/50 bg-rose-950/30'
                    : isSea
                      ? 'border-sky-500/35 bg-[#0c1729]'
                      : 'border-slate-800/95 bg-[#0d1524]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-semibold text-slate-100">
                    {loc.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-cyan-300 tabular-nums">
                    {loc.tempC}°C
                  </span>
                </div>

                {isSea ? (
                  <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-sky-200">
                      <span className="inline-flex items-center gap-0.5">
                        <Wind size={10} /> Cấp {loc.beaufortScale}
                        {loc.windDirLabel ? ` ${loc.windDirLabel}` : ''}
                      </span>
                      <span>Giật {loc.windGustKmh}km/h</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={loc.stormWarning ? 'font-bold text-rose-300' : 'text-slate-400'}>
                        {loc.stormWarning ? '⚠️ BIỂN ĐỘNG' : loc.weatherLabel}
                      </span>
                      {loc.waveHeightM !== undefined && (
                        <span className="font-semibold text-cyan-300 tabular-nums">
                          Sóng {loc.waveHeightM.toFixed(1)}m
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between gap-1">
                      {loc.usAqi !== undefined && aqiMeta ? (
                        <span className={`rounded border px-1 py-0.1 font-bold ${aqiMeta.cls}`}>
                          AQI {loc.usAqi} · {aqiMeta.label}
                        </span>
                      ) : (
                        <span className="text-slate-400">{loc.weatherLabel}</span>
                      )}
                      {loc.pm25 !== undefined && (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          PM2.5 {loc.pm25}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                      <span>
                        {loc.rainProbPct !== undefined ? `Mưa ${loc.rainProbPct}%` : loc.weatherLabel}
                        {loc.humidityPct !== undefined ? ` · Ẩm ${loc.humidityPct}%` : ''}
                      </span>
                      {loc.uvIndex !== undefined && (
                        <span className={loc.uvIndex >= 7 ? 'font-semibold text-amber-300' : 'text-slate-400'}>
                          UV {loc.uvIndex.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {loc.ensemble && <EnsembleLine ensemble={loc.ensemble} />}
                {isSea && (loc.seaSurfaceTempC !== undefined || loc.oceanCurrentKmh !== undefined || loc.swellHeightM !== undefined) && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    {loc.seaSurfaceTempC !== undefined && `Mặt biển ${loc.seaSurfaceTempC}°C · `}
                    {loc.oceanCurrentKmh !== undefined && `Dòng chảy ${loc.oceanCurrentKmh} km/h${loc.oceanCurrentDirectionDeg !== undefined ? ` (${loc.oceanCurrentDirectionDeg}°)` : ''} · `}
                    {loc.swellHeightM !== undefined && `Sóng lừng ${loc.swellHeightM} m`}
                  </div>
                )}
                {loc.hourlyForecast && loc.hourlyForecast.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    6 giờ tới: {loc.hourlyForecast.map((hour) =>
                      `${hour.time.slice(11)} ${hour.rainMm === null ? '—' : `${hour.rainMm}mm`}/${hour.windKmh === null ? '—' : `${hour.windKmh}km/h`}`,
                    ).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
      </div>

      <p className="mt-1 text-[11px] text-slate-400">
        Open-Meteo · tải lúc {new Date(vietnamEnv.updatedAt).toLocaleString('vi-VN')}: dữ liệu mô hình tham khảo, không dùng để dẫn đường hoặc thay cảnh báo chính thức.
      </p>
      {vietnamEnv.riverDischarge && vietnamEnv.riverDischarge.length > 0 && (
        <div className="mt-2 rounded border border-slate-700 p-2 text-[11px] text-slate-300">
          <strong>Lưu lượng mô phỏng gần TP.HCM / Hà Nội · Open-Meteo GloFAS</strong>
          <p>Ô lưới gần tọa độ thành phố; chưa xác minh sông, không phải mực nước hoặc cảnh báo lũ.</p>
          {vietnamEnv.riverDischarge.map((river) => (
            <p key={river.city}>{river.city} ({river.latitude.toFixed(3)}, {river.longitude.toFixed(3)}): {river.forecast.map((day) => `${day.date}: ${day.dischargeM3s.toLocaleString('vi-VN')} m³/s`).join(' · ')}</p>
          ))}
        </div>
      )}
      {!vietnamEnv.riverDischarge?.length && <p className="mt-1 text-[11px] text-slate-400">Chưa có lưu lượng mô phỏng gần Hà Nội / TP.HCM.</p>}
      {vietnamEnv.alerts && vietnamEnv.alerts.length > 0 && (
        <div className="mt-2 rounded border border-sky-500/30 bg-[#0a1322] px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
            <span className="font-bold text-sky-300">
              ⚠️ BẢN TIN CẢNH BÁO KTTV VIỆT NAM (NCHMF · BÃO &amp; LŨ)
            </span>
            <a
              href="https://nchmf.gov.vn"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-200"
            >
              nchmf.gov.vn ↗
            </a>
          </div>
          <div className="divide-y divide-slate-800/75">
            {vietnamEnv.alerts.slice(0, 3).map((al) => (
              <a
                key={al.id}
                href={safeHref(al.url)}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-2 py-1.5 first:pt-0.5 last:pb-0 transition hover:text-sky-200"
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={`mr-1.5 inline-block rounded border px-1 py-0.1 font-mono text-[11px] font-bold ${
                      al.severity === 'critical'
                        ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                        : al.severity === 'high'
                          ? 'border-amber-500/45 bg-amber-500/18 text-amber-200'
                          : 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                    }`}
                  >
                    {al.badge}
                  </span>
                  <span className="text-[11px] leading-snug text-slate-200 hover:text-sky-200">
                    {al.title}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                  {formatRelativeTime(al.publishedAt)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
