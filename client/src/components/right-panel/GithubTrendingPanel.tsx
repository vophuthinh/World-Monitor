import { ArrowsClockwise, ArrowSquareOut, Fire } from '@phosphor-icons/react';
import { safeHref } from '../../lib/safe-href';
import type { CollectorId, GitHubTrendingRepo, TechCyberItem } from '@shared/types';

export function GithubTrendingPanel({ activeGhTrending, filteredGhTrending, filteredTech, ghTrendingPeriod, setGhTrendingPeriod, translateVi, onForceRefresh, refreshingIds }: {
  activeGhTrending: GitHubTrendingRepo[];
  filteredGhTrending: GitHubTrendingRepo[];
  filteredTech: TechCyberItem[];
  ghTrendingPeriod: 'daily' | 'weekly';
  setGhTrendingPeriod: (period: 'daily' | 'weekly') => void;
  translateVi: boolean;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  return (
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
                      href={safeHref(repo.url)}
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
                    href={safeHref(repo.url)}
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
  );
}
