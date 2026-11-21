# Thiết kế Kiến trúc — Hệ thống World Monitor Độc lập (`worldmonitor`)

- **Ngày lập:** 2026-11-22
- **Phạm vi:** Giai đoạn 1 (Core Live Tactical Dashboard + Kinh tế, Tài chính & Thị trường Dự đoán — chạy ngay 100% không cần API key trả phí)
- **Nguyên tắc thiết kế:** Kế thừa các kỹ thuật xử lý nguồn và bộ dữ liệu địa lý tĩnh đã kiểm chứng từ `koala73/worldmonitor` (AGPL-3.0), đồng thời tối giản hóa toàn bộ hạ tầng phức tạp (loại bỏ phụ thuộc bắt buộc vào Vercel + Railway + Upstash Redis + Cloudflare R2 + Convex + Protobuf codegen) thành kiến trúc **Full-stack TypeScript nguyên khối gọn nhẹ**, khởi chạy bằng một lệnh duy nhất và bổ sung trọng tâm khu vực **Việt Nam / Biển Đông / Đông Nam Á**.

---

## 1. Phân tích Kế thừa từ `koala73/worldmonitor` vs. Cải tiến Tự Xây

### 1.1 Những tối ưu kỹ thuật kế thừa từ `koala73`
1. **Phân loại máy bay quân sự chính xác cao (`seed-military-flights.mjs`):**
   - Sử dụng nguồn miễn phí không cần key `https://api.adsb.lol/v2/mil`.
   - Áp dụng bộ lọc 3 lớp: dải mã ICAO 24-bit quân sự (`HEX_RANGES` của USAF, RAF, FAF, GAF, IAF, NATO...), danh sách mã máy bay đặc biệt (`EXACT_MILITARY_AIRCRAFT`), danh sách chặn hãng hàng không thương mại dễ nhầm (`COMMERCIAL_CALLSIGN_PATTERNS` như `QTR`, `UAE`, `THY`, `CCA`), và nhận diện vai trò tác chiến qua callsign (`FORTE` UAV trinh sát, `RIVET`/`COBRA` trinh sát điện tử, `BONE`/`DOOM` máy bay ném bom, `SNTRY` AWACS, `SAM`/`AF1` chuyên cơ VIP, `KING`/`SHELL` tiếp dầu).
2. **Xử lý tường lửa F5 của GDACS & Timeout phân tầng (`seed-natural-events.mjs`):**
   - Hệ thống chống bot F5 của GDACS chặn `User-Agent` trình duyệt (`Mozilla/5.0`) bằng trang thử thách JavaScript, nhưng trả JSON bình thường cho `User-Agent` định danh ứng dụng (ví dụ `MyWorldMonitor/1.0 (+https://localhost)`).
   - Đặt timeout riêng `35s` cho GDACS (do payload hạn hán/bão nặng) và `12s` cho NASA EONET / USGS để không nghẽn luồng chung.
3. **Cơ chế giữ Snapshot khi nguồn lỗi (`selectSourceSnapshot`):**
   - Mỗi nguồn lưu kèm đồng hồ lỗi độc lập (`fetchedAt`, `retainedUntil`, `consecutiveFailures`, `firstFailureAt`, `lastError`). Khi gọi upstream thất bại, hệ thống không ghi đè dữ liệu rỗng và không gia hạn `fetchedAt` giả tạo, mà trả bản snapshot hợp lệ gần nhất kèm trạng thái `stale`.
4. **Khử trùng lặp & phân nhóm Polymarket (`list-prediction-markets.ts`):**
   - Chuẩn hóa khóa định danh theo URL slug hoặc tiêu đề chuẩn hóa, giữ bản có `volume` cao nhất khi trùng sự kiện, phân tách rõ nhóm `geopolitics`, `finance`, `crypto_tech` và sắp xếp theo thanh khoản/khối lượng giao dịch.
5. **Bộ dữ liệu Địa lý Chiến lược Tĩnh (`chokepoint-registry.ts`, `finance-geo.ts`, `geo-map.ts`):**
   - Tích hợp danh mục 13 eo biển/kênh đào chiến lược (Hormuz, Malacca, Bab el-Mandeb, Suez, Panama, Đài Loan...), các sàn chứng khoán lớn, ngân hàng trung ương, trung tâm tài chính GFCI, cơ sở hạt nhân trọng yếu và tuyến cáp quang biển chính.
