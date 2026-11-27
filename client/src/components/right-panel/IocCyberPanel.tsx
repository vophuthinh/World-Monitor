import { ArrowSquareOut, ShieldWarning } from '@phosphor-icons/react';
import { safeHref } from '../../lib/safe-href';
import type { GeoPointFeature, IocLookupResult } from '@shared/types';

export function IocCyberPanel({ cyberThreats, iocQuery, setIocQuery, iocLoading, iocError, iocResult, setIocResult, runIocScan, translateVi }: {
  cyberThreats: GeoPointFeature[];
  iocQuery: string;
  setIocQuery: (value: string) => void;
  iocLoading: boolean;
  iocError: string | null;
  iocResult: IocLookupResult | null;
  setIocResult: (value: IocLookupResult | null) => void;
  runIocScan: (overrideQuery?: string) => Promise<void>;
  translateVi: boolean;
}) {
  return (
    <div className="bg-[#0b1220] p-2.5">
      <div className="rounded border border-fuchsia-500/30 bg-[#0d1524] p-2">
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="flex items-center gap-1 font-mono text-xs font-semibold tracking-wider text-fuchsia-200">
            <ShieldWarning size={12} className="text-fuchsia-400" weight="fill" />
            <span>QUÉT IOC / IP / CVE TRỰC TIẾP (SHODAN + NVD)</span>
          </h2>
          <div className="flex items-center gap-1 font-mono text-xs">
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
            className="min-w-0 flex-1 rounded border border-slate-700/95 bg-[#070b12] px-2 py-1 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={iocLoading}
            className="shrink-0 rounded border border-fuchsia-500/50 bg-fuchsia-500/20 px-2.5 py-1 font-mono text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/30 disabled:opacity-50"
          >
            {iocLoading ? 'Đang quét...' : 'Quét Live'}
          </button>
        </form>

        {iocError && (
          <div className="mt-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-xs text-rose-200">
            {iocError}
          </div>
        )}

        {iocResult && (
          <div className="mt-2 space-y-1.5 rounded border border-slate-800 bg-[#080d17] p-2 font-mono text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-100">{iocResult.query}</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded px-1.5 py-0.2 text-xs font-bold uppercase ${
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
                  <div className="font-sans text-xs text-slate-300">
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
                        className="rounded border border-rose-500/40 bg-rose-500/15 px-1 py-0.2 text-xs text-rose-200 hover:bg-rose-500/30"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {iocResult.cpes && iocResult.cpes.length > 0 && (
                  <div className="truncate text-xs text-slate-400">
                    CPE: {iocResult.cpes.slice(0, 3).join(' · ')}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-sans text-xs leading-snug text-slate-200">
                  {translateVi
                    ? iocResult.descriptionVi || iocResult.description
                    : iocResult.description}
                </div>
                {iocResult.vectorString && (
                  <div className="truncate text-xs text-slate-400">
                    {iocResult.vectorString}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end">
              <a
                href={safeHref(iocResult.referenceUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-fuchsia-300 hover:underline"
              >
                Mở hồ sơ gốc <ArrowSquareOut size={10} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
