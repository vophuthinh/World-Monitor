# Bàn giao Ngữ cảnh & Tiến độ Dự án (`HANDOFF_CONTEXT.md`)

Tài liệu này tóm tắt **100% nội dung cuộc trò chuyện khởi tạo**, các quyết định thiết kế đã thống nhất và vị trí mọi tài nguyên đã thu thập để bạn (và AI Agent ở phiên mới) tiếp tục làm việc ngay lập tức khi mở thư mục `/Users/vophuthinh/Code/worldmonitor`.

- **ID phiên hội thoại gốc:** `4030a947-550a-47b4-9a34-40c3cc12cca2`
- **Bản trích xuất nội dung đoạn chat dễ đọc:** `docs/chat-history/2026-11-22-chat-messages.md`
- **Log hội thoại JSONL nguyên bản:** `docs/chat-history/transcript.jsonl`

---

## 1. Tóm tắt Diễn biến & Các Quyết định Đã Chốt của Người dùng

1. **Khảo sát `worldmonitor.app` trực tiếp trên trình duyệt:**
   - Đã kiểm tra toàn bộ lưu lượng mạng (XHR/Fetch, Vector PMTiles, Radar tiles) của URL Dashboard 13 layers (`iranAttacks`, `hotspots`, `conflicts`, `bases`, `nuclear`, `military`, `weather`, `canadaAlerts`, `outages`, `natural`, `waterways`, `economic`, `sanctions`).
   - Kết quả chi tiết lưu tại: `docs/reference/live-network-inspection-report.md`.
2. **Thu thập toàn bộ hệ thống API & Nguồn dữ liệu gốc:**
   - Đã tải toàn bộ **247 OpenAPI 3.1 endpoints** trên 38 services của `api.worldmonitor.app` (`docs/reference/worldmonitor-apis/openapi.json` & `ALL_WORLDMONITOR_ENDPOINTS.md`).
   - Đã tải toàn bộ **1.584 nguồn dữ liệu gốc (Upstream Sources)** từ mã nguồn mở `koala73/worldmonitor` — gồm **551 API dữ liệu có cấu trúc** và **1.033 nguồn RSS** (`docs/reference/worldmonitor-apis/ALL_UPSTREAM_DATA_SOURCES.md` & `source-attribution-manifest.json`).
3. **Hướng xây dựng đã chốt:**
   - **Tự xây hệ thống World Monitor độc lập** gọi trực tiếp các **Upstream APIs miễn phí** (không phụ thuộc máy chủ hay API key trả phí của `worldmonitor.app`, không vi phạm EULA).
   - **Nguyên tắc vàng từ người dùng:** *"Tham khảo từ mã nguồn có sẵn của `koala73` cho tối ưu. Cái nào mình làm tốt hơn thì tự làm."*
4. **Phạm vi Giai đoạn 1 (MVP chạy ngay không cần API key trả phí):**
   - Kết hợp **Nhóm 1 (Đa lĩnh vực cốt lõi)** + **Nhóm 4 (Kinh tế, Tài chính & Thị trường Dự đoán)**:
     1. Máy bay quân sự toàn cầu thời gian thực (`adsb.lol/v2/mil` + bộ lọc 3 lớp HEX/Callsign của `koala73`).
     2. Động đất (`USGS`) & Thiên tai toàn cầu (`NASA EONET` + `GDACS` dùng named `User-Agent` tránh tường lửa F5).
     3. Sự kiện địa chính trị, xung đột, trừng phạt (`GDELT Geo 2.0`) + Dữ liệu tĩnh chuẩn hóa (13 Eo biển hàng hải, Cơ sở hạt nhân, Cáp quang biển, Sàn giao dịch/NHTW/Trung tâm tài chính).
     4. Lớp phủ Radar mưa/bão trực tiếp (`RainViewer`).
     5. Thị trường tài chính & Tiền số (`CoinGecko`, `Alternative.me Fear & Greed`, tỷ giá `USD/VND`, `EUR/USD`, `USD/JPY`..., chỉ số chứng khoán & vàng/dầu).
     6. Kinh tế vĩ mô (`World Bank` GDP & CPI cho Mỹ, Trung Quốc, EU, Nhật, Đức, Ấn Độ, **Việt Nam**, Singapore).
     7. Thị trường dự đoán (`Polymarket Gamma API` — địa chính trị, lãi suất Fed, kinh tế, công nghệ).
     8. Luồng tin nóng RSS chọn lọc (Quốc tế, Tài chính & Việt Nam) kèm tự động gắn tọa độ `flyTo`.
