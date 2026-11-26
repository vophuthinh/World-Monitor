import { memo, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Clock,
  Compass,
  CornersIn,
  CornersOut,
  Cube,
  Globe,
  Lightning,
  MagnifyingGlass,
  MapTrifold,
  NavigationArrow,
  Pulse,
  SidebarSimple,
  Television,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import type {
  BasemapTheme,
  CollectorId,
  CryptoQuote,
  FearGreedSnapshot,
  MapLayerId,
  MarketQuote,
  SourceHealth,
  TheaterViewPreset,
  TimeWindow,
} from '@shared/types';
import type { FlashDirection, SearchHit } from '../hooks/useMonitorData';

interface TopCommandBarProps {
  isGlobe: boolean;
  onToggleGlobe: () => void;
  basemap: BasemapTheme;
  onChangeBasemap: (theme: BasemapTheme) => void;
  theaters: readonly TheaterViewPreset[];
  activeTheaterId: string;
  onSelectTheater: (preset: TheaterViewPreset) => void;
  timeWindow: TimeWindow;
  onChangeTimeWindow: (tw: TimeWindow) => void;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  searchResults: SearchHit[];
  onPickSearchHit: (hit: SearchHit) => void;
  health: SourceHealth[];
  refreshingIds: Set<string>;
  onForceRefresh: (id: CollectorId | 'polymarket-news') => void;
  quotes: MarketQuote[];
  crypto: CryptoQuote[];
  fearGreed: FearGreedSnapshot | null;
  layerCounts: Record<MapLayerId, number>;
  streamConnected: boolean;
  liveTickCount: number;
  priceFlashes: Record<string, FlashDirection>;
  deadReckoning: boolean;
  onToggleDeadReckoning: () => void;
  liveTvOpen: boolean;
  onToggleLiveTv: () => void;
  desktopIntelOpen?: boolean;
  onToggleDesktopIntel?: () => void;
}

const TIME_OPTIONS: ReadonlyArray<{ id: TimeWindow; label: string }> = [
  { id: '6h', label: '6H' },
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: 'all', label: 'ALL' },
];

const LiveClockLine = memo(function LiveClockLine() {
  const [nowTime, setNowTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const vnClock = nowTime.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const utcClock = nowTime.toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="font-mono text-[11px] text-slate-400 tabular-nums">
      VN {vnClock} · UTC {utcClock}
    </div>
  );
});

