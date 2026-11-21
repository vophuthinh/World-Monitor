# World Monitor (Custom Independent Edition)

Hệ thống Trung tâm Chỉ huy & Tình báo Đa lĩnh vực thời gian thực (**Quân sự ADS-B**, **Động đất USGS**, **Thiên tai NASA EONET + GDACS**, **Địa chính trị GDELT**, **Radar Mưa/Bão RainViewer**, **Tài chính/FX/Crypto**, **Vĩ mô World Bank**, **Polymarket** & **Tin nóng RSS gắn tọa độ**) — gọi trực tiếp các nguồn dữ liệu gốc miễn phí (Keyless Upstream APIs), tích hợp sẵn trọng tâm khu vực **Việt Nam & Biển Đông**.

## Khởi chạy Nhanh (1 Lệnh Duy Nhất)

```bash
npm install
npm run dev
```

- **Giao diện Web (Vite + React 19 + MapLibre GL v5 2D/3D):** `http://localhost:5173`
- **Backend API & Scheduler (Hono + Cache 2 tầng RAM/.cache):** `http://localhost:8787/api/bootstrap`

## Các Lệnh Kiểm thử & Build Sản xuất

```bash
npm test          # Chạy toàn bộ bộ kiểm thử đơn vị & API bằng Vitest
npm run typecheck # Kiểm tra kiểu tĩnh TypeScript nghiêm ngặt
npm run build     # Biên dịch Client (dist/client) & Server (dist/server/index.js)
npm start         # Chạy bản Production gộp cả Web + API trên cổng 8787
```

## Điểm Nổi bật Kiến trúc Giai đoạn 1

1. **Zero-Infra Monorepo:** Loại bỏ hoàn toàn sự phụ thuộc vào 5 dịch vụ đám mây rời rạc; sử dụng Cache 2 tầng tự phục hồi (`RAM + .cache/*.json` ghi nguyên tử, kế thừa đồng hồ lỗi `selectSourceSnapshot` từ `koala73/worldmonitor`).
2. **Bản đồ Chiến thuật 2D Mercator ↔ 3D Globe:** Chuyển đổi tức thì giữ nguyên toàn bộ 9 lớp dữ liệu, icon máy bay quân sự vẽ hướng bay thực tế phân màu theo vai trò (`Bomber`, `VIP`, `AWACS`, `Recon/UAV`, `Fighter`, `Tanker`, `Transport`).
3. **Trọng tâm Việt Nam & Biển Đông:** Khung nhìn nhanh `VN · Biển Đông`, sàn `HOSE`, `HNX`, `Ngân hàng Nhà nước (SBV)`, tỷ giá `USD/VND`, chỉ số `VN-Index`, vĩ mô `VNM` (World Bank), các tuyến cáp quang biển cập bờ Đà Nẵng / Quy Nhơn / Vũng Tàu (`APG`, `AAG`, `AAE-1`, `SJC2/ADC`) và nguồn tin tiếng Việt gắn tọa độ `flyTo`.

## Tài liệu Dự án

- **[HANDOFF_CONTEXT.md](./HANDOFF_CONTEXT.md)**: Tóm tắt toàn bộ quyết định thiết kế, lịch sử hội thoại và hướng dẫn làm việc tiếp.
- **[Thiết kế Kiến trúc Giai đoạn 1](./docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md)**: Đặc tả kỹ thuật chi tiết cho Backend Collectors, Cache 2 tầng, Bản đồ 2D/3D và các Panel Tài chính / Polymarket / Tin nóng.
- **[Kế hoạch Triển khai Giai đoạn 1](./docs/superpowers/plans/2026-11-22-worldmonitor-phase1.md)**: Kế hoạch triển khai chi tiết từng bước theo TDD.
- **[Danh mục 551 API Nguồn gốc (Upstream)](./docs/reference/worldmonitor-apis/ALL_UPSTREAM_DATA_SOURCES.md)**: Toàn bộ các nguồn dữ liệu gốc để mở rộng hệ thống ở Giai đoạn 2.
- **[Danh mục 247+ API của worldmonitor.app](./docs/reference/worldmonitor-apis/ALL_WORLDMONITOR_ENDPOINTS.md)**: Tài liệu tham chiếu hệ thống API bản gốc.
- **[Mã nguồn Tham khảo chọn lọc từ koala73/worldmonitor](./docs/reference/koala73-source-refs/)**: Các thuật toán phân loại máy bay quân sự, xử lý GDACS/EONET, Polymarket và bộ dữ liệu địa lý tĩnh.

## Giấy phép

Phân phối theo giấy phép **GNU AGPLv3** (`LICENSE`), tương thích với các bảng dữ liệu địa lý tham chiếu từ `koala73/worldmonitor`.
