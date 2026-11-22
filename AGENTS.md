# AGENTS.md — Project Context for AI Agents

Project: `/Users/vophuthinh/Code/worldmonitor` — independent World Monitor. Calls free/keyless upstream APIs directly (no dependency on `worldmonitor.app`). Vietnam / East Sea (Biển Đông) / ASEAN focus. Phase 1 is done; project has grown well past the original spec.

## Locked Decisions (do not re-ask)
- Build independent, call upstream APIs directly. Reference `koala73/worldmonitor` patterns from `docs/reference/koala73-source-refs/` instead of re-fetching from GitHub.
- Stack: TypeScript monorepo. `Hono` backend (port `8787`, binds `127.0.0.1`), `React 19` + `Vite` + `Tailwind v4` + `MapLibre GL v5` (2D/3D toggle, port `5173`), `Vitest`.
- One command to run: `npm run dev`. No external cloud services.
- License: AGPL-3.0.

## Layout
- `server/app.ts` — Hono routes. `server/index.ts` — registers collectors, starts scheduler, SSE hub, streams.
- `server/collectors/` — one file per data source (`markets-crypto.ts` is the orchestrator; its parsers live in `markets/{crypto,fx-yahoo,vn-gold-stocks,vn-valuation-macro,fred}.ts`, re-exported from it). `server/cache/` — scheduler + 2-tier store (RAM + atomic `.cache/*.json`).
- `server/realtime/` — SSE hub, Binance / Polymarket / unified news streams.
- `server/lib/` — Groq/Gemini AI (`groq-intel`), IOC scanner, Telegram alerter, regime ledger, translator.
- `shared/` — types, static registries (`registries/`), `macro-health.ts` (VN/US quant engine), `intelligence.ts`, catalysts/chokepoints, dead-reckoning.
- `client/src/` — `App.tsx`, `components/` (map, top bar, layer dock, inspector), `components/right-panel/` (6 lazy tabs), `hooks/useMonitorData.ts`.
- `tests/` — 14 Vitest files, 84 tests.

## Collectors (ids in `server/index.ts`)
`military-flights` (adsb.fi/adsb.lol failover), `maritime-vessels` (AISStream), `cyber-threats`, `gps-outages`, `earthquakes` (USGS), `natural-events` (EONET+GDACS), `geopolitics-gdelt`, `weather-radar`, `vietnam-env`, `markets-crypto`, `macro-worldbank`, `polymarket`, `google-trends`, `rss-news`, `tech-cyber`, `policy-legal`, `hpt-intel`, `ai-sitrep`. Intervals 30s–6h; tuned to avoid 429s — do not shorten without checking.

## API (all under `/api`)
`GET /stream` (SSE), `/health`, `/bootstrap`, `/live-fast`, `/ioc-lookup`, `/ai-sitrep`; `POST /ai-sitrep/refresh`, `/ai-ask`, `/policy-summarize`, `/refresh/:collectorName`. AI and refresh endpoints are rate-limited. Guards on `/api/*`: Host allowlist (anti DNS-rebinding), Origin/`Sec-Fetch-Site` check on writes (anti CSRF), CORS whitelist (localhost + `ALLOWED_ORIGINS`). Client IP = socket address; `X-Forwarded-For` only trusted with `TRUST_PROXY=1`. Bodies capped at 16 KB; one shared 20s cooldown for all AI-sitrep triggers. `/policy-summarize` takes only `id` and reads title from the server snapshot.

## Right panel tabs
`intel` (Live Intel), `techCyber`, `news`, `policy` (Vietnam policy/legal), `markets` (markets + Macro Health + Investment Compass), `hpt` (HPT Corporate Radar; alerts via Telegram run headless from `.env`, no UI config).

## Env (`.env`, optional — app runs without any)
`AISSTREAM_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `FRED_API_KEY`, `NASA_FIRMS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PORT`, `HOST`, `ALLOWED_ORIGINS` (also extends allowed Host names), `TRUST_PROXY`. Never commit `.env`.

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm start`. Verify with typecheck + tests + build before claiming done.

## Known Debt
- `shared/macro-health.ts` is now a barrel over `shared/macro/{core,vietnam,us,compass}.ts` (compass.ts still ~900 lines). Still oversized: `client/src/components/WorldMap.tsx` (~1.1k, helpers already in `map/map-utils.ts`), `right-panel/MarketsMacroTab.tsx` (now ~215; sections live in `right-panel/markets/*Section.tsx`, plus `MacroHealthSection` and `InvestmentCompassSection`), `right-panel/LiveIntelTab.tsx` (now ~320; all sections extracted to sibling `*Section.tsx` files), `right-panel/TechCyberTab.tsx` (~460; `IocCyberPanel` and `GithubTrendingPanel` extracted). Split before adding features.
- Macro figures come from live collectors and carry `periodLabel`; benchmarks are hardcoded constants (CPI target now `VN_CPI_TARGET_PCT` in `shared/macro/core.ts`; other benchmarks still inline). One literal narrative string (`~0.3% GDP`, `vn-cab` metric) is hand-written.
- No client component tests. Server+shared line coverage 72.7% (branches 58.5%); measure with `npx vitest run --coverage --coverage.include='server/**' --coverage.include='shared/**'` (`@vitest/coverage-v8` is a devDependency).
- Several unofficial sources (Yahoo v8 UA spoof, RSSHub, Reddit, public Telegram, NCHMF) can break or breach ToS; collector health is exposed at `/api/health` and shown in `TopCommandBar`, but no dedicated page.
- Scope creep: avoid new features until above is addressed.

## Reference Library (consult, do not re-fetch)
- `docs/reference/koala73-source-refs/` — koala73 modules (military classifier, EONET/GDACS, chokepoints, finance geo, etc.).
- `docs/reference/worldmonitor-apis/` — 551 upstream APIs, 247 endpoints, `openapi.json`, `feeds.ts`.
- `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md` — original Phase 1 spec (historical).
- `docs/superpowers/plans/2026-11-22-worldmonitor-phase1.md` — Phase 1 plan (done).
- `HANDOFF_CONTEXT.md`, `docs/chat-history/` — history of the initial session only.