5. **Tech Stack & Kiến trúc đã chốt:**
   - **Full-stack TypeScript Monorepo:** Backend `Hono` (Node.js) + Cache 2 tầng tự phục hồi (`RAM + .cache/*.json` kế thừa cơ chế `selectSourceSnapshot` của `koala73`) + Frontend `React 19` + `Vite` + `Tailwind CSS` + `MapLibre GL JS v5` (chuyển đổi mượt **2D Mercator ↔ 3D Globe**, dùng nền vector tối miễn phí `CARTO Dark Matter GL`).
   - Khởi chạy toàn bộ chỉ bằng **1 lệnh `npm run dev`** (loại bỏ sự cồng kềnh 5 dịch vụ đám mây của bản gốc) và bổ sung trọng tâm khu vực **Việt Nam & Biển Đông** (`HOSE`, `HNX`, `SBV`, `VNM`, `USD/VND`, preset góc nhìn Biển Đông).

---

## 2. Bản đồ Tài liệu trong Dự án Này

| Đường dẫn | Nội dung |
| :--- | :--- |
| `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md` | **Bản thiết kế kiến trúc chính thức (Spec)** cho Giai đoạn 1 |
| `docs/reference/live-network-inspection-report.md` | Báo cáo phân tích trực tiếp lưu lượng mạng & 13 layers trên `worldmonitor.app/dashboard` |
| `docs/reference/worldmonitor-apis/ALL_UPSTREAM_DATA_SOURCES.md` | Bảng tổng hợp 551 API nguồn gốc bên thứ ba để gọi trực tiếp |
| `docs/reference/worldmonitor-apis/ALL_WORLDMONITOR_ENDPOINTS.md` | Danh sách toàn bộ 247+ endpoints của `api.worldmonitor.app` |
| `docs/reference/worldmonitor-apis/openapi.json` | Đặc tả OpenAPI 3.1 gốc của World Monitor |
| `docs/reference/worldmonitor-apis/feeds.ts` | Danh mục các nguồn RSS tin tức chọn lọc |
| `docs/reference/worldmonitor-apis/upstream-env-keys.example` | Hướng dẫn lấy các API key miễn phí cho Giai đoạn 2 (`AISStream`, `ACLED`, `FRED`, `EIA`, `NASA FIRMS`...) |
| `docs/reference/koala73-source-refs/` | **17 file mã nguồn thực tế từ `koala73/worldmonitor`** để tham khảo trực tiếp khi code (`seed-military-flights.mjs`, `seed-natural-events.mjs`, `chokepoint-registry.ts`, `finance-geo.ts`, `geo-map.ts`, `nuclear-facilities-data.ts`, `basemap-styles.ts`, `theater-presets.ts`, `list-prediction-markets.ts`, `_quote-provider.ts`, `list-world-bank-indicators.ts`, `stocks.json`, `gdelt-intel.ts`...) |
| `docs/chat-history/2026-11-22-chat-messages.md` | Toàn bộ nội dung đoạn chat trước khi chuyển sang thư mục này |

---

## 3. Bước Tiếp theo Ngay Khi Mở Thư mục Này

Khi mở `/Users/vophuthinh/Code/worldmonitor` trong phiên làm việc mới, bạn chỉ cần nhắn:
> **"Đọc `HANDOFF_CONTEXT.md` và bản spec rồi lập kế hoạch triển khai và bắt đầu code luôn nhé"**

Quy trình tiếp theo cho AI Agent:
1. Đọc `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md`.
2. Sử dụng skill `writing-plans` tạo kế hoạch triển khai chi tiết tại `docs/superpowers/plans/2026-11-22-worldmonitor-phase1.md`.
3. Triển khai từng task (kèm kiểm thử `vitest` + chạy thử trực tiếp `npm run dev` và xác minh trên trình duyệt).
