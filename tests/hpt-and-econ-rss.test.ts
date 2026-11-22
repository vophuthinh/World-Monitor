import { describe, expect, it } from 'vitest';
import {
  isAuthenticHptMention,
  parseCafeFHptDisclosuresHtml,
  parseGroqHptSentimentBatch,
  parseHptOfficialSiteHtml,
} from '../server/collectors/hpt-company-intel';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';

describe('Economic RSS Feeds & HPT (UPCoM) FireAnt-Style Corporate Intelligence', () => {
  it('includes Vietnam & International Economic RSS sources (CafeF, VnEconomy, Vietstock, CNBC Finance, Yahoo Finance, MarketWatch)', () => {
    const names = CURATED_RSS_FEEDS.map((f) => f.name).join(' | ');
    expect(names).toContain('CafeF');
    expect(names).toContain('VnEconomy');
    expect(names).toContain('Vietstock');
    expect(names).toContain('CNBC Finance');
    expect(names).toContain('Yahoo Finance');
    expect(names).toContain('MarketWatch');
  });

  it('parses CafeF / HNX / UBCKNN official HPT exchange disclosures cleanly', () => {
    const sampleHtml = `
      <div id="divEvents">
        <ul class="News_Title_Link">
          <li>
            <span class="timeTitle">09/11/2026 00:00</span>
            <a class='docnhanhTitle' href="/du-lieu/HPT-3017991/hpt-nhan-duoc-tai-lieu-bao-cao-ket-qua-phat-hanh-co-phieu-de-tra-co-tuc-cua-hpt.chn">HPT: Nhận được tài liệu Báo cáo Kết quả phát hành cổ phiếu để trả cổ tức của HPT</a>
          </li>
          <li>
            <span class="timeTitle">02/11/2026 00:00</span>
            <a class='docnhanhTitle' href="/du-lieu/HPT-3012463/hpt-nghi-quyet-hoi-dong-quan-tri-thong-qua-ket-qua-phat-hanh-co-phieu-de-tra-co-tuc-nam-2025.chn">HPT: Nghị quyết Hội đồng quản trị thông qua kết quả phát hành cổ phiếu để trả cổ tức năm 2025</a>
          </li>
        </ul>
      </div>
    `;

    const items = parseCafeFHptDisclosuresHtml(sampleHtml, 1700000000000);
    expect(items.length).toBe(2);
    expect(items[0].category).toBe('exchange_filing');
    expect(items[0].badge).toContain('CỔ TỨC');
    expect(items[0].url).toBe(
      'https://cafef.vn/du-lieu/HPT-3017991/hpt-nhan-duoc-tai-lieu-bao-cao-ket-qua-phat-hanh-co-phieu-de-tra-co-tuc-cua-hpt.chn',
    );
    expect(items[1].badge).toContain('NGHỊ QUYẾT HĐQT');
    expect(items[1].dateLabel).toBe('02/11/2026');
  });

  it('parses official hpt.vn/co-dong shareholder filings and hpt.vn/tin-tuc corporate tech news', () => {
    const sampleCoDong = `
      <a href="/co-dong/hpt-cong-bo-thong-tin-van-ban-so-9887-ubck-qlcb-ngay-05-10-2026-cua-uy-ban-chung-khoan-nha-nuoc/16006">HPT công b&#7889; thông tin Văn b&#7843;n s&#7889; 9887/UBCK-QLCB ngày 05/10/2026 c&#7911;a &#7910;y ban Ch&#7913;ng khoán Nhà nư&#7899;c</a>
    `;
    const irItems = parseHptOfficialSiteHtml(sampleCoDong, 'shareholder_ir', 1700000000000);
    expect(irItems.length).toBe(1);
    expect(irItems[0].title).toContain('9887/UBCK-QLCB');
    expect(irItems[0].url).toContain('https://hpt.vn/co-dong/');

    const sampleTinTuc = `
      <a href="/tin-tuc/hpt-cung-saigon-co-op-dua-ai-vao-trai-nghiem-mua-sam-tai-tp-hcm/16031">HPT cùng Saigon Co.op đưa AI vào trải nghiệm mua sắm tại TP.HCM</a>
    `;
    const techItems = parseHptOfficialSiteHtml(sampleTinTuc, 'tech_activity', 1700000000000);
    expect(techItems.length).toBe(1);
    expect(techItems[0].category).toBe('tech_activity');
    expect(techItems[0].sentiment).toBe('positive');
  });

  it('enforces strict HPT context filter to block 3-letter acronym collisions (Hải Phòng Tourist, Hypertension, etc.)', () => {
    expect(
      isAuthenticHptMention(
        'Lịch chốt quyền trả cổ tức tuần tới: Cổ phiếu HPT phát hành thêm tỷ lệ 10%',
        '',
        'https://vietstock.vn/hpt-co-tuc.htm',
      ),
    ).toBe(true);

    expect(
      isAuthenticHptMention(
        'Công ty Công nghệ Tin học HPT trúng gói thầu hạ tầng an toàn thông tin ngân hàng',
        '',
        'https://f319.com/threads/hpt',
      ),
    ).toBe(true);

    // Must block false positives!
    expect(
      isAuthenticHptMention(
        'Công ty Hải Phòng Tourist (HPT) khai trương tuyến du lịch Cát Bà mùa hè',
        '',
        'https://example.com/du-lich',
      ),
    ).toBe(false);

    expect(
      isAuthenticHptMention(
        'Clinical study of pulmonary hypertension (HPT) patients in hospital',
        '',
        'https://medical.example.com/hpt',
      ),
    ).toBe(false);

    expect(
      isAuthenticHptMention(
        'High pressure turbine (HPT) blade inspection on commercial jet engine',
        '',
        'https://aviation.example.com/hpt',
      ),
    ).toBe(false);
  });

  it('parses Groq AI verification + sentiment batch and drops non-HPT false positives', () => {
    const rawGroq = [
      '0|YES|POSITIVE|HPT chốt quyền chia cổ tức năm 2025 bằng cổ phiếu, củng cố vốn điều lệ.',
      '1|NO|NEUTRAL|Bài viết nói về bệnh cao huyết áp, không liên quan Công ty HPT.',
      '2|YES|NEUTRAL|UBCKNN xác nhận đã nhận đầy đủ hồ sơ báo cáo phát hành của mã HPT.',
    ].join('\n');

    const parsed = parseGroqHptSentimentBatch(rawGroq);
    expect(parsed.get(0)?.isHpt).toBe(true);
    expect(parsed.get(0)?.sentiment).toBe('positive');
    expect(parsed.get(0)?.summary).toContain('cổ tức');

    expect(parsed.get(1)?.isHpt).toBe(false);
    expect(parsed.get(2)?.sentiment).toBe('neutral');
  });
});