export const TopCommandBar = memo(function TopCommandBar({
  isGlobe,
  onToggleGlobe,
  basemap,
  onChangeBasemap,
  theaters,
  activeTheaterId,
  onSelectTheater,
  timeWindow,
  onChangeTimeWindow,
  searchQuery,
  onChangeSearch,
  searchResults,
  onPickSearchHit,
  health,
  refreshingIds,
  onForceRefresh,
  quotes,
  crypto,
  fearGreed,
  layerCounts,
  streamConnected,
  liveTickCount,
  priceFlashes,
  deadReckoning,
  onToggleDeadReckoning,
  liveTvOpen,
  onToggleLiveTv,
  desktopIntelOpen = true,
  onToggleDesktopIntel,
}: TopCommandBarProps) {
  const [healthOpen, setHealthOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && document.activeElement !== searchInputRef.current) {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setHealthOpen(false);
        setSearchFocused(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const okCount = health.filter((h) => h.status === 'ok').length;
  const staleCount = health.filter((h) => h.status === 'stale').length;
  const errorCount = health.filter((h) => h.status === 'error').length;
  const warmingCount = health.filter((h) => h.status === 'warming').length;

  const findQuote = (sym: string) => quotes.find((q) => q.symbol === sym);
  const usdVnd = findQuote('USD/VND');
  const vnIdx = findQuote('VN-Index') ?? findQuote('VNM ETF');
  const sp500 = findQuote('S&P 500');
  const gold = findQuote('Gold');
  const brent = findQuote('Brent Crude');
  const btc = crypto.find((c) => c.symbol === 'BTC');
  const eth = crypto.find((c) => c.symbol === 'ETH');
  const sol = crypto.find((c) => c.symbol === 'SOL');

  const tickerItems = [
    usdVnd && { key: 'USD/VND', label: 'USD/VND', price: usdVnd.price.toLocaleString('en-US'), chg: usdVnd.changePercent24h, highlight: true },
    vnIdx && { key: vnIdx.symbol, label: vnIdx.symbol, price: vnIdx.price.toLocaleString('en-US'), chg: vnIdx.changePercent24h, highlight: true },
    btc && { key: 'BTC', label: 'BTC', price: `$${btc.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, chg: btc.changePercent24h },
    eth && { key: 'ETH', label: 'ETH', price: `$${eth.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, chg: eth.changePercent24h },
    sol && { key: 'SOL', label: 'SOL', price: `$${sol.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, chg: sol.changePercent24h },
    gold && { key: 'Gold', label: 'GOLD', price: `$${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`, chg: gold.changePercent24h },
    sp500 && { key: 'S&P 500', label: 'S&P 500', price: sp500.price.toLocaleString('en-US'), chg: sp500.changePercent24h },
    brent && { key: 'Brent Crude', label: 'BRENT', price: `$${brent.price.toFixed(2)}`, chg: brent.changePercent24h },
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <header className="relative z-30 shrink-0 border-b border-slate-800/95 bg-[#090e18]/98 select-none">
      {/* Row 1: Primary Tactical Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-500/40 bg-cyan-500/15 text-cyan-300">
              <Compass size={17} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold tracking-wider text-slate-100">
                  WORLD MONITOR
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.2 font-mono text-[11px] font-semibold ${
                    streamConnected
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  }`}
                  title="Luồng đẩy trực tiếp SSE + Binance WebSocket 1s + ADS-B 10s"
                >
                  <Broadcast size={11} className={streamConnected ? 'animate-pulse text-emerald-400' : ''} />
                  {streamConnected ? `LIVE WS · ${liveTickCount}` : 'RECONNECTING'}
                </span>
              </div>
              <LiveClockLine />
            </div>
          </div>

          <nav className="hidden items-center gap-1 border-l border-slate-800 pl-3 2xl:flex" aria-label="Khung nhìn khu vực">
            {theaters.map((preset) => {
              const isActive = activeTheaterId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  onClick={() => onSelectTheater(preset)}
                  className={`rounded px-2 py-1 text-xs font-medium transition active:scale-[0.98] ${
                    isActive
                      ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                      : preset.highlight
                        ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : 'border border-transparent text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Unified Instant Search */}
          <div className="relative w-32 sm:w-56">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Tìm máy bay, tàu AIS, tin... (/)"
              aria-label="Tìm kiếm toàn cục"
              className="w-full rounded border border-slate-700/85 bg-[#0d1524] py-1 pl-8 pr-7 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearch('')}
                aria-label="Xóa tìm kiếm"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X size={13} />
              </button>
            )}

            {searchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-md border border-slate-700 bg-[#0a101d] p-1 shadow-2xl">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    Không tìm thấy kết quả cho &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  searchResults.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onMouseDown={() => {
                        onPickSearchHit(hit);
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-start gap-2 rounded px-2.5 py-1.5 text-left transition hover:bg-slate-800/90"
                    >
                      <span className="mt-0.5 shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.2 font-mono text-[11px] font-semibold text-cyan-300">
                        {hit.badge}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-slate-100">{hit.title}</div>
                        <div className="truncate text-[11px] text-slate-400">{hit.subtitle}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Time Window Filter */}
          <div className="flex items-center rounded border border-slate-800 bg-[#0d1524] p-0.5" role="group" aria-label="Bộ lọc thời gian">
            <Clock size={13} className="mx-1.5 text-slate-400" />
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeTimeWindow(opt.id)}
                aria-pressed={timeWindow === opt.id}
                className={`min-h-11 min-w-11 rounded px-1.5 py-0.5 font-mono text-xs font-medium transition sm:min-h-8 sm:min-w-8 ${
                  timeWindow === opt.id
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Dead-Reckoning Live Motion Toggle */}
          <button
            type="button"
            onClick={onToggleDeadReckoning}
            title="Ngoại suy chuyển động mượt (Dead-Reckoning) cho Máy bay quân sự & Tàu AIS theo vận tốc thực"
            className={`hidden items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] font-medium transition sm:inline-flex ${
              deadReckoning
                ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700/85 bg-[#0d1524] text-slate-400'
            }`}
          >
            <NavigationArrow size={13} weight={deadReckoning ? 'fill' : 'regular'} />
            <span>GLIDE</span>
          </button>

          {/* Live TV PiP Toggle */}
          <button
            type="button"
            onClick={onToggleLiveTv}
            title="Mở cửa sổ truyền hình tin tức quốc tế trực tiếp (DW / France24 / Al Jazeera)"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] font-medium transition ${
              liveTvOpen
                ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                : 'border-slate-700/85 bg-[#0d1524] text-slate-300 hover:border-slate-600'
            }`}
          >
            <Television size={14} />
            <span className="hidden md:inline">LIVE TV</span>
          </button>

          {/* 2D Mercator <-> 3D Globe Toggle */}
          <button
            type="button"
            onClick={onToggleGlobe}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-xs font-semibold transition active:scale-[0.98] ${
              isGlobe
                ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700/85 bg-[#0d1524] text-slate-200 hover:border-slate-600'
            }`}
          >
            {isGlobe ? <Globe size={15} weight="duotone" className="text-cyan-300" /> : <MapTrifold size={15} />}
            <span>{isGlobe ? '3D GLOBE' : '2D MAP'}</span>
            <Cube size={12} className="opacity-65" />
          </button>

          {/* Basemap Selector */}
          <select
            aria-label="Chọn bản đồ nền"
            value={basemap}
            onChange={(e) => onChangeBasemap(e.target.value as BasemapTheme)}
            className="hidden rounded border border-slate-700/85 bg-[#0d1524] px-2 py-1 font-mono text-[11px] text-slate-300 focus:border-cyan-400 focus:outline-none md:block"
          >
            <option value="dark-matter">Dark Matter</option>
            <option value="voyager">Voyager</option>
            <option value="positron">Positron Light</option>
          </select>

          {/* Desktop Right Intel Panel Collapse/Expand (Full-Map Mode) */}
          {onToggleDesktopIntel && (
            <button
              type="button"
              onClick={onToggleDesktopIntel}
              title={desktopIntelOpen ? 'Thu gọn Bảng Intel để mở rộng Bản đồ toàn khung' : 'Hiện lại Bảng Intel bên phải'}
              className={`hidden items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] font-medium transition lg:inline-flex ${
                desktopIntelOpen
                  ? 'border-slate-700/85 bg-[#0d1524] text-slate-300 hover:border-cyan-500/45 hover:text-cyan-200'
                  : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              }`}
            >
              <SidebarSimple size={14} weight={desktopIntelOpen ? 'duotone' : 'regular'} />
              <span className="hidden xl:inline">{desktopIntelOpen ? 'ẨN PANEL' : 'HIỆN PANEL'}</span>
            </button>
          )}

          {/* Browser Native Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thoát Toàn màn hình (Esc)' : 'Mở Toàn màn hình (Phím F)'}
            className={`hidden items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] font-medium transition sm:inline-flex ${
              isFullscreen
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                : 'border-slate-700/85 bg-[#0d1524] text-slate-300 hover:border-cyan-500/45 hover:text-cyan-200'
            }`}
          >
            {isFullscreen ? <CornersIn size={14} weight="bold" /> : <CornersOut size={14} weight="bold" />}
            <span className="hidden 2xl:inline">{isFullscreen ? 'THOÁT FULL' : 'FULLSCREEN'}</span>
          </button>

          {/* Upstream Health Diagnostics Pill & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setHealthOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700/90 bg-[#0d1524] px-2.5 py-1 font-mono text-[11px] text-slate-200 transition hover:border-cyan-500/40"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  errorCount > 0
                    ? 'bg-rose-500'
                    : warmingCount > 0 || staleCount > 0
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                }`}
              />
              <span className="tabular-nums">
                {okCount}/{health.length || 10}
                <span className="hidden sm:inline"> UPSTREAM</span>
              </span>
            </button>

            {healthOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(355px,calc(100vw-1.5rem))] rounded-md border border-slate-700 bg-[#0a101d] p-3 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-slate-100">
                      TRẠNG THÁI NGUỒN REALTIME &amp; UPSTREAM
                    </div>
                    <div className="text-[11px] text-slate-400">
                      SSE Push + Binance 1s WS + 10s ADS-B + Cache 2 tầng
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHealthOpen(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
                  {health.map((src) => {
                    const isRefreshing = refreshingIds.has(src.id);
                    return (
                      <div
                        key={src.id}
                        className="flex items-center justify-between gap-2 rounded border border-slate-800/90 bg-slate-900/65 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {src.status === 'ok' && <CheckCircle size={13} weight="fill" className="shrink-0 text-emerald-400" />}
                            {src.status === 'stale' && <WarningCircle size={13} weight="fill" className="shrink-0 text-amber-400" />}
                            {src.status === 'warming' && <Pulse size={13} className="shrink-0 animate-pulse text-sky-400" />}
                            {src.status === 'error' && <WarningCircle size={13} weight="fill" className="shrink-0 text-rose-400" />}
                            <span className="truncate text-xs font-medium text-slate-200">{src.label}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                            {src.status.toUpperCase()} · {src.itemCount} mục · chu kỳ {Math.round(src.intervalMs / 1000)}s
                          </div>
                          {src.lastError && (
                            <div className="mt-0.5 truncate font-mono text-[11px] text-amber-400/90" title={src.lastError}>
                              {src.lastError}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isRefreshing}
                          onClick={() => onForceRefresh(src.id)}
                          title="Làm mới nguồn này (giới hạn 10s)"
                          className="shrink-0 rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:border-cyan-500/45 hover:text-cyan-300 disabled:opacity-45"
                        >
                          {isRefreshing ? (
                            <ArrowsClockwise size={13} className="animate-spin text-cyan-300" />
                          ) : (
                            <ArrowClockwise size={13} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-2xl Theater Strip */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-800/80 px-3 py-1 2xl:hidden">
        {theaters.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelectTheater(preset)}
            className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
              activeTheaterId === preset.id
                ? 'bg-cyan-500/20 text-cyan-200'
                : preset.highlight
                  ? 'text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {preset.shortLabel}
          </button>
        ))}
      </div>

      {/* Row 2: Realtime Tick-Flash Market & Telemetry Strip */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto border-t border-slate-800/80 bg-[#070b12] px-3 py-1 font-mono text-[11px] tabular-nums">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400">
            <Lightning size={12} weight="fill" />
            1S TICK
          </span>
          {tickerItems.map((item) => {
            const flash = priceFlashes[item.key];
            return (
              <div
                key={item.key}
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.2 transition-colors duration-300 ${
                  flash === 'up'
                    ? 'bg-emerald-500/25 text-emerald-100'
                    : flash === 'down'
                      ? 'bg-rose-500/25 text-rose-100'
                      : ''
                }`}
              >
                <span className={item.highlight ? 'font-semibold text-emerald-300' : 'text-slate-400'}>
                  {item.label}
                </span>
                <span className="font-medium text-slate-100">{item.price}</span>
                {item.chg != null && item.chg !== 0 && (
                  <span className={item.chg > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {item.chg > 0 ? '+' : ''}
                    {item.chg.toFixed(2)}%
                  </span>
                )}
              </div>
            );
          })}
          {fearGreed && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-2.5">
              <span className="text-slate-400">F&amp;G</span>
              <span
                className={`font-semibold ${
                  fearGreed.value >= 60
                    ? 'text-emerald-400'
                    : fearGreed.value <= 40
                      ? 'text-amber-400'
                      : 'text-slate-200'
                }`}
              >
                {fearGreed.value} ({fearGreed.classification})
              </span>
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-3 text-[11px] text-slate-400 lg:flex">
          <span>
            MIL <strong className="text-cyan-300">{layerCounts.military}</strong>
          </span>
          <span>
            AIS <strong className="text-emerald-300">{layerCounts.vessels}</strong>
          </span>
          <span>
            EQ <strong className="text-rose-400">{layerCounts.earthquakes}</strong>
          </span>
          <span>
            GEO <strong className="text-orange-300">{layerCounts.geopolitics}</strong>
          </span>
        </div>
      </div>
    </header>
  );
});
