import type { IocLookupResult, SeverityLevel } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from './http';
import { globalViTranslator } from './translator';

interface RawShodanInternetDb {
  ip?: string;
  ports?: number[];
  vulns?: string[];
  cpes?: string[];
  hostnames?: string[];
  tags?: string[];
}

interface RawIpGeoInfo {
  country?: string;
  city?: string;
  org?: string;
}

export function normalizeShodanInternetDb(
  ip: string,
  payload: RawShodanInternetDb | null,
  geo?: RawIpGeoInfo | null,
): IocLookupResult {
  const ports = Array.isArray(payload?.ports) ? payload.ports.slice(0, 24) : [];
  const vulns = Array.isArray(payload?.vulns) ? payload.vulns.slice(0, 20) : [];
  const cpes = Array.isArray(payload?.cpes)
    ? payload.cpes.map((c) => c.replace(/^cpe:\/[aoh]:/, '')).slice(0, 12)
    : [];
  const hostnames = Array.isArray(payload?.hostnames) ? payload.hostnames.slice(0, 8) : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags.slice(0, 10) : [];

  const hasMaliciousTag = tags.some((t) => /compromised|c2|malware|botnet|tor|scanner/i.test(t));
  let riskLevel: SeverityLevel = 'low';
  if (vulns.length >= 2 || (vulns.length >= 1 && hasMaliciousTag)) {
    riskLevel = 'critical';
  } else if (vulns.length === 1 || hasMaliciousTag || ports.length >= 6) {
    riskLevel = 'high';
  } else if (ports.length > 0) {
    riskLevel = 'medium';
  }

  return {
    kind: 'ip',
    query: ip,
    riskLevel,
    ports,
    vulns,
    cpes,
    hostnames,
    tags,
    country: geo?.country,
    city: geo?.city,
    org: geo?.org,
    referenceUrl: `https://www.shodan.io/host/${encodeURIComponent(ip)}`,
  };
}

export function normalizeNvdCveLookup(cveId: string, payload: unknown): IocLookupResult | null {
  const rec = payload as Record<string, any> | null;
  const firstVuln = rec?.vulnerabilities?.[0]?.cve;
  if (!firstVuln) return null;

  const id = String(firstVuln.id ?? cveId).toUpperCase();
  const descriptions: Array<{ lang?: string; value?: string }> = Array.isArray(firstVuln.descriptions)
    ? firstVuln.descriptions
    : [];
  const enDesc =
    descriptions.find((d) => d.lang === 'en')?.value ?? descriptions[0]?.value ?? '';

  const v31 = firstVuln.metrics?.cvssMetricV31?.[0]?.cvssData;
  const v40 = firstVuln.metrics?.cvssMetricV40?.[0]?.cvssData;
  const v30 = firstVuln.metrics?.cvssMetricV30?.[0]?.cvssData;
  const v2 = firstVuln.metrics?.cvssMetricV2?.[0]?.cvssData;
  const metric = v31 ?? v40 ?? v30 ?? v2;

  const cvssScore = typeof metric?.baseScore === 'number' ? metric.baseScore : undefined;
  const cvssSeverity = String(metric?.baseSeverity ?? (cvssScore && cvssScore >= 9 ? 'CRITICAL' : cvssScore && cvssScore >= 7 ? 'HIGH' : 'MEDIUM')).toUpperCase();
  const vectorString = typeof metric?.vectorString === 'string' ? metric.vectorString : undefined;

  let riskLevel: SeverityLevel = 'medium';
  if (cvssSeverity === 'CRITICAL' || (cvssScore ?? 0) >= 9.0) riskLevel = 'critical';
  else if (cvssSeverity === 'HIGH' || (cvssScore ?? 0) >= 7.0) riskLevel = 'high';
  else if (cvssSeverity === 'LOW') riskLevel = 'low';

  return {
    kind: 'cve',
    query: id,
    riskLevel,
    cvssScore,
    cvssSeverity,
    vectorString,
    description: enDesc.slice(0, 420),
    publishedAt: typeof firstVuln.published === 'string' ? firstVuln.published : undefined,
    referenceUrl: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`,
  };
}

export async function lookupLiveIocOrCve(rawQuery: string): Promise<IocLookupResult> {
  const q = rawQuery.trim();
  const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/;
  const cveRe = /^CVE-\d{4}-\d{4,}$/i;

  if (ipv4Re.test(q)) {
    const [shodanRes, geoRes] = await Promise.allSettled([
      fetchJsonWithTimeout<RawShodanInternetDb>(
        `https://internetdb.shodan.io/${encodeURIComponent(q)}`,
        { timeoutMs: 6_500, retries: 0, userAgent: NAMED_APP_UA },
      ),
      fetchJsonWithTimeout<{ country?: string; city?: string; org?: string; isp?: string }>(
        `http://ip-api.com/json/${encodeURIComponent(q)}?fields=status,country,city,org,isp`,
        { timeoutMs: 4_500, retries: 0, userAgent: NAMED_APP_UA },
      ),
    ]);

    const shodanData = shodanRes.status === 'fulfilled' ? shodanRes.value : null;
    const geoData =
      geoRes.status === 'fulfilled'
        ? {
            country: geoRes.value.country,
            city: geoRes.value.city,
            org: geoRes.value.org || geoRes.value.isp,
          }
        : null;

    return normalizeShodanInternetDb(q, shodanData, geoData);
  }

  if (cveRe.test(q)) {
    const upperCve = q.toUpperCase();
    const nvdPayload = await fetchJsonWithTimeout<unknown>(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(upperCve)}`,
      { timeoutMs: 8_000, retries: 0, userAgent: NAMED_APP_UA },
    );
    const normalized = normalizeNvdCveLookup(upperCve, nvdPayload);
    if (!normalized) {
      throw new Error(`Không tìm thấy mã lỗ hổng ${upperCve} trên cơ sở dữ liệu NIST NVD`);
    }
    if (normalized.description) {
      const [vi] = await globalViTranslator.translateBatch([normalized.description]);
      normalized.descriptionVi = vi || normalized.description;
    }
    return normalized;
  }

  throw new Error('Nhập địa chỉ IPv4 (ví dụ: 45.148.10.240) hoặc mã CVE (ví dụ: CVE-2024-38477)');
}
