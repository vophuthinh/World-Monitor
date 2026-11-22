# World Monitor (Custom Independent Edition)

Trung tâm chỉ huy & tình báo đa lĩnh vực thời gian thực, gọi trực tiếp các nguồn dữ liệu gốc miễn phí, trọng tâm **Việt Nam & Biển Đông**. Không cần API key để chạy; key tùy chọn mở thêm tính năng.

## Khởi chạy

```bash
npm install
cp .env.example .env   # tùy chọn
npm run dev
```

- Web (Vite + React 19 + MapLibre GL v5, 2D/3D): `http://localhost:5173`
- API + scheduler (Hono): `http://127.0.0.1:8787/api/bootstrap`

```bash
npm test          # Vitest (84 test)
npm run typecheck # tsc --noEmit
npm run build     # dist/client + dist/server/index.js
npm start         # production, web + API trên cổng 8787
```

## Tính năng

**Bản đồ chiến thuật** (2D Mercator ↔ 3D Globe): máy bay quân sự ADS-B (adsb.fi/adsb.lol), tàu biển AIS (cần key), động đất USGS, thiên tai EONET + GDACS, địa chính trị GDELT, radar RainViewer + Windy, nhiễu GPS/BGP, eo biển, cơ sở hạt nhân, cáp biển, trung tâm tài chính, chủ quyền Biển Đông.

**Panel phải (6 tab, lazy-load):**
- **Live Intel** — tin tức tình báo, AI Sitrep, Copilot "Ask Monitor", Polymarket, Google Trends.
- **Tech & Cyber** — mối đe dọa mạng, GitHub Trending, quét IOC/CVE (Shodan InternetDB, NVD).
- **News** — luồng RSS hợp nhất, gắn tọa độ `flyTo`.
- **Policy** — văn bản pháp luật Việt Nam, tóm tắt AI theo yêu cầu.
- **Markets & Macro** — crypto, FX (USD/VND), chỉ số, hàng hóa, World Bank, Macro Health VN/US (mô hình định lượng nhiều nhân tố), Investment Compass, lịch catalyst.
- **HPT** — radar tin doanh nghiệp HPT; cảnh báo Telegram chạy nền từ `.env`.

## Kiến trúc

```
server/      Hono API, collectors/, cache/ (RAM + .cache/*.json), realtime/ (SSE), lib/ (AI, IOC, Telegram)
client/src/  React UI: map, command bar, layer dock, right-panel/ tabs
shared/      types, registries tĩnh, macro-health, intelligence
tests/       Vitest
```

18 collector chạy theo chu kỳ 30 giây – 6 giờ; cache 2 tầng tự phục hồi khi nguồn lỗi. Đẩy dữ liệu realtime qua SSE `/api/stream`.

## Biến môi trường (tùy chọn)

`AISSTREAM_API_KEY` (tàu AIS), `GROQ_API_KEY` / `GEMINI_API_KEY` (AI), `FRED_API_KEY` (vĩ mô Mỹ), `NASA_FIRMS_API_KEY` (nhiệt vệ tinh), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (cảnh báo), `PORT`, `HOST` (mặc định `127.0.0.1`), `ALLOWED_ORIGINS`. Xem `.env.example`.

## Bảo mật

Server bind `127.0.0.1`, CORS whitelist, rate-limit endpoint AI và refresh. Nếu deploy công khai, đặt `HOST` và `ALLOWED_ORIGINS` có chủ đích và đặt sau reverse proxy.

## Hạn chế đã biết

- Các mốc benchmark vĩ mô là hằng số trong code và có thể lỗi thời.
- Vài nguồn không chính thức (Yahoo, RSSHub, Reddit, Telegram công khai) có thể ngừng hoạt động.
- Chưa có test cho component client.

## Tài liệu

- [AGENTS.md](./AGENTS.md) — ngữ cảnh cho AI agent và nợ kỹ thuật.
- [Spec Giai đoạn 1](./docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md), [Plan](./docs/superpowers/plans/2026-11-22-worldmonitor-phase1.md) — lịch sử thiết kế.
- [HANDOFF_CONTEXT.md](./HANDOFF_CONTEXT.md) — bàn giao phiên khởi tạo.
- [551 API nguồn](./docs/reference/worldmonitor-apis/ALL_UPSTREAM_DATA_SOURCES.md), [mã tham khảo koala73](./docs/reference/koala73-source-refs/).

## Giấy phép

GNU AGPLv3 (`LICENSE`), tương thích với dữ liệu địa lý tham chiếu từ `koala73/worldmonitor`.
