import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  HPT_EXTERNAL_FEEDS,
  canonicalizeHptUrl,
  classifyHptExternalItem,
  deduplicateHptItems,
  fetchHptCompanyIntelligence,
  isAuthenticHptMention,
  isHptSelfSocialPost,
  normalizeSimplizeHptSummary,
  parseBaoMoiHptSearchHtml,
  parseCafeFHptDisclosuresHtml,
  parseGoogleCseHptSearchJson,
  parseGroqHptSentimentBatch,
  parseHptExternalRss,
  parseMetaPageMentionsJson,
  parseRedditHptSearchJson,
  parseSearxngHptSearchJson,
  parseSerperHptSearchJson,
  parseTelegramPublicChannelHtml,
  resolveSearxngBaseUrl,
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

  it('badges public Facebook/LinkedIn/TikTok mentions, filters LinkedIn job titles behind wrapper URLs, and parses Google CSE & Meta Page mentions', () => {
    // Must reject LinkedIn job-title pattern even when URL is wrapped by news.google.com
    expect(
      isAuthenticHptMention(
        'SOC Analyst (Tier 2 / Tier 3) tại HPT Vietnam Corporation',
        'An ninh mạng SOC',
        'https://news.google.com/rss/articles/CBMiW0FVX3lxTE1',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        '[THÁI HÀ] HPT tìm kiếm nhân sự cho các vị trí: Business Analyst, Java Dev Backend',
        'Kỹ sư An toàn thông tin',
        'https://news.google.com/rss/articles/CBMiRecruit2',
        [],
        'Facebook',
      ),
    ).toBe(false);

    // Public Facebook post indexed via RSS gets FACEBOOK · CÔNG KHAI badge
    const fbClass = classifyHptExternalItem(
      'Chủ tịch HĐQT Công nghệ Tin học HPT chia sẻ về chuyển đổi số',
      'Facebook',
      'https://news.google.com/rss/articles/CBMiFB123',
      'press_social',
    );
    expect(fbClass.badge).toBe('FACEBOOK · CÔNG KHAI');

    // Google CSE free-tier parser extracts authentic Facebook/LinkedIn mentions and blocks hpt.vn / job ads
    const cseItems = parseGoogleCseHptSearchJson(
      {
        items: [
          {
            title: 'Khách hàng ngân hàng đánh giá dịch vụ bảo mật HSOC của Công nghệ Tin học HPT',
            link: 'https://www.facebook.com/groups/chungkhoanvn/posts/123456789/',
            snippet: 'Triển khai trung tâm giám sát an toàn thông tin HSOC vận hành tốt.',
            displayLink: 'www.facebook.com',
          },
          {
            title: 'Senior System Engineer tại HPT Vietnam Corporation',
            link: 'https://vn.linkedin.com/posts/hpt-job-123',
            snippet: 'Mô tả công việc kỹ sư hệ thống',
            displayLink: 'vn.linkedin.com',
          },
        ],
      },
      1795352000000,
    );
    expect(cseItems).toHaveLength(1);
    expect(cseItems[0].badge).toBe('FACEBOOK · CÔNG KHAI');
    expect(cseItems[0].source).toBe('Facebook (Google Index)');

    // Meta Graph API parser ignores HPT's own self-posts and keeps external visitor/tagged mentions
    const metaItems = parseMetaPageMentionsJson(
      {
        data: [
          {
            id: '999_111',
            message: 'Bài tự đăng quảng bá nội bộ của Fanpage HPT',
            created_time: '2026-11-22T09:00:00+0000',
            permalink_url: 'https://www.facebook.com/HPTVietnam/posts/111',
            from: { id: '999', name: 'HPT Vietnam' },
          },
          {
            id: '999_222',
            message: 'Cảm ơn đội ngũ HPT Cyber Security đã hỗ trợ xử lý sự cố bảo mật kịp thời trong đêm!',
            created_time: '2026-11-22T10:00:00+0000',
            permalink_url: 'https://www.facebook.com/user123/posts/222',
            from: { id: '777', name: 'Nguyễn Văn A' },
          },
        ],
      },
      '999',
      1795352000000,
    );
    expect(metaItems).toHaveLength(1);
    expect(metaItems[0].badge).toBe('FACEBOOK · TAG FANPAGE');
    expect(metaItems[0].source).toBe('Facebook · Nguyễn Văn A');
  });

  it('excludes self-authored HPT posts across Facebook, linkedin.com/posts, linkedin.com/pulse, threads.net, and tiktok.com while keeping third-party mentions', () => {
    // 1. Upstream RSS feed queries must contain -site: exclusions for official HPT accounts while staying concise
    const fbFeed = HPT_EXTERNAL_FEEDS.find((f) => f.name.startsWith('Facebook'));
    expect(fbFeed?.url).toContain('-site:facebook.com/HPTVietnamCorp');
    expect(fbFeed?.url).toContain('-site:facebook.com/LifeAtHPT');

    // 2. Direct URLs of self-posts by HPT on all 5 surfaces MUST be rejected
    expect(
      isAuthenticHptMention(
        'Lễ ký kết hợp tác chuyển đổi số ngân hàng cùng Công nghệ Tin học HPT',
        '',
        'https://www.facebook.com/HPTVietnamCorp/posts/pfbid02xyz123',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Hoạt động văn hóa doanh nghiệp công nghệ tại HPT',
        '',
        'https://m.facebook.com/LifeAtHPT/posts/99887766',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Báo cáo an toàn thông tin quý IV từ trung tâm giám sát HSOC của HPT',
        '',
        'https://www.linkedin.com/posts/hpt-vietnam-corporation_an-toan-thong-tin-hsoc-activity-726111222333-abcd',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Xu hướng bảo mật điện toán đám mây năm 2026 cho ngành tài chính ngân hàng',
        'Công nghệ Tin học HPT',
        'https://www.linkedin.com/pulse/xu-huong-bao-mat-2026-hpt-vietnam-corporation-x9k2f',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Chia sẻ giải pháp tích hợp hệ thống AI cho doanh nghiệp của HPT',
        '',
        'https://www.threads.net/@hptvietnamcorp/post/DBxyz123',
      ),
    ).toBe(false);
    expect(
      isAuthenticHptMention(
        'Khám phá trung tâm điều hành an ninh mạng HSOC của Công nghệ Tin học HPT',
        '',
        'https://www.tiktok.com/@hptvietnamcorp/video/7431234567890123456',
      ),
    ).toBe(false);

    // 3. Wrapped Google News RSS items (news.google.com/rss/articles/...) authored by HPT on FB/LinkedIn/Threads/TikTok MUST be rejected
    const sampleRssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <item>
          <title>HPT Vietnam Corporation (@HPTVietnamCorp) - Videos - Facebook</title>
          <link>https://news.google.com/rss/articles/CBMiSelfFbPage1</link>
          <description>Trang video chính thức của Công nghệ Tin học HPT</description>
          <source url="https://www.facebook.com">Facebook</source>
        </item>
        <item>
          <title>HPT Vietnam Corporation on LinkedIn: Giải pháp bảo mật HSOC thế hệ mới - LinkedIn</title>
          <link>https://news.google.com/rss/articles/CBMiSelfLiPost2</link>
          <description>Trung tâm an ninh mạng HPT Cyber Security</description>
          <source url="https://www.linkedin.com">LinkedIn</source>
        </item>
        <item>
          <title>Xu hướng An toàn thông tin 2026 | HPT Vietnam Corporation - LinkedIn</title>
          <link>https://news.google.com/rss/articles/CBMiSelfLiPulse3</link>
          <description>Bài viết chuyên sâu về an toàn thông tin ngân hàng của HPT</description>
          <source url="https://www.linkedin.com">LinkedIn</source>
        </item>
        <item>
          <title>Một ngày tại trung tâm SOC | HPT Vietnam Corporation (@hptvietnamcorp) - TikTok</title>
          <link>https://news.google.com/rss/articles/CBMiSelfTt4</link>
          <description>An ninh mạng Công nghệ Tin học HPT</description>
          <source url="https://www.tiktok.com">TikTok</source>
        </item>
        <item>
          <title>UIT và Công nghệ Tin học HPT ký kết hợp tác đào tạo nhân lực an toàn thông tin - Facebook</title>
          <link>https://news.google.com/rss/articles/CBMiExternalUitFb5</link>
          <description>Trường Đại học Công nghệ Thông tin ĐHQG-HCM phối hợp cùng HPT</description>
          <source url="https://www.facebook.com">Facebook</source>
        </item>
      </channel></rss>`;

    const parsedRss = parseHptExternalRss(
      sampleRssXml,
      { name: 'Social Test', defaultCategory: 'press_social', url: 'https://example.com/rss' },
      1795353000000,
    );
    expect(parsedRss).toHaveLength(1);
    expect(parsedRss[0].url).toContain('CBMiExternalUitFb5');
    expect(parsedRss[0].badge).toBe('FACEBOOK · CÔNG KHAI');

    // 4. Genuine third-party posts on linkedin.com/posts, linkedin.com/pulse, threads.net, tiktok.com, and facebook.com MUST be kept
    expect(
      isAuthenticHptMention(
        'Nguyen Van A on LinkedIn: Đánh giá cao năng lực triển khai bảo mật HSOC của Công nghệ Tin học HPT',
        '',
        'https://www.linkedin.com/posts/nguyen-van-a-998877_cong-nghe-tin-hoc-hpt-hsoc-activity-726000111222-xyzw',
        [],
        'LinkedIn',
      ),
    ).toBe(true);
    expect(
      isAuthenticHptMention(
        'Phân tích cổ phiếu Công nghệ Tin học HPT năm 2026 | Trần Minh Quân',
        'Cổ tức 15% trên sàn UPCoM',
        'https://www.linkedin.com/pulse/phan-tich-co-phieu-cong-nghe-tin-hoc-hpt-nam-2026-tran-minh-quan-a1b2c',
        [],
        'LinkedIn',
      ),
    ).toBe(true);
    expect(
      isAuthenticHptMention(
        'Cổ phiếu HPT (Công nghệ Tin học HPT) vừa chốt quyền trả cổ tức tỷ lệ 15%',
        '',
        'https://www.threads.net/@nhadautu_upcom/post/DC12345',
        [],
        'Threads',
      ),
    ).toBe(true);
    expect(
      isAuthenticHptMention(
        'Đánh giá báo cáo tài chính cổ phiếu HPT của Công nghệ Tin học HPT quý này',
        '',
        'https://www.tiktok.com/@chungkhoan_official/video/743555666777888',
        [],
        'TikTok',
      ),
    ).toBe(true);

    // 5. Sister fanpage self-post via Meta Graph API (e.g. "Life at HPT" tagging main page) & legacy URL-encoded /pages/...HPT/<id> MUST be dropped
    expect(
      isHptSelfSocialPost(
        'https://www.facebook.com/pages/Cty%20c%E1%BB%95%20ph%E1%BA%A7n%20C%C3%B4ng%20ngh%E1%BB%87%20Tin%20H%E1%BB%8Dc%20HPT/151329082327557/',
        'Cty cổ phần Công nghệ Tin Học HPT - Facebook',
      ),
    ).toBe(true);
    expect(
      isHptSelfSocialPost('https://www.facebook.com/LifeAtHPT/posts/555', 'Sự kiện nội bộ', '', 'Life at HPT'),
    ).toBe(true);
    const sisterMeta = parseMetaPageMentionsJson(
      {
        data: [
          {
            id: '888_555',
            message: 'Hoạt động nội bộ cuối năm cùng đại gia đình Công nghệ Tin học HPT',
            created_time: '2026-11-22T12:00:00+0000',
            permalink_url: 'https://www.facebook.com/LifeAtHPT/posts/555',
            from: { id: '888', name: 'Life at HPT' },
          },
        ],
      },
      '999',
      1795353000000,
    );
    expect(sisterMeta).toHaveLength(0);
  });

  it('parses local SearXNG ?format=json metasearch results, keeps direct third-party links, drops HPT self-posts, and handles dates honestly', () => {
    expect(resolveSearxngBaseUrl(undefined)).toBe('http://127.0.0.1:8888');
    expect(resolveSearxngBaseUrl('http://localhost:8888/')).toBe('http://localhost:8888');
    expect(resolveSearxngBaseUrl('off')).toBeNull();
    expect(resolveSearxngBaseUrl('ftp://invalid.local')).toBeNull();

    const fallbackNow = Date.parse('2026-11-23T02:00:00+07:00');
    const items = parseSearxngHptSearchJson(
      {
        query: 'HPT',
        results: [
          {
            // Should be DROPPED: HPT's own Facebook page direct URL
            title: 'HPT Vietnam Corporation đón nhận giải thưởng chuyển đổi số',
            url: 'https://www.facebook.com/HPTVietnamCorp/posts/pfbid02selfpost',
            content: '2 giờ trước — Sự kiện tại TP.HCM',
            engines: ['google', 'brave'],
          },
          {
            // Should be DROPPED: HPT's own LinkedIn /posts/ URL
            title: 'Báo cáo an toàn thông tin từ HSOC',
            url: 'https://www.linkedin.com/posts/hpt-vietnam-corporation_hsoc-security-activity-12345',
            content: '1 ngày trước — Trung tâm giám sát an ninh mạng',
            engines: ['bing'],
          },
          {
            // Should be DROPPED: Malformed triple-slash redirect URL ("http:///go/v1/...") & foreign non-VN HSOC page
            title: 'HSOC Cyber (@hsoccyber) - Security',
            url: 'https://www.facebook.com/hsoccyber/',
            content: 'Global cyber page',
            engines: ['google'],
          },
          {
            title: 'Ngô Vi Đồng - Chủ tịch HĐQT HPT',
            url: 'http:///go/v1/AdoeaW_broken_brave_redirect',
            content: 'Công nghệ Tin học HPT',
            engines: ['brave'],
          },
          {
            // Should be DROPPED: Unrelated person profile, unrelated company PDF, or tangential quote lacking HPT in title/URL
            title: 'Trương Gia Bình - FireAnt',
            url: 'https://fireant.vn/ca-nhan/truong-gia-binh/674',
            content: 'Danh sách doanh nhân liên quan Công nghệ Tin học HPT',
            engines: ['google cse'],
          },
          {
            title: 'CÔNG TY CỔ PHẦN CHỨNG KHOÁN SSI - 24HMoney',
            url: 'https://cdn.24hmoney.vn/upload/file/2025-2/2025-04-18/no-name-1744935654.pdf',
            content: 'Bảng danh mục cổ phiếu có HPT',
            engines: ['google cse'],
          },
          {
            title: 'Giá cổ phiếu CTCP Dịch vụ Công nghệ Tin học HPT hôm nay - FireAnt',
            url: 'https://fireant.vn/ma-chung-khoan/HPT',
            content: 'Bảng giá tĩnh cổ phiếu HPT',
            engines: ['brave'],
          },
          {
            // Should be DROPPED: Namesake machinery company hptvietnam.vn & HPT sub-product Fanpage Hpt.RPAsolution
            title: 'HPT Việt Nam ra mắt showroom AI và tự động hóa',
            url: 'https://www.facebook.com/hptvietnam.vn/posts/1566191502196356/',
            content: 'Máy dò kim loại và AI X-Ray cho nông sản',
            engines: ['google'],
          },
          {
            title: 'Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT - HPT RPA Solution',
            url: 'https://www.facebook.com/Hpt.RPAsolution/posts/701379755328770/',
            content: 'Đối tác chuyển đổi số của bạn',
            engines: ['duckduckgo'],
          },
          {
            // Should be KEPT: Third-party Facebook group post with Vietnamese relative timestamp
            title: 'Đánh giá dịch vụ tích hợp hệ thống của Công nghệ Tin học HPT cho ngân hàng',
            url: 'https://www.facebook.com/groups/cnttvietnam/posts/987654321/',
            content: '3 giờ trước — Anh em trong ngành đánh giá thế nào về đội triển khai bảo mật HSOC của HPT?',
            engines: ['google', 'duckduckgo'],
          },
          {
            // Should be KEPT: Third-party F319 stock forum thread with undated archival fallback
            title: 'Phân tích cổ phiếu HPT (Công nghệ Tin học HPT) trả cổ tức 15%',
            url: 'https://f319.com/threads/phan-tich-co-phieu-hpt-upcom.1899999/',
            content: 'Báo cáo tài chính kiểm toán cho thấy lợi nhuận vượt kế hoạch.',
            engines: ['brave'],
          },
        ],
      },
      fallbackNow,
    );

    expect(items).toHaveLength(2);
    expect(items[0].url).toBe('https://www.facebook.com/groups/cnttvietnam/posts/987654321/');
    expect(items[0].badge).toBe('FACEBOOK · CÔNG KHAI');
    expect(items[0].source).toBe('Facebook (SearXNG · google+duckduckgo)');
    expect(items[0].publishedAt).toBe(fallbackNow - 3 * 3_600_000);

    expect(items[1].url).toBe('https://f319.com/threads/phan-tich-co-phieu-hpt-upcom.1899999/');
    expect(items[1].source).toBe('f319.com (SearXNG · brave)');
    expect(items[1].dateLabel).toBe('Không rõ ngày');
    expect(items[1].publishedAt).toBe(fallbackNow - 30 * 86_400_000);

    // Serper.dev Google SERP JSON parser keeps authentic external mentions and drops self-posts / static quotes
    const serperItems = parseSerperHptSearchJson(
      {
        organic: [
          {
            title: 'HPT Vietnam Corporation công bố giải thưởng mới',
            link: 'https://www.facebook.com/HPTVietnamCorp/posts/999888777',
            snippet: 'Bài tự đăng từ Fanpage chính thức của HPT',
            date: '2 giờ trước',
          },
          {
            title: "HPT Vietnam Corporation's Post",
            link: 'https://www.google.com/goto?url=CAEStQEBxCJF17furFbs923',
            snippet: 'Google Knowledge Panel self-post card của Công nghệ Tin học HPT',
            date: '1 ngày trước',
          },
          {
            title: 'UIT và HPT tăng cường hợp tác đào tạo nhân lực an toàn thông tin',
            link: 'https://www.facebook.com/UIT.Fanpage/posts/1515918327240833/',
            snippet: 'Trường ĐH CNTT ĐHQG-HCM ký kết cùng Công nghệ Tin học HPT.',
            date: '4 giờ trước',
          },
          {
            title: 'Nguyen Minh on LinkedIn: Trải nghiệm triển khai giải pháp bảo mật cùng Công nghệ Tin học HPT',
            link: 'https://www.linkedin.com/posts/nguyen-minh-123_cong-nghe-tin-hoc-hpt-activity-726999',
            snippet: 'Đội ngũ kỹ sư an ninh mạng SOC hỗ trợ rất sát sao.',
            date: '10 thg 11, 2026',
          },
        ],
      },
      fallbackNow,
    );
    expect(serperItems).toHaveLength(2);
    expect(serperItems[0].badge).toBe('FACEBOOK · CÔNG KHAI');
    expect(serperItems[0].source).toBe('Facebook (Serper Google)');
    expect(serperItems[0].publishedAt).toBe(fallbackNow - 4 * 3_600_000);
    expect(serperItems[1].badge).toBe('LINKEDIN · MẠNG XÃ HỘI');
    expect(serperItems[1].source).toBe('LinkedIn (Serper Google)');
    expect(serperItems[1].dateLabel).toBe('10/11/2026');
  });

  it('deduplicates overlapping HPT items across Google News RSS, Serper, SearXNG, FireAnt & CafeF and blocks duplicate Telegram alerts when source ID changes', async () => {
    // 1. Canonical URL normalization collapses m./www., tracking params, FireAnt /binh-luan, and Facebook slug vs numeric ID
    expect(
      canonicalizeHptUrl('https://m.facebook.com/UIT.Fanpage/posts/uit-va-hpt-hop-tac/1515918327240833/?mibextid=abc'),
    ).toBe('fb:page:uit.fanpage:1515918327240833');
    expect(
      canonicalizeHptUrl('https://www.facebook.com/UIT.Fanpage/posts/1515918327240833'),
    ).toBe('fb:page:uit.fanpage:1515918327240833');
    expect(
      canonicalizeHptUrl('https://fireant.vn/bai-viet/hpt-tra-co-tuc/42138090/binh-luan?utm_source=x'),
    ).toBe('fireant.vn/bai-viet/hpt-tra-co-tuc/42138090');

    // 2. Cross-source story deduplication merges Google RSS full title + Serper direct Facebook video URL (matched via decoded URL slug!)
    const merged = deduplicateHptItems([
      {
        id: 'hpt-ext:https://news.google.com/rss/articles/CBMiWrappedHtv1',
        title:
          'HTV - Đài truyền hình TP.HCM. . 30 NĂM LÀM DOANH NGHIỆP, ĐỌC SÁCH LUÔN LÀ MỘT TIÊU CHÍ VĂN HÓA CỦA HPT. Theo ông Ngô Vi Đồng',
        category: 'press_social',
        badge: 'FACEBOOK · CÔNG KHAI',
        source: 'Facebook',
        publishedAt: 1795300000000,
        url: 'https://news.google.com/rss/articles/CBMiWrappedHtv1',
        sentiment: 'positive',
      },
      {
        id: 'hpt-sp:https://www.facebook.com/htv.hcm/videos/1109490385373907',
        title: 'Chủ tịch HĐQT Công ty CP Dịch vụ Công nghệ tin học HPT ...',
        category: 'press_social',
        badge: 'FACEBOOK · CÔNG KHAI',
        source: 'Facebook (Serper Google)',
        publishedAt: 1795200000000,
        dateLabel: 'Không rõ ngày',
        url: 'https://www.facebook.com/htv.hcm/videos/30-n%C4%83m-l%C3%A0m-doanh-nghi%E1%BB%87p-%C4%91%E1%BB%8Dc-s%C3%A1ch-lu%C3%B4n-l%C3%A0-m%E1%BB%99t-ti%C3%AAu-ch%C3%AD-v%C4%83n-h%C3%B3a-c%E1%BB%A7a-hpttheo-%C3%B4ng-ng/1109490385373907/',
        sentiment: 'positive',
      },
      {
        id: 'hpt-sx:https://www.facebook.com/UIT.Fanpage/posts/1515918327240833',
        title: 'UIT VÀ HPT TĂNG CƯỜNG HỢP TÁC, CÙNG KIẾN TẠO THẾ HỆ ...',
        category: 'press_social',
        badge: 'FACEBOOK · CÔNG KHAI',
        source: 'Facebook (SearXNG · google)',
        publishedAt: 1795290000000,
        url: 'https://www.facebook.com/UIT.Fanpage/posts/1515918327240833/',
        sentiment: 'positive',
      },
      {
        id: 'hpt-sp:https://m.facebook.com/UIT.Fanpage/posts/slug/1515918327240833',
        title: '🤝 UIT VÀ HPT TĂNG CƯỜNG HỢP TÁC, CÙNG KIẾN TẠO THẾ HỆ NHÂN LỰC CÔNG NGHỆ CHẤT LƯỢNG CAO',
        category: 'press_social',
        badge: 'FACEBOOK · CÔNG KHAI',
        source: 'Facebook (Serper Google)',
        publishedAt: 1795290000000,
        url: 'https://m.facebook.com/UIT.Fanpage/posts/uit-va-hpt/1515918327240833/?fbclid=IwAR123',
        sentiment: 'positive',
      },
    ]);

    expect(merged).toHaveLength(2);
    // HTV item keeps full untruncated title from RSS AND direct unwrapped Facebook URL from Serper!
    expect(merged[0].title).toContain('30 NĂM LÀM DOANH NGHIỆP, ĐỌC SÁCH LUÔN LÀ MỘT TIÊU CHÍ VĂN HÓA CỦA HPT');
    expect(merged[0].url).toContain('https://www.facebook.com/htv.hcm/videos/');
    expect(merged[0].publishedAt).toBe(1795300000000);
    // UIT item collapses SearXNG + Serper mobile URL into 1 card with full title
    expect(merged[1].title).toContain('NHÂN LỰC CÔNG NGHỆ CHẤT LƯỢNG CAO');

    // 3. TelegramAlertEngine does NOT send a 2nd alert when the same story switches from Google RSS ID to Serper direct URL ID
    const tempDir = mkdtempSync(join(tmpdir(), 'wm-tg-dedup-'));
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

      store.set('hpt-intel', { stock: null, items: [], sourceCount: 1, aiSentimentEnabled: false, updatedAt: 10 }, 60_000, 0);
      await tg.evaluateCollectorUpdate('hpt-intel', store);

      // First tick: story arrives via Google News RSS wrapper URL
      store.set(
        'hpt-intel',
        {
          stock: null,
          sourceCount: 2,
          aiSentimentEnabled: false,
          updatedAt: 100,
          items: [
            {
              id: 'hpt-ext:https://news.google.com/rss/articles/CBMiStory1',
              title: 'Agribank và Công nghệ Tin học HPT ký kết hợp tác triển khai quản lý rủi ro',
              category: 'it_press_partner',
              badge: 'BÁO CHUYÊN NGÀNH CNTT',
              source: 'Agribank',
              publishedAt: 95,
              url: 'https://news.google.com/rss/articles/CBMiStory1',
              sentiment: 'positive',
            },
          ],
        },
        60_000,
        1,
      );
      await tg.evaluateCollectorUpdate('hpt-intel', store);
      expect(sentTexts).toHaveLength(1);

      // Second tick: exact same story upgraded to Serper direct URL (`id` changed from `hpt-ext:...` to `hpt-sp:...`)
      store.set(
        'hpt-intel',
        {
          stock: null,
          sourceCount: 3,
          aiSentimentEnabled: false,
          updatedAt: 200,
          items: [
            {
              id: 'hpt-sp:https://www.agribank.com.vn/vn/ve-agribank/tin-tuc/hpt-ky-ket',
              title: 'Agribank và Công nghệ Tin học HPT ký kết hợp tác triển khai quản lý rủi ro',
              category: 'it_press_partner',
              badge: 'BÁO CHUYÊN NGÀNH CNTT',
              source: 'agribank.com.vn (Serper Google)',
              publishedAt: 95,
              url: 'https://www.agribank.com.vn/vn/ve-agribank/tin-tuc/hpt-ky-ket',
              sentiment: 'positive',
            },
          ],
        },
        60_000,
        1,
      );
      await tg.evaluateCollectorUpdate('hpt-intel', store);
      // Must still be 1 — zero duplicate Telegram alert!
      expect(sentTexts).toHaveLength(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps financial filings for different quarters despite their common prefix', () => {
    const common = 'Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT công bố báo cáo tài chính ';
    const item = (quarter: number) => ({
      id: `filing-${quarter}`, title: `${common}quý ${quarter} năm 2026`,
      category: 'exchange_filing' as const, badge: 'CBTT', source: 'HNX',
      publishedAt: Date.now(), url: `https://example.com/${quarter}`, sentiment: 'neutral' as const,
    });
    expect(deduplicateHptItems([item(1), item(2)])).toHaveLength(2);
  });

  it('reports an outage instead of renewing a wholly retained HPT snapshot', async () => {
    for (const key of ['SERPER_API_KEY', 'GOOGLE_CSE_API_KEY', 'GOOGLE_CSE_CX', 'META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN', 'GROQ_API_KEY', 'GEMINI_API_KEY']) {
      vi.stubEnv(key, '');
    }
    vi.stubEnv('SEARXNG_BASE_URL', 'off');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const previous = {
      stock: null,
      items: [{ id: 'old', title: 'Tin HPT', category: 'press_social' as const, badge: 'B', source: 'S', publishedAt: 1, url: 'https://example.com/old', sentiment: 'neutral' as const }],
      sourceCount: 1, aiSentimentEnabled: false, updatedAt: 1,
    };
    try {
      await expect(fetchHptCompanyIntelligence(previous)).rejects.toThrow('sources failed');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
