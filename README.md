# World Monitor

Bảng theo dõi thời gian thực về địa chính trị, hàng hải, hàng không quân sự, an ninh mạng, chính sách pháp luật và vĩ mô tài chính, tập trung vào **Việt Nam, Biển Đông và ASEAN**.

Backend tự gọi thẳng các nguồn dữ liệu mở, không đi qua `worldmonitor.app` hay dịch vụ đám mây trung gian. **Chạy được ngay sau khi cài gói, không cần khóa API nào.** Khóa tùy chọn chỉ mở thêm tính năng.

## Điểm nổi bật

- **Bản đồ 2D/3D** với 15 lớp dữ liệu bật/tắt độc lập: máy bay quân sự, tàu AIS, động đất, thiên tai, xung đột, radar mưa, cáp quang biển và nhiều lớp nữa.
- **6 chuyên mục** ở khung bên phải: tình báo tổng hợp, AI và an ninh mạng, tin nóng, chính sách pháp luật, thị trường và vĩ mô, theo dõi riêng cổ phiếu HPT.
- **Chịu được nguồn lỗi:** mỗi nguồn có cache hai tầng (RAM và đĩa), nên trang mở lên luôn có dữ liệu. Dữ liệu cũ hoặc thiếu bị gắn nhãn hoặc loại khỏi điểm số, không bị thay bằng số giả định.
- **Một lệnh để chạy:** `npm run dev`. Không cần Docker, cơ sở dữ liệu hay dịch vụ đám mây.

## Chạy thử

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev
```

| Địa chỉ | Thành phần |
| :--- | :--- |
| `http://localhost:5173` | Giao diện web (React 19, Vite 6, Tailwind CSS v4, MapLibre GL v5) |
| `http://127.0.0.1:8787` | Backend API và bộ lập lịch thu thập dữ liệu (Hono) |

Muốn mở thêm luồng tàu AIS trực tiếp, tóm tắt bằng AI hoặc cảnh báo Telegram, tạo file cấu hình từ bản mẫu rồi điền khóa cần dùng:

```bash
cp .env.example .env
```

## Trong ứng dụng có gì

### Bản đồ

Chuyển trực tiếp giữa Mercator 2D và địa cầu 3D. Có sẵn các góc nhìn `Global`, `VN · Biển Đông`, `Trung Đông`, `Châu Âu`, `Đông Á`, `Châu Mỹ`; nút `GLIDE` nội suy vị trí tàu và máy bay theo hướng đang đi; có thêm lớp gió và sóng Windy và khung xem truyền hình trực tiếp. Mốc chủ quyền Hoàng Sa, Trường Sa luôn hiện trên bản đồ.

| Nhóm | Lớp dữ liệu | Nguồn |
| :--- | :--- | :--- |
| Quân sự và hàng hải | Máy bay quân sự, tàu AIS | `adsb.fi` / `adsb.lol` (tự chuyển dự phòng), `AISStream` khi có khóa |
| An ninh mạng | Máy chủ C2/APT, tuyến tấn công, nhiễu GPS và sự cố BGP | Nguồn mở về mối đe dọa, chỉ số NIC hàng không, RIPE |
| Thiên nhiên | Động đất, thiên tai và điểm nóng nhiệt, radar mưa | USGS, NASA EONET, GDACS, NOAA NHC, NASA FIRMS, RainViewer |
| Địa chính trị | Điểm nóng xung đột | GDELT |
| Dữ liệu tĩnh | Căn cứ quân sự và bãi phóng, trung tâm dữ liệu AI và đất hiếm, eo biển chiến lược, cơ sở hạt nhân, sàn chứng khoán và ngân hàng trung ương, cáp quang biển | Bộ dữ liệu trong `shared/registries/` |

### Khung bên phải

Chỉ tab đầu được tải khi mở trang; 5 tab còn lại nạp khi bạn bấm vào.

