import { describe, expect, it } from 'vitest';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';
import {
  TECH_CYBER_FEEDS,
  mergeBalancedTechItems,
  normalizeCisaKevCatalog,
  normalizeStatuspageSummary,
  parseGitHubTrendingHtml,
} from '../server/collectors/tech-cyber-intel';

describe('Dedicated AI, Tech, Semiconductor & Cybersecurity Intelligence Collector (Koala73 + VN)', () => {
  it('configures 40+ verified AI, Cybersecurity, Tech/Chip/Cloud, and Vietnamese Tech RSS/Atom feeds', () => {
    expect(TECH_CYBER_FEEDS.length).toBeGreaterThanOrEqual(40);

    const subCats = new Set(TECH_CYBER_FEEDS.map((f) => f.subCategory));
    expect(subCats.has('ai')).toBe(true);
    expect(subCats.has('cyber')).toBe(true);
    expect(subCats.has('tech_infra')).toBe(true);
    expect(subCats.has('vn_tech')).toBe(true);

    const names = TECH_CYBER_FEEDS.map((f) => f.name).join(' | ');
    expect(names).toContain('OpenAI');
    expect(names).toContain('DeepMind');
    expect(names).toContain('Hugging Face');
    expect(names).toContain('Krebs on Security');
    expect(names).toContain('CISA');
    expect(names).toContain('Palo Alto Unit 42');
    expect(names).toContain('Google Project Zero');
    expect(names).toContain('Ars Technica');
    expect(names).toContain('MIT Tech Review');
    expect(names).toContain('VnExpress Số hóa');
    expect(names).toContain('Tuổi Trẻ Công nghệ');
  });

  it('expands general geopolitical & defense intel feeds with Koala73 sources (Defense One, TWZ, Bellingcat, SCMP, Diplomat)', () => {
    expect(CURATED_RSS_FEEDS.length).toBeGreaterThanOrEqual(25);
    const names = CURATED_RSS_FEEDS.map((f) => f.name).join(' | ');
    expect(names).toContain('Defense One');
    expect(names).toContain('The War Zone');
    expect(names).toContain('Bellingcat');
    expect(names).toContain('The Diplomat');
    expect(names).toContain('South China Morning Post');
  });

  it('normalizes CISA Known Exploited Vulnerabilities (KEV) JSON into cyber CVE items', () => {
    const items = normalizeCisaKevCatalog({
      vulnerabilities: [
        {
          cveID: 'CVE-2026-1111',
          vendorProject: 'Palo Alto Networks',
          product: 'PAN-OS',
          vulnerabilityName: 'PAN-OS Command Injection Vulnerability',
          dateAdded: '2026-11-20',
          shortDescription: 'Active exploitation detected in firewall management interface.',
          knownRansomwareCampaignUse: 'Known',
        },
        {
          cveID: 'CVE-2026-2222',
          vendorProject: 'Ivanti',
          product: 'Connect Secure',
          vulnerabilityName: 'Ivanti Auth Bypass',
          dateAdded: '2026-11-21',
        },
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0].cveId).toBe('CVE-2026-2222');
    expect(items[1].cveId).toBe('CVE-2026-1111');
    expect(items[1].subCategory).toBe('cyber');
    expect(items[1].severity).toBe('critical');
    expect(items[1].url).toContain('nvd.nist.gov/vuln/detail/CVE-2026-1111');
  });

  it('normalizes OpenAI / Anthropic / GitHub / Cloudflare Statuspage summary JSON accurately', () => {
    const okStatus = normalizeStatuspageSummary('OpenAI', 'https://status.openai.com', {
      status: { indicator: 'none', description: 'All Systems Operational' },
    });
    expect(okStatus.level).toBe('operational');

    const degradedStatus = normalizeStatuspageSummary('Cloudflare', 'https://www.cloudflarestatus.com', {
      status: { indicator: 'minor', description: 'Partially Degraded Service' },
    });
    expect(degradedStatus.level).toBe('degraded');
    expect(degradedStatus.description).toBe('Partially Degraded Service');
  });

  it('caps per-source volume in mergeBalancedTechItems so high-frequency feeds never drown out frontier labs', () => {
    const noisyAws = Array.from({ length: 12 }, (_, idx) => ({
      id: `aws:${idx}`,
      title: `AWS update ${idx}`,
      source: 'AWS What is New',
      subCategory: 'tech_infra' as const,
      publishedAt: 1_700_000_000_000 - idx * 1000,
      url: `https://aws.amazon.com/new/${idx}`,
    }));
    const openAiPost = {
      id: 'openai:1',
      title: 'Introducing next-gen reasoning model',
      source: 'OpenAI News',
      subCategory: 'ai' as const,
      publishedAt: 1_699_900_000_000,
      url: 'https://openai.com/index/model',
    };

    const merged = mergeBalancedTechItems([...noisyAws, openAiPost], 4);
    const awsCount = merged.filter((x) => x.source === 'AWS What is New').length;
    expect(awsCount).toBeLessThanOrEqual(4);
    expect(merged.some((x) => x.id === 'openai:1')).toBe(true);
  });

  it('parses GitHub Trending HTML (daily & weekly) accurately without matching SVG <path> tags', () => {
    const sampleHtml = `
      <div>
        <article class="Box-row">
          <div class="float-right"><svg><path d="M8 14.25"></path></svg></div>
          <h2 class="h3 lh-condensed">
            <a href="/elementalsouls/Claude-BugHunter" class="Link">
              <span class="text-normal">elementalsouls /</span> Claude-BugHunter
            </a>
          </h2>
          <p class="col-9 color-fg-muted my-1">
            A Claude Code skill bundle for bug hunting &amp; red-team work.
          </p>
          <div class="f6 color-fg-muted mt-2">
            <span>
              <span class="repo-language-color" style="background-color: #3572A5"></span>
              <span itemprop="programmingLanguage">Python</span>
            </span>
            <a href="/elementalsouls/Claude-BugHunter/stargazers">16,602</a>
            <a href="/elementalsouls/Claude-BugHunter/forks">1,878</a>
            <span class="float-sm-right">1,803 stars today</span>
          </div>
        </article>
        <article class="Box-row">
          <h2 class="h3 lh-condensed">
            <a href="/cursor/plugins">cursor / plugins</a>
          </h2>
          <p class="col-9 color-fg-muted my-1">Cursor plugin specification and official plugins.</p>
          <div class="f6 color-fg-muted mt-2">
            <span class="repo-language-color" style="background-color: #3178c6"></span>
            <span itemprop="programmingLanguage">TypeScript</span>
            <a href="/cursor/plugins/stargazers">18,202</a>
            <a href="/cursor/plugins/forks">1,989</a>
            <span class="float-sm-right">260 stars today</span>
          </div>
        </article>
      </div>
    `;

    const parsed = parseGitHubTrendingHtml(sampleHtml, 'daily');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      rank: 1,
      fullName: 'elementalsouls/Claude-BugHunter',
      owner: 'elementalsouls',
      repoName: 'Claude-BugHunter',
      description: 'A Claude Code skill bundle for bug hunting & red-team work.',
      language: 'Python',
      languageColor: '#3572A5',
      totalStars: 16602,
      forks: 1878,
      periodStars: 1803,
      period: 'daily',
      url: 'https://github.com/elementalsouls/Claude-BugHunter',
    });
    expect(parsed[1]).toMatchObject({
      rank: 2,
      fullName: 'cursor/plugins',
      language: 'TypeScript',
      languageColor: '#3178c6',
      totalStars: 18202,
      periodStars: 260,
    });
  });
});
