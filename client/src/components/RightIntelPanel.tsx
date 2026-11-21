import { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  Broadcast,
  ChartBar,
  ChartLineUp,
  Cpu,
  Crosshair,
  Gauge,
  Lightning,
  MagnifyingGlass,
  Newspaper,
  ShieldWarning,
  Translate,
  TrendDown,
  TrendUp,
} from '@phosphor-icons/react';
import type {
  MarketSnapshot,
  NewsCategory,
  NewsItem,
  NewsStreamStats,
  PredictionCategory,
  PredictionItem,
  TechCyberItem,
  TechCyberSnapshot,
  TechSubCategory,
} from '@shared/types';
import type { FlashDirection } from '../hooks/useMonitorData';

type RightTabId = 'markets' | 'predictions' | 'news' | 'techCyber';

interface RightIntelPanelProps {
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  news: NewsItem[];
  techCyber?: TechCyberSnapshot;
  newsStreamStats?: NewsStreamStats;
  freshNewsIds?: ReadonlySet<string>;
  priceFlashes: Record<string, FlashDirection>;
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
  const diffSec = Math.max(1, Math.round((Date.now() - ts) / 1_000));
  if (diffSec < 60) return `${diffSec}s trước`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}p trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h trước`;
  return `${Math.round(diffHr / 24)}d trước`;
}

function sourceBadgeStyle(item: NewsItem): string {
  if (item.streamSource === 'bluesky') {
    return 'border border-sky-500/40 bg-sky-500/15 text-sky-300';
  }
  if (item.streamSource === 'wikimedia') {
    return 'border border-purple-500/40 bg-purple-500/15 text-purple-300';
  }
  if (item.streamSource === 'gdelt') {
    return 'border border-rose-500/40 bg-rose-500/15 text-rose-300';
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

export function RightIntelPanel({
  markets,
  predictions,
  news,
  techCyber,
  newsStreamStats,
  freshNewsIds,
  priceFlashes,
  streamConnected,
  onFlyToLocation,
}: RightIntelPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTabId>('markets');
  const [predFilter, setPredFilter] = useState<'all' | PredictionCategory>('all');
  const [predQuery, setPredQuery] = useState('');
  const [newsFilter, setNewsFilter] = useState<'all' | NewsCategory>('all');
  const [newsQuery, setNewsQuery] = useState('');
  const [techFilter, setTechFilter] = useState<'all' | TechSubCategory>('all');
  const [techQuery, setTechQuery] = useState('');
  const [translateVi, setTranslateVi] = useState<boolean>(true);

  const fxQuotes = useMemo(() => markets.quotes.filter((q) => q.group === 'fx'), [markets.quotes]);
  const indexAndCommodityQuotes = useMemo(
    () => markets.quotes.filter((q) => q.group !== 'fx'),
    [markets.quotes],
  );

  const filteredPredictions = useMemo(() => {
    const q = predQuery.trim().toLowerCase();
    return predictions.filter((item) => {
      if (predFilter !== 'all' && item.category !== predFilter) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [predictions, predFilter, predQuery]);

  const filteredNews = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return news.filter((item) => {
      if (newsFilter !== 'all' && item.category !== newsFilter) return false;
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

  const techItems = techCyber?.items ?? [];

  const techCounts = useMemo(() => {
    let ai = 0;
    let cyber = 0;
    let tech_infra = 0;
    let vn_tech = 0;
    for (const item of techItems) {
      if (item.subCategory === 'ai') ai += 1;
      else if (item.subCategory === 'cyber') cyber += 1;
      else if (item.subCategory === 'vn_tech') vn_tech += 1;
      else tech_infra += 1;
    }
    return { ai, cyber, tech_infra, vn_tech };
  }, [techItems]);

  const filteredTech = useMemo(() => {
    const q = techQuery.trim().toLowerCase();
    return techItems.filter((item) => {
      if (techFilter !== 'all' && item.subCategory !== techFilter) return false;
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
  }, [techItems, techFilter, techQuery]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-800/95 bg-[#090e18] lg:w-[432px] xl:w-[468px]">
      {/* 4-Tab Header */}
      <div className="grid shrink-0 grid-cols-4 border-b border-slate-800/95 bg-[#070b12]">
        <button
          type="button"
          onClick={() => setActiveTab('markets')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${
            activeTab === 'markets'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChartLineUp size={14} />
          <span>Thị trường</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('predictions')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${
            activeTab === 'predictions'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChartBar size={14} />
          <span>Dự đoán ({predictions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${
            activeTab === 'news'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Newspaper size={14} />
          <span>Tin nóng ({news.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('techCyber')}
          className={`flex items-center justify-center gap-1 border-b-2 py-2.5 text-[11px] font-semibold transition ${
            activeTab === 'techCyber'
              ? 'border-violet-400 bg-violet-500/12 text-violet-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu size={14} />
          <span>AI · Cyber ({techItems.length})</span>
        </button>
      </div>

      {/* Tab 1: Markets, FX, Crypto & World Bank Macro */}
      {activeTab === 'markets' && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
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
                    className={`rounded border px-2.5 py-2 ${
                      isVnd
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-slate-800/90 bg-[#0d1524]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          isVnd ? 'text-emerald-300' : 'text-slate-300'
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
                    className={`flex items-center justify-between px-2.5 py-2 transition-colors duration-300 ${
                      flash === 'up'
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
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-semibold text-slate-100">
                        {q.unit?.startsWith('USD') ? '$' : ''}
                        {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </div>
                      <div
                        className={`inline-flex items-center gap-0.5 text-[10.5px] ${
                          up ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {up ? <TrendUp size={11} /> : <TrendDown size={11} />}
                        {up ? '+' : ''}
                        {q.changePercent24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

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
              {markets.crypto.map((coin) => {
                const up = coin.changePercent24h >= 0;
                const flash = priceFlashes[coin.symbol];
                return (
                  <div
                    key={coin.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 transition-colors duration-300 ${
                      flash === 'up'
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
                        className={`text-xs font-semibold ${
                          flash === 'up'
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
                    <th className="px-2 py-1.5 text-right">GDP %</th>
                    <th className="px-2 py-1.5 text-right">QUY MÔ</th>
                    <th className="px-2.5 py-1.5 text-right">CPI %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/75 font-mono text-[11px] tabular-nums">
                  {markets.macro.map((row) => (
                    <tr
                      key={row.countryCode}
                      className={row.isVietnam ? 'bg-emerald-500/12 text-emerald-200' : 'text-slate-200'}
                    >
                      <td className="px-2.5 py-1.5 font-sans">
                        <span className="font-semibold">{row.countryName}</span>
                        <span className="ml-1 font-mono text-[9.5px] text-slate-400">{row.countryCode}</span>
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-semibold ${
                          (row.gdpGrowthPct ?? 0) >= 5
                            ? 'text-emerald-400'
                            : (row.gdpGrowthPct ?? 0) < 0
                              ? 'text-rose-400'
                              : 'text-slate-100'
                        }`}
                      >
                        {row.gdpGrowthPct !== null ? `${row.gdpGrowthPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-300">
                        {formatCompactUsd(row.gdpCurrentUsd)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-amber-300">
                        {row.cpiInflationPct !== null ? `${row.cpiInflationPct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Polymarket Predictions */}
      {activeTab === 'predictions' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'geopolitics', label: 'Địa chính trị' },
                  { id: 'finance', label: 'Kinh tế & Fed' },
                  { id: 'crypto_tech', label: 'Crypto & Tech' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPredFilter(cat.id)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    predFilter === cat.id
                      ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
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
                value={predQuery}
                onChange={(e) => setPredQuery(e.target.value)}
                placeholder="Lọc hợp đồng dự đoán Polymarket..."
                aria-label="Lọc hợp đồng Polymarket"
                className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
            {filteredPredictions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Không có thị trường dự đoán nào khớp bộ lọc.
              </div>
            ) : (
              filteredPredictions.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded border border-slate-800/95 bg-[#0d1524] p-2.5 transition hover:border-cyan-500/40 hover:bg-[#111c30]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-medium leading-snug text-slate-100">{item.title}</h3>
                    <ArrowSquareOut size={13} className="mt-0.5 shrink-0 text-slate-500" />
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span className="font-bold text-cyan-300">YES {item.yesPercent}%</span>
                      <span className="text-slate-400">NO {100 - item.yesPercent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${Math.max(2, Math.min(98, item.yesPercent))}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-400 tabular-nums">
                    <span>Vol {formatCompactUsd(item.volumeUsd)}</span>
                    <span>Liq {formatCompactUsd(item.liquidityUsd)}</span>
                    {item.endDate && (
                      <span>Đóng: {new Date(item.endDate).toLocaleDateString('vi-VN')}</span>
                    )}
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Unified OSINT Firehose + 27 Geopolitics/Defense/VN RSS + Auto-Vietnamese Translation */}
      {activeTab === 'news' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-slate-800/90 bg-[#0d1524] px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                    newsStreamStats?.blueskyConnected
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  title="Bluesky Jetstream WebSocket Firehose"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      newsStreamStats?.blueskyConnected ? 'animate-pulse bg-sky-400' : 'bg-slate-500'
                    }`}
                  />
                  BSky {newsStreamStats?.blueskyCount ?? 0}
                </span>

                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                    newsStreamStats?.wikimediaConnected
                      ? 'bg-purple-500/15 text-purple-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  title="Wikimedia EventStreams SSE Crisis Burst Detector"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      newsStreamStats?.wikimediaConnected ? 'animate-pulse bg-purple-400' : 'bg-slate-500'
                    }`}
                  />
                  Wiki {newsStreamStats?.wikimediaCount ?? 0}
                </span>

                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
                  GDELT {newsStreamStats?.gdeltCount ?? 0}
                </span>

                <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-300">
                  HN {newsStreamStats?.hnCount ?? 0}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setTranslateVi((v) => !v)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                  translateVi
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
                  { id: 'all', label: 'Tất cả' },
                  { id: 'osint_live', label: '⚡ Live OSINT' },
                  { id: 'vietnam', label: 'Việt Nam' },
                  { id: 'world', label: 'Thế giới & Quốc phòng' },
                  { id: 'finance', label: 'Tài chính' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setNewsFilter(cat.id)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    newsFilter === cat.id
                      ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
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
                placeholder="Tìm tin tức Tiếng Việt, tiếng Anh hoặc địa danh..."
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
              filteredNews.map((item) => {
                const isTranslated =
                  Boolean(item.titleVi) && item.titleVi !== item.title && item.category !== 'vietnam';
                const headline = translateVi ? item.titleVi || item.title : item.title;
                const isFresh = freshNewsIds?.has(item.id) ?? false;

                return (
                  <article
                    key={item.id}
                    className={`px-3 py-2.5 transition-colors duration-500 hover:bg-slate-900/65 ${
                      isFresh ? 'bg-cyan-500/12' : ''
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
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Dedicated AI, Semiconductor, Cloud & Cybersecurity Intelligence (53+ Koala73 & VN Sources) */}
      {activeTab === 'techCyber' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            {/* Cloud & Frontier AI Infrastructure Status Bar + Auto-Translate Toggle */}
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
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                  translateVi
                    ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Translate size={12} weight="bold" />
                <span>{translateVi ? 'Dịch VI: BẬT' : 'Dịch VI: TẮT'}</span>
              </button>
            </div>

            {/* Sub-Domain Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${techItems.length})` },
                  { id: 'ai', label: `🤖 AI & LLM (${techCounts.ai})` },
                  { id: 'cyber', label: `🛡️ Cyber & CVE (${techCounts.cyber})` },
                  { id: 'tech_infra', label: `💻 Chip · Cloud · Dev (${techCounts.tech_infra})` },
                  { id: 'vn_tech', label: `🇻🇳 Công nghệ VN (${techCounts.vn_tech})` },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTechFilter(cat.id)}
                  className={`rounded px-2 py-1 text-[10.5px] font-medium transition ${
                    techFilter === cat.id
                      ? 'border border-violet-500/45 bg-violet-500/20 text-violet-200'
                      : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={techQuery}
                onChange={(e) => setTechQuery(e.target.value)}
                placeholder="Tìm OpenAI, LLM, lỗ hổng CVE, ransomware, chip NVIDIA..."
                aria-label="Tìm tin AI Công nghệ An ninh mạng"
                className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
            {filteredTech.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                {techItems.length === 0
                  ? 'Đang đồng bộ 53+ nguồn AI, Công nghệ & An ninh mạng...'
                  : 'Không có bản tin nào khớp điều kiện lọc.'}
              </div>
            ) : (
              filteredTech.map((item) => {
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
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-rose-500/45 bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-bold text-rose-200">
                            <ShieldWarning size={10} weight="fill" />
                            {item.cveId}
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
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