6. **Bản đồ nền Vector tối không cần API key (`basemap-styles.ts`):**
   - Dùng trực tiếp style chuẩn `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (kèm phương án dự phòng `positron`/`voyager`), tương thích hoàn toàn với chế độ `mercator` (2D) và `globe` (3D) của MapLibre GL JS v5.

### 1.2 Những điểm tự thiết kế mới tối ưu hơn
1. **Kiến trúc 1 lệnh chạy (`Zero-Infra Monorepo`):** Thay vì cần 5 dịch vụ đám mây và bước biên dịch Protobuf phức tạp, toàn bộ hệ thống dùng `Hono` (Node.js) + Cache 2 tầng (`RAM + .cache/*.json` ghi nguyên tử) + `React 19` + `Vite` + `MapLibre GL v5`. Chạy `npm run dev` là hoạt động đầy đủ 100%.
2. **Tích hợp sẵn dữ liệu khu vực Việt Nam & Biển Đông:**
   - Preset góc nhìn nhanh `Việt Nam & Biển Đông` (`lat: 14.5, lon: 111.0, zoom: 4.8`) bên cạnh `Toàn cầu`, `Trung Đông`, `Châu Âu`, `Đông Á`, `Bắc Mỹ`.
   - Bổ sung **HOSE (TP.HCM)**, **HNX (Hà Nội)** và **Ngân hàng Nhà nước Việt Nam (SBV)** vào lớp Trung tâm Kinh tế/Tài chính; bổ sung mã `VNM` vào bảng so sánh vĩ mô GDP & CPI của World Bank và tỷ giá `USD/VND`.
3. **Giao diện Command Center nhanh & sạch:** Tìm kiếm tức thì xuyên suốt mọi layer bản đồ + Polymarket + tin tức RSS; bấm vào tin tức hoặc cảnh báo có tọa độ sẽ điều khiển bản đồ `flyTo` mượt tới tâm chấn.
4. **Tuân thủ bản quyền rõ ràng:** Kèm tệp `LICENSE` (AGPL-3.0) và ghi nguồn rõ ràng cho các bảng dữ liệu địa lý tham khảo từ `koala73/worldmonitor` cũng như từng nhà cung cấp dữ liệu gốc.

---

## 2. Cấu trúc Thư mục Dự án

Dự án đặt tại `/Users/vophuthinh/Code/worldmonitor`:

```text
worldmonitor/
├── package.json                 # Workspace scripts: dev, build, start, test, typecheck
├── tsconfig.base.json           # Cấu hình TypeScript strict chung
├── LICENSE                      # AGPL-3.0 (tương thích dữ liệu tham khảo từ koala73)
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-11-22-custom-worldmonitor-design.md
├── shared/                      # Kiểu dữ liệu & hằng số dùng chung Server <-> Client
│   ├── types.ts                 # GeoFeatureItem, MarketQuote, MacroIndicator, PredictionItem, NewsItem, SourceHealth
│   └── registries/              # Dữ liệu tĩnh chuẩn hóa (kèm bổ sung VN/ASEAN)
│       ├── chokepoints.ts       # 13 eo biển chiến lược + tuyến hàng hải liên quan
│       ├── finance-centers.ts   # Sàn chứng khoán (có HOSE/HNX), NHTW (có Fed, ECB, SBV...), trung tâm GFCI
│       ├── strategic-sites.ts   # Cơ sở hạt nhân, điểm nóng địa chính trị & tuyến cáp biển lớn
│       └── theaters.ts          # Khung nhìn nhanh (Global, Biển Đông/VN, MENA, Europe, East Asia, Americas)
├── server/                      # Backend Hono (cổng 8787)
│   ├── index.ts                 # Khởi tạo Hono server, CORS, nén gzip, routes & khởi chạy Scheduler
│   ├── cache/
│   │   ├── snapshot-store.ts    # RAM + .cache/*.json (atomic write, TTL, stale retention, failure clock)
│   │   └── scheduler.ts         # Vòng lặp cập nhật nền có chống chồng lấn (in-flight lock)
│   ├── lib/
│   │   └── http.ts              # Fetch có AbortSignal timeout, retry nhẹ & User-Agent phù hợp từng nguồn
│   └── collectors/              # 8 bộ thu thập độc lập (không cần API key)
│       ├── military-flights.ts  # adsb.lol/v2/mil + bộ phân loại HEX/Callsign quân sự (30s)
│       ├── earthquakes.ts       # USGS GeoJSON M2.5+ 7 ngày (180s)
│       ├── natural-events.ts    # NASA EONET v3 + GDACS MAP (600s, named UA cho GDACS)
│       ├── geopolitics-gdelt.ts # GDELT Geo 2.0 JSON xung đột/trừng phạt/biểu tình (900s)
│       ├── weather-radar.ts     # RainViewer weather-maps.json lấy frame radar mới nhất (300s)
│       ├── markets-crypto.ts    # CoinGecko + Alternative.me Fear&Greed + ECB FX + Yahoo/Stooq quotes (120s)
│       ├── macro-worldbank.ts   # World Bank v2 GDP growth & CPI cho US, CN, EU, JP, DE, IN, VN, SG (21600s)
│       └── polymarket-news.ts   # Polymarket Gamma API (180s) + RSS Quốc tế/Tài chính/Việt Nam (300s)
├── client/                      # Frontend React 19 + Vite + Tailwind CSS + MapLibre GL v5 (cổng 5173)
│   ├── index.html
│   ├── vite.config.ts           # Proxy /api -> http://localhost:8787 khi chạy dev
│   └── src/
│       ├── App.tsx              # Bố cục chính & đồng bộ polling từ backend
│       ├── hooks/
│       │   └── useMonitorData.ts# Tải /api/bootstrap ban đầu + polling định kỳ từng phần
│       └── components/
│           ├── TopCommandBar.tsx    # Đèn Health, chuyển 2D/3D, Quick Views, tìm kiếm, bộ lọc thời gian & Ticker
│           ├── LayerControlDock.tsx # Bật/tắt các lớp bản đồ + đếm số lượng trực tiếp + chỉnh độ mờ Radar
│           ├── WorldMap.tsx         # MapLibre GL v5 (Mercator/Globe), clustering, icon xoay góc bay, cáp biển
│           ├── FeatureInspector.tsx # Thẻ chi tiết khi click điểm/đường trên bản đồ
│           └── RightIntelPanel.tsx  # 3 Tab: [Thị trường & Vĩ mô] | [Dự đoán Polymarket] | [Tin nóng & Sự kiện]
└── tests/                       # Kiểm thử tự động với Vitest
    ├── snapshot-store.test.ts   # Test TTL, atomic disk fallback, stale retention & failure clock
    ├── military-classifier.test.ts # Test lọc máy bay thương mại giả & phân loại callsign/hex quân sự
    └── collectors-normalizer.test.ts # Test chuẩn hóa payload USGS, EONET/GDACS, Polymarket, World Bank
```

---

## 3. Hợp đồng Dữ liệu & API Nội bộ (`shared/types.ts` & `server/index.ts`)

### 3.1 Kiểu dữ liệu chuẩn hóa chính
- **`MapLayerId`:** `'military' | 'earthquakes' | 'natural' | 'geopolitics' | 'chokepoints' | 'nuclear' | 'financeCenters' | 'cables' | 'weatherRadar'`
- **`GeoPointFeature`:**
  ```ts
  export interface GeoPointFeature {
    id: string;
    layer: Exclude<MapLayerId, 'cables' | 'weatherRadar'>;
    title: string;
    subtitle?: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical' | 'info';
    lat: number;
    lon: number;
    timestamp: number;        // Unix ms
    source: string;
    url?: string;
    heading?: number;         // Dùng cho máy bay xoay hướng
    magnitude?: number;       // Dùng cho bán kính tâm chấn / quy mô
    meta: Record<string, string | number | boolean | null>;
  }
  ```
- **`MarketSnapshot`:**
  - `quotes`: Danh sách chỉ số, hàng hóa & tỷ giá chính (`S&P 500`, `NASDAQ`, `Nikkei 225`, `VN-Index` / `FTSE VN`, `Gold`, `WTI Crude`, `Brent`, `EUR/USD`, `USD/JPY`, `USD/VND`...) kèm giá, `%` thay đổi 24h.
  - `crypto`: Top tiền số (`BTC`, `ETH`, `SOL`, `BNB`, `XRP`...) kèm giá USD, `%` 24h, vốn hóa.
  - `fearGreed`: `{ value: number; classification: string; updatedAt: number }` từ `api.alternative.me/fng/`.
  - `macro`: Mảng quốc gia (`USA`, `CHN`, `EMU`, `JPN`, `DEU`, `IND`, `VNM`, `SGP`) với tăng trưởng GDP (`NY.GDP.MKTP.KD.ZG`), GDP danh nghĩa (`NY.GDP.MKTP.CD`) và lạm phát CPI (`FP.CPI.TOTL.ZG`) mới nhất từ World Bank.
- **`PredictionItem`:** `{ id, title, category: 'geopolitics' | 'finance' | 'crypto_tech', yesPercent, volumeUsd, liquidityUsd, endDate, url }` lấy từ `https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=60`.
- **`NewsItem`:** `{ id, title, source, category: 'world' | 'finance' | 'vietnam', publishedAt, url, matchedLat?, matchedLon?, matchedLocation? }` (tự động gắn tọa độ nếu tiêu đề khớp tên quốc gia/eo biển/điểm nóng để hỗ trợ nút **Bay tới vị trí**).

### 3.2 Các Endpoint Backend (`http://localhost:8787`)
1. `GET /api/bootstrap`: Trả về toàn bộ dữ liệu hiện có trong RAM chỉ trong 1 phản hồi JSON (`layers`, `staticGeo`, `weatherRadar`, `markets`, `predictions`, `news`, `health`, `serverTime`).
2. `GET /api/live-fast`: Endpoint nhẹ chỉ trả `military`, `earthquakes`, `weatherRadar`, `markets.quotes`, `markets.crypto` và `health` để frontend poll mỗi `30s` mà không phải tải lại dữ liệu tĩnh hay World Bank.
3. `POST /api/refresh/:collectorName`: Cho phép người dùng bấm nút làm mới cưỡng bức 1 nguồn từ giao diện (có giới hạn tối thiểu `10s` giữa 2 lần ép làm mới để bảo vệ upstream).
4. `GET /api/health`: Trả mảng `SourceHealth[]` gồm `{ id, label, status: 'ok' | 'stale' | 'warming' | 'error', itemCount, lastSuccessAt, lastAttemptAt, consecutiveFailures, lastError }`.

---

## 4. Chi tiết Nguồn Upstream & Xử lý Lỗi

| Collector | Endpoint Upstream | Chu kỳ | Retention (`stale`) | Cơ chế Dự phòng / Lưu ý Kỹ thuật |
| :--- | :--- | :--- | :--- | :--- |
| `military-flights` | `https://api.adsb.lol/v2/mil` | 30s | 30 phút | Lọc bỏ tọa độ rỗng, loại callsign thương mại trùng lặp, gắn nhãn `fighter`/`bomber`/`recon`/`awacs`/`tanker`/`drone`/`vip`/`transport`. |
| `earthquakes` | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson` | 3 phút | 6 giờ | Chuẩn hóa độ lớn Richter thành mức `severity` (`>=6.0` critical, `>=5.0` high, `>=4.0` medium). |
| `natural-events` | `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100` + `https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP` | 10 phút | 18 giờ | Chạy song song `Promise.allSettled`; một trong hai nguồn lỗi vẫn hiển thị nguồn còn lại; dùng named `User-Agent` cho GDACS. |
| `geopolitics-gdelt` | `https://api.gdeltproject.org/api/v2/geo/geo?query=(conflict OR missile OR military OR sanctions OR protest)&mode=PointData&format=GeoJSON&timespan=24h` | 15 phút | 12 giờ | Kiểm tra Content-Type JSON trước khi parse (GDELT đôi khi trả text khi quá tải) để giữ nguyên snapshot cũ. |
| `weather-radar` | `https://api.rainviewer.com/public/weather-maps.json` | 5 phút | 2 giờ | Trích frame radar cuối cùng trong `radar.past` để ghép URL tile `https://tilecache.rainviewer.com{path}/256/{z}/{x}/{y}/6/1_1.png`. |
| `markets-crypto` | CoinGecko `/api/v3/coins/markets` + `api.alternative.me/fng/` + `open.er-api.com/v6/latest/USD` (kèm ECB XML) + Yahoo Finance v8 chart (`^GSPC`, `^IXIC`, `^N225`, `^VNI`, `GC=F`, `CL=F`, `BZ=F`) | 2 phút | 6 giờ | Từng nhánh (`crypto`, `fx`, `indices`, `fearGreed`) độc lập nhau; `open.er-api.com` miễn phí không key cung cấp cả `USD/VND`, `EUR/USD`, `USD/JPY`, `USD/CNY`. |
| `macro-worldbank` | `https://api.worldbank.org/v2/country/US;CN;XC;JP;DE;IN;VN;SG/indicator/{code}?format=json&per_page=300&date=2021:2026` | 6 giờ | 7 ngày | Lấy giá trị năm gần nhất khác `null` cho từng quốc gia. |
| `polymarket-news` | `https://gamma-api.polymarket.com/events?...` + 10 RSS feeds (BBC World, Al Jazeera, Reuters/CNBC/MarketWatch/OilPrice/VnExpress Kinh doanh & Thế giới) | 3–5 phút | 6 giờ | Parse XML an toàn có timeout `8s` mỗi RSS feed; lỗi 1 tờ báo không ảnh hưởng các tờ còn lại. |

---

## 5. Thiết kế Giao diện & Trải nghiệm Người dùng (`client/`)

1. **Phong cách Thị giác:** Tactical Command Center nền tối sâu (`#070b12` / `#0d1420`), viền mảnh độ tương phản chuẩn, font số liệu `JetBrains Mono` (`tabular-nums`) thẳng hàng tuyệt đối cho giá tài chính, tọa độ và xác suất.
2. **Bản đồ `WorldMap.tsx`:**
   - Hỗ trợ chuyển đổi tức thì **2D Mercator ↔ 3D Globe** giữ nguyên trạng thái toàn bộ các layer dữ liệu đang bật.
   - Layer máy bay quân sự vẽ mũi tên định hướng xoay theo `heading`, tô màu nổi bật cho nhóm đặc biệt (`VIP`, `Bomber`, `AWACS`, `Recon`, `Drone`).
   - Hỗ trợ lọc theo khung thời gian (`6h`, `24h`, `7 ngày`) áp dụng cho các sự kiện có dấu thời gian (động đất, thiên tai, địa chính trị, tin tức).
3. **Cột Panel Phải (`RightIntelPanel.tsx`):**
   - **Tab 1 — Thị trường & Vĩ mô:** Khối Chỉ số & Hàng hóa (Chứng khoán Mỹ/Á/VN-Index, Vàng, Dầu WTI/Brent) + Tỷ giá (`USD/VND`, `EUR/USD`, `USD/JPY`, `USD/CNY`) + Crypto & đồng hồ `Fear & Greed` + Bảng Vĩ mô World Bank 8 nền kinh tế.
   - **Tab 2 — Dự đoán (Polymarket):** Bộ lọc nhanh `Tất cả | Địa chính trị | Kinh tế & Fed | Crypto & Tech`, hiển thị thanh xác suất trực quan và khối lượng giao dịch USD.
   - **Tab 3 — Tin nóng & Sự kiện:** Lọc theo `Tất cả | Thế giới | Tài chính | Việt Nam`, tích hợp ô tìm kiếm từ khóa và nút định vị nhanh trên bản đồ.

---

## 6. Chiến lược Kiểm thử & Tiêu chí Hoàn thành

1. **Unit Tests (`vitest`):**
   - `snapshot-store.test.ts`: Kiểm tra ghi/đọc cache RAM + đĩa `.cache/`, hết hạn TTL, phục hồi dữ liệu `stale` khi hàm fetch ném lỗi và tăng bộ đếm `consecutiveFailures`.
   - `military-classifier.test.ts`: Kiểm tra nhận diện đúng máy bay quân sự Mỹ/NATO/Trung Quốc và loại trừ chính xác các chuyến bay thương mại (`QTR123`, `UAE45`, `CCA981`).
   - `collectors-normalizer.test.ts`: Kiểm tra hàm chuẩn hóa dữ liệu mẫu của USGS, EONET/GDACS, Polymarket và World Bank xử lý an toàn dữ liệu thiếu trường hoặc sai định dạng.
2. **Xác minh Tích hợp & Giao diện:**
   - `npm run typecheck` và `npm test` đạt 100% không lỗi.
   - `npm run build` biên dịch thành công cả client & server.
   - Khởi chạy thực tế server + web app, kiểm tra `/api/health` và `/api/bootstrap` trả dữ liệu sống từ các nguồn upstream, và mở trình duyệt xác minh bản đồ 2D/3D, các layer và cả 3 tab hoạt động mượt.
