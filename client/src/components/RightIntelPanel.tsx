import { type ReactNode, memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Broadcast,
  ChartBar,
  ChartLineUp,
  CloudSun,
  Coins,
  Cpu,
  Crosshair,
  FilePdf,
  Fire,
  Gauge,
  Lightning,
  MagnifyingGlass,
  Newspaper,
  PaperPlaneRight,
  Scales,
  ShieldWarning,
  Sparkle,
  Target,
  Translate,
  TrendDown,
  TrendUp,
  Wind,
} from '@phosphor-icons/react';
import {
  type CiiBand,
  type IntelTopicId,
  type PostureLevel,
  classifyLiveIntelTopics,
  computeCountryInstabilityScores,
  computeGlobalThreatLevel,
  computeTheaterPostures,
  detectTrendingSpikes,
  selectTopHotPolymarket,
} from '@shared/intelligence';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '@shared/macro-health';
import type {
  AiAskResponse,
  AiSitrepSnapshot,
  AqiBand,
  CollectorId,
  GeoPointFeature,
  GoogleTrendGeo,
  GoogleTrendsSnapshot,
  HptCompanyIntelSnapshot,
  HptItemCategory,
  HptSentiment,
  IocLookupResult,
  LegalDocType,
  MarketSnapshot,
  NewsCategory,
  NewsItem,
  NewsStreamStats,
  PolicyLegalItem,
  PolicyLegalSnapshot,
  PredictionItem,
  TechCyberItem,
  TechCyberSnapshot,
  TechSubCategory,
  VietnamEnvSnapshot,
} from '@shared/types';
import type { FlashDirection } from '../hooks/useMonitorData';

type RightTabId = 'intel' | 'techCyber' | 'news' | 'policy' | 'markets';
type NewsFilterId = 'all' | 'bbc' | NewsCategory;

interface RightIntelPanelProps {
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  googleTrends?: GoogleTrendsSnapshot;
  news: NewsItem[];
  techCyber?: TechCyberSnapshot;
  policyLegal?: PolicyLegalSnapshot;
  vietnamEnv?: VietnamEnvSnapshot;
  hptIntel?: HptCompanyIntelSnapshot;
  aiSitrep?: AiSitrepSnapshot;
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes?: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  cyberThreats: GeoPointFeature[];
  newsStreamStats?: NewsStreamStats;
  freshNewsIds?: ReadonlySet<string>;
  priceFlashes: Record<string, FlashDirection>;
  predictionFlashes?: Record<string, FlashDirection>;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  streamConnected: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
}

