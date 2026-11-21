import { describe, expect, it } from 'vitest';
import {
  classifyVietnameseLegalDoc,
  parseCongBaoOrLegalRss,
  parseVanBanChinhPhuHtml,
} from '../server/collectors/vietnam-policy-legal';
import {
  normalizeRedditPosts,
  normalizeSnapiArticles,
} from '../server/realtime/news-stream';

describe('Vietnam Policy & Legal Radar + Open OSINT (SNAPI, Reddit JSON, Google News RSS)', () => {
  it('classifies Vietnamese legal document codes (NĐ-CP, NQ-TW, NQ-CP, QH15, QĐ-TTg) via Regex accurately', () => {
    const nd = classifyVietnameseLegalDoc(
      'Nghị định số 415/2026/NĐ-CP quy định xử phạt vi phạm hành chính trong lĩnh vực khoa học và công nghệ',
    );
    expect(nd.docCode).toBe('415/2026/NĐ-CP');
    expect(nd.docType).toBe('nghi_dinh');
    expect(nd.typeBadge).toBe('NGHỊ ĐỊNH');
    expect(nd.sector).toContain('Khoa học');

    const nq57 = classifyVietnameseLegalDoc(
      'Triển khai Nghị quyết số 57-NQ/TW về đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia',
    );
    expect(nq57.docCode).toBe('57-NQ/TW');
    expect(nq57.docType).toBe('nq_tw_cp');
    expect(nq57.typeBadge).toBe('NGHỊ QUYẾT TW');

    const nqCp = classifyVietnameseLegalDoc('Nghị quyết 66/NQ-CP chương trình cắt giảm thủ tục hành chính');
    expect(nqCp.docCode).toBe('66/NQ-CP');
    expect(nqCp.docType).toBe('nq_tw_cp');

    const luat = classifyVietnameseLegalDoc('Luật số 136/2024/QH15 sửa đổi Luật Đất đai');
    expect(luat.docCode).toBe('136/2024/QH15');
    expect(luat.docType).toBe('luat_qh');
  });

  it('parses vanban.chinhphu.vn HTML table rows including official code, summary, and signed PDF URL', () => {
    const sampleHtml = `
      <table class="table search-result">
        <tr><th>Số ký hiệu</th><th>Ngày ban hành</th><th>Trích yếu</th></tr>
        <tr>
          <td>
            <a href='/?pageid=27160&docid=220325&classid=1'>
              <span class="code">416/2026/NĐ-CP</span>
              <span class="issue-v2">19/11/2026</span>
            </a>
          </td>
          <td><span class="issued-date">19/11/2026</span></td>
          <td>
            <a href='/?pageid=27160&docid=220325&classid=1'>
              <span class="substract">Quy định về chính sách tín dụng ưu đãi phát triển kinh tế</span>
            </a>
            <div class="bl-doc-files">
              <div class="bl-doc-file">
                <a href="https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/416_2026_ndcp_19112026-signed.signed.pdf" target="_blank" download>Tài liệu đính kèm</a>
              </div>
            </div>
          </td>
        </tr>
      </table>
    `;

    const docs = parseVanBanChinhPhuHtml(sampleHtml);
    expect(docs).toHaveLength(1);
    expect(docs[0].docCode).toBe('416/2026/NĐ-CP');
    expect(docs[0].docType).toBe('nghi_dinh');
    expect(docs[0].issuedDate).toBe('19/11/2026');
    expect(docs[0].pdfUrl).toBe(
      'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/416_2026_ndcp_19112026-signed.signed.pdf',
    );
    expect(docs[0].highlights.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty <title></title> in Công báo điện tử Chính phủ RSS by reading <description> CDATA', () => {
    const congBaoXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title></title>
            <description><![CDATA[Nghị định số 388/2026/NĐ-CP ngày 10/11/2026 của Chính phủ quy định chi tiết Luật Dữ liệu]]></description>
            <pubDate>Thu, 12 Nov 2026 00:00:00 GMT</pubDate>
            <link>https://congbao.chinhphu.vn/noi-dung-van-ban-so-388-2026-nd-cp-45678</link>
          </item>
        </channel>
      </rss>`;

    const items = parseCongBaoOrLegalRss(congBaoXml, 'Công báo Chính phủ');
    expect(items).toHaveLength(1);
    expect(items[0].docCode).toBe('388/2026/NĐ-CP');
    expect(items[0].title).toContain('Luật Dữ liệu');
  });

  it('normalizes Spaceflight News API v4 (SNAPI) and Reddit / ArcticShift OSINT JSON posts', () => {
    const snapi = normalizeSnapiArticles({
      results: [
        {
          id: 28001,
          title: 'SpaceX launches Starship flight test from Starbase in Texas',
          url: 'https://spacenews.com/starship-launch',
          news_site: 'SpaceNews',
          published_at: '2026-11-21T18:00:00Z',
        },
      ],
    });
    expect(snapi).toHaveLength(1);
    expect(snapi[0].streamSource).toBe('snapi');
    expect(snapi[0].source).toContain('SNAPI');

    const reddit = normalizeRedditPosts(
      [
        {
          id: 'abc99',
          subreddit: 'worldnews',
          title: 'Naval coalition escorts commercial tankers through Red Sea corridor',
          url: 'https://reuters.com/world/red-sea-escort',
          permalink: '/r/worldnews/comments/abc99/naval_coalition/',
          created_utc: 1_700_000_000,
          score: 120,
        },
      ],
      'worldnews',
    );
    expect(reddit).toHaveLength(1);
    expect(reddit[0].streamSource).toBe('reddit');
    expect(reddit[0].matchedLocation).toContain('Biển Đỏ');
  });
});
