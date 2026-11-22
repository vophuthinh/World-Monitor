import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Broadcast,
  CloudSun,
  Crosshair,
  Fire,
  Gauge,
  MagnifyingGlass,
  PaperPlaneRight,
  Sparkle,
  Translate,
  Wind,
} from '@phosphor-icons/react';
import {
  type IntelTopicId,
  classifyLiveIntelTopics,
  computeCountryInstabilityScores,
  computeGlobalThreatLevel,
  computeTheaterPostures,
  detectTrendingSpikes,
  selectTopHotPolymarket,
} from '@shared/intelligence';
import type {
  AiAskResponse,
  AiSitrepSnapshot,
  CollectorId,
  GeoPointFeature,
  GoogleTrendGeo,
  GoogleTrendsSnapshot,
  NewsItem,
  PolicyLegalSnapshot,
  PredictionItem,
  TechCyberSnapshot,
  VietnamEnvSnapshot,
} from '@shared/types';
import type { FlashDirection } from '../../hooks/useMonitorData';
import {
  AQI_BADGE_STYLE,
  CII_BAND_STYLE,
  FormattedAiMarkdown,
  INTEL_TOPIC_TABS,
  POSTURE_BADGE,
  VN_ENV_DISPLAY_ORDER,
  formatCompactUsd,
  formatRelativeTime,
  renderInlineMarkdown,
} from './shared';

export interface LiveIntelTabProps {
  predictions: PredictionItem[];
  googleTrends?: GoogleTrendsSnapshot;
  news: NewsItem[];
  techCyber?: TechCyberSnapshot;
  policyLegal?: PolicyLegalSnapshot;
  vietnamEnv?: VietnamEnvSnapshot;
  aiSitrep?: AiSitrepSnapshot;
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  cyberThreats: GeoPointFeature[];
  predictionFlashes: Record<string, FlashDirection>;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  streamConnected: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onOpenWindy?: () => void;
  translateVi: boolean;
  onToggleTranslateVi: () => void;
  onJumpToTechCyber: (opts: { query?: string; scanIoc?: string }) => void;
  onJumpToNews: (query: string) => void;
}

