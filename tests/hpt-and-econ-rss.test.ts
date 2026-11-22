import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  classifyHptExternalItem,
  isAuthenticHptMention,
  normalizeSimplizeHptSummary,
  parseBaoMoiHptSearchHtml,
  parseCafeFHptDisclosuresHtml,
  parseGroqHptSentimentBatch,
  parseRedditHptSearchJson,
  parseTelegramPublicChannelHtml,
} from '../server/collectors/hpt-company-intel';
import { CURATED_RSS_FEEDS } from '../server/collectors/polymarket-news';
import { TelegramAlertEngine } from '../server/lib/telegram-alerter';

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strictly blocks recruitment/job-posting domains and hiring ads while accepting HSOC & custom HPT keywords', () => {
    // Must reject job boards (TopCV, ITviec, VietnamWorks, LinkedIn Jobs, Glints, etc.)
    expect(
      isAuthenticHptMention(
        'Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT',
        'Kỹ sư An toàn thông tin SOC',
        'https://www.topcv.vn/cong-ty/cong-ty-cp-dich-vu-cong-nghe-tin-hoc-hpt/12345.html',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'HPT Cyber Security reviews & jobs',
        'An ninh mạng SOC',
        'https://itviec.com/companies/hpt-vietnam',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Công nghệ Tin học HPT tuyển dụng gấp Chuyên viên Tích hợp hệ thống',
        '',
        'https://voz.vn/t/tuyen-dung-hpt.999999/',
      ),
    ).toBe(false);

    // Must accept non-recruitment HSOC / HPT Cyber Security / custom keyword mentions on forums & social
    expect(
      isAuthenticHptMention(
        'Trung tâm giám sát an toàn thông tin HSOC của HPT vừa công bố báo cáo mã độc mới',
        '',
        'https://tinhte.vn/thread/hsoc-bao-cao.12345/',
      ),
    ).toBe(true);
    expect(
      isAuthenticHptMention(
        'Đánh giá giải pháp HPT SmartNOC triển khai cho khối ngân hàng',
        '',
        'https://voz.vn/t/danh-gia-smartnoc.888888/',
        ['HPT SmartNOC'],
      ),
    ).toBe(true);
  });

  it('parses Reddit JSON, Public Telegram Channel HTML (t.me/s/...), and persists custom RSSHub/Telegram watch config', () => {
    const redditItems = parseRedditHptSearchJson(
      {
        data: {
          children: [
            {
              data: {
                id: 'abc123',
                subreddit: 'vozforums',
                title: 'Bàn về sự cố dịch vụ tích hợp hệ thống của Công nghệ Tin học HPT tuần này',
                selftext: 'Có bác nào đang dùng dịch vụ bảo mật HSOC bên HPT bị gián đoạn không?',
                permalink: '/r/vozforums/comments/abc123/ban_ve_su_co_hpt/',
                created_utc: 1795350000,
              },
            },
            {
              data: {
                id: 'job999',
                subreddit: 'VietNam',
                title: 'Công nghệ Tin học HPT tuyển dụng Senior SOC Analyst tại Quận 9',
                selftext: 'Ứng tuyển ngay',
                permalink: '/r/VietNam/comments/job999/hpt_tuyen_dung/',
                created_utc: 1795350100,
              },
            },
          ],
        },
      },
      1795351000000,
    );

    expect(redditItems.length).toBe(1);
    expect(redditItems[0].source).toBe('Reddit · r/vozforums');
    expect(redditItems[0].sentiment).toBe('negative');
    expect(redditItems[0].url).toContain('reddit.com/r/vozforums/comments/abc123');

    const tgHtml = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="f319channel/4521">
          <div class="tgme_widget_message_text">Cổ phiếu HPT (Công nghệ Tin học HPT) vừa ký hợp đồng an toàn thông tin lớn với khối ngân hàng.</div>
          <a class="tgme_widget_message_date" href="https://t.me/f319channel/4521"><time datetime="2026-11-22T11:30:00+00:00"></time></a>
        </div>
      </div>
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="f319channel/4522">
          <div class="tgme_widget_message_text">Tin tức thị trường chung không liên quan</div>
          <a class="tgme_widget_message_date" href="https://t.me/f319channel/4522"><time datetime="2026-11-22T12:00:00+00:00"></time></a>
        </div>
      </div>
    `;
    const tgItems = parseTelegramPublicChannelHtml(tgHtml, 'f319channel', 1795351000000);
    expect(tgItems.length).toBe(1);
    expect(tgItems[0].url).toBe('https://t.me/f319channel/4521');
    expect(tgItems[0].source).toBe('Telegram · @f319channel');
    expect(tgItems[0].sentiment).toBe('positive');
  });

  it('runs headless TelegramAlertEngine exclusively for HPT articles and flags NEGATIVE HPT articles with RED alert', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wm-tg-hpt-only-'));
    try {
      const sentTexts: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        if (init?.body) {
          const parsed = JSON.parse(String(init.body)) as { text?: string };
          if (parsed.text) sentTexts.push(parsed.text);
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const store = new SnapshotStore(tempDir);
      const tg = new TelegramAlertEngine(tempDir, {
        botToken: '123456789:AAHtesttoken1234',
        chatId: '999999999',
      });

      // First pass seeds baseline without sending old items
      store.set('hpt-intel', { stock: null, items: [], sourceCount: 1, aiSentimentEnabled: false, updatedAt: 1 }, 60_000, 0);
      await tg.evaluateCollectorUpdate('hpt-intel', store);
      expect(sentTexts.length).toBe(0);

      // Non-HPT collectors must be ignored completely
      await tg.evaluateCollectorUpdate('markets-crypto', store);
      await tg.evaluateCollectorUpdate('vietnam-env', store);
      expect(sentTexts.length).toBe(0);

      // New HPT forum/press posts (both press_social & negative sentiment) MUST trigger immediate Telegram alerts!
      store.set(
        'hpt-intel',
        {
          stock: null,
          sourceCount: 3,
          aiSentimentEnabled: true,
          updatedAt: 3,
          items: [
            {
              id: 'hpt-neg-1',
              title: 'Cảnh báo sự cố gián đoạn dịch vụ tích hợp của Công nghệ Tin học HPT trên diễn đàn',
              category: 'press_social',
              badge: 'REDDIT · DIỄN ĐÀN',
              source: 'Reddit · r/vozforums',
              publishedAt: 3,
              url: 'https://www.reddit.com/r/vozforums/comments/abc123/',
              sentiment: 'negative',
              aiSummary: 'Thảo luận phản ánh sự cố kỹ thuật cần kiểm tra xác minh ngay.',
            },
            {
              id: 'hpt-pos-2',
              title: 'Công nghệ Tin học HPT nhận giải thưởng chuyển đổi số năm 2026',
              category: 'press_social',
              badge: 'YOUTUBE · BÁO CHÍ',
              source: 'YouTube · VTV',
              publishedAt: 3,
              url: 'https://www.youtube.com/watch?v=xyz987',
              sentiment: 'positive',
            },
          ],
        },
        60_000,
        2,
      );

      await tg.evaluateCollectorUpdate('hpt-intel', store);
      expect(sentTexts.length).toBe(2);
      expect(sentTexts[0]).toContain('CẢNH BÁO ĐỎ');
      expect(sentTexts[0]).toContain('TIÊU CỰC');
      expect(sentTexts[1]).toContain('Công nghệ Tin học HPT nhận giải thưởng');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
