import { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  ChartBar,
  ChartLineUp,
  Crosshair,
  Gauge,
  MagnifyingGlass,
  Newspaper,
  TrendDown,
  TrendUp,
} from '@phosphor-icons/react';
import type {
  MarketSnapshot,
  NewsCategory,
  NewsItem,
  PredictionCategory,
  PredictionItem,
} from '@shared/types';

type RightTabId = 'markets' | 'predictions' | 'news';

interface RightIntelPanelProps {
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  news: NewsItem[];
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
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (diffMin < 60) return `${diffMin}p trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h trước`;
  return `${Math.round(diffHr / 24)}d trước`;
}

export function RightIntelPanel({
  markets,
  predictions,
  news,
  onFlyToLocation,
}: RightIntelPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTabId>('markets');
  const [predFilter, setPredFilter] = useState<'all' | PredictionCategory>('all');
  const [predQuery, setPredQuery] = useState('');
  const [newsFilter, setNewsFilter] = useState<'all' | NewsCategory>('all');
  const [newsQuery, setNewsQuery] = useState('');

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
      if (q && !`${item.title} ${item.source} ${item.matchedLocation ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [news, newsFilter, newsQuery]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-800/95 bg-[#090e18] lg:w-[410px] xl:w-[436px]">
      {/* Tab Header */}
      <div className="grid shrink-0 grid-cols-3 border-b border-slate-800/95 bg-[#070b12]">
        <button
          type="button"
          onClick={() => setActiveTab('markets')}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition ${
            activeTab === 'markets'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChartLineUp size={15} />
          <span>Thị trường &amp; Vĩ mô</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('predictions')}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition ${
            activeTab === 'predictions'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChartBar size={15} />
          <span>Dự đoán ({predictions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition ${
            activeTab === 'news'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Newspaper size={15} />
          <span>Tin nóng ({news.length})</span>
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
                return (
                  <div
                    key={q.symbol}
                    className={`flex items-center justify-between px-2.5 py-2 ${
                      isVn ? 'bg-emerald-500/8' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-100">{q.symbol}</span>
                        <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-[9.5px] uppercase text-slate-400">
                          {q.group}
                        </span>
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
              <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
                TIỀN SỐ &amp; TÂM LÝ THỊ TRƯỜNG
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
                return (
                  <div key={coin.id} className="flex items-center justify-between px-2.5 py-1.5">
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-100">{coin.symbol}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{coin.name}</span>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-semibold text-slate-100">
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
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
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

      {/* Tab 3: Curated RSS News & Geo-FlyTo */}
      {activeTab === 'news' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-800/90 p-2.5">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'vietnam', label: 'Việt Nam' },
                  { id: 'world', label: 'Thế giới' },
                  { id: 'finance', label: 'Tài chính & Dầu' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setNewsFilter(cat.id)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    newsFilter === cat.id
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
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
                placeholder="Tìm từ khóa tin tức hoặc địa danh..."
                aria-label="Tìm tin tức RSS"
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
              filteredNews.map((item) => (
                <article key={item.id} className="px-3 py-2.5 transition hover:bg-slate-900/65">
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span
                      className={`rounded px-1.5 py-0.2 font-semibold ${
                        item.category === 'vietnam'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : item.category === 'finance'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.source}
                    </span>
                    <span className="text-slate-500 tabular-nums">{formatRelativeTime(item.publishedAt)}</span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs font-medium leading-relaxed text-slate-100 hover:text-cyan-300"
                  >
                    {item.title}
                  </a>

                  {item.matchedLat !== undefined && item.matchedLon !== undefined && (
                    <div className="mt-1.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                        className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                      >
                        <Crosshair size={11} />
                        Bay tới: {item.matchedLocation}
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400 hover:text-slate-200"
                      >
                        Đọc bài <ArrowSquareOut size={11} />
                      </a>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
