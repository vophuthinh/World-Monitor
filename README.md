# World Monitor

Bảng theo dõi thời gian thực về địa chính trị, hàng hải, hàng không quân sự, an ninh mạng, chính sách pháp luật và vĩ mô tài chính, tập trung vào **Việt Nam, Biển Đông và ASEAN**.

Backend tự gọi thẳng các nguồn dữ liệu mở, không đi qua `worldmonitor.app` hay dịch vụ đám mây trung gian. **Chạy được ngay sau khi cài gói, không cần khóa API nào.** Khóa tùy chọn chỉ mở thêm tính năng.

## Điểm nổi bật

- **Bản đồ 2D/3D** với 17 lớp dữ liệu bật/tắt độc lập: máy bay quân sự, tàu AIS, động đất, thiên tai, xung đột, radar mưa, cáp quang biển và nhiều lớp nữa.
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
| Thời tiết và thiên nhiên | Động đất, thiên tai và điểm nóng nhiệt, radar mưa, **bão và áp thấp nhiệt đới đang hoạt động** (đường đi, vùng dự báo), **ảnh vệ tinh hồng ngoại Himawari-9** (tắt mặc định) | USGS, NASA EONET, GDACS, NOAA NHC, NASA FIRMS, RainViewer, dữ liệu bão JTWC qua GDACS, Himawari-9 của JMA |
| Địa chính trị | Điểm nóng xung đột | GDELT |
| Dữ liệu tĩnh | Căn cứ quân sự và bãi phóng, trung tâm dữ liệu AI và đất hiếm, eo biển chiến lược, cơ sở hạt nhân, sàn chứng khoán và ngân hàng trung ương, cáp quang biển | Bộ dữ liệu trong `shared/registries/` |

### Khung bên phải

Chỉ tab đầu được tải khi mở trang; 5 tab còn lại nạp khi bạn bấm vào.

| Tab | Nội dung chính |
| :--- | :--- |
| **Live Intel** | Mức cảnh báo chung, bản tin tóm tắt bằng AI và khung hỏi đáp trên dữ liệu đang mở, trạng thái các khu vực nóng, thời tiết biển và chất lượng không khí Việt Nam kèm **dự báo 24 giờ từ 6 mô hình** (trung bình, khoảng dao động và mức đồng thuận giữa các mô hình), 5 hợp đồng Polymarket biến động mạnh nhất, Google Trends, từ khóa theo dõi, chỉ số bất ổn quốc gia |
| **AI & ML** | Trạng thái các nền tảng AI và Cloud lớn, GitHub Trending, tra cứu IP hoặc CVE (Shodan InternetDB, NVD, CISA KEV), lọc theo kỹ thuật MITRE ATT&CK |
| **Tin nóng** | Luồng tin gộp từ Wikimedia, GDELT, Hacker News, Reddit và báo chí trong nước lẫn quốc tế; dịch tự động tiêu đề sang tiếng Việt; bấm tin để bản đồ bay tới tọa độ sự kiện |
| **Chính sách** | Văn bản mới từ Cổng Thông tin Chính phủ, Công báo, Bộ Khoa học và Công nghệ, nhóm Nghị quyết 57, 59, 66, 68. Tóm tắt 3 ý bằng AI khi bạn yêu cầu |
| **Thị trường** | Sức khỏe vĩ mô Việt Nam và Mỹ, khẩu vị rủi ro và tín hiệu thị trường, lịch sự kiện, tác động khi nghẽn eo biển, giá vàng SJC, rổ VN30, tỷ giá, lãi suất Mỹ, VIX, stablecoin và crypto theo thời gian thực |
| **HPT** | Theo dõi riêng Công ty Cổ phần Dịch vụ Công nghệ Tin học HPT (UPCoM: `HPT`): giá và định giá, công bố thông tin, thông báo đấu thầu, tin tài chính, diễn đàn và mạng xã hội. Tự loại tin từ chính HPT và tin tuyển dụng, phân loại sắc thái, hiện chấm báo khi có tin mới trong 24 giờ |

## Dữ liệu và độ tin cậy