export const LiveIntelTab = memo(function LiveIntelTab({
  predictions,
  googleTrends,
  news,
  techCyber,
  policyLegal,
  vietnamEnv,
  aiSitrep,
  military,
  vessels,
  earthquakes,
  geopolitics,
  cyberThreats,
  predictionFlashes,
  refreshingIds,
  onForceRefresh,
  streamConnected,
  onFlyToLocation,
  onOpenWindy,
  translateVi,
  onToggleTranslateVi,
  onJumpToTechCyber,
  onJumpToNews,
}: LiveIntelTabProps) {
  const [intelTopic, setIntelTopic] = useState<IntelTopicId | 'c2_ioc'>('cyber');
  const [trendGeo, setTrendGeo] = useState<GoogleTrendGeo>('VN');

  const [localSitrep, setLocalSitrep] = useState<AiSitrepSnapshot | null>(null);
  const [sitrepRefreshing, setSitrepRefreshing] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askReply, setAskReply] = useState<AiAskResponse | null>(null);

  const effectiveSitrep = localSitrep ?? aiSitrep ?? null;

  const refreshAiSitrep = useCallback(async () => {
    setSitrepRefreshing(true);
    try {
      const resp = await fetch('/api/ai-sitrep/refresh', { method: 'POST' });
      if (resp.ok) {
        const snap = (await resp.json()) as AiSitrepSnapshot;
        setLocalSitrep(snap);
      }
    } catch {
      // Keep current sitrep
    } finally {
      setSitrepRefreshing(false);
    }
  }, []);

  const submitAiQuestion = useCallback(
    async (overridePrompt?: string) => {
      const q = (overridePrompt ?? askInput).trim();
      if (!q) return;
      if (overridePrompt) setAskInput(overridePrompt);
      setAskLoading(true);
      setAskError(null);
      try {
        const resp = await fetch('/api/ai-ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });
        const body = (await resp.json()) as AiAskResponse & { error?: string };
        if (!resp.ok || body.error) {
          throw new Error(body.error || `HTTP ${resp.status}`);
        }
        setAskReply(body);
      } catch (err) {
        setAskError(err instanceof Error ? err.message : 'Không thể kết nối Trợ lý AI');
      } finally {
        setAskLoading(false);
      }
    },
    [askInput],
  );

  const [watchlistTerms, setWatchlistTerms] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wm_watchlist_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 10);
      }
    } catch {
      // Ignore storage errors
    }
    return ['Biển Đông', 'Nghị quyết 57', 'Zero-Day', 'TSMC'];
  });
  const [newWatchTerm, setNewWatchTerm] = useState('');
  const [selectedWatchTerm, setSelectedWatchTerm] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('wm_watchlist_v1', JSON.stringify(watchlistTerms));
    } catch {
      // Ignore storage errors
    }
  }, [watchlistTerms]);

  const techItems = techCyber?.items ?? [];

  const theaterPostures = useMemo(
    () => computeTheaterPostures({ military, vessels, geopolitics, cyberThreats }),
    [military, vessels, geopolitics, cyberThreats],
  );

  const globalThreat = useMemo(
    () =>
      computeGlobalThreatLevel({
        theaterPostures,
        cyberCount: cyberThreats.length,
        earthquakeMajorCount: earthquakes.filter((e) => (e.magnitude ?? 0) >= 5.0).length,
        geopoliticsCriticalCount: geopolitics.filter((g) => g.severity === 'critical').length,
      }),
    [theaterPostures, cyberThreats.length, earthquakes, geopolitics],
  );

  const ciiScores = useMemo(
    () => computeCountryInstabilityScores({ geopolitics, military, cyberThreats, news }),
    [geopolitics, military, cyberThreats, news],
  );

  const intelTopicBuckets = useMemo(
    () => classifyLiveIntelTopics(news, techItems),
    [news, techItems],
  );

  const trendingSpikes = useMemo(
    () => detectTrendingSpikes(news, techItems),
    [news, techItems],
  );

  const watchlistHitsMap = useMemo(() => {
    const out = new Map<
      string,
      Array<{ id: string; title: string; source: string; url: string; publishedAt: number }>
    >();
    for (const term of watchlistTerms) {
      const q = term.trim().toLowerCase();
      if (!q) continue;
      const matches: Array<{ id: string; title: string; source: string; url: string; publishedAt: number }> = [];
      for (const n of news) {
        if (`${n.title} ${n.titleVi ?? ''} ${n.matchedLocation ?? ''}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-n:${n.id}`,
            title: translateVi ? n.titleVi || n.title : n.title,
            source: n.source,
            url: n.url,
            publishedAt: n.publishedAt,
          });
        }
      }
      for (const t of techItems) {
        if (`${t.title} ${t.titleVi ?? ''} ${t.cveId ?? ''}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-t:${t.id}`,
            title: translateVi ? t.titleVi || t.title : t.title,
            source: t.source,
            url: t.url,
            publishedAt: t.publishedAt,
          });
        }
      }
      for (const p of policyLegal?.items ?? []) {
        if (`${p.title} ${p.docCode ?? ''} ${p.sector}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-p:${p.id}`,
            title: p.title,
            source: p.source,
            url: p.pdfUrl ?? p.url,
            publishedAt: p.publishedAt,
          });
        }
      }
      out.set(term, matches.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 8));
    }
    return out;
  }, [watchlistTerms, news, techItems, policyLegal?.items, translateVi]);

  const top5HotPolymarket = useMemo(() => selectTopHotPolymarket(predictions, 5), [predictions]);

  const activeGoogleTrends = useMemo(
    () => (trendGeo === 'VN' ? googleTrends?.vn ?? [] : googleTrends?.global ?? []),
    [googleTrends, trendGeo],
  );

  return (
    <div className="flex-1 space-y-3.5 overflow-y-auto p-2.5">
      {/* Top Bar: Global Threat DEFCON + Live Telemetry Summary + Translate Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-fuchsia-500/30 bg-[#0d1524] px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span
            title={globalThreat.summary}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${
              globalThreat.defcon <= 2
                ? 'border-rose-500/55 bg-rose-500/20 text-rose-200'
                : globalThreat.defcon === 3
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                  : 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200'
            }`}
          >
            <Gauge size={11} weight="fill" />
            DEFCON {globalThreat.defcon} · {globalThreat.score}/100
          </span>
          <span className="text-slate-400">
            C2/APT <strong className="text-fuchsia-200">{cyberThreats.length}</strong> · MIL{' '}
            <strong className="text-cyan-300">{military.length}</strong> · AIS{' '}
            <strong className="text-emerald-300">{vessels.length}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleTranslateVi}
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${
            translateVi
              ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
              : 'border-slate-700 bg-slate-900 text-slate-400'
          }`}
        >
          <Translate size={11} weight="bold" />
          <span>{translateVi ? 'VI: BẬT' : 'VI: TẮT'}</span>
        </button>
      </div>

      {/* 0. Groq LPU AI Executive Sitrep & Interactive "Ask Monitor" Copilot */}
      <section className="rounded border border-emerald-500/35 bg-gradient-to-b from-[#0d1829] to-[#0a1220] p-2.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-emerald-200">
            <Sparkle size={13} className="text-emerald-400" weight="fill" />
            <span>AI SITREP &amp; TRỢ LÝ TÌNH BÁO</span>
            <span className="rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[8.5px] font-bold uppercase text-emerald-300">
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
            className="inline-flex items-center gap-1 rounded border border-slate-700/90 bg-slate-900/90 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 transition hover:border-emerald-400/50 hover:text-emerald-200 disabled:opacity-50"
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
                  <span className="mt-0.5 shrink-0 rounded border border-emerald-500/35 bg-emerald-500/12 px-1 py-0.1 font-mono text-[8.5px] font-bold text-emerald-300">
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
            className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <PaperPlaneRight size={11} weight="fill" />
            <span>{askLoading ? 'Đang trả lời...' : 'Hỏi AI'}</span>
          </button>
        </form>

        <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[9px]">
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
          <div className="mt-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[10.5px] text-rose-200">
            {askError}
          </div>
        )}

        {askReply && (
          <div className="mt-2 rounded border border-emerald-500/40 bg-[#070d17] p-2.5 text-[11px] leading-relaxed text-slate-100">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 font-mono text-[9px] text-emerald-300">
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

      {/* 1. AI Strategic Theater Posture (6 Operational Theaters) */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
            STRATEGIC THEATER POSTURE (TÁC CHIẾN TRỰC TIẾP)
          </h2>
          <span className="font-mono text-[9.5px] text-slate-500">Bấm để bay tới</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {theaterPostures.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => onFlyToLocation(th.lat, th.lon, th.zoom)}
              className="rounded border border-slate-800/95 bg-[#0d1524] p-2 text-left transition hover:border-cyan-500/45 hover:bg-[#111c30]"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-semibold text-slate-100">{th.name}</span>
                <span
                  className={`shrink-0 rounded border px-1 py-0.2 font-mono text-[8.5px] font-bold ${POSTURE_BADGE[th.posture]}`}
                >
                  {th.posture}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-slate-400 tabular-nums">
                <span>AIR {th.airCount}</span>
                <span>SEA {th.seaCount}</span>
                <span>GEO {th.conflictCount}</span>
                <span className="text-fuchsia-300">CYB {th.cyberCount}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 1b. Vietnam Marine Weather, UV/Rain, AQI & NCHMF Storm Alerts */}
      {vietnamEnv && vietnamEnv.locations.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-slate-200">
              <CloudSun size={13} className="text-sky-400" weight="fill" />
              <span>KHÍ TƯỢNG · SÓNG BIỂN ĐÔNG &amp; AQI VN</span>
            </h2>
            <div className="flex items-center gap-1">
              {onOpenWindy && (
                <button
                  type="button"
                  onClick={onOpenWindy}
                  title="Mở Bản đồ Dòng chảy Gió & Sóng Biển Đông trực tiếp (Windy)"
                  className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-sky-200 transition hover:bg-sky-500/25"
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
                      <div className="mt-1 space-y-0.5 font-mono text-[9.5px]">
                        <div className="flex items-center justify-between text-sky-200">
                          <span className="inline-flex items-center gap-0.5">
                            <Wind size={10} /> Cấp {loc.beaufortScale}
                            {loc.windDirLabel ? ` ${loc.windDirLabel}` : ''}
                          </span>
                          <span>Giật {loc.windGustKmh}km/h</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
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
                      <div className="mt-1 space-y-0.5 font-mono text-[9.5px]">
                        <div className="flex items-center justify-between gap-1">
                          {loc.usAqi !== undefined && aqiMeta ? (
                            <span className={`rounded border px-1 py-0.1 font-bold ${aqiMeta.cls}`}>
                              AQI {loc.usAqi} · {aqiMeta.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">{loc.weatherLabel}</span>
                          )}
                          {loc.pm25 !== undefined && (
                            <span className="text-[9px] text-slate-400 tabular-nums">
                              PM2.5 {loc.pm25}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-400 tabular-nums">
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
                  </button>
                );
              })}
          </div>

          {vietnamEnv.alerts && vietnamEnv.alerts.length > 0 && (
            <div className="mt-2 rounded border border-sky-500/30 bg-[#0a1322] px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between font-mono text-[9.5px]">
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
                    href={al.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start justify-between gap-2 py-1.5 first:pt-0.5 last:pb-0 transition hover:text-sky-200"
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={`mr-1.5 inline-block rounded border px-1 py-0.1 font-mono text-[8.5px] font-bold ${
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
                    <span className="shrink-0 font-mono text-[9px] text-slate-500 tabular-nums">
                      {formatRelativeTime(al.publishedAt)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 2. Polymarket Top 5 Hottest Realtime */}
      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-slate-200">
            <Fire size={13} className="text-amber-400" weight="fill" />
            <span>POLYMARKET · TOP 5 HOT NHẤT</span>
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {streamConnected ? 'LIVE WS' : '45S LIVE'}
            </span>
          </h2>

          <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
            <span>24h Vol</span>
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => onForceRefresh('polymarket')}
                title="Làm mới Polymarket ngay lập tức"
                className="inline-flex items-center gap-0.5 rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={refreshingIds?.has('polymarket') ? 'animate-spin text-cyan-300' : ''}
                />
              </button>
            )}
          </div>
        </div>

        {top5HotPolymarket.length === 0 ? (
          <div className="mt-1.5 rounded border border-slate-800/95 bg-[#0d1524] py-4 text-center text-xs text-slate-400">
            Đang đồng bộ Top 5 Polymarket sôi động nhất 24h...
          </div>
        ) : (
          <div className="mt-1.5 divide-y divide-slate-800/85 rounded border border-amber-500/25 bg-[#0d1524]">
            {top5HotPolymarket.map((item, idx) => {
              const label = translateVi ? item.titleVi || item.title : item.title;
              const flash = predictionFlashes[item.id];
              const vol24 = item.volume24hUsd ?? item.volumeUsd;
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`block px-2.5 py-2 transition hover:bg-[#121e33] ${
                    flash === 'up'
                      ? 'bg-emerald-500/15'
                      : flash === 'down'
                        ? 'bg-rose-500/15'
                        : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 font-mono text-[9px] font-bold ${
                            idx === 0
                              ? 'border border-amber-400/50 bg-amber-500/20 text-amber-200'
                              : idx < 3
                                ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                                : 'border border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          #{idx + 1} HOT
                        </span>
                        {item.outcomeLabel && (
                          <span className="truncate rounded border border-fuchsia-500/35 bg-fuchsia-500/15 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-fuchsia-200">
                            {item.outcomeLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs font-medium leading-snug text-slate-100">
                        {label}
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div
                        className={`text-sm font-bold transition-colors ${
                          flash === 'up'
                            ? 'text-emerald-300'
                            : flash === 'down'
                              ? 'text-rose-300'
                              : 'text-cyan-300'
                        }`}
                      >
                        {item.yesPercent}%
                      </div>
                      {item.change24hPct !== undefined && (
                        <div
                          className={`text-[9px] font-semibold ${
                            item.change24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.change24hPct >= 0 ? '+' : ''}
                          {item.change24hPct.toFixed(1)}% 24h
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500"
                        style={{ width: `${Math.max(3, Math.min(98, item.yesPercent))}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[9.5px] font-semibold text-amber-300 tabular-nums">
                      24h {formatCompactUsd(vol24)}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-slate-500 tabular-nums">
                      Tổng {formatCompactUsd(item.volumeUsd)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Google Trends Realtime */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-slate-200">
            <MagnifyingGlass size={13} className="text-cyan-400" weight="bold" />
            <span>GOOGLE TRENDS REALTIME</span>
            <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/12 px-1.5 py-0.2 font-mono text-[8.5px] font-bold text-cyan-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              LIVE 60S
            </span>
          </h2>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTrendGeo('VN')}
              className={`rounded px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${
                trendGeo === 'VN'
                  ? 'border border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              🇻🇳 Việt Nam ({googleTrends?.vn.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setTrendGeo('GLOBAL')}
              className={`rounded px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${
                trendGeo === 'GLOBAL'
                  ? 'border border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              🌍 Thế giới ({googleTrends?.global.length ?? 0})
            </button>
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => onForceRefresh('google-trends')}
                title="Làm mới Google Trends ngay lập tức"
                className="inline-flex items-center rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={refreshingIds?.has('google-trends') ? 'animate-spin text-cyan-300' : ''}
                />
              </button>
            )}
          </div>
        </div>

        <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] text-slate-500">
          <span>Từ khóa người dùng tìm kiếm đột biến nhiều nhất trên Google</span>
          {googleTrends?.updatedAt ? (
            <span>Cập nhật {formatRelativeTime(googleTrends.updatedAt)}</span>
          ) : null}
        </div>

        {activeGoogleTrends.length === 0 ? (
          <div className="mt-1.5 rounded border border-slate-800/95 bg-[#0d1524] py-4 text-center text-xs text-slate-400">
            Đang kéo luồng xu hướng tìm kiếm trực tiếp từ Google Trends...
          </div>
        ) : (
          <div className="mt-1.5 max-h-[295px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-cyan-500/25 bg-[#0d1524]">
            {activeGoogleTrends.slice(0, 10).map((tr, idx) => {
              const newsHeadline = translateVi
                ? tr.topNewsTitleVi || tr.topNewsTitle
                : tr.topNewsTitle;
              return (
                <div key={tr.id} className="px-2.5 py-2 transition hover:bg-[#111c30]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`inline-flex h-4 min-w-[20px] shrink-0 items-center justify-center rounded px-1 font-mono text-[9.5px] font-bold ${
                          idx === 0
                            ? 'border border-amber-400/50 bg-amber-500/25 text-amber-200'
                            : idx < 3
                              ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                              : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{tr.rank}
                      </span>
                      <a
                        href={tr.topNewsUrl ?? tr.trendUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs font-semibold text-slate-100 hover:text-cyan-300"
                      >
                        {tr.query}
                      </a>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px]">
                      <span className="rounded border border-amber-500/35 bg-amber-500/12 px-1.5 py-0.2 font-semibold text-amber-300 tabular-nums">
                        🔥 {tr.approxTraffic}
                      </span>
                      <span className="text-slate-500">{formatRelativeTime(tr.publishedAt)}</span>
                    </div>
                  </div>

                  {newsHeadline && (
                    <a
                      href={tr.topNewsUrl ?? tr.trendUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-[11px] leading-snug text-slate-300 hover:text-slate-100"
                    >
                      {tr.topNewsSource && (
                        <span className="mr-1.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-[9px] text-slate-400">
                          {tr.topNewsSource}
                        </span>
                      )}
                      <span>{newsHeadline}</span>
                    </a>
                  )}

                  <div className="mt-1 flex items-center justify-between font-mono text-[9.5px]">
                    <a
                      href={tr.trendUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-slate-400 hover:text-cyan-300"
                    >
                      Google Trends <ArrowSquareOut size={10} />
                    </a>
                    {tr.matchedLat !== undefined && tr.matchedLon !== undefined && (
                      <button
                        type="button"
                        onClick={() => onFlyToLocation(tr.matchedLat!, tr.matchedLon!, 5.5)}
                        className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                      >
                        <Crosshair size={10} />
                        Bay tới: {tr.matchedLocation}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Custom Watchlist Keyword Alerts */}
      <section className="rounded border border-slate-800/95 bg-[#0d1524] p-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wider text-amber-200">
            <Broadcast size={12} className="text-amber-400" weight="fill" />
            <span>WATCHLIST TỪ KHÓA (CẢNH BÁO TỰ ĐỘNG)</span>
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newWatchTerm.trim();
              if (!clean) return;
              if (!watchlistTerms.some((t) => t.toLowerCase() === clean.toLowerCase())) {
                setWatchlistTerms((prev) => [...prev.slice(-8), clean]);
              }
              setNewWatchTerm('');
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={newWatchTerm}
              onChange={(e) => setNewWatchTerm(e.target.value)}
              placeholder="+ Thêm từ khóa..."
              className="w-28 rounded border border-slate-700/90 bg-[#070b12] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </form>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {watchlistTerms.map((term) => {
            const count = watchlistHitsMap.get(term)?.length ?? 0;
            const active = selectedWatchTerm === term;
            return (
              <span
                key={term}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition ${
                  active
                    ? 'border-amber-400/70 bg-amber-500/25 text-amber-100'
                    : count > 0
                      ? 'border-amber-500/40 bg-amber-500/12 text-amber-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedWatchTerm((prev) => (prev === term ? null : term))}
                  className="inline-flex items-center gap-1 font-semibold"
                >
                  <span>{term}</span>
                  <span className="rounded bg-black/30 px-1 text-[8.5px]">{count}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWatchlistTerms((prev) => prev.filter((x) => x !== term));
                    if (selectedWatchTerm === term) setSelectedWatchTerm(null);
                  }}
                  title={`Xóa ${term}`}
                  className="ml-0.5 text-slate-500 hover:text-rose-300"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>

        {selectedWatchTerm && (
          <div className="mt-2 max-h-[155px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-amber-500/30 bg-[#090f1a] px-2 py-1">
            {(watchlistHitsMap.get(selectedWatchTerm) ?? []).length === 0 ? (
              <div className="py-2 text-center text-[10.5px] text-slate-400">
                Chưa có tín hiệu mới khớp từ khóa &ldquo;{selectedWatchTerm}&rdquo;.
              </div>
            ) : (
              (watchlistHitsMap.get(selectedWatchTerm) ?? []).map((hit) => (
                <a
                  key={hit.id}
                  href={hit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-1.5 text-[11px] leading-snug text-slate-200 hover:text-amber-200"
                >
                  <span className="mr-1.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-[9px] text-amber-300">
                    {hit.source}
                  </span>
                  <span>{hit.title}</span>
                </a>
              ))
            )}
          </div>
        )}
      </section>

      {/* 5. Surging Keywords & CVE Spike Detector */}
      {trendingSpikes.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1 font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
            <Fire size={12} className="text-amber-400" weight="fill" />
            <span>TRENDING THREAT &amp; KEYWORD SPIKES</span>
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {trendingSpikes.map((sp) => (
              <button
                key={sp.term}
                type="button"
                onClick={() => {
                  const keyword = sp.term.split(' / ')[0];
                  if (sp.kind === 'cve' || sp.kind === 'tech_ai') {
                    onJumpToTechCyber({ query: keyword });
                  } else {
                    onJumpToNews(keyword);
                  }
                }}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition hover:brightness-125 ${
                  sp.kind === 'cve'
                    ? 'border-rose-500/45 bg-rose-500/15 text-rose-200'
                    : sp.kind === 'tech_ai'
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                      : 'border-amber-500/40 bg-amber-500/12 text-amber-200'
                }`}
              >
                <span className="font-semibold">{sp.term}</span>
                <span className="opacity-75">×{sp.mentions}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 6. Live Intelligence Feeds & Cyber IOCs */}
      <section>
        <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
          LIVE INTELLIGENCE STREAMS &amp; CYBER IOCs
        </h2>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {INTEL_TOPIC_TABS.map((tab) => {
            const count =
              tab.id === 'c2_ioc' ? cyberThreats.length : intelTopicBuckets[tab.id].length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIntelTopic(tab.id)}
                className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${
                  intelTopic === tab.id
                    ? 'border border-fuchsia-500/50 bg-fuchsia-500/20 text-fuchsia-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="mt-2 max-h-[300px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-slate-800/95 bg-[#0d1524]">
          {intelTopic === 'c2_ioc' ? (
            cyberThreats.slice(0, 35).map((ioc) => (
              <div key={ioc.id} className="px-2.5 py-2 transition hover:bg-slate-900/70">
                <div className="flex items-center justify-between gap-2 font-mono text-[9.5px]">
                  <span
                    className={`rounded border px-1.5 py-0.2 font-semibold ${
                      ioc.category === 'apt_group'
                        ? 'border-rose-500/45 bg-rose-500/20 text-rose-200'
                        : 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300'
                    }`}
                  >
                    {ioc.category === 'apt_group' ? 'APT ACTOR' : ioc.source}
                  </span>
                  <span className="text-slate-400">{String(ioc.meta.country ?? '')}</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-100">{ioc.title}</div>
                {ioc.subtitle && (
                  <div className="mt-0.5 text-[10.5px] text-slate-400">{ioc.subtitle}</div>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onFlyToLocation(ioc.lat, ioc.lon, 6.0)}
                      className="inline-flex items-center gap-1 rounded border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[9.5px] text-fuchsia-200 hover:bg-fuchsia-500/20"
                    >
                      <Crosshair size={10} />
                      Định vị C2
                    </button>
                    {typeof ioc.meta.ipAddress === 'string' && (
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToTechCyber({ scanIoc: String(ioc.meta.ipAddress) })
                        }
                        className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9.5px] text-cyan-200 hover:bg-cyan-500/20"
                      >
                        <MagnifyingGlass size={10} />
                        Quét Shodan
                      </button>
                    )}
                  </div>
                  {ioc.url && (
                    <a
                      href={ioc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      Hồ sơ IOC <ArrowSquareOut size={10} />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : intelTopicBuckets[intelTopic].length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Đang quét tín hiệu OSINT cho chủ đề này...
            </div>
          ) : (
            intelTopicBuckets[intelTopic].slice(0, 18).map((item) => {
              const headline = translateVi ? item.titleVi || item.title : item.title;
              return (
                <div key={item.id} className="px-2.5 py-2 transition hover:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-2 font-mono text-[9.5px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate rounded bg-slate-800 px-1.5 py-0.2 font-semibold text-slate-300">
                        {item.source}
                      </span>
                      {item.cveId && (
                        <span className="shrink-0 rounded border border-rose-500/45 bg-rose-500/20 px-1 py-0.2 font-bold text-rose-200">
                          {item.cveId}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-slate-500">
                      {formatRelativeTime(item.publishedAt)}
                    </span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs font-medium leading-snug text-slate-100 hover:text-fuchsia-300"
                  >
                    {headline}
                  </a>
                  {item.matchedLat !== undefined && item.matchedLon !== undefined && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                        className="inline-flex items-center gap-1 font-mono text-[9.5px] text-cyan-300 hover:underline"
                      >
                        <Crosshair size={10} />
                        Bay tới: {item.matchedLocation}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 7. Country Instability & Strategic Risk Index (CII) */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
            COUNTRY INSTABILITY INDEX (CII REALTIME)
          </h2>
          <span className="font-mono text-[9.5px] text-slate-500">
            0 = Ổn định · 100 = Xung đột
          </span>
        </div>
        <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
          {ciiScores.map((row) => {
            const style = CII_BAND_STYLE[row.band];
            return (
              <button
                key={row.code}
                type="button"
                onClick={() => onFlyToLocation(row.lat, row.lon, 5.2)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition hover:bg-slate-900/75 ${
                  row.isVietnam ? 'bg-emerald-500/8' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100">{row.name}</span>
                    <span className="font-mono text-[9.5px] text-slate-500">{row.code}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${row.score}%`, backgroundColor: style.bar }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="text-xs font-bold text-slate-100">{row.score}/100</div>
                  <span
                    className={`inline-block rounded border px-1 py-0.2 text-[8.5px] font-semibold ${style.badge}`}
                  >
                    {row.isVietnam && row.band === 'LOW' ? 'STABLE · LOW' : row.band}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
});

export default LiveIntelTab;
