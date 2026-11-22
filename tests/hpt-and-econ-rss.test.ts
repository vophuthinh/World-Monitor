import { describe, expect, it } from 'vitest';
import {
  classifyHptExternalItem,
  isAuthenticHptMention,
  normalizeSimplizeHptSummary,
  parseBaoMoiHptSearchHtml,
  parseCafeFHptDisclosuresHtml,
  parseGroqHptSentimentBatch,
} from '../server/collectors/hpt-company-intel';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';

describe('Economic RSS Feeds & Independent External HPT (UPCoM · MST 0301447436) Intelligence', () => {
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
    expect(items[1].badge).toContain('NGHỊ QUYẾT HĐQT');
    expect(items[1].dateLabel).toBe('02/11/2026');
  });

  it('strictly excludes self-published hpt.vn URLs and blocks 3-letter acronym noise (FPT, Hải Phòng Tourist, Hypertension)', () => {
    // Explicit user requirement: do NOT take articles from hpt.vn
    expect(
      isAuthenticHptMention(
        'HPT cùng Saigon Co.op đưa AI vào trải nghiệm mua sắm',
        '',
        'https://hpt.vn/tin-tuc/hpt-saigon-coop/16031',
      ),
    ).toBe(false);

    // Must block Bing fuzzy-match noise where only FPT is mentioned without HPT
    expect(
      isAuthenticHptMention(
        'Cổ phiếu FPT tiếp tục thủng đáy, giảm gần 60% từ đỉnh',
        '',
        'https://cafef.vn/fpt.chn',
      ),
    ).toBe(false);

    // Must block acronym collisions
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

    // Must accept independent bidding, tax code 0301447436, IT trade press & partner news
    expect(
      isAuthenticHptMention(
        'HPT trúng nhiều gói thầu công nghệ giá trị lớn tại Vietcombank',
        '',
        'https://baodauthau.vn/hpt-trung-goi-thau.html',
      ),
    ).toBe(true);

    expect(
      isAuthenticHptMention(
        'Thông báo kết quả lựa chọn nhà thầu của MST 0301447436 gói hạ tầng lưu trữ',
        '',
        'https://muasamcong.mpi.gov.vn/web/guest',
      ),
    ).toBe(true);
  });

  it('classifies Bidding/Procurement (won vs lost) and IT Trade Press / Associations (VINASA, VNISA, Microsoft, IBM)', () => {
    const lostBid = classifyHptExternalItem(
      'Sun Việt thắng HPT trong cuộc đua giành gói thầu công nghệ 143 tỷ đồng của BIDV',
      'Báo Đấu thầu',
      'https://baodauthau.vn/post1.html',
    );
    expect(lostBid.category).toBe('bidding_project');
    expect(lostBid.badge).toBe('ĐẤU THẦU · DỰ ÁN');
    expect(lostBid.sentiment).toBe('negative');

    const wonBid = classifyHptExternalItem(
      'HPT trúng nhiều gói thầu công nghệ giá trị lớn tại Vietcombank',
      'Báo Đấu thầu',
      'https://baodauthau.vn/post2.html',
    );
    expect(wonBid.category).toBe('bidding_project');
    expect(wonBid.sentiment).toBe('positive');

    const partnerNews = classifyHptExternalItem(
      'HPT đạt danh hiệu Microsoft Frontier Partner, khẳng định năng lực tiên phong về AI',
      'VnEconomy',
      'https://vneconomy.vn/hpt-microsoft.htm',
    );
    expect(partnerNews.category).toBe('it_press_partner');
    expect(partnerNews.sentiment).toBe('positive');
  });

  it('normalizes Simplize HPT valuation ratios (P/E, P/B, Market Cap, Free-float, Ceiling/Floor) & BaoMoi search HTML', () => {
    const fund = normalizeSimplizeHptSummary({
      data: {
        peRatio: 3.98,
        pbRatio: 0.88,
        marketCap: 253617189000,
        freeFloatRate: 47.05,
        dividendYieldCurrent: 2.04,
        pricePctChgYtd: 20.89,
        pricePctChg1y: 14.15,
        priceCeiling: 28100,
        priceFloor: 20900,
        priceReferrance: 24500,
        taSignal1d: 'bullish',
      },
    });
    expect(fund).not.toBeUndefined();
    expect(fund?.taxCode).toBe('0301447436');
    expect(fund?.peRatio).toBe(3.98);
    expect(fund?.pbRatio).toBe(0.88);
    expect(fund?.marketCapBillionVnd).toBe(253.6);
    expect(fund?.ceilingThousandVnd).toBe(28.1);

    const bmHtml = `
      <a href="/cong-nghe-tin-hoc-hpt-chia-co-tuc-15-c56296119.epi" title="Công nghệ Tin học HPT chốt trả cổ tức tỷ lệ 15%">Link</a>
      <a href="/co-phieu-fpt-giam-c56296120.epi" title="Cổ phiếu FPT giảm mạnh">Link</a>
    `;
    const bmItems = parseBaoMoiHptSearchHtml(bmHtml, 1700000000000);
    expect(bmItems.length).toBe(1);
    expect(bmItems[0].source).toBe('Báo Mới');
    expect(bmItems[0].url).toContain('https://baomoi.com/');
  });

  it('parses Groq AI verification + sentiment batch and drops non-HPT false positives', () => {
    const rawGroq = [
      '0|YES|POSITIVE|HPT chốt quyền chia cổ tức năm 2025 bằng cổ phiếu, củng cố vốn điều lệ.',
      '1|NO|NEUTRAL|Bài viết nói về bệnh cao huyết áp, không liên quan Công ty HPT.',
    ].join('\n');

    const parsed = parseGroqHptSentimentBatch(rawGroq);
    expect(parsed.get(0)?.isHpt).toBe(true);
    expect(parsed.get(0)?.sentiment).toBe('positive');
    expect(parsed.get(1)?.isHpt).toBe(false);
  });
});