function formatCompactUsd(val: number | null): string {
  if (val === null || !Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1_000_000_000_000) return `$${(val / 1_000_000_000_000).toFixed(2)}T`;
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(0)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatRelativeTime(ts: number): string {
  if (!ts || ts <= 0) return 'Cố định';
  const diffSec = Math.max(1, Math.round((Date.now() - ts) / 1_000));
  if (diffSec < 60) return `${diffSec}s trước`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}p trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h trước`;
  return `${Math.round(diffHr / 24)}d trước`;
}

function sourceBadgeStyle(item: NewsItem): string {
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

function techBadgeStyle(item: TechCyberItem): string {
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

const POSTURE_BADGE: Record<PostureLevel, string> = {
  CRITICAL: 'border-rose-500/55 bg-rose-500/20 text-rose-200',
  ELEVATED: 'border-amber-500/50 bg-amber-500/18 text-amber-200',
  NORMAL: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

const CII_BAND_STYLE: Record<CiiBand, { badge: string; bar: string }> = {
  CRITICAL: { badge: 'text-rose-300 bg-rose-500/20 border-rose-500/45', bar: '#f43f5e' },
  HIGH: { badge: 'text-orange-300 bg-orange-500/20 border-orange-500/45', bar: '#f97316' },
  ELEVATED: { badge: 'text-amber-300 bg-amber-500/20 border-amber-500/45', bar: '#f59e0b' },
  MODERATE: { badge: 'text-sky-300 bg-sky-500/15 border-sky-500/35', bar: '#38bdf8' },
  LOW: { badge: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40', bar: '#10b981' },
};

const INTEL_TOPIC_TABS: ReadonlyArray<{ id: IntelTopicId | 'c2_ioc'; label: string }> = [
  { id: 'cyber', label: '🔓 Cyber Threats' },
  { id: 'c2_ioc', label: '🌐 Live C2 IOCs' },
  { id: 'military', label: '⚔️ Quân sự' },
  { id: 'maritime', label: '🚢 Hàng hải' },
  { id: 'nuclear', label: '☢️ Hạt nhân' },
  { id: 'sanctions', label: '🚫 Trừng phạt' },
  { id: 'intelligence', label: '🕵️ Tình báo' },
];

function legalBadgeStyle(item: PolicyLegalItem): string {
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

const AQI_BADGE_STYLE: Record<AqiBand, { label: string; cls: string }> = {
  good: { label: 'Tốt', cls: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300' },
  moderate: { label: 'TB', cls: 'border-yellow-500/45 bg-yellow-500/15 text-yellow-200' },
  sensitive: { label: 'Kém', cls: 'border-orange-500/50 bg-orange-500/20 text-orange-200' },
  unhealthy: { label: 'Xấu', cls: 'border-rose-500/50 bg-rose-500/20 text-rose-200' },
  hazardous: { label: 'Nguy hại', cls: 'border-fuchsia-500/60 bg-fuchsia-500/25 text-fuchsia-100' },
};

const VN_ENV_DISPLAY_ORDER: Record<string, number> = {
  'vn-hcmc': 0,
  'vn-hanoi': 1,
  'vn-danang': 2,
  'vn-hoang-sa': 3,
  'vn-truong-sa': 4,
};

function MiniSparkline({ values, positive }: { values?: number[]; positive: boolean }) {
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

function renderInlineMarkdown(raw: string): ReactNode[] {
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
          className="rounded border border-slate-700/80 bg-slate-800/90 px-1 py-0.2 font-mono text-[10px] text-cyan-200"
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

function FormattedAiMarkdown({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-slate-200">
      {lines.map((line, idx) => {
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch) {
          return (
            <div
              key={idx}
              className="pt-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300"
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
                <span className="mt-0.5 shrink-0 rounded border border-emerald-500/35 bg-emerald-500/12 px-1 py-0.1 font-mono text-[8.5px] font-bold text-emerald-300">
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

export const RightIntelPanel = memo(function RightIntelPanel({
  markets,
  predictions,
  googleTrends,
  news,
  techCyber,
  policyLegal,
  vietnamEnv,
  hptIntel,
  aiSitrep,
  military,
  vessels,
  earthquakes = [],
  geopolitics,
  cyberThreats,
  newsStreamStats,
  freshNewsIds,
  priceFlashes,
  predictionFlashes = {},
  refreshingIds,
  onForceRefresh,
  streamConnected,
  onFlyToLocation,
}: RightIntelPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTabId>('intel');
  const [intelTopic, setIntelTopic] = useState<IntelTopicId | 'c2_ioc'>('cyber');
  const [trendGeo, setTrendGeo] = useState<GoogleTrendGeo>('VN');
  const [newsFilter, setNewsFilter] = useState<NewsFilterId>('all');
  const [newsQuery, setNewsQuery] = useState('');
  const [techFilter, setTechFilter] = useState<'all' | TechSubCategory>('all');
  const [ghTrendingPeriod, setGhTrendingPeriod] = useState<'daily' | 'weekly'>('daily');
  const [mitreFilter, setMitreFilter] = useState<string | null>(null);
  const [techQuery, setTechQuery] = useState('');
  const [legalFilter, setLegalFilter] = useState<'all' | 'most' | 'ai_only' | LegalDocType>('all');
  const [legalPillar, setLegalPillar] = useState<'57' | '59' | '66' | '68' | null>(null);
  const [legalQuery, setLegalQuery] = useState('');
  const [onDemandPolicyAi, setOnDemandPolicyAi] = useState<Record<string, string[]>>({});
  const [policyAiLoadingIds, setPolicyAiLoadingIds] = useState<Set<string>>(new Set());
  const [hptFilter, setHptFilter] = useState<'all' | 'filings' | HptItemCategory>('all');
  const [macroRegion, setMacroRegion] = useState<'VN' | 'US'>('VN');
  const [translateVi, setTranslateVi] = useState<boolean>(true);
  const [visibleLimit, setVisibleLimit] = useState<number>(40);

  useEffect(() => {
    setVisibleLimit(40);
  }, [activeTab, newsFilter, newsQuery, techFilter, mitreFilter, techQuery, legalFilter, legalPillar, legalQuery]);

  // Live IOC / IP / CVE Recon Scanner (Shodan InternetDB + NIST NVD 2.0)
  const [iocQuery, setIocQuery] = useState('');
  const [iocLoading, setIocLoading] = useState(false);
  const [iocError, setIocError] = useState<string | null>(null);
  const [iocResult, setIocResult] = useState<IocLookupResult | null>(null);

  // Groq LPU AI Sitrep & Interactive "Ask Monitor" Copilot state
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

  const requestPolicyAiSummary = useCallback(async (doc: PolicyLegalItem) => {
    setPolicyAiLoadingIds((prev) => new Set(prev).add(doc.id));
    try {
      const resp = await fetch('/api/policy-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: doc.id,
          title: doc.title,
          docCode: doc.docCode,
          sector: doc.sector,
          source: doc.source,
        }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as { highlights?: string[] };
        if (j.highlights && j.highlights.length >= 2) {
          setOnDemandPolicyAi((prev) => ({ ...prev, [doc.id]: j.highlights! }));
        }
      }
    } catch {
      // Ignore transient AI error
    } finally {
      setPolicyAiLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
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

  // Custom Keyword Watchlist Alerts (persisted in localStorage)
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

  const runIocScan = useCallback(async (overrideQuery?: string) => {
    const target = (overrideQuery ?? iocQuery).trim();
    if (!target) return;
    if (overrideQuery) setIocQuery(overrideQuery);
    setIocLoading(true);
    setIocError(null);
    try {
      const resp = await fetch(`/api/ioc-lookup?q=${encodeURIComponent(target)}`);
      const body = (await resp.json()) as IocLookupResult & { error?: string };
      if (!resp.ok || body.error) {
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      setIocResult(body);
    } catch (err) {
      setIocResult(null);
      setIocError(err instanceof Error ? err.message : 'Không thể quét IOC/CVE');
    } finally {
      setIocLoading(false);
    }
  }, [iocQuery]);

  const fxQuotes = useMemo(() => markets.quotes.filter((q) => q.group === 'fx'), [markets.quotes]);
  const indexAndCommodityQuotes = useMemo(
    () => markets.quotes.filter((q) => q.group !== 'fx'),
    [markets.quotes],
  );
  const macroHealth = useMemo(() => evaluateMacroHealth(markets), [markets]);
  const investmentCompass = useMemo(() => evaluateInvestmentCompass(markets), [markets]);
  const activeMacroReport =
    macroRegion === 'VN'
      ? macroHealth.vn ?? macroHealth.us
      : macroHealth.us ?? macroHealth.vn;

  const techItems = techCyber?.items ?? [];

  // Live Intelligence Analytics (WorldMonitor CII + Strategic Posture + 6 Intel Topics + Spikes)
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

  const bbcCount = useMemo(
    () => news.filter((n) => n.source.startsWith('BBC ')).length,
    [news],
  );

  const financeNewsCount = useMemo(
    () => news.filter((n) => n.category === 'finance').length,
    [news],
  );

  const filteredHptItems = useMemo(() => {
    const list = hptIntel?.items ?? [];
    if (hptFilter === 'all') return list;
    if (hptFilter === 'filings') {
      return list.filter((i) => i.category === 'exchange_filing');
    }
    return list.filter((i) => i.category === hptFilter);
  }, [hptIntel?.items, hptFilter]);

  const hptSentimentStats = useMemo(() => {
    const list = hptIntel?.items ?? [];
    let pos = 0;
    let neg = 0;
    let neu = 0;
    for (const it of list) {
      if (it.sentiment === 'positive') pos += 1;
      else if (it.sentiment === 'negative') neg += 1;
      else neu += 1;
    }
    return { pos, neg, neu, total: list.length };
  }, [hptIntel?.items]);

  const top5HotPolymarket = useMemo(
    () => selectTopHotPolymarket(predictions, 5),
    [predictions],
  );

  const activeGoogleTrends = useMemo(
    () => (trendGeo === 'VN' ? googleTrends?.vn ?? [] : googleTrends?.global ?? []),
    [googleTrends, trendGeo],
  );

  const topMacroGeopoliticsPredictions = useMemo(() => {
    const macroGeo = predictions.filter((p) => p.category === 'finance' || p.category === 'geopolitics');
    return (macroGeo.length >= 5 ? macroGeo : predictions).slice(0, 5);
  }, [predictions]);

  const filteredNews = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return news.filter((item) => {
      if (newsFilter === 'bbc') {
        if (!item.source.startsWith('BBC ')) return false;
      } else if (newsFilter !== 'all' && item.category !== newsFilter) {
        return false;
      }
      if (
        q &&
        !`${item.title} ${item.titleVi ?? ''} ${item.source} ${item.matchedLocation ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [news, newsFilter, newsQuery]);

  const techCounts = useMemo(() => {
    let ai = 0;
    let github_release = 0;
    let cyber = 0;
    let tech_infra = 0;
    let vn_tech = 0;
    for (const item of techItems) {
      if (item.subCategory === 'ai') ai += 1;
      else if (item.subCategory === 'github_release') github_release += 1;
      else if (item.subCategory === 'cyber') cyber += 1;
      else if (item.subCategory === 'vn_tech') vn_tech += 1;
      else tech_infra += 1;
    }
    return { ai, github_release, cyber, tech_infra, vn_tech };
  }, [techItems]);

  const ghTrendingDaily = techCyber?.githubTrending?.daily ?? [];
  const ghTrendingWeekly = techCyber?.githubTrending?.weekly ?? [];
  const activeGhTrending = ghTrendingPeriod === 'daily' ? ghTrendingDaily : ghTrendingWeekly;

  const filteredGhTrending = useMemo(() => {
    const q = techQuery.trim().toLowerCase();
    if (!q) return activeGhTrending;
    return activeGhTrending.filter((repo) =>
      `${repo.fullName} ${repo.description} ${repo.descriptionVi ?? ''} ${repo.language ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [activeGhTrending, techQuery]);

  const filteredTech = useMemo(() => {
    const q = techQuery.trim().toLowerCase();
    return techItems.filter((item) => {
      if (techFilter !== 'all' && item.subCategory !== techFilter) return false;
      if (mitreFilter && !(item.mitreTtps ?? []).some((t) => t.id === mitreFilter)) return false;
      if (
        q &&
        !`${item.title} ${item.titleVi ?? ''} ${item.source} ${item.cveId ?? ''} ${item.matchedLocation ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [techItems, techFilter, mitreFilter, techQuery]);

  const stablecoins = useMemo(
    () => markets.crypto.filter((c) => c.symbol === 'USDT' || c.symbol === 'USDC'),
    [markets.crypto],
  );

  const volatileCrypto = useMemo(
    () => markets.crypto.filter((c) => c.symbol !== 'USDT' && c.symbol !== 'USDC'),
    [markets.crypto],
  );

  const policyItems = policyLegal?.items ?? [];

  const mostPolicyCount = useMemo(
    () => policyItems.filter((d) => d.isMost).length,
    [policyItems],
  );

  const pillarCounts = useMemo(() => {
    const counts = { '57': 0, '59': 0, '66': 0, '68': 0 };
    for (const d of policyItems) {
      if (d.pillarResolution) counts[d.pillarResolution] += 1;
    }
    return counts;
  }, [policyItems]);

  const aiSummarizedPolicyCount = useMemo(
    () => policyItems.filter((d) => d.aiSummarized || Boolean(onDemandPolicyAi[d.id])).length,
    [policyItems, onDemandPolicyAi],
  );

  const filteredPolicy = useMemo(() => {
    const q = legalQuery.trim().toLowerCase();
    return policyItems.filter((doc) => {
      if (legalPillar && doc.pillarResolution !== legalPillar) return false;
      if (legalFilter === 'most') {
        if (!doc.isMost) return false;
      } else if (legalFilter === 'ai_only') {
        if (!doc.aiSummarized && !onDemandPolicyAi[doc.id]) return false;
      } else if (legalFilter !== 'all' && doc.docType !== legalFilter) {
        return false;
      }
      if (
        q &&
        !`${doc.title} ${doc.docCode ?? ''} ${doc.typeBadge} ${doc.sector} ${doc.source}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [policyItems, legalFilter, legalPillar, legalQuery, onDemandPolicyAi]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-800/95 bg-[#090e18] lg:w-[454px] xl:w-[494px] 2xl:w-[548px]">
      {/* Command Header: Live Intel · AI & ML · Tin nóng · Chính sách · Thị trường */}
      <div className="grid shrink-0 grid-cols-5 border-b border-slate-800/95 bg-[#070b12]">
        <button
          type="button"
          onClick={() => setActiveTab('intel')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${activeTab === 'intel'
            ? 'border-fuchsia-400 bg-fuchsia-500/12 text-fuchsia-200'
            : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          <Target size={13} />
          <span>Live Intel</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('techCyber')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${activeTab === 'techCyber'
            ? 'border-violet-400 bg-violet-500/12 text-violet-200'
            : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          <Cpu size={13} />
          <span>AI &amp; ML</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${activeTab === 'news'
            ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
            : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          <Newspaper size={13} />
          <span>Tin nóng</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${activeTab === 'policy'
            ? 'border-amber-400 bg-amber-500/12 text-amber-200'
            : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          <Scales size={13} />
          <span>Chính sách</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('markets')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${activeTab === 'markets'
            ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
            : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          <ChartLineUp size={13} />
          <span>Thị trường</span>
        </button>
      </div>

      {/* Tab 1: WorldMonitor Live Intelligence (Theater Posture + Cyber Threats IOC + 6 Intel Topics + CII) */}
      {activeTab === 'intel' && (
        <div className="flex-1 space-y-3.5 overflow-y-auto p-2.5">
          {/* Top Bar: Global Threat DEFCON + Live Telemetry Summary + Translate Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-fuchsia-500/30 bg-[#0d1524] px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
              <span
                title={globalThreat.summary}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${globalThreat.defcon <= 2
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
              onClick={() => setTranslateVi((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${translateVi
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

            {/* Ask Monitor Copilot Q&A grounded in live RAM */}
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

          {/* 1b. Vietnam Marine Weather (Hoàng Sa · Trường Sa) & Mainland AQI (Open-Meteo Live) */}
          {vietnamEnv && vietnamEnv.locations.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-slate-200">
                  <CloudSun size={13} className="text-sky-400" weight="fill" />
                  <span>KHÍ TƯỢNG BIỂN ĐÔNG &amp; CHẤT LƯỢNG KHÔNG KHÍ VN</span>
                </h2>
                {onForceRefresh && (
                  <button
                    type="button"
                    onClick={() => onForceRefresh('vietnam-env')}
                    title="Làm mới Khí tượng Hoàng Sa - Trường Sa & AQI"
                    className="inline-flex items-center rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-sky-400/50 hover:text-sky-200"
                  >
                    <ArrowsClockwise
                      size={10}
                      className={refreshingIds?.has('vietnam-env') ? 'animate-spin text-sky-300' : ''}
                    />
                  </button>
                )}
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
                      className={`rounded border p-2 text-left transition hover:border-sky-400/55 ${loc.stormWarning
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
                            </span>
                            <span>Giật {loc.windGustKmh}km/h</span>
                          </div>
                          <div
                            className={`text-[9px] font-semibold ${loc.stormWarning ? 'text-rose-300' : 'text-slate-400'
                              }`}
                          >
                            {loc.stormWarning ? '⚠️ BIỂN ĐỘNG MẠNH' : loc.weatherLabel}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center justify-between gap-1 font-mono text-[9.5px]">
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
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. Polymarket Top 5 Hottest Realtime (CLOB Live WS + 24h Volume) */}
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
                      className={`block px-2.5 py-2 transition hover:bg-[#121e33] ${flash === 'up'
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
                              className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 font-mono text-[9px] font-bold ${idx === 0
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
                            className={`text-sm font-bold transition-colors ${flash === 'up'
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
                              className={`text-[9px] font-semibold ${item.change24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
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

          {/* 3. Google Trends Realtime — What People Are Searching Most on Google */}
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
                  className={`rounded px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${trendGeo === 'VN'
                    ? 'border border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  🇻🇳 Việt Nam ({googleTrends?.vn.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTrendGeo('GLOBAL')}
                  className={`rounded px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${trendGeo === 'GLOBAL'
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
                            className={`inline-flex h-4 min-w-[20px] shrink-0 items-center justify-center rounded px-1 font-mono text-[9.5px] font-bold ${idx === 0
                              ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                              : idx < 3
                                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
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

          {/* 4. Custom Watchlist Keyword Alerts (pulse-world-monitor + CTI Radar pattern) */}
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
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition ${active
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

          {/* 5. Live IOC / IP / CVE Recon Scanner (Shodan InternetDB + NIST NVD 2.0) */}
          <section className="rounded border border-fuchsia-500/30 bg-[#0d1524] p-2">
            <div className="flex items-center justify-between gap-1.5">
              <h2 className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wider text-fuchsia-200">
                <ShieldWarning size={12} className="text-fuchsia-400" weight="fill" />
                <span>QUÉT IOC / IP / CVE TRỰC TIẾP (SHODAN + NVD)</span>
              </h2>
              <div className="flex items-center gap-1 font-mono text-[8.5px]">
                <button
                  type="button"
                  onClick={() => {
                    const sampleIp =
                      String(
                        cyberThreats.find((c) => c.category === 'c2_ioc')?.meta.ipAddress ??
                        '45.148.10.240',
                      );
                    void runIocScan(sampleIp);
                  }}
                  className="rounded border border-fuchsia-500/35 bg-fuchsia-500/12 px-1.5 py-0.2 text-fuchsia-200 hover:bg-fuchsia-500/25"
                >
                  Thử IP C2
                </button>
                <button
                  type="button"
                  onClick={() => void runIocScan('CVE-2024-38477')}
                  className="rounded border border-rose-500/35 bg-rose-500/12 px-1.5 py-0.2 text-rose-200 hover:bg-rose-500/25"
                >
                  Thử CVE
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runIocScan();
              }}
              className="mt-1.5 flex items-center gap-1.5"
            >
              <input
                type="text"
                value={iocQuery}
                onChange={(e) => setIocQuery(e.target.value)}
                placeholder="Nhập IP (45.148.10.240) hoặc CVE-2024-38477..."
                className="min-w-0 flex-1 rounded border border-slate-700/95 bg-[#070b12] px-2 py-1 font-mono text-[10.5px] text-slate-100 placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={iocLoading}
                className="shrink-0 rounded border border-fuchsia-500/50 bg-fuchsia-500/20 px-2.5 py-1 font-mono text-[10px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/30 disabled:opacity-50"
              >
                {iocLoading ? 'Đang quét...' : 'Quét Live'}
              </button>
            </form>

            {iocError && (
              <div className="mt-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[10.5px] text-rose-200">
                {iocError}
              </div>
            )}

            {iocResult && (
              <div className="mt-2 space-y-1.5 rounded border border-slate-800 bg-[#080d17] p-2 font-mono text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-100">{iocResult.query}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${iocResult.riskLevel === 'critical'
                        ? 'bg-rose-500/25 text-rose-200 border border-rose-500/50'
                        : iocResult.riskLevel === 'high'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/45'
                          : 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35'
                        }`}
                    >
                      {iocResult.kind === 'cve' && iocResult.cvssScore !== undefined
                        ? `CVSS ${iocResult.cvssScore} · ${iocResult.cvssSeverity}`
                        : `RISK: ${iocResult.riskLevel}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIocResult(null)}
                      className="text-slate-500 hover:text-slate-200"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {iocResult.kind === 'ip' ? (
                  <>
                    {(iocResult.country || iocResult.org) && (
                      <div className="font-sans text-[10.5px] text-slate-300">
                        {[iocResult.city, iocResult.country, iocResult.org].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="text-slate-300">
                      <span className="text-slate-500">Cổng mở (Ports): </span>
                      {iocResult.ports && iocResult.ports.length > 0
                        ? iocResult.ports.join(', ')
                        : 'Không phát hiện cổng công khai'}
                    </div>
                    {iocResult.vulns && iocResult.vulns.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-rose-300">Lỗ hổng ({iocResult.vulns.length}):</span>
                        {iocResult.vulns.slice(0, 6).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => void runIocScan(v)}
                            className="rounded border border-rose-500/40 bg-rose-500/15 px-1 py-0.2 text-[9px] text-rose-200 hover:bg-rose-500/30"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                    {iocResult.cpes && iocResult.cpes.length > 0 && (
                      <div className="truncate text-[9.5px] text-slate-400">
                        CPE: {iocResult.cpes.slice(0, 3).join(' · ')}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-sans text-[11px] leading-snug text-slate-200">
                      {translateVi
                        ? iocResult.descriptionVi || iocResult.description
                        : iocResult.description}
                    </div>
                    {iocResult.vectorString && (
                      <div className="truncate text-[9px] text-slate-400">{iocResult.vectorString}</div>
                    )}
                  </>
                )}

                <div className="flex justify-end">
                  <a
                    href={iocResult.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[9.5px] text-fuchsia-300 hover:underline"
                  >
                    Mở hồ sơ gốc <ArrowSquareOut size={10} />
                  </a>
                </div>
              </div>
            )}
          </section>

          {/* 6. Surging Keywords & CVE Spike Detector */}
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
                      if (sp.kind === 'cve' || sp.kind === 'tech_ai') {
                        setActiveTab('techCyber');
                        setTechFilter('all');
                        setTechQuery(sp.term.split(' / ')[0]);
                      } else {
                        setActiveTab('news');
                        setNewsFilter('all');
                        setNewsQuery(sp.term.split(' / ')[0]);
                      }
                    }}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition hover:brightness-125 ${sp.kind === 'cve'
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

          {/* 3. Live Intelligence Feeds (Cyber Threats, Live C2 IOCs, Military, Maritime, Nuclear, Sanctions, Espionage) */}
          <section>
            <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
              LIVE INTELLIGENCE STREAMS &amp; CYBER IOCs
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {INTEL_TOPIC_TABS.map((tab) => {
                const count =
                  tab.id === 'c2_ioc'
                    ? cyberThreats.length
                    : intelTopicBuckets[tab.id].length;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setIntelTopic(tab.id)}
                    className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${intelTopic === tab.id
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
                        className={`rounded border px-1.5 py-0.2 font-semibold ${ioc.category === 'apt_group'
                          ? 'border-rose-500/45 bg-rose-500/20 text-rose-200'
                          : 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300'
                          }`}
                      >
                        {ioc.category === 'apt_group' ? 'APT ACTOR' : ioc.source}
                      </span>
                      <span className="text-slate-400">{String(ioc.meta.country ?? '')}</span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-100">{ioc.title}</div>
                    {ioc.subtitle && <div className="mt-0.5 text-[10.5px] text-slate-400">{ioc.subtitle}</div>}
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
                            onClick={() => void runIocScan(String(ioc.meta.ipAddress))}
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
                        <span className="shrink-0 text-slate-500">{formatRelativeTime(item.publishedAt)}</span>
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

          {/* 4. Country Instability & Strategic Risk Index (CII) */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
                COUNTRY INSTABILITY INDEX (CII REALTIME)
              </h2>
              <span className="font-mono text-[9.5px] text-slate-500">0 = Ổn định · 100 = Xung đột</span>
            </div>
            <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
              {ciiScores.map((row) => {
                const style = CII_BAND_STYLE[row.band];
                return (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() => onFlyToLocation(row.lat, row.lon, 5.2)}
                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition hover:bg-slate-900/75 ${row.isVietnam ? 'bg-emerald-500/8' : ''
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
                      <span className={`inline-block rounded border px-1 py-0.2 text-[8.5px] font-semibold ${style.badge}`}>
                        {row.isVietnam && row.band === 'LOW' ? 'STABLE · LOW' : row.band}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Dedicated AI & Machine Learning + Cybersecurity + Semiconductor/Cloud + VN Tech */}
      {activeTab === 'techCyber' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-slate-800/90 bg-[#0d1524] px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
                {(techCyber?.infraStatus ?? []).map((st) => {
                  const dotClass =
                    st.level === 'operational'
                      ? 'bg-emerald-400'
                      : st.level === 'degraded'
                        ? 'animate-pulse bg-amber-400'
                        : 'animate-pulse bg-rose-500';
                  const pillClass =
                    st.level === 'operational'
                      ? 'bg-slate-800/90 text-slate-300 hover:text-white'
                      : st.level === 'degraded'
                        ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'border border-rose-500/45 bg-rose-500/20 text-rose-200';
                  return (
                    <a
                      key={st.name}
                      href={st.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`${st.name}: ${st.description}`}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition ${pillClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                      <span>{st.name}</span>
                    </a>
                  );
                })}
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">
                  {techCyber?.activeSourceCount ?? 0} nguồn
                </span>
              </div>

              <button
                type="button"
                onClick={() => setTranslateVi((v) => !v)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${translateVi
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Translate size={12} weight="bold" />
                <span>{translateVi ? 'Dịch VI: BẬT' : 'Dịch VI: TẮT'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${techItems.length})` },
                  { id: 'ai', label: `🤖 AI & ML (${techCounts.ai})` },
                  {
                    id: 'github_release',
                    label: `🔥 GitHub (${(ghTrendingDaily.length || ghTrendingWeekly.length) + techCounts.github_release})`,
                  },
                  { id: 'cyber', label: `🛡️ Cyber · NVD (${techCounts.cyber})` },
                  { id: 'tech_infra', label: `💻 Chip · Cloud (${techCounts.tech_infra})` },
                  { id: 'vn_tech', label: `🇻🇳 Công nghệ VN (${techCounts.vn_tech})` },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setTechFilter(cat.id);
                    if (cat.id === 'all') setMitreFilter(null);
                  }}
                  className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${techFilter === cat.id
                    ? 'border border-violet-500/45 bg-violet-500/20 text-violet-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {mitreFilter && (
              <div className="flex items-center justify-between rounded border border-rose-500/45 bg-rose-500/15 px-2.5 py-1 font-mono text-[10px] text-rose-200">
                <span>Đang lọc theo kỹ thuật MITRE ATT&amp;CK: <strong>{mitreFilter}</strong></span>
                <button
                  type="button"
                  onClick={() => setMitreFilter(null)}
                  className="rounded border border-rose-400/40 px-1.5 py-0.2 hover:bg-rose-500/25"
                >
                  Xóa lọc ×
                </button>
              </div>
            )}

            <div className="relative">
              <MagnifyingGlass
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={techQuery}
                onChange={(e) => setTechQuery(e.target.value)}
                placeholder="Tìm GitHub Trending, OpenAI, DeepMind, lỗ hổng CVE, chip NVIDIA..."
                aria-label="Tìm tin AI Machine Learning An ninh mạng"
                className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
            {/* Compact Top 3 GitHub Trending spotlight when viewing "Tất cả" */}
            {techFilter === 'all' && !mitreFilter && !techQuery.trim() && ghTrendingDaily.length > 0 && (
              <div className="bg-[#0b1322]/90 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px]">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                    <Fire size={12} weight="fill" className="text-orange-400" />
                    GITHUB TRENDING HÔM NAY
                  </span>
                  <button
                    type="button"
                    onClick={() => setTechFilter('github_release')}
                    className="rounded border border-emerald-500/40 bg-emerald-500/12 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                  >
                    Xem tất cả {ghTrendingDaily.length} repo →
                  </button>
                </div>
                <div className="space-y-1.5">
                  {ghTrendingDaily.slice(0, 3).map((repo) => (
                    <a
                      key={repo.id}
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 rounded border border-slate-800/90 bg-[#090f1b] px-2 py-1.5 transition hover:border-emerald-500/45"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                          <span className="shrink-0 rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-300">
                            #{repo.rank}
                          </span>
                          <span className="truncate font-semibold text-cyan-200">{repo.fullName}</span>
                          {repo.language && (
                            <span className="inline-flex shrink-0 items-center gap-1 text-[9.5px] text-slate-400">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: repo.languageColor || '#38bdf8' }}
                              />
                              {repo.language}
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-400">
                            {translateVi ? repo.descriptionVi || repo.description : repo.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-emerald-300 tabular-nums">
                        +{repo.periodStars.toLocaleString('en-US')} ★
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Full GitHub Trending Board inside the GitHub sub-tab */}
            {techFilter === 'github_release' && (
              <div className="bg-[#080e19]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/85 bg-[#0d1524] px-3 py-2 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Fire size={13} weight="fill" className="text-orange-400" />
                    <span className="font-bold text-emerald-300">GITHUB TRENDING</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[9.5px] text-slate-300">
                      {filteredGhTrending.length} repo
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setGhTrendingPeriod('daily')}
                      className={`rounded border px-2 py-0.5 text-[9.5px] font-semibold transition ${
                        ghTrendingPeriod === 'daily'
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      onClick={() => setGhTrendingPeriod('weekly')}
                      className={`rounded border px-2 py-0.5 text-[9.5px] font-semibold transition ${
                        ghTrendingPeriod === 'weekly'
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Tuần này
                    </button>
                    {onForceRefresh && (
                      <button
                        type="button"
                        onClick={() => onForceRefresh('tech-cyber')}
                        title="Làm mới GitHub Trending & Releases"
                        className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
                      >
                        <ArrowsClockwise
                          size={10}
                          className={refreshingIds?.has('tech-cyber') ? 'animate-spin text-emerald-300' : ''}
                        />
                      </button>
                    )}
                    <a
                      href={`https://github.com/trending?since=${ghTrendingPeriod}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9.5px] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      github.com/trending <ArrowSquareOut size={10} />
                    </a>
                  </div>
                </div>

                {filteredGhTrending.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    {activeGhTrending.length === 0
                      ? 'Đang tải danh sách repo nổi bật từ github.com/trending...'
                      : 'Không có repo GitHub Trending nào khớp từ khóa.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70">
                    {filteredGhTrending.map((repo) => {
                      const descText = translateVi
                        ? repo.descriptionVi || repo.description
                        : repo.description;

                      return (
                        <article
                          key={repo.id}
                          className="px-3 py-2.5 transition hover:bg-slate-900/65"
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10.5px]">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.2 text-[9.5px] font-bold ${
                                  repo.rank <= 3
                                    ? 'border border-amber-500/45 bg-amber-500/20 text-amber-200'
                                    : 'border border-slate-700 bg-slate-800 text-slate-300'
                                }`}
                              >
                                #{repo.rank}
                              </span>
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate font-semibold text-cyan-200 hover:text-emerald-300 hover:underline"
                              >
                                <span className="font-normal text-slate-400">{repo.owner} / </span>
                                {repo.repoName}
                              </a>
                            </div>
                            {repo.periodStars > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300 tabular-nums">
                                <Fire size={10} weight="fill" className="text-orange-400" />
                                +{repo.periodStars.toLocaleString('en-US')} ★{' '}
                                {ghTrendingPeriod === 'daily' ? 'hôm nay' : 'tuần này'}
                              </span>
                            )}
                          </div>

                          {descText && (
                            <p
                              className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-200"
                              title={repo.description}
                            >
                              {descText}
                            </p>
                          )}

                          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                            <div className="flex flex-wrap items-center gap-2.5">
                              {repo.language && (
                                <span className="inline-flex items-center gap-1 text-slate-300">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: repo.languageColor || '#38bdf8' }}
                                  />
                                  {repo.language}
                                </span>
                              )}
                              <span className="tabular-nums text-amber-200/90">
                                ★ {repo.totalStars.toLocaleString('en-US')}
                              </span>
                              <span className="tabular-nums text-slate-400">
                                ⑂ {repo.forks.toLocaleString('en-US')}
                              </span>
                            </div>
                            <a
                              href={repo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-200"
                            >
                              Mở repo <ArrowSquareOut size={11} />
                            </a>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {filteredTech.length > 0 && (
                  <div className="border-t border-slate-800 bg-[#0d1524] px-3 py-1.5 font-mono text-[10px] font-bold text-violet-300">
                    🚀 PHIÊN BẢN PHÁT HÀNH MỚI · AI &amp; AGENT CLI ({filteredTech.length})
                  </div>
                )}
              </div>
            )}

            {filteredTech.length === 0 &&
            (techFilter !== 'github_release' || filteredGhTrending.length === 0) ? (
              <div className="py-10 text-center text-xs text-slate-400">
                {techItems.length === 0
                  ? 'Đang đồng bộ 55+ nguồn AI & Machine Learning, Công nghệ & An ninh mạng...'
                  : 'Không có bản tin nào khớp điều kiện lọc.'}
              </div>
            ) : (
              <>
                {filteredTech.slice(0, visibleLimit).map((item) => {
                  const isTranslated =
                    Boolean(item.titleVi) && item.titleVi !== item.title && item.subCategory !== 'vn_tech';
                  const headline = translateVi ? item.titleVi || item.title : item.title;

                  return (
                    <article key={item.id} className="px-3 py-2.5 transition hover:bg-slate-900/65">
                      <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className={`truncate rounded px-1.5 py-0.2 font-semibold ${techBadgeStyle(item)}`}>
                            {item.source}
                          </span>
                          {item.cveId && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('intel');
                                void runIocScan(item.cveId!);
                              }}
                              title="Bấm để tra cứu điểm CVSS & chi tiết trên NIST NVD"
                              className="inline-flex shrink-0 items-center gap-0.5 rounded border border-rose-500/45 bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-bold text-rose-200 hover:bg-rose-500/35"
                            >
                              <ShieldWarning size={10} weight="fill" />
                              {item.cveId}
                              {item.cvssScore !== undefined ? ` · ${item.cvssScore}` : ''}
                            </button>
                          )}
                          {translateVi && isTranslated && (
                            <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] text-emerald-300">
                              VI
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-slate-500 tabular-nums">
                          {formatRelativeTime(item.publishedAt)}
                        </span>
                      </div>

                      {item.mitreTtps && item.mitreTtps.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 font-mono text-[8.5px]">
                          {item.mitreTtps.map((ttp) => (
                            <button
                              key={ttp.id}
                              type="button"
                              onClick={() =>
                                setMitreFilter((prev) => (prev === ttp.id ? null : ttp.id))
                              }
                              className={`rounded border px-1.5 py-0.2 font-semibold transition ${mitreFilter === ttp.id
                                ? 'border-rose-400 bg-rose-500/30 text-rose-100'
                                : 'border-rose-500/35 bg-rose-950/50 text-rose-300 hover:bg-rose-500/20'
                                }`}
                            >
                              MITRE {ttp.id} · {ttp.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs font-medium leading-relaxed text-slate-100 hover:text-violet-300"
                      >
                        {headline}
                      </a>

                      {translateVi && isTranslated && (
                        <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-500" title={item.title}>
                          Gốc: {item.title}
                        </p>
                      )}

                      <div className="mt-1.5 flex items-center justify-between">
                        {item.matchedLat !== undefined && item.matchedLon !== undefined ? (
                          <button
                            type="button"
                            onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                            className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                          >
                            <Crosshair size={11} />
                            Bay tới: {item.matchedLocation}
                          </button>
                        ) : (
                          <span />
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400 hover:text-slate-200"
                        >
                          Mở nguồn <ArrowSquareOut size={11} />
                        </a>
                      </div>
                    </article>
                  );
                })}
                {filteredTech.length > visibleLimit && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + 40)}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[10.5px] text-slate-300 transition hover:border-violet-400 hover:text-violet-200"
                    >
                      Xem thêm ({filteredTech.length - visibleLimit} tin còn lại)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Unified OSINT Firehose + BBC World Multi-Desk + 32 Geopolitics/Defense/VN RSS */}
      {activeTab === 'news' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-slate-800/90 bg-[#0d1524] px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${newsStreamStats?.wikimediaConnected
                    ? 'bg-purple-500/15 text-purple-300'
                    : 'bg-slate-800 text-slate-400'
                    }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${newsStreamStats?.wikimediaConnected ? 'animate-pulse bg-purple-400' : 'bg-slate-500'
                      }`}
                  />
                  Wiki {newsStreamStats?.wikimediaCount ?? 0}
                </span>

                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
                  GDELT {newsStreamStats?.gdeltCount ?? 0}
                </span>

                <span className="rounded bg-orange-600/20 px-1.5 py-0.5 text-orange-200">
                  Reddit {newsStreamStats?.redditCount ?? 0}
                </span>

                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-200">
                  Space {newsStreamStats?.snapiCount ?? 0}
                </span>

                <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-red-200">
                  BBC {bbcCount}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setTranslateVi((v) => !v)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${translateVi
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Translate size={12} weight="bold" />
                <span>{translateVi ? 'Dịch VI: BẬT' : 'Dịch VI: TẮT'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${news.length})` },
                  { id: 'bbc', label: `🔴 BBC World (${bbcCount})` },
                  { id: 'osint_live', label: '⚡ Live OSINT' },
                  { id: 'vietnam', label: 'Việt Nam' },
                  { id: 'world', label: 'Thế giới & Quốc phòng' },
                  { id: 'finance', label: `💹 Kinh tế & Tài chính (${financeNewsCount})` },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setNewsFilter(cat.id)}
                  className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${newsFilter === cat.id
                    ? cat.id === 'bbc'
                      ? 'border border-red-500/55 bg-red-600/25 text-red-100'
                      : 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <MagnifyingGlass
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={newsQuery}
                onChange={(e) => setNewsQuery(e.target.value)}
                placeholder="Tìm BBC World, tin Tiếng Việt, OSINT hoặc địa danh..."
                aria-label="Tìm tin tức"
                className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
            {filteredNews.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Không có bản tin nào khớp điều kiện lọc.
              </div>
            ) : (
              <>
                {filteredNews.slice(0, visibleLimit).map((item) => {
                  const isTranslated =
                    Boolean(item.titleVi) && item.titleVi !== item.title && item.category !== 'vietnam';
                  const headline = translateVi ? item.titleVi || item.title : item.title;
                  const isFresh = freshNewsIds?.has(item.id) ?? false;

                  return (
                    <article
                      key={item.id}
                      className={`px-3 py-2.5 transition-colors duration-500 hover:bg-slate-900/65 ${isFresh ? 'bg-cyan-500/12' : ''
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className={`truncate rounded px-1.5 py-0.2 font-semibold ${sourceBadgeStyle(item)}`}>
                            {item.source}
                          </span>
                          {item.isLiveStream && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-cyan-500/15 px-1 py-0.2 text-[9px] font-semibold text-cyan-300">
                              <Lightning size={9} weight="fill" />
                              LIVE
                            </span>
                          )}
                          {translateVi && isTranslated && (
                            <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] text-emerald-300">
                              VI
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-slate-500 tabular-nums">
                          {formatRelativeTime(item.publishedAt)}
                        </span>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs font-medium leading-relaxed text-slate-100 hover:text-cyan-300"
                      >
                        {headline}
                      </a>

                      {translateVi && isTranslated && (
                        <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-500" title={item.title}>
                          Gốc: {item.title}
                        </p>
                      )}

                      <div className="mt-1.5 flex items-center justify-between">
                        {item.matchedLat !== undefined && item.matchedLon !== undefined ? (
                          <button
                            type="button"
                            onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                            className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                          >
                            <Crosshair size={11} />
                            Bay tới: {item.matchedLocation}
                          </button>
                        ) : (
                          <span />
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400 hover:text-slate-200"
                        >
                          Mở nguồn <ArrowSquareOut size={11} />
                        </a>
                      </div>
                    </article>
                  );
                })}
                {filteredNews.length > visibleLimit && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + 40)}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[10.5px] text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                    >
                      Xem thêm ({filteredNews.length - visibleLimit} tin còn lại)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Vietnam Policy & Legal Radar (Bộ tứ NQ 57·59·66·68, Bộ KH&CN mst.gov.vn, Công báo, Văn bản Chính phủ PDF Dấu đỏ) */}
      {activeTab === 'policy' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-[#0d1524] px-2.5 py-1.5 font-mono text-[9.5px]">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  POLICY &amp; LEGAL RADAR
                </span>
                <span className="truncate text-slate-400">
                  {policyLegal?.activeSourceCount ?? 18} nguồn Chính phủ · Bộ KH&amp;CN · Bộ tứ NQ
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {(aiSummarizedPolicyCount > 0 || legalFilter === 'ai_only') && (
                  <button
                    type="button"
                    onClick={() =>
                      setLegalFilter((prev) => (prev === 'ai_only' ? 'all' : 'ai_only'))
                    }
                    title="Lọc các văn bản bạn đã bấm tóm tắt AI"
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold transition ${
                      legalFilter === 'ai_only'
                        ? 'border-emerald-400 bg-emerald-500/30 text-emerald-100'
                        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    <Sparkle size={10} weight="fill" />
                    <span>Đã tóm tắt ({aiSummarizedPolicyCount})</span>
                  </button>
                )}
                {onForceRefresh && (
                  <button
                    type="button"
                    onClick={() => onForceRefresh('policy-legal')}
                    title="Làm mới Chính sách & Văn bản Bộ KH&CN"
                    className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
                  >
                    <ArrowsClockwise
                      size={10}
                      className={refreshingIds?.has('policy-legal') ? 'animate-spin text-amber-300' : ''}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Legal Document Type & Bộ KH&CN Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${policyItems.length})` },
                  { id: 'most', label: `🔬 Bộ KH&CN (${mostPolicyCount})` },
                  { id: 'nq_tw_cp', label: '⭐ Nghị quyết (57·59·66·68)' },
                  { id: 'nghi_dinh', label: '📜 Nghị định (NĐ-CP)' },
                  { id: 'luat_qh', label: '⚖️ Luật / QH' },
                  { id: 'quyet_dinh_tt', label: '📋 QĐ / Thông tư' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setLegalFilter(cat.id);
                    if (cat.id === 'all') setLegalPillar(null);
                  }}
                  className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${legalFilter === cat.id
                    ? cat.id === 'most'
                      ? 'border border-violet-400/55 bg-violet-500/20 text-violet-200'
                      : 'border border-amber-500/50 bg-amber-500/20 text-amber-200'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Dedicated "Bộ tứ Nghị quyết Chiến lược: 57 · 59 · 66 · 68" + Quick Topic Chips */}
            <div className="flex flex-wrap items-center gap-1 font-mono text-[9.5px]">
              <span className="text-slate-500">Bộ tứ NQ:</span>
              {(
                [
                  { id: '57', label: `NQ 57 · KHCN (${pillarCounts['57']})` },
                  { id: '59', label: `NQ 59 · Hội nhập (${pillarCounts['59']})` },
                  { id: '66', label: `NQ 66 · Pháp luật (${pillarCounts['66']})` },
                  { id: '68', label: `NQ 68 · KT tư nhân (${pillarCounts['68']})` },
                ] as const
              ).map((pil) => (
                <button
                  key={pil.id}
                  type="button"
                  onClick={() => {
                    setLegalFilter('all');
                    setLegalPillar((prev) => (prev === pil.id ? null : pil.id));
                  }}
                  className={`rounded border px-1.5 py-0.5 font-semibold transition ${legalPillar === pil.id
                    ? 'border-amber-400/70 bg-red-600/25 text-amber-200'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-500/40 hover:text-amber-200'
                    }`}
                >
                  {pil.label}
                </button>
              ))}
              {['TT-BKHCN', 'NĐ-CP', 'Chuyển đổi số', 'Thuế', 'Đất đai'].map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    setLegalPillar(null);
                    setLegalQuery((prev) => (prev === kw ? '' : kw));
                  }}
                  className={`rounded border px-1.5 py-0.5 transition ${legalQuery === kw
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {kw}
                </button>
              ))}
            </div>

            <div className="relative">
              <MagnifyingGlass
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={legalQuery}
                onChange={(e) => setLegalQuery(e.target.value)}
                placeholder="Tìm NQ 57, NQ 59, NQ 66, NQ 68, TT-BKHCN, Bộ Khoa học & Công nghệ..."
                aria-label="Tìm văn bản pháp luật"
                className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
            {filteredPolicy.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                {policyItems.length === 0
                  ? 'Đang đồng bộ Công báo điện tử, Bộ KH&CN (mst.gov.vn) & Bộ tứ Nghị quyết 57·59·66·68...'
                  : 'Không có văn bản nào khớp điều kiện lọc.'}
              </div>
            ) : (
              <>
                {filteredPolicy.slice(0, visibleLimit).map((doc) => {
                  const aiBullets = onDemandPolicyAi[doc.id] ?? (doc.aiSummarized ? doc.highlights : null);
                  const isSummarizing = policyAiLoadingIds.has(doc.id);

                  return (
                  <article key={doc.id} className="px-3 py-2.5 transition hover:bg-slate-900/65">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1.5 py-0.2 font-bold ${legalBadgeStyle(doc)}`}>
                          {doc.typeBadge}
                        </span>
                        {doc.docCode && (
                          <span className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/12 px-1.5 py-0.2 font-semibold text-cyan-200">
                            {doc.docCode}
                          </span>
                        )}
                        {doc.isMost && (
                          <span className="shrink-0 rounded border border-violet-500/45 bg-violet-500/20 px-1.5 py-0.2 font-bold text-violet-200">
                            BỘ KH&amp;CN
                          </span>
                        )}
                        <span className="truncate text-[9.5px] text-slate-400">{doc.source}</span>
                      </div>
                      <span className="shrink-0 text-slate-500 tabular-nums">
                        {doc.issuedDate ?? formatRelativeTime(doc.publishedAt)}
                      </span>
                    </div>

                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 block text-xs font-semibold leading-relaxed text-slate-100 hover:text-amber-300"
                    >
                      {doc.title}
                    </a>

                    {aiBullets && aiBullets.length > 0 && (
                      <div className="mt-1.5 rounded border border-emerald-500/35 bg-[#091622] px-2.5 py-1.5 text-[10.5px] leading-snug text-slate-200">
                        <div className="mb-1 flex items-center gap-1 font-mono text-[9px] font-bold tracking-wider text-emerald-300">
                          <Sparkle size={10} weight="fill" />
                          <span>AI TÓM TẮT 3 Ý TRỌNG TÂM</span>
                        </div>
                        <ul className="space-y-0.5">
                          {aiBullets.map((bullet, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                              <span>{renderInlineMarkdown(bullet)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">
                        {doc.sector}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!aiBullets && (
                          <button
                            type="button"
                            disabled={isSummarizing}
                            onClick={() => void requestPolicyAiSummary(doc)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-500/45 bg-emerald-500/15 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            <Sparkle size={10} weight="fill" />
                            <span>{isSummarizing ? 'Đang tóm tắt...' : 'AI Tóm tắt 3 ý'}</span>
                          </button>
                        )}
                        {doc.pdfUrl && (
                          <a
                            href={doc.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-rose-500/45 bg-rose-600/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-200 transition hover:bg-rose-600/35"
                          >
                            <FilePdf size={12} weight="fill" />
                            PDF Dấu đỏ
                          </a>
                        )}
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400 hover:text-slate-200"
                        >
                          Toàn văn <ArrowSquareOut size={11} />
                        </a>
                      </div>
                    </div>
                  </article>
                  );
                })}
                {filteredPolicy.length > visibleLimit && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + 40)}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[10.5px] text-slate-300 transition hover:border-amber-400 hover:text-amber-200"
                    >
                      Xem thêm ({filteredPolicy.length - visibleLimit} văn bản còn lại)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Markets, Macro Health Radar, Domestic Gold SJC/9999, VN30 Bluechips, FX, Crypto 1s WS, World Bank Macro & Top 5 Polymarket */}
      {activeTab === 'markets' && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {/* Macroeconomic Health & Regime Diagnosis Radar (VN & US/Global — Actual vs Forecast + 3M/12M Slope) */}
          {activeMacroReport && (
            <section className="rounded-md border border-cyan-500/35 bg-[#0a1322] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-cyan-300">
                  <Gauge size={14} weight="fill" className="text-cyan-400" />
                  <span>CHẨN ĐOÁN SỨC KHỎE VĨ MÔ</span>
                </h2>
                <div className="flex items-center gap-1 font-mono text-[9.5px]">
                  {macroHealth.vn && (
                    <button
                      type="button"
                      onClick={() => setMacroRegion('VN')}
                      className={`rounded border px-2 py-0.5 font-semibold transition ${
                        activeMacroReport.id === 'VN'
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🇻🇳 Việt Nam ({macroHealth.vn.compositeScore})
                    </button>
                  )}
                  {macroHealth.us && (
                    <button
                      type="button"
                      onClick={() => setMacroRegion('US')}
                      className={`rounded border px-2 py-0.5 font-semibold transition ${
                        activeMacroReport.id === 'US'
                          ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🇺🇸 Mỹ · FRED ({macroHealth.us.compositeScore})
                    </button>
                  )}
                  {onForceRefresh && (
                    <button
                      type="button"
                      onClick={() => {
                        onForceRefresh('markets-crypto');
                        onForceRefresh('macro-worldbank');
                      }}
                      title="Làm mới dữ liệu FRED & World Bank"
                      className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      <ArrowsClockwise
                        size={10}
                        className={
                          refreshingIds?.has('markets-crypto') || refreshingIds?.has('macro-worldbank')
                            ? 'animate-spin text-cyan-300'
                            : ''
                        }
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Composite Score + Automatic Economic Regime Badge */}
              <div className="mt-2 rounded border border-slate-800/95 bg-[#070d18] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10px] text-slate-400">{activeMacroReport.subtitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                          activeMacroReport.regime === 'soft_landing'
                            ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                            : activeMacroReport.regime === 'overheating'
                              ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                              : activeMacroReport.regime === 'early_slowdown'
                                ? 'border-orange-500/50 bg-orange-500/20 text-orange-200'
                                : 'border-rose-500/55 bg-rose-500/20 text-rose-200'
                        }`}
                      >
                        {activeMacroReport.regimeLabel}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-lg font-extrabold leading-none text-slate-100">
                      {activeMacroReport.compositeScore}
                      <span className="text-[11px] font-normal text-slate-400">/100</span>
                    </div>
                    <div className="mt-0.5 text-[9px] text-slate-400">ĐIỂM SỨC KHỎE</div>
                  </div>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${activeMacroReport.compositeScore}%`,
                      backgroundColor:
                        activeMacroReport.compositeScore >= 70
                          ? '#10b981'
                          : activeMacroReport.compositeScore >= 52
                            ? '#f59e0b'
                            : '#f43f5e',
                    }}
                  />
                </div>

                <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
                  {activeMacroReport.regimeSummary}
                </p>

                {activeMacroReport.warningFlags.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {activeMacroReport.warningFlags.map((flag, idx) => (
                      <div
                        key={idx}
                        className={`rounded border px-2 py-1 text-[10.5px] leading-snug ${
                          flag.severity === 'critical'
                            ? 'border-rose-500/45 bg-rose-950/40 text-rose-200'
                            : flag.severity === 'warn'
                              ? 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                              : 'border-emerald-500/35 bg-emerald-950/25 text-emerald-200'
                        }`}
                      >
                        {flag.severity === 'critical' ? '🚨 ' : flag.severity === 'warn' ? '⚠️ ' : '✓ '}
                        {flag.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3 Core Macro Pillars: Actual vs Forecast/Target + 3M/12M Trend Slope */}
              <div className="mt-2 space-y-2">
                {activeMacroReport.pillars.map((pillar) => (
                  <div
                    key={pillar.id}
                    className="rounded border border-slate-800/90 bg-[#0d1524] px-2.5 py-2"
                  >
                    <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px]">
                      <span className="font-bold text-slate-200">{pillar.title}</span>
                      <span
                        className={`rounded px-1.5 py-0.2 font-bold tabular-nums ${
                          pillar.score >= 70
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : pillar.score >= 52
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {pillar.score}/100
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/75">
                      {pillar.metrics.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  m.status === 'good'
                                    ? 'bg-emerald-400'
                                    : m.status === 'watch'
                                      ? 'bg-amber-400'
                                      : 'bg-rose-400'
                                }`}
                              />
                              <span className="truncate text-[11px] font-medium text-slate-100">
                                {m.name}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
                              <span>
                                {m.benchmarkLabel}: {m.benchmarkValue.toLocaleString('en-US')}
                                {m.unit === '%' ? '%' : m.unit === '₫' ? '₫' : ` ${m.unit}`}
                              </span>
                              {m.trendLabel && (
                                <span className="rounded bg-slate-800/90 px-1 py-0.1 text-slate-300">
                                  {m.trendLabel}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right font-mono tabular-nums">
                            <div className="text-xs font-bold text-cyan-200">
                              {m.unit === '₫'
                                ? `${m.actual.toLocaleString('en-US')}₫`
                                : `${m.actual.toFixed(2)}${m.unit === '%' ? '%' : ` ${m.unit}`}`}
                            </div>
                            <div
                              className={`text-[9.5px] font-semibold ${
                                m.status === 'good'
                                  ? 'text-emerald-400'
                                  : m.status === 'watch'
                                    ? 'text-amber-300'
                                    : 'text-rose-400'
                              }`}
                            >
                              Δ {m.deltaVsBenchmark >= 0 ? '+' : ''}
                              {m.deltaVsBenchmark.toFixed(2)}
                              {m.unit.includes('%') || m.unit === '₫' ? '%' : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {/* Forward-Looking Investment Compass & Leading Indicators (3–9 Month Horizon) */}
          {investmentCompass && (
            <section className="rounded-md border border-emerald-500/35 bg-[#091420] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-emerald-300">
                  <Target size={14} weight="fill" className="text-emerald-400" />
                  <span>LA BÀN ĐẦU TƯ &amp; CHỈ BÁO DẪN DẮT (3–9 THÁNG)</span>
                </h2>
                <span className="shrink-0 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-200 tabular-nums">
                  Khẩu vị: {investmentCompass.riskAppetiteScore}/100
                </span>
              </div>

              <div className="mt-2 rounded border border-slate-800/95 bg-[#070d17] p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                      investmentCompass.stance === 'risk_on' ||
                      investmentCompass.stance === 'selective_growth'
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                        : investmentCompass.stance === 'cautious'
                          ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                          : 'border-rose-500/55 bg-rose-500/20 text-rose-200'
                    }`}
                  >
                    {investmentCompass.stanceLabel}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
                  {investmentCompass.summary}
                </p>

                <div className="mt-2 space-y-1.5 text-[10.5px] leading-snug">
                  <div className="rounded border border-emerald-500/35 bg-emerald-950/25 px-2 py-1.5">
                    <div className="font-mono text-[9.5px] font-bold text-emerald-300">
                      🟢 KÊNH ƯU TIÊN TÍCH SẢN / NẮM GIỮ
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-slate-200">
                      {investmentCompass.favoredAssets.map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>

                  {investmentCompass.watchAssets.length > 0 && (
                    <div className="rounded border border-amber-500/35 bg-amber-950/20 px-2 py-1.5">
                      <div className="font-mono text-[9.5px] font-bold text-amber-300">
                        🟡 QUAN SÁT · GIẢI NGÂN TỪNG PHẦN KHI CHỈNH
                      </div>
                      <ul className="mt-0.5 space-y-0.5 text-slate-200">
                        {investmentCompass.watchAssets.map((item, idx) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {investmentCompass.avoidAssets.length > 0 && (
                    <div className="rounded border border-rose-500/35 bg-rose-950/25 px-2 py-1.5">
                      <div className="font-mono text-[9.5px] font-bold text-rose-300">
                        🔴 CẨN TRỌNG · HẠN CHẾ MUA ĐUỔI / ĐÒN BẨY
                      </div>
                      <ul className="mt-0.5 space-y-0.5 text-slate-200">
                        {investmentCompass.avoidAssets.map((item, idx) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {investmentCompass.signals.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex flex-col justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2 py-1.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[10px] font-medium text-slate-300">
                          {sig.label}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] font-bold text-cyan-200 tabular-nums">
                          {sig.valueDisplay}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-[9.5px] text-slate-400" title={sig.subtext}>
                        {sig.subtext}
                      </div>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.1 font-mono text-[8.5px] font-bold ${
                          sig.tone === 'bullish'
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : sig.tone === 'bearish'
                              ? 'border-rose-500/45 bg-rose-500/18 text-rose-200'
                              : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                        }`}
                      >
                        {sig.signalBadge.trim()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Vietnam Domestic Gold (SJC & Nhẫn 9999) + World Parity Spread */}
          {markets.vnGold && markets.vnGold.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-amber-200">
                  <Coins size={13} className="text-amber-400" weight="fill" />
                  <span>GIÁ VÀNG TRONG NƯỚC (TRIỆU ₫ / LƯỢNG)</span>
                </h2>
                {onForceRefresh && (
                  <button
                    type="button"
                    onClick={() => onForceRefresh('markets-crypto')}
                    title="Làm mới Giá vàng SJC, VN30 & Thị trường"
                    className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
                  >
                    <ArrowsClockwise
                      size={10}
                      className={refreshingIds?.has('markets-crypto') ? 'animate-spin text-amber-300' : ''}
                    />
                  </button>
                )}
              </div>

              <div className="mt-1.5 divide-y divide-slate-800/85 rounded border border-amber-500/35 bg-[#0d1524]">
                {markets.vnGold.map((g) => (
                  <div key={g.code} className="px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.1 font-mono text-[10px] font-bold text-amber-200">
                            {g.code}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-100">{g.name}</span>
                        </div>
                        {g.worldParityPerLuongMillionVnd !== undefined &&
                          g.premiumVsWorldMillionVnd !== undefined && (
                            <div className="mt-0.5 font-mono text-[9.5px] text-slate-400 tabular-nums">
                              Quy đổi TG: {g.worldParityPerLuongMillionVnd.toFixed(2)} tr · Chênh{' '}
                              <span
                                className={
                                  g.premiumVsWorldMillionVnd >= 0 ? 'text-amber-300' : 'text-emerald-300'
                                }
                              >
                                {g.premiumVsWorldMillionVnd >= 0 ? '+' : ''}
                                {g.premiumVsWorldMillionVnd.toFixed(2)} tr/lượng
                              </span>
                            </div>
                          )}
                      </div>

                      <div className="shrink-0 text-right font-mono tabular-nums">
                        <div className="text-xs">
                          <span className="text-[10px] text-slate-400">Mua </span>
                          <strong className="text-emerald-300">
                            {g.buyPerLuongMillionVnd.toFixed(2)}
                          </strong>
                          <span className="mx-1 text-slate-600">|</span>
                          <span className="text-[10px] text-slate-400">Bán </span>
                          <strong className="text-amber-300">
                            {g.sellPerLuongMillionVnd.toFixed(2)}
                          </strong>
                        </div>
                        <div className="text-[9.5px] text-slate-500">
                          Biên độ {g.spreadMillionVnd.toFixed(2)} tr
                          {g.updatedLabel ? ` · ${g.updatedLabel.split(' ')[1] ?? g.updatedLabel}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top 10 VN30 Leading Stocks (HOSE Live + 10-Session Sparklines) */}
          {markets.vn30 && markets.vn30.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-[11px] font-semibold tracking-wider text-emerald-300">
                  RỔ CỔ PHIẾU DẪN DẮT VN30 (HOSE · NGHÌN ₫)
                </h2>
                <span className="font-mono text-[9.5px] text-slate-500">Sparkline 10 phiên</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {markets.vn30.map((st) => {
                  const up = st.changePercent >= 0;
                  return (
                    <div
                      key={st.symbol}
                      className="flex items-center justify-between gap-1.5 rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-100">{st.symbol}</span>
                          <span className="truncate text-[9.5px] text-slate-400">{st.sector}</span>
                        </div>
                        <MiniSparkline values={st.sparkline} positive={up} />
                      </div>
                      <div className="shrink-0 text-right font-mono tabular-nums">
                        <div className="text-xs font-semibold text-slate-100">
                          {st.priceThousandVnd.toFixed(2)}
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                        >
                          {up ? '+' : ''}
                          {st.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* FireAnt-Style Independent Corporate Intelligence Radar: HPT (UPCoM · MST 0301447436 — Excludes hpt.vn) */}
          {hptIntel && (hptIntel.stock || hptIntel.items.length > 0) && (
            <section className="rounded border border-cyan-500/35 bg-[#0a1322] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="rounded border border-cyan-400/55 bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-cyan-200">
                    HPT · UPCoM
                  </span>
                  <h2 className="truncate text-xs font-semibold tracking-wide text-slate-100">
                    Tin về HPT
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {hptIntel.stock && (
                    <button
                      type="button"
                      onClick={() => onFlyToLocation(hptIntel.stock!.hqLat, hptIntel.stock!.hqLon, 12.5)}
                      title="Bay tới Trụ sở HPT tại Khu Công nghệ cao TP.HCM (SHTP)"
                      className="inline-flex items-center gap-0.5 rounded border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300 hover:bg-cyan-500/20"
                    >
                      <Crosshair size={10} />
                      SHTP
                    </button>
                  )}
                  {onForceRefresh && (
                    <button
                      type="button"
                      onClick={() => onForceRefresh('hpt-intel')}
                      title="Quét mới Đấu thầu, CBTT HNX/UBCKNN, Simplize & Báo chí độc lập về HPT"
                      className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      <ArrowsClockwise
                        size={10}
                        className={refreshingIds?.has('hpt-intel') ? 'animate-spin text-cyan-300' : ''}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* HPT Live Stock Ticker Strip + Simplize Valuation Ratios + AI Sentiment Summary */}
              <div className="mt-2 space-y-1.5 rounded border border-slate-800/90 bg-[#0d1729] px-2.5 py-2 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {hptIntel.stock ? (
                    <div className="flex items-center gap-2.5">
                      <div>
                        <div className="flex items-baseline gap-1.5 tabular-nums">
                          <span className="text-sm font-bold text-slate-100">
                            {(hptIntel.stock.priceThousandVnd * 1000).toLocaleString('en-US')}₫
                          </span>
                          <span
                            className={`text-[10.5px] font-semibold ${hptIntel.stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                          >
                            {hptIntel.stock.changePercent >= 0 ? '+' : ''}
                            {hptIntel.stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 tabular-nums">
                          KL: {(hptIntel.stock.volume * 100).toLocaleString('en-US')} cp
                          {hptIntel.stock.fundamentals?.ceilingThousandVnd
                            ? ` · Trần ${hptIntel.stock.fundamentals.ceilingThousandVnd} / Sàn ${hptIntel.stock.fundamentals.floorThousandVnd}`
                            : ' · Sàn HNX/UPCoM'}
                        </div>
                      </div>
                      <MiniSparkline
                        values={hptIntel.stock.sparkline}
                        positive={hptIntel.stock.changePercent >= 0}
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">Mã HPT (UPCoM)</span>
                  )}

                  <div className="text-right text-[9px]">
                    <div className="font-semibold text-emerald-300">
                      {hptIntel.aiSentimentEnabled ? '🤖 AI PHÂN TÍCH TÍN HIỆU' : 'TỔNG HỢP ĐA NGUỒN'}
                    </div>
                    <div className="mt-0.5 text-slate-400 tabular-nums">
                      🟢 {hptSentimentStats.pos} · ⚪ {hptSentimentStats.neu} · 🔴 {hptSentimentStats.neg}
                    </div>
                  </div>
                </div>

                {/* Valuation & Fundamental Ratios from Simplize */}
                {hptIntel.stock?.fundamentals && (
                  <div className="grid grid-cols-4 gap-1 border-t border-slate-800/85 pt-1.5 text-[9.5px] tabular-nums">
                    <div>
                      <span className="text-slate-500">P/E </span>
                      <strong className="text-cyan-300">
                        {hptIntel.stock.fundamentals.peRatio?.toFixed(2) ?? '—'}x
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">P/B </span>
                      <strong className="text-emerald-300">
                        {hptIntel.stock.fundamentals.pbRatio?.toFixed(2) ?? '—'}x
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Vốn hóa </span>
                      <strong className="text-slate-200">
                        {hptIntel.stock.fundamentals.marketCapBillionVnd
                          ? `${hptIntel.stock.fundamentals.marketCapBillionVnd}tỷ`
                          : '—'}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">YTD </span>
                      <strong
                        className={
                          (hptIntel.stock.fundamentals.ytdChangePct ?? 0) >= 0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        {(hptIntel.stock.fundamentals.ytdChangePct ?? 0) >= 0 ? '+' : ''}
                        {hptIntel.stock.fundamentals.ytdChangePct ?? 0}%
                      </strong>
                    </div>
                  </div>
                )}

                {/* Quick National Portal Verification Links for MST 0301447436 */}
                <div className="flex flex-wrap items-center gap-1 border-t border-slate-800/80 pt-1.5 text-[8.5px]">
                  <span className="text-slate-500">Tra cứu gốc:</span>
                  {[
                    { label: 'MuaSắmCông (Thầu)', href: 'https://muasamcong.mpi.gov.vn/' },
                    { label: 'Simplize HPT', href: 'https://simplize.vn/co-phieu/HPT' },
                    { label: 'Thuế GDT', href: 'https://tracuunnt.gdt.gov.vn/' },
                    { label: 'ĐKKD', href: 'https://dangkykinhdoanh.gov.vn/' },
                    { label: 'Bản án Tòa án', href: 'https://congbobanan.toaan.gov.vn/' },
                    { label: 'SHTT WIPO', href: 'http://wipopublish.ipvietnam.gov.vn/' },
                  ].map((ext) => (
                    <a
                      key={ext.label}
                      href={ext.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-slate-700/90 bg-slate-900/90 px-1.5 py-0.2 text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      {ext.label} ↗
                    </a>
                  ))}
                </div>
              </div>

              {/* FireAnt-Style Independent Category Filter Pills */}
              <div className="mt-2 flex flex-wrap gap-1">
                {(
                  [
                    { id: 'all', label: `Tất cả (${hptIntel.items.length})` },
                    { id: 'filings', label: '📜 CBTT & Cổ đông' },
                    { id: 'bidding_project', label: '🏗️ Đấu thầu & Dự án' },
                    { id: 'it_press_partner', label: '🤝 Báo CNTT · VINASA · Đối tác' },
                    { id: 'press_social', label: '🌐 Bing · Báo Mới · F319' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHptFilter(tab.id)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${hptFilter === tab.id
                      ? 'border-cyan-400/55 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* FireAnt-Style Independent Disclosure, Bidding & Trade Press Stream */}
              <div className="mt-2 max-h-[360px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-slate-800/95 bg-[#080f1c]">
                {filteredHptItems.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-400">
                    Chưa có tin khớp phân nhóm này.
                  </div>
                ) : (
                  filteredHptItems.slice(0, 28).map((item) => {
                    const sentBadge: Record<HptSentiment, { text: string; cls: string }> = {
                      positive: {
                        text: 'TÍCH CỰC',
                        cls: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
                      },
                      neutral: {
                        text: 'TRUNG LẬP',
                        cls: 'border-slate-700 bg-slate-800/90 text-slate-300',
                      },
                      negative: {
                        text: 'TIÊU CỰC',
                        cls: 'border-rose-500/45 bg-rose-500/15 text-rose-300',
                      },
                    };
                    const sb = sentBadge[item.sentiment];
                    return (
                      <article key={item.id} className="px-2.5 py-2 transition hover:bg-[#0f1a2e]">
                        <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[9px]">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded border px-1.5 py-0.1 font-bold ${item.category === 'exchange_filing'
                                ? 'border-amber-400/50 bg-amber-500/18 text-amber-200'
                                : item.category === 'bidding_project'
                                  ? 'border-emerald-400/50 bg-emerald-500/18 text-emerald-200'
                                  : item.category === 'it_press_partner'
                                    ? 'border-violet-500/45 bg-violet-500/15 text-violet-200'
                                    : 'border-slate-700 bg-slate-800 text-slate-300'
                                }`}
                            >
                              {item.badge}
                            </span>
                            <span className={`rounded border px-1 py-0.1 font-semibold ${sb.cls}`}>
                              {sb.text}
                            </span>
                          </div>
                          <span className="text-slate-500 tabular-nums">
                            {item.dateLabel ?? formatRelativeTime(item.publishedAt)}
                          </span>
                        </div>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-xs font-medium leading-snug text-slate-100 hover:text-cyan-300"
                        >
                          {item.title}
                        </a>

                        {item.aiSummary && (
                          <p className="mt-1 rounded border border-slate-800/80 bg-[#0b1424] px-2 py-1 text-[10.5px] leading-snug text-emerald-200/90">
                            🤖 {renderInlineMarkdown(item.aiSummary)}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9.5px]">
                          <span className="truncate text-slate-400">{item.source}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.pdfUrl && (
                              <a
                                href={item.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded border border-rose-500/45 bg-rose-600/20 px-1.5 py-0.2 font-semibold text-rose-200 hover:bg-rose-600/35"
                              >
                                <FilePdf size={11} weight="fill" />
                                PDF gốc
                              </a>
                            )}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-cyan-200"
                            >
                              Chi tiết <ArrowSquareOut size={10} />
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* FX Rates */}
          <section>
            <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
              TỶ GIÁ NGOẠI HỐI TRỰC TIẾP
            </h2>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {fxQuotes.map((fx) => {
                const isVnd = fx.symbol === 'USD/VND';
                return (
                  <div
                    key={fx.symbol}
                    className={`rounded border px-2.5 py-2 ${isVnd
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-slate-800/90 bg-[#0d1524]'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[11px] font-semibold ${isVnd ? 'text-emerald-300' : 'text-slate-300'
                          }`}
                      >
                        {fx.symbol}
                      </span>
                      {isVnd && (
                        <span className="rounded bg-emerald-500/20 px-1 py-0.2 font-mono text-[9px] text-emerald-300">
                          VN
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-slate-100 tabular-nums">
                      {fx.price.toLocaleString('en-US', {
                        maximumFractionDigits: isVnd ? 0 : 4,
                      })}
                    </div>
                    <div className="truncate text-[10px] text-slate-400">{fx.name}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Federal Reserve Macro & US Yield Curve / VIX Telemetry (FRED Live API) */}
          {markets.fred && markets.fred.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-[11px] font-semibold tracking-wider text-sky-300">
                  LÃI SUẤT FED · LỢI SUẤT TRÁI PHIẾU MỸ &amp; VIX (FRED LIVE)
                </h2>
                <span className="font-mono text-[9.5px] text-slate-500">St. Louis Fed</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {markets.fred
                  .filter((fm) => fm.pillar === 'market' || fm.id === 'FEDFUNDS' || fm.id === 'T10Y2Y')
                  .map((fm) => {
                  const up = fm.change >= 0;
                  return (
                    <div
                      key={fm.id}
                      className={`rounded border px-2.5 py-2 ${fm.alertBadge
                        ? 'border-rose-500/45 bg-rose-950/25'
                        : 'border-slate-800/95 bg-[#0d1524]'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-mono text-[10.5px] font-bold text-slate-200">
                          {fm.label}
                        </span>
                        <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">
                          {fm.value.toFixed(2)}
                          {fm.unit === '%' ? '%' : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">{fm.subtitle}</div>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <MiniSparkline values={fm.sparkline} positive={up} />
                        <span
                          className={`font-mono text-[9.5px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                        >
                          {up ? '+' : ''}
                          {fm.change.toFixed(2)}
                        </span>
                      </div>
                      {fm.alertBadge && (
                        <div className="mt-1 rounded border border-rose-500/45 bg-rose-500/20 px-1.5 py-0.2 text-center font-mono text-[8.5px] font-bold text-rose-200">
                          {fm.alertBadge}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Global & Vietnam Indices + Strategic Commodities */}
          <section>
            <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
              CHỈ SỐ CHỨNG KHOÁN &amp; HÀNG HÓA CHIẾN LƯỢC
            </h2>
            <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
              {indexAndCommodityQuotes.map((q) => {
                const up = q.changePercent24h >= 0;
                const isVn = q.symbol.includes('VN');
                const flash = priceFlashes[q.symbol];
                return (
                  <div
                    key={q.symbol}
                    className={`flex items-center justify-between px-2.5 py-2 transition-colors duration-300 ${flash === 'up'
                      ? 'bg-emerald-500/25'
                      : flash === 'down'
                        ? 'bg-rose-500/25'
                        : isVn
                          ? 'bg-emerald-500/8'
                          : ''
                      }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-100">{q.symbol}</span>
                        <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-[9.5px] uppercase text-slate-400">
                          {q.group}
                        </span>
                        {q.symbol === 'Gold' && streamConnected && (
                          <span className="font-mono text-[9px] text-emerald-400">LIVE 1S</span>
                        )}
                      </div>
                      <div className="truncate text-[10.5px] text-slate-400">{q.name}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <MiniSparkline values={q.sparkline} positive={up} />
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-xs font-semibold text-slate-100">
                          {q.unit?.startsWith('USD') ? '$' : ''}
                          {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`inline-flex items-center gap-0.5 text-[10.5px] ${up ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                        >
                          {up ? <TrendUp size={11} /> : <TrendDown size={11} />}
                          {up ? '+' : ''}
                          {q.changePercent24h.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* WorldMonitor Stablecoin Peg Monitor */}
          {stablecoins.length > 0 && (
            <section>
              <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
                STABLECOIN PEG MONITOR
              </h2>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {stablecoins.map((sc) => {
                  const dev = Math.abs(sc.priceUsd - 1.0);
                  const onPeg = dev < 0.005;
                  return (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5 font-mono"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-100">{sc.symbol}</div>
                        <div className="text-[10px] text-slate-400">${sc.priceUsd.toFixed(4)}</div>
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${onPeg
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                          }`}
                      >
                        {onPeg ? 'ON PEG' : 'DEPEG WARN'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Crypto & Fear & Greed Sentiment */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-300">
                <span>TIỀN SỐ REALTIME</span>
                {streamConnected && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9.5px] text-emerald-300">
                    <Broadcast size={10} className="animate-pulse" />
                    WS 1S
                  </span>
                )}
              </h2>
              {markets.fearGreed && (
                <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-cyan-300 tabular-nums">
                  <Gauge size={13} />
                  F&amp;G: {markets.fearGreed.value}/100 ({markets.fearGreed.classification})
                </span>
              )}
            </div>

            {markets.fearGreed && (
              <div className="mt-1.5 rounded border border-slate-800/90 bg-[#0d1524] p-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${markets.fearGreed.value}%`,
                      backgroundColor:
                        markets.fearGreed.value >= 60
                          ? '#10b981'
                          : markets.fearGreed.value <= 35
                            ? '#f43f5e'
                            : '#f59e0b',
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
              {volatileCrypto.map((coin) => {
                const up = coin.changePercent24h >= 0;
                const flash = priceFlashes[coin.symbol];
                return (
                  <div
                    key={coin.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 transition-colors duration-300 ${flash === 'up'
                      ? 'bg-emerald-500/22'
                      : flash === 'down'
                        ? 'bg-rose-500/22'
                        : ''
                      }`}
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-100">{coin.symbol}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{coin.name}</span>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div
                        className={`text-xs font-semibold ${flash === 'up'
                          ? 'text-emerald-200'
                          : flash === 'down'
                            ? 'text-rose-200'
                            : 'text-slate-100'
                          }`}
                      >
                        $
                        {coin.priceUsd.toLocaleString('en-US', {
                          maximumFractionDigits: coin.priceUsd >= 10 ? 2 : 4,
                        })}
                      </div>
                      <div className="text-[10px]">
                        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                          {up ? '+' : ''}
                          {coin.changePercent24h.toFixed(2)}%
                        </span>
                        <span className="ml-1.5 text-slate-500">MCap {formatCompactUsd(coin.marketCapUsd)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* World Bank Macroeconomic Table */}
          <section>
            <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
              VĨ MÔ 8 NỀN KINH TẾ (WORLD BANK OPEN DATA)
            </h2>
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
                          <span className="ml-1 font-mono text-[9.5px] text-slate-400">{row.countryCode}</span>
                        </div>
                        {(row.manufacturingGrowthPct !== null && row.manufacturingGrowthPct !== undefined) && (
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
                        className={`px-1.5 py-1.5 text-right font-semibold ${(row.gdpGrowthPct ?? 0) >= 5
                          ? 'text-emerald-400'
                          : (row.gdpGrowthPct ?? 0) < 0
                            ? 'text-rose-400'
                            : 'text-slate-100'
                          }`}
                      >
                        {row.gdpGrowthPct !== null ? `${row.gdpGrowthPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-amber-300">
                        {row.cpiInflationPct !== null ? `${row.cpiInflationPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-slate-300">
                        {row.unemploymentPct !== null && row.unemploymentPct !== undefined
                          ? `${row.unemploymentPct.toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-slate-300">
                        {formatCompactUsd(row.gdpCurrentUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Compact Top 5 Macro & Geopolitical Probability Indicators (Polymarket) */}
          {topMacroGeopoliticsPredictions.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-300">
                  <ChartBar size={13} className="text-cyan-400" />
                  <span>CHỈ BÁO XÁC SUẤT VĨ MÔ &amp; ĐỊA CHÍNH TRỊ (TOP 5)</span>
                </h2>
                <span className="font-mono text-[9.5px] text-slate-500">Polymarket</span>
              </div>

              <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
                {topMacroGeopoliticsPredictions.map((item) => {
                  const label = translateVi ? item.titleVi || item.title : item.title;
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-2.5 py-2 transition hover:bg-[#111c30]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium leading-snug text-slate-100">{label}</span>
                          {item.outcomeLabel && (
                            <span className="ml-1.5 inline-block rounded border border-cyan-500/35 bg-cyan-500/12 px-1 py-0.2 font-mono text-[9px] text-cyan-200">
                              {item.outcomeLabel}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold text-cyan-300 tabular-nums">
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
                        <span className="shrink-0 font-mono text-[9.5px] text-slate-400 tabular-nums">
                          Vol {formatCompactUsd(item.volumeUsd)}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  );
});