| Tab | Nội dung chính |
| :--- | :--- |
| **Live Intel** | Mức cảnh báo chung, bản tin tóm tắt bằng AI và khung hỏi đáp trên dữ liệu đang mở, trạng thái các khu vực nóng, thời tiết biển và chất lượng không khí Việt Nam, 5 hợp đồng Polymarket biến động mạnh nhất, Google Trends, từ khóa theo dõi, chỉ số bất ổn quốc gia |
| **AI & ML** | Trạng thái các nền tảng AI và Cloud lớn, GitHub Trending, tra cứu IP hoặc CVE (Shodan InternetDB, NVD, CISA KEV), lọc theo kỹ thuật MITRE ATT&CK |
| **Tin nóng** | Luồng tin gộp từ Wikimedia, GDELT, Hacker News, Reddit và báo chí trong nước lẫn quốc tế; dịch tự động tiêu đề sang tiếng Việt; bấm tin để bản đồ bay tới tọa độ sự kiện |
| **Chính sách** | Văn bản mới từ Cổng Thông tin Chính phủ, Công báo, Bộ Khoa học và Công nghệ, nhóm Nghị quyết 57, 59, 66, 68. Tóm tắt 3 ý bằng AI khi bạn yêu cầu |
| **Thị trường** | Sức khỏe vĩ mô Việt Nam và Mỹ, khẩu vị rủi ro và tỷ trọng mô phỏng, lịch sự kiện, tác động khi nghẽn eo biển, giá vàng SJC, rổ VN30, tỷ giá, lãi suất Mỹ, VIX, stablecoin và crypto theo thời gian thực |
| **HPT** | Theo dõi riêng Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT (UPCoM: `HPT`): giá và định giá, công bố thông tin, thông báo đấu thầu, tin tài chính, diễn đàn và mạng xã hội. Tự loại tin từ chính HPT và tin tuyển dụng, phân loại sắc thái, hiện chấm báo khi có tin mới trong 24 giờ |

## Dữ liệu và độ tin cậy

- **18 bộ thu thập** chạy theo chu kỳ từ 30 giây đến 6 giờ (xem `server/index.ts`). Nếu một lượt quét chưa xong thì lượt sau không chạy chồng.
- **Cache hai tầng:** đọc ghi trên RAM, ghi nguyên tử xuống `.cache/*.json`. Khi nguồn lỗi, hệ thống giữ lại bản trước đó và đánh dấu là cũ.
- **Thiếu hoặc quá cũ thì không bịa:** chỉ tiêu vĩ mô thiếu dữ liệu bị bỏ khỏi điểm số. Dữ liệu giữ lại quá 7 ngày không được dùng để chấm điểm. Kỳ quan sát cũ (FRED theo ngày, tuần, tháng, quý lần lượt 14, 30, 120, 240 ngày; World Bank hơn 3 năm) được cảnh báo rõ trên giao diện.
- **Số liệu thời gian thực** (giá crypto Binance, xác suất Polymarket, vị trí tàu, luồng tin) đẩy xuống trình duyệt qua SSE tại `/api/stream`.
- **Lịch gắn nhãn "Ước tính"** không phải ngày công bố đã xác nhận. Hãy đối chiếu lịch chính thức.

## Kiến trúc

```text
server/
  app.ts          Định tuyến Hono, kiểm tra bảo mật, giới hạn tần suất, SSE
  index.ts        Đăng ký 18 collector, luồng thời gian thực, khởi động HTTP
  cache/          Bộ lập lịch và kho lưu trữ RAM + .cache/*.json
  collectors/     Thu thập theo nguồn (markets/ và hpt/ là các module con)
  realtime/       SSE hub, WebSocket Binance và Polymarket, luồng tin hợp nhất
  lib/            AI Groq/Gemini, tra cứu IOC/CVE, sổ cái pha vĩ mô, dịch, Telegram
shared/
  macro/          Chấm điểm sức khỏe vĩ mô VN/Mỹ, khẩu vị rủi ro, phân bổ, kiểm tra độ tươi
  registries/     Dữ liệu tọa độ tĩnh
  intelligence.ts Chỉ số bất ổn quốc gia, trạng thái khu vực, từ khóa đột biến
  dead-reckoning.ts  Nội suy vị trí cho mục tiêu có hướng đi xác định
client/src/
  App.tsx, components/, hooks/   Bản đồ, thanh điều khiển, 6 tab bên phải
tests/            Vitest: collector, mô hình vĩ mô, giao diện React (jsdom), xử lý lỗi
infra/            Cấu hình SearXNG tùy chọn
```

## Cấu hình

Mọi biến đều tùy chọn. **Không đưa file `.env` lên kho mã nguồn.**

