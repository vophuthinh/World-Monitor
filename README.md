# World Monitor (Custom Independent Edition)

Hệ thống theo dõi tình báo địa chính trị, quân sự, thiên tai, thời tiết và thị trường tài chính/dự đoán toàn cầu theo thời gian thực — gọi trực tiếp các nguồn dữ liệu gốc (Upstream APIs), tối ưu kiến trúc gọn nhẹ (`Hono` + `React` + `MapLibre GL 2D/3D`) và tích hợp trọng tâm khu vực **Việt Nam & Biển Đông**.

## Tài liệu Dự án

- **[HANDOFF_CONTEXT.md](./HANDOFF_CONTEXT.md)**: Tóm tắt toàn bộ quyết định thiết kế, lịch sử hội thoại và hướng dẫn làm việc tiếp.
- **[Thiết kế Kiến trúc Giai đoạn 1](./docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md)**: Đặc tả kỹ thuật chi tiết cho Backend Collectors, Cache 2 tầng, Bản đồ 2D/3D và các Panel Tài chính / Polymarket / Tin nóng.
- **[Danh mục 551 API Nguồn gốc (Upstream)](./docs/reference/worldmonitor-apis/ALL_UPSTREAM_DATA_SOURCES.md)**: Toàn bộ các nguồn dữ liệu gốc để mở rộng hệ thống.
- **[Danh mục 247+ API của worldmonitor.app](./docs/reference/worldmonitor-apis/ALL_WORLDMONITOR_ENDPOINTS.md)**: Tài liệu tham chiếu hệ thống API bản gốc.
- **[Báo cáo Kiểm tra Mạng Trực tiếp](./docs/reference/live-network-inspection-report.md)**: Phân tích chi tiết các layer và luồng dữ liệu trên `worldmonitor.app/dashboard`.
- **[Mã nguồn Tham khảo chọn lọc từ koala73/worldmonitor](./docs/reference/koala73-source-refs/)**: Các thuật toán phân loại máy bay quân sự, xử lý GDACS/EONET, Polymarket và bộ dữ liệu địa lý tĩnh.
- **[Lịch sử Đoạn Chat Khởi tạo](./docs/chat-history/2026-11-22-chat-messages.md)**: Bản lưu đầy đủ cuộc trao đổi trước khi chuyển sang thư mục này.
