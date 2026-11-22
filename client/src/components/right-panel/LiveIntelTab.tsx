import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  Broadcast,
  Fire,
  Gauge,
  PaperPlaneRight,
  Sparkle,
  Translate,
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
import { GoogleTrendsSection } from './GoogleTrendsSection';
import { IntelFeedsSection } from './IntelFeedsSection';
import { PolymarketSection } from './PolymarketSection';
import { VietnamEnvSection } from './VietnamEnvSection';
import type { FlashDirection } from '../../hooks/useMonitorData';
import {
  CII_BAND_STYLE,
  FormattedAiMarkdown,
  POSTURE_BADGE,
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
        <VietnamEnvSection
          vietnamEnv={vietnamEnv}
          onFlyToLocation={onFlyToLocation}
          onForceRefresh={onForceRefresh}
          onOpenWindy={onOpenWindy}
          refreshingIds={refreshingIds}
        />
      )}

      {/* 2. Polymarket Top 5 Hottest Realtime */}
      <PolymarketSection
        top5HotPolymarket={top5HotPolymarket}
        predictionFlashes={predictionFlashes}
        streamConnected={streamConnected}
        translateVi={translateVi}
        onForceRefresh={onForceRefresh}
        refreshingIds={refreshingIds}
      />

      {/* 3. Google Trends Realtime */}
      <GoogleTrendsSection
        activeGoogleTrends={activeGoogleTrends}
        googleTrends={googleTrends}
        trendGeo={trendGeo}
        setTrendGeo={setTrendGeo}
        translateVi={translateVi}
        onFlyToLocation={onFlyToLocation}
        onForceRefresh={onForceRefresh}
        refreshingIds={refreshingIds}
      />

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
      <IntelFeedsSection
        cyberThreats={cyberThreats}
        intelTopic={intelTopic}
        setIntelTopic={setIntelTopic}
        intelTopicBuckets={intelTopicBuckets}
        translateVi={translateVi}
        onFlyToLocation={onFlyToLocation}
        onJumpToTechCyber={onJumpToTechCyber}
      />

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