| Biến | Tác dụng |
| :--- | :--- |
| `AISSTREAM_API_KEY` | Luồng tàu AIS trực tiếp từ `aisstream.io` |
| `GROQ_API_KEY` | Bản tin AI, hỏi đáp dữ liệu, tóm tắt văn bản pháp luật |
| `GEMINI_API_KEY` | AI dự phòng khi không có Groq hoặc Groq quá tải |
| `FRED_API_KEY` | Chuỗi lãi suất, lợi suất, lạm phát kỳ vọng, thanh khoản Fed |
| `NASA_FIRMS_API_KEY` | Điểm nóng nhiệt vệ tinh độ phân giải 375 m |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot chạy ngầm, báo tin mới về HPT (không có giao diện cấu hình) |
| `SEARXNG_BASE_URL` | Máy tìm kiếm SearXNG cục bộ cho tin HPT trên mạng xã hội (bật bằng `npm run searxng:up`, đặt `off` để tắt) |
| `HPT_TELEGRAM_CHANNELS` | Kênh Telegram công khai bổ sung để quét tin HPT (phân tách bằng dấu phẩy) |
| `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` | Google Programmable Search gói miễn phí, tự giới hạn dưới 72 lượt/ngày |
| `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` | Meta Graph API cho bài gắn thẻ Fanpage do bạn quản lý |
| `PORT` (mặc định `8787`), `HOST` (mặc định `127.0.0.1`) | Cổng và địa chỉ mà server lắng nghe |
| `ALLOWED_ORIGINS` | Origin bổ sung được gọi API, đồng thời mở rộng danh sách `Host` hợp lệ |
| `TRUST_PROXY` | Đặt `1` khi chạy sau reverse proxy để tính giới hạn theo `X-Forwarded-For` |

## API và bảo mật

Các đường dẫn dưới `/api`:

| Đường dẫn | Mục đích |
| :--- | :--- |
| `GET /bootstrap`, `GET /live-fast` | Dữ liệu khởi tạo và các lớp cập nhật nhanh |
| `GET /stream` | Kênh SSE đẩy dữ liệu thời gian thực |
| `GET /health` | Trạng thái và lỗi của từng collector |
| `GET /ioc-lookup` | Tra cứu IP hoặc CVE |
| `GET /ai-sitrep`, `POST /ai-sitrep/refresh`, `POST /ai-ask`, `POST /policy-summarize` | Tác vụ dùng AI |
| `POST /refresh/:collectorName` | Ép làm mới một collector |

Các chốt chặn bật sẵn trong `server/app.ts`:

- Chỉ lắng nghe `127.0.0.1` theo mặc định. Muốn mở ra ngoài phải đổi `HOST` có chủ đích.
- Kiểm tra header `Host` để chặn DNS rebinding; kiểm tra `Origin` và `Sec-Fetch-Site` trên các yêu cầu ghi để chặn CSRF; giới hạn thân yêu cầu 16 KB; CORS chỉ nhận `localhost` và các origin khai báo trong `ALLOWED_ORIGINS`.
- Endpoint AI và làm mới collector đều có giới hạn tần suất. Tóm tắt chính sách chỉ nhận `id`, tiêu đề được đọc từ dữ liệu trên server.
- Đường dẫn bài viết từ nguồn ngoài chỉ được dùng khi là `http:` hoặc `https:`, cả trên giao diện lẫn trong tin nhắn Telegram.

Ứng dụng **không có xác thực người dùng**. Nếu triển khai công khai, hãy đặt sau reverse proxy có xác thực.

## Phát triển

```bash
npm test          # Vitest: server, shared và giao diện (jsdom)
npm run typecheck # tsc --noEmit
npm run build     # dist/client và dist/server/index.js
npm start         # bản production, web và API cùng cổng 8787
```

Đo độ phủ cho server và shared:

```bash
npx vitest run --coverage --coverage.include='server/**' --coverage.include='shared/**'
```

Quy ước làm việc và nợ kỹ thuật hiện tại nằm trong [AGENTS.md](./AGENTS.md). Tài liệu tham chiếu nguồn dữ liệu nằm trong `docs/reference/`.

## Giới hạn đã biết

- **Không phải mô hình dự báo.** Các bảng vĩ mô phản ánh sức khỏe và tín hiệu rủi ro từ số liệu đã công bố; không phải dự báo GDP, CPI hay tỷ giá. Tỷ trọng danh mục là mô phỏng theo quy tắc, chưa qua backtest, không phải lời khuyên đầu tư.
- **Tham số hiệu chỉnh cố định.** Một số mốc đối chiếu của Việt Nam (vùng cân bằng USD/VND, CPI, lãi suất liên ngân hàng) là hằng số trong mã và trôi dần theo thời gian. Cần rà soát định kỳ, có nguồn và có kiểm thử.
- **Nguồn không chính thức.** Yahoo Finance v8, RSSHub, Reddit JSON, trang cảnh báo NCHMF có thể đổi cấu trúc hoặc chặn truy cập bất cứ lúc nào. Xem trạng thái từng nguồn trên thanh công cụ hoặc tại `/api/health`.
- **Kiểm thử giao diện còn hạn chế.** Có test tương tác React trong jsdom, nhưng chưa thay được kiểm thử trên trình duyệt thật, công nghệ trợ năng và độ tương phản.

## Giấy phép

Phát hành theo **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). Xem [LICENSE](./LICENSE).
