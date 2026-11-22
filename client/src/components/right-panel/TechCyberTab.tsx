import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Crosshair,
  Fire,
  MagnifyingGlass,
  ShieldWarning,
  Translate,
} from '@phosphor-icons/react';
import type {
  CollectorId,
  GeoPointFeature,
  IocLookupResult,
  TechCyberSnapshot,
  TechSubCategory,
} from '@shared/types';
import { formatRelativeTime, techBadgeStyle } from './shared';

export interface TechCyberJumpPayload {
  seq: number;
  query?: string;
  scanIoc?: string;
}

export interface TechCyberTabProps {
  techCyber?: TechCyberSnapshot;
  cyberThreats: GeoPointFeature[];
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  translateVi: boolean;
  onToggleTranslateVi: () => void;
  jumpPayload: TechCyberJumpPayload | null;
}

const TechCyberTab = memo(function TechCyberTab({
  techCyber,
  cyberThreats,
  refreshingIds,
  onForceRefresh,
  onFlyToLocation,
  translateVi,
  onToggleTranslateVi,
  jumpPayload,
}: TechCyberTabProps) {
  const [techFilter, setTechFilter] = useState<'all' | TechSubCategory>('all');
  const [ghTrendingPeriod, setGhTrendingPeriod] = useState<'daily' | 'weekly'>('daily');
  const [mitreFilter, setMitreFilter] = useState<string | null>(null);
  const [techQuery, setTechQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);

  const [iocQuery, setIocQuery] = useState('');
  const [iocLoading, setIocLoading] = useState(false);
  const [iocError, setIocError] = useState<string | null>(null);
  const [iocResult, setIocResult] = useState<IocLookupResult | null>(null);

  const deferredTechQuery = useDeferredValue(techQuery);

  useEffect(() => {
    setVisibleLimit(25);
  }, [techFilter, mitreFilter, deferredTechQuery]);

  const runIocScan = useCallback(
    async (overrideQuery?: string) => {
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
    },
    [iocQuery],
  );

  useEffect(() => {
    if (!jumpPayload) return;
    if (jumpPayload.scanIoc) {
      setTechFilter('cyber');
      void runIocScan(jumpPayload.scanIoc);
    } else if (jumpPayload.query !== undefined) {
      setTechFilter('all');
      setMitreFilter(null);
      setTechQuery(jumpPayload.query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpPayload?.seq]);

  const techItems = techCyber?.items ?? [];

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
    const q = deferredTechQuery.trim().toLowerCase();
    if (!q) return activeGhTrending;
    return activeGhTrending.filter((repo) =>
      `${repo.fullName} ${repo.description} ${repo.descriptionVi ?? ''} ${repo.language ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [activeGhTrending, deferredTechQuery]);

  const filteredTech = useMemo(() => {
    const q = deferredTechQuery.trim().toLowerCase();
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
  }, [techItems, techFilter, mitreFilter, deferredTechQuery]);

  return (
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
            onClick={onToggleTranslateVi}
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

        {mitreFilter && (
          <div className="flex items-center justify-between rounded border border-rose-500/45 bg-rose-500/15 px-2.5 py-1 font-mono text-[10px] text-rose-200">
            <span>
              Đang lọc theo kỹ thuật MITRE ATT&amp;CK: <strong>{mitreFilter}</strong>
            </span>
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
        {techFilter === 'cyber' && (
          <div className="bg-[#0b1220] p-2.5">
            <div className="rounded border border-fuchsia-500/30 bg-[#0d1524] p-2">
              <div className="flex items-center justify-between gap-1.5">
                <h2 className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wider text-fuchsia-200">
                  <ShieldWarning size={12} className="text-fuchsia-400" weight="fill" />
                  <span>QUÉT IOC / IP / CVE TRỰC TIẾP (SHODAN + NVD)</span>
                </h2>
                <div className="flex items-center gap-1 font-mono text-[8.5px]">
                  <button
                    type="button"
                    onClick={() => {
                      const sampleIp = String(
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
                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                          iocResult.riskLevel === 'critical'
                            ? 'border border-rose-500/50 bg-rose-500/25 text-rose-200'
                            : iocResult.riskLevel === 'high'
                              ? 'border border-amber-500/45 bg-amber-500/20 text-amber-200'
                              : 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200'
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
                          {[iocResult.city, iocResult.country, iocResult.org]
                            .filter(Boolean)
                            .join(' · ')}
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
                        <div className="truncate text-[9px] text-slate-400">
                          {iocResult.vectorString}
                        </div>
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
            </div>
          </div>
        )}

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
                      className="perf-card px-3 py-2.5 transition hover:bg-slate-900/65"
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
                <article
                  key={item.id}
                  className="perf-card px-3 py-2.5 transition hover:bg-slate-900/65"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`truncate rounded px-1.5 py-0.2 font-semibold ${techBadgeStyle(item)}`}>
                        {item.source}
                      </span>
                      {item.cveId && (
                        <button
                          type="button"
                          onClick={() => {
                            setTechFilter('cyber');
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
                          className={`rounded border px-1.5 py-0.2 font-semibold transition ${
                            mitreFilter === ttp.id
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
  );
});

export default TechCyberTab;
