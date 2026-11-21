# AGENTS.md — Project Context & Instructions for AI Agents

## Current Project Status (Read First!)

This project (`/Users/vophuthinh/Code/worldmonitor`) was initialized after completing full API discovery, upstream source extraction, reference code analysis from `koala73/worldmonitor`, and architectural design with the user.

Before asking any questions or taking action, **read these two files first**:
1. `HANDOFF_CONTEXT.md` — Complete summary of all user decisions, scope, and reference files migrated from the initial session (`4030a947-550a-47b4-9a34-40c3cc12cca2`).
2. `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md` — The complete architecture & feature specification for Phase 1.

## Key User Decisions Already Locked In (Do Not Re-Ask)
- **Direction:** Independent World Monitor calling free/keyless **upstream APIs directly** (Option 1), optimized by referencing battle-tested patterns & static registries from `koala73/worldmonitor` (saved locally in `docs/reference/koala73-source-refs/`), while building a cleaner, faster architecture where we can do better (single `npm run dev` monorepo without external cloud service sprawl, plus built-in Vietnam & East Sea / ASEAN focus).
- **Phase 1 Scope:** Multi-domain live tactical map (Military flights via `adsb.lol`, Earthquakes via `USGS`, Natural disasters via `NASA EONET` + `GDACS`, Geopolitics via `GDELT`, Weather Radar via `RainViewer`, Static registries for Chokepoints / Nuclear / Cables / Financial Centers) **+** Finance, Macro & Prediction Markets (`CoinGecko`, `Fear & Greed`, `FX rates` incl. `USD/VND`, global indices/commodities, `World Bank` GDP/CPI incl. `VNM`, `Polymarket Gamma API`, and curated World/Finance/Vietnam RSS news).
- **Tech Stack:** Full-stack TypeScript (`Hono` backend on port `8787` with 2-tier RAM + `.cache/*.json` snapshot store, `React 19` + `Vite` + `Tailwind CSS` + `MapLibre GL JS v5` with 2D Mercator / 3D Globe toggle on port `5173`, `Vitest` for unit tests).

## Local Reference Library
- `docs/reference/koala73-source-refs/`: Contains actual reference modules from `koala73/worldmonitor` (`seed-military-flights.mjs`, `seed-natural-events.mjs`, `chokepoint-registry.ts`, `finance-geo.ts`, `geo-map.ts`, `nuclear-facilities-data.ts`, `basemap-styles.ts`, `theater-presets.ts`, `list-prediction-markets.ts`, `_quote-provider.ts`, `list-world-bank-indicators.ts`, `stocks.json`, `gdelt-intel.ts`). Consult these directly instead of re-fetching from GitHub.
- `docs/reference/worldmonitor-apis/`: Contains `ALL_UPSTREAM_DATA_SOURCES.md` (551 structured upstream APIs), `ALL_WORLDMONITOR_ENDPOINTS.md` (247+ endpoints), `openapi.json`, `feeds.ts`, and `upstream-env-keys.example`.
- `docs/chat-history/`: Contains `2026-11-22-chat-messages.md` and raw `transcript.jsonl`.

## Next Step
Once the user confirms or asks to continue implementation:
1. Follow the `writing-plans` skill to create `docs/superpowers/plans/2026-11-22-worldmonitor-phase1.md` from `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md`.
2. Execute the plan cleanly with TDD (`vitest`), typechecking, build verification, and live verification.