- **20 bộ thu thập** chạy theo chu kỳ từ 30 giây đến 6 giờ (xem `server/index.ts`). Nếu một lượt quét chưa xong thì lượt sau không chạy chồng.
- **Cache hai tầng:** đọc ghi trên RAM, ghi nguyên tử xuống `.cache/*.json`. Khi nguồn lỗi, hệ thống giữ lại bản trước đó và đánh dấu là cũ.
- **Thiếu hoặc quá cũ thì không bịa:** chỉ tiêu vĩ mô thiếu dữ liệu bị bỏ khỏi điểm số. Dữ liệu giữ lại quá 7 ngày không được dùng để chấm điểm. Kỳ quan sát cũ (FRED theo ngày, tuần, tháng, quý lần lượt 14, 30, 120, 240 ngày; World Bank hơn 3 năm) được cảnh báo rõ trên giao diện.
- **Giá và thời điểm nguồn:** tỷ giá ER-API giữ riêng thời điểm quan sát và thời điểm tải; thiếu thời điểm hoặc quá 48 giờ được đánh dấu cũ. Giá phiên Yahoo và VN-Index không rõ thời điểm hoặc quá 7 ngày được đánh dấu cũ. Thiếu giá đóng cửa phiên trước thì biến động VN-Index và VN30 hiển thị không rõ. Giá vàng Mi Hồng không rõ hoặc quá 6 giờ được đánh dấu tham khảo cũ và không tạo cảnh báo chênh lệch; Fear & Greed thiếu thời điểm hoặc quá 7 ngày không được coi là mới.
- **Vị trí AIS:** vị trí Digitraffic quá 30 phút hoặc không rõ thời điểm không được hiển thị; AISStream yêu cầu thời gian gửi hợp lệ trong 25 phút. Thời gian gửi không đảm bảo là thời gian đo vị trí. Tin AIS tĩnh không làm mới vị trí; nội suy tàu chỉ dùng hướng chuyển động và tốc độ khả dụng. Nguồn Digitraffic lỗi được phản ánh trong trạng thái collector, kể cả khi còn dữ liệu lưu tạm.
- **MapLibre:** `npm audit` có thể vẫn báo GHSA-jrc7-96c5-q579 cho v5.24.1 dù [ghi chú phát hành v5.24.1](https://github.com/maplibre/maplibre-gl-js/releases/tag/v5.24.1) xác nhận đã đưa bản sửa #8189 vào v5. Kiểm thử attribution bao gồm trường hợp các thuộc tính nguy hiểm liền nhau; cảnh báo phụ thuộc vẫn cần được theo dõi.
- **Số liệu thời gian thực** (giá crypto Binance, xác suất Polymarket, vị trí tàu, luồng tin) đẩy xuống trình duyệt qua SSE tại `/api/stream`.
- **Tra cứu quốc gia:** đặt `RESTCOUNTRIES_API_KEY` trong `.env` sau khi thu hồi khóa đã lộ. Tra cứu qua server, cache 24 giờ, giới hạn 30 lượt upstream / 24 giờ cho mỗi tiến trình (khởi động lại sẽ đặt lại giới hạn; quota gói miễn phí dùng chung toàn tài khoản). Không đưa khóa vào trình duyệt.
- **Open-Meteo:** mục Live Intel có nhiệt độ mặt biển, dòng chảy, sóng lừng và dự báo mưa/gió theo giờ; lưu lượng sông là mô phỏng GloFAS tại ô lưới gần trung tâm Hà Nội và TP.HCM, chưa xác minh sông, không phải mực nước hay cảnh báo lũ. Dữ liệu là mô hình tham khảo, không dùng dẫn đường. Gói miễn phí chỉ dành cho phi thương mại và cần ghi nguồn theo [điều khoản Open-Meteo](https://open-meteo.com/en/terms).
- **Lịch gắn nhãn "Ước tính"** không phải ngày công bố đã xác nhận. Hãy đối chiếu lịch chính thức.

## Kiến trúc

```text
server/
  app.ts          Định tuyến Hono, kiểm tra bảo mật, giới hạn tần suất, SSE
  index.ts        Đăng ký 20 collector, luồng thời gian thực, khởi động HTTP
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
| `SERPER_API_KEY` | Tìm kiếm Google JSON qua `serper.dev` cho tin HPT (lưu đệm đĩa, tự giới hạn tối đa 1 lượt/giờ) |
| `SEARXNG_BASE_URL` | Máy tìm kiếm SearXNG cục bộ cho tin HPT trên mạng xã hội (bật bằng `npm run searxng:up`, đặt `off` để tắt) |
| `HPT_TELEGRAM_CHANNELS` | Kênh Telegram công khai bổ sung để quét tin HPT (phân tách bằng dấu phẩy) |
| `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX` | Google Programmable Search gói miễn phí, tự giới hạn dưới 72 lượt/ngày |
| `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` | Meta Graph API cho bài gắn thẻ Fanpage do bạn quản lý |
| `PORT` (mặc định `8787`), `HOST` (mặc định `127.0.0.1`) | Cổng và địa chỉ mà server lắng nghe |
| `ALLOWED_ORIGINS` | Origin bổ sung được gọi API, đồng thời mở rộng danh sách `Host` hợp lệ |
| `TRUST_PROXY` | Đặt `1` khi chạy sau reverse proxy để tính giới hạn theo `X-Forwarded-For` |

Tab HPT cảnh báo khi giá hoặc tin được giữ lại từ lần trước; nếu toàn bộ nguồn mất kết nối, trạng thái nguồn chuyển sang lỗi thay vì làm mới thời gian dữ liệu cũ. Serper chờ ít nhất một giờ giữa các lần thử, kể cả khi kết quả rỗng hoặc yêu cầu lỗi; nếu không ghi được cache, giới hạn qua lần khởi động lại không được bảo đảm. Cảnh báo Telegram chưa gửi do lỗi cấu hình sẽ được thử lại trong cửa sổ tin mới 72 giờ.

Giá tham chiếu HPT được ghi rõ và không giả định biến động hoặc khối lượng giao dịch. SearXNG và Google CSE cũng giới hạn tần suất khi truy vấn lỗi hoặc trả rỗng; giới hạn này chỉ tồn tại trong phiên chạy.

Giá PAXG/USDT từ Binance là công cụ riêng, không thay thế giá vàng kỳ hạn COMEX. Giá, tiền số và vàng Việt Nam được giữ lại tối đa 6 giờ khi nguồn tương ứng lỗi và hiển thị nhãn dữ liệu cũ; Fear & Greed giữ tối đa 7 ngày khi các nguồn khác vẫn cập nhật. Nếu mọi nguồn thị trường và vĩ mô đều lỗi, collector không gia hạn snapshot cũ và toàn bộ snapshot hết hạn sau tối đa 6 giờ. Kết nối SSE không bảo đảm nguồn giá đang hoạt động.

Giá Yahoo, tỷ giá ER-API và phiên VN-Index/VN30 hiển thị thời điểm quan sát do nguồn cung cấp (hoặc “không rõ”), tách biệt với thời điểm tải; giá thiếu thời điểm hoặc quá 7 ngày không dùng để chấm điểm vĩ mô. Khi nguồn chỉ trả một phần, các mã còn thiếu được giữ lại tối đa 6 giờ và đánh dấu cũ. Chênh lệch vàng dùng đầu vào cũ hơn 6 giờ hoặc không rõ thời điểm chỉ mang tính tham khảo và không dùng cho cảnh báo La bàn. Vốn hóa, khối lượng và biến động tiền số không có dữ liệu được hiển thị là không rõ; vốn hóa và khối lượng quá 6 giờ bị ẩn độc lập với giá Binance realtime.

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
- Luồng SSE `/api/stream` tối đa 200 kết nối (quá thì trả 503); máy khách đọc chậm bị ngắt thay vì để bộ đệm phình mãi. Các bộ nhớ đệm trong tiến trình đều có trần.
- Chạy bằng `docker compose`: ứng dụng giới hạn 1 GB RAM (heap Node 768 MB), SearXNG 512 MB, 256 tiến trình mỗi container, log xoay vòng 10 MB × 3 file. Đặt `WM_MEM_LIMIT` để đổi giới hạn RAM của ứng dụng.
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

- **Không phải mô hình dự báo.** Các bảng vĩ mô phản ánh sức khỏe và tín hiệu rủi ro từ số liệu đã công bố; không phải dự báo GDP, CPI hay tỷ giá. Web không hiển thị tỷ trọng danh mục: kiểm định 11/2026 trên dữ liệu 2019–2026 (thiếu số vĩ mô Việt Nam, Polymarket, độ rộng VN30; chênh lệch HY chỉ có từ 11/2023) cho thấy tỷ trọng cổ phiếu theo điểm tổng hợp có Sharpe thấp hơn giữ cố định cùng mức trung bình trên cả VN-Index và S&P 500, và điểm tương quan âm với lợi nhuận 3–6 tháng sau đó.
- **Tham số hiệu chỉnh cố định.** Một số mốc đối chiếu của Việt Nam (vùng cân bằng USD/VND, CPI, lãi suất liên ngân hàng) là hằng số trong mã và trôi dần theo thời gian. Cần rà soát định kỳ, có nguồn và có kiểm thử.
- **Nguồn không chính thức.** Yahoo Finance v8, RSSHub, Reddit JSON, trang cảnh báo NCHMF có thể đổi cấu trúc hoặc chặn truy cập bất cứ lúc nào. Xem trạng thái từng nguồn trên thanh công cụ hoặc tại `/api/health`.
- **Dữ liệu bão lấy từ GDACS, chưa trực tiếp từ JMA/JTWC.** GDACS đăng lại cảnh báo JTWC (đường đi, vùng dự báo) và cấu trúc đã được kiểm chứng bằng cả bão đang hoạt động lẫn bão đã qua. Bản tin trực tiếp của JMA (`targetTc.json`) và JTWC chưa được dùng vì chưa có bão để xác minh cấu trúc dữ liệu.
- **Dự báo đa mô hình không phải bảo đảm chính xác.** Khi kiểm tra với quan trắc của Singapore, thứ hạng các mô hình thay đổi theo thời điểm; vì vậy ứng dụng hiển thị khoảng dao động giữa mô hình thay vì chọn một mô hình.
- **Kiểm thử giao diện còn hạn chế.** Có test tương tác React trong jsdom, nhưng chưa thay được kiểm thử trên trình duyệt thật, công nghệ trợ năng và độ tương phản.

## Giấy phép

Phát hành theo **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). Xem [LICENSE](./LICENSE).
