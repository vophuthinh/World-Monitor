# Custom Independent World Monitor (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, zero-paid-key Full-Stack TypeScript World Monitor command center with real-time military aviation, earthquakes, natural disasters, geopolitics, weather radar, strategic static registries, global/Vietnam markets, World Bank macro indicators, Polymarket predictions, and geo-tagged RSS news on a 2D Mercator / 3D Globe MapLibre dashboard.

**Architecture:** Single-command (`npm run dev`) TypeScript monorepo pairing a Node.js `Hono` backend (`:8787`)—backed by an atomic 2-tier `RAM + .cache/*.json` snapshot store with independent failure clocks (`selectSourceSnapshot`) and in-flight deduplicated background schedulers—with a `React 19` + `Vite` + `Tailwind CSS v4` + `MapLibre GL JS v5` tactical frontend (`:5173`). Static geo registries inherit battle-tested coordinates and 3-layer ADS-B classification rules from `koala73/worldmonitor` while adding first-class Vietnam & East Sea (`Biển Đông`, `HOSE`, `HNX`, `SBV`, `USD/VND`, `VNM`, `APG`/`AAG`/`AAE-1` cables) coverage.

**Tech Stack:** TypeScript 5.x (strict), Node.js, Hono, `@hono/node-server`, `fast-xml-parser`, React 19, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), MapLibre GL JS v5 (`maplibre-gl`), `@phosphor-icons/react`, IBM Plex Sans + JetBrains Mono (`@fontsource`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-custom-worldmonitor-design.md`

## Global Constraints

- Zero mandatory paid API keys: 100% of Phase 1 collectors must work out-of-the-box against keyless public upstream endpoints.
- License & attribution: Include `LICENSE` (`AGPL-3.0-only` compatible with `koala73/worldmonitor` reference registries) and source attribution in every normalized record.
- Resilient caching (`selectSourceSnapshot` pattern): Failed upstream calls must never overwrite valid snapshots with empty arrays and must never extend `fetchedAt` or `retainedUntil`; they increment `consecutiveFailures` and serve retained data as `'stale'` until `retainedUntil`.
- Upstream firewall & timeout safety: Use named `User-Agent: WorldMonitor-VN/1.0 (+https://localhost:8787)` for GDACS (`35s` timeout) to avoid F5 HTML bot challenges; `12s` timeout for USGS/EONET; content-type/JSON guard for GDELT Geo 2.0; `8s` per-feed timeout for RSS XML.
- Regional Vietnam & East Sea focus: Include `Việt Nam & Biển Đông` (`lat: 14.5, lon: 111.0, zoom: 4.8`) theater preset, `HOSE`, `HNX`, `SBV`, `USD/VND`, `VN-Index`, `VNM` World Bank macro row, Vietnam RSS feeds, and Vietnam-landed submarine cables (`APG`, `AAG`, `AAE-1`, `SJC2`).
- Tactical UI craft: Dark command palette (`#070b12` / `#0d1420`), `IBM Plex Sans` + `JetBrains Mono` (`tabular-nums`), `@phosphor-icons/react` icons (no emoji clutter), instant 2D Mercator ↔ 3D Globe toggle preserving active layers.

---

### Task 1: Project Scaffolding, TypeScript Config, License & Shared Data Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vitest.config.ts`
- Create: `LICENSE`
- Create: `shared/types.ts`

**Interfaces:**
- Consumes: Spec §2 & §3.1 data model definitions.
- Produces:
  - `MapLayerId`, `SeverityLevel`, `TimeWindow`, `GeoPointFeature`, `GeoLineFeature`, `StaticGeoBundle`, `WeatherRadarSnapshot`
  - `MarketQuote`, `CryptoQuote`, `FearGreedSnapshot`, `MacroCountryIndicator`, `MarketSnapshot`
  - `PredictionCategory`, `PredictionItem`, `NewsCategory`, `NewsItem`
  - `CollectorId`, `SourceHealthStatus`, `SourceHealth`, `BootstrapResponse`, `LiveFastResponse`, `TheaterViewPreset`

- [ ] **Step 1: Create `package.json`, TypeScript configs, `vitest.config.ts`, and `LICENSE`**

Define scripts (`dev`, `dev:server`, `dev:client`, `build`, `start`, `test`, `typecheck`), strict TypeScript compiler options with `@shared/*` path aliases, Vitest Node test environment, and GNU AGPLv3 license notice referencing upstream data providers and `koala73/worldmonitor`.

- [ ] **Step 2: Create `shared/types.ts` with complete Server-Client contracts**

Define all shared TypeScript interfaces (`MapLayerId`, `GeoPointFeature`, `GeoLineFeature`, `WeatherRadarSnapshot`, `MarketSnapshot`, `MacroCountryIndicator`, `PredictionItem`, `NewsItem`, `SourceHealth`, `BootstrapResponse`, `LiveFastResponse`, `TheaterViewPreset`).

- [ ] **Step 3: Install dependencies and verify `typecheck` passes**

Run: `npm install && npm run typecheck`
Expected: Clean install, `tsc --noEmit` exits `0`.

- [ ] **Step 4: Commit scaffolding & shared contracts**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json tsconfig.server.json vitest.config.ts LICENSE shared/types.ts
git commit -m "chore: scaffold monorepo config, AGPL-3.0 license, and shared types"
```

---

### Task 2: Strategic Static Geo Registries (Chokepoints, Finance Centers, Nuclear, Cables & Theaters)

**Files:**
- Create: `tests/registries.test.ts`
- Create: `shared/registries/theaters.ts`
- Create: `shared/registries/chokepoints.ts`
- Create: `shared/registries/finance-centers.ts`
- Create: `shared/registries/strategic-sites.ts`
- Create: `shared/registries/index.ts`

**Interfaces:**
- Consumes: `GeoPointFeature`, `GeoLineFeature`, `StaticGeoBundle`, `TheaterViewPreset` from `shared/types.ts`.
- Produces:
  - `THEATER_PRESETS: readonly TheaterViewPreset[]` (includes `global`, `east-sea-vn`, `mena`, `europe`, `east-asia`, `americas`)
  - `CHOKEPOINT_FEATURES: readonly GeoPointFeature[]` (13 canonical maritime chokepoints)
  - `FINANCE_CENTER_FEATURES: readonly GeoPointFeature[]` (global exchanges, central banks, financial hubs + `HOSE`, `HNX`, `SBV`)
  - `NUCLEAR_SITE_FEATURES: readonly GeoPointFeature[]` (key global nuclear power, enrichment, weapons & research sites including `zaporizhzhia`, `natanz`, `fordow`, `yongbyon`, `fangchenggang`, `changjiang`, `dalat_reactor`)
  - `SUBMARINE_CABLE_FEATURES: readonly GeoLineFeature[]` (ordered MultiLineString cable routes including Vietnam-connected `apg`, `aag`, `aae_1`, `ia_tata`)
  - `buildStaticGeoBundle(): StaticGeoBundle`

- [ ] **Step 1: Write failing registry validation tests (`tests/registries.test.ts`)**

Assert 13 canonical chokepoints exist, `east-sea-vn` preset matches `lat: 14.5, lon: 111.0, zoom: 4.8`, `HOSE`/`HNX`/`SBV` exist in `FINANCE_CENTER_FEATURES`, all coordinates lie within valid WGS84 bounds (`[-90, 90]`, `[-180, 180]`), and submarine cables have valid MultiLineString segments including Vietnam landing points (`Đà Nẵng`, `Vũng Tàu`).

- [ ] **Step 2: Run Vitest to confirm RED failure**

Run: `npx vitest run tests/registries.test.ts`
Expected: FAIL because `shared/registries/*` modules do not exist yet.

- [ ] **Step 3: Implement `theaters.ts`, `chokepoints.ts`, `finance-centers.ts`, `strategic-sites.ts`, and `index.ts`**

Populate accurate coordinates and structured `meta` fields adapted from `docs/reference/koala73-source-refs/` plus Vietnam/ASEAN strategic entries and antimeridian-safe MultiLineString submarine cable paths.

- [ ] **Step 4: Run Vitest & typecheck to confirm GREEN**

Run: `npx vitest run tests/registries.test.ts && npm run typecheck`
Expected: PASS (all registry assertions green, 0 TS errors).

- [ ] **Step 5: Commit static geo registries**

```bash
git add shared/registries tests/registries.test.ts
git commit -m "feat(shared): add strategic static geo registries with Vietnam and East Sea coverage"
```

---

### Task 3: 2-Tier Self-Healing Snapshot Store, HTTP Helper & Background Scheduler

**Files:**
- Create: `tests/snapshot-store.test.ts`
- Create: `server/cache/snapshot-store.ts`
- Create: `server/cache/scheduler.ts`
- Create: `server/lib/http.ts`

**Interfaces:**
- Consumes: `CollectorId`, `SourceHealth` from `shared/types.ts`.
- Produces:
  - `SnapshotEnvelope<T>`, `CollectorRefreshConfig<T>`, `SnapshotStore` (`register`, `hydrateFromDisk`, `refresh`, `get`, `getHealth`, `getAllHealth`, `canForceRefresh`)
  - `CollectorScheduler` (`registerCollector`, `startAll`, `stopAll`, `refreshCollector`, `getStore`)
  - `fetchJsonWithTimeout<T>(url, options)` & `fetchTextWithTimeout(url, options)` with `AbortSignal.timeout`, optional 1-retry on transient network errors, custom `User-Agent`, and strict JSON Content-Type/parse validation.

- [ ] **Step 1: Write failing unit tests in `tests/snapshot-store.test.ts`**

Test cases:
1. Fresh fetch stores snapshot in RAM and writes `.cache/<id>.json` atomically (`status: 'ok'`, `consecutiveFailures: 0`).
2. Failed refresh preserves previous valid snapshot (`status: 'stale'`), increments `consecutiveFailures`, records `firstFailureAt` & `lastError`, and does NOT extend `fetchedAt` or `retainedUntil`.
3. Expired `retainedUntil` on failure transitions health to `'error'` and does not serve expired stale data as fresh.
4. Disk hydration restores `.cache/<id>.json` into a new `SnapshotStore` instance on cold start.
5. Concurrent `refresh()` calls for the same key share a single in-flight promise (anti-overlap lock).
6. Force-refresh rate limiter enforces minimum `10_000ms` cooldown per collector.

- [ ] **Step 2: Run Vitest to confirm RED failure**

Run: `npx vitest run tests/snapshot-store.test.ts`
Expected: FAIL (missing `server/cache/snapshot-store.ts`).

- [ ] **Step 3: Implement `server/lib/http.ts`, `server/cache/snapshot-store.ts`, and `server/cache/scheduler.ts`**

Implement atomic `.tmp` + `fs.rename` persistence, `selectSourceSnapshot` failure-clock invariants, in-flight promise deduplication, and `CollectorScheduler` interval runner.

- [ ] **Step 4: Run Vitest & typecheck to confirm GREEN**

Run: `npx vitest run tests/snapshot-store.test.ts && npm run typecheck`
Expected: PASS (all 6 cache & concurrency test cases green).

- [ ] **Step 5: Commit cache store, HTTP helper & scheduler**

```bash
git add server/lib/http.ts server/cache tests/snapshot-store.test.ts
git commit -m "feat(server): implement 2-tier self-healing snapshot store and scheduler"
```

---

### Task 4: Military Aircraft Classifier & Tactical Map Collectors (`military`, `earthquakes`, `natural`, `geopolitics`, `weatherRadar`)

**Files:**
- Create: `tests/military-classifier.test.ts`
- Create: `server/collectors/military-flights.ts`
- Create: `server/collectors/earthquakes.ts`
- Create: `server/collectors/natural-events.ts`
- Create: `server/collectors/geopolitics-gdelt.ts`
- Create: `server/collectors/weather-radar.ts`

**Interfaces:**
- Consumes: `fetchJsonWithTimeout`, `fetchTextWithTimeout` from `server/lib/http.ts`; `GeoPointFeature`, `WeatherRadarSnapshot` from `shared/types.ts`.
- Produces:
  - `classifyMilitaryAircraft(ac)`, `normalizeMilitaryFlights(payload, now)`, `fetchMilitaryFlights()`
  - `normalizeUsgsEarthquakes(payload)`, `fetchEarthquakes()`
  - `normalizeEonetEvents(payload, now)`, `normalizeGdacsEvents(payload)`, `fetchNaturalEvents()`
  - `normalizeGdeltGeoJson(rawText, now)`, `fetchGeopoliticsGdelt()`
  - `normalizeRainViewerRadar(payload, now)`, `fetchWeatherRadar()`

- [ ] **Step 1: Write failing unit tests in `tests/military-classifier.test.ts`**

Test cases:
1. Classifies USAF RQ-4 Global Hawk (`FORTE12`, hex `AE5420`) as `drone` / `USA` / `high` severity.
2. Classifies USAF B-52 / B-1B (`BONE21`, `DOOM11`) as `bomber`, `SNTRY01` as `awacs`, `RIVET14` as `reconnaissance`, `SAM45` as `vip`, `SHELL81` as `tanker`, `RCH412` as `transport`.
3. Recognizes exact PLA military hexes (`7A4262` Y-8G, `7A444F` YY-20, `7A446F` Y-20A) as `China` (`plaaf`) without false-matching civil Chinese hexes.
4. Rejects commercial airline callsigns (`QTR123`, `UAE45`, `CCA981`, `THY19`, `SVA702`, `ELAL315`) when hex is not an authoritative trusted military hex.
5. Drops records with missing or out-of-range coordinates (`lat`/`lon`) and converts `alt_baro` (ft), `gs` (knots), and `track` (degrees) accurately.

- [ ] **Step 2: Run Vitest to confirm RED failure**

Run: `npx vitest run tests/military-classifier.test.ts`
Expected: FAIL (missing `server/collectors/military-flights.ts`).

- [ ] **Step 3: Implement `military-flights.ts`, `earthquakes.ts`, `natural-events.ts`, `geopolitics-gdelt.ts`, and `weather-radar.ts`**

Implement the 3-layer HEX + Commercial Blocklist + Callsign/Type-Code classifier for `adsb.lol/v2/mil`, USGS M2.5+ 7-day normalizer, parallel `Promise.allSettled` EONET (`12s`) + GDACS (`35s`, named UA `WorldMonitor-VN/1.0`) normalizer, GDELT Geo 2.0 JSON-guarded normalizer (with GDELT DOC 2.0 geo-matched fallback if Geo 2.0 returns plain-text overload), and RainViewer radar frame normalizer.

- [ ] **Step 4: Run Vitest & typecheck to confirm GREEN**

Run: `npx vitest run tests/military-classifier.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit tactical map collectors**

```bash
git add server/collectors/military-flights.ts server/collectors/earthquakes.ts server/collectors/natural-events.ts server/collectors/geopolitics-gdelt.ts server/collectors/weather-radar.ts tests/military-classifier.test.ts
git commit -m "feat(collectors): add military ADS-B classifier and live geo/radar collectors"
```

---

### Task 5: Finance, Crypto, World Bank Macro, Polymarket & Geo-Tagged RSS Collectors

**Files:**
- Create: `tests/collectors-normalizer.test.ts`
- Create: `server/collectors/markets-crypto.ts`
- Create: `server/collectors/macro-worldbank.ts`
- Create: `server/collectors/polymarket-news.ts`

**Interfaces:**
- Consumes: `MarketSnapshot`, `MacroCountryIndicator`, `PredictionItem`, `NewsItem` from `shared/types.ts`; `http.ts` helpers.
- Produces:
  - `normalizeCoinGeckoMarkets`, `normalizeFearGreed`, `normalizeErApiFx`, `normalizeYahooChartQuote`, `fetchMarketsAndCrypto(prev?)`
  - `normalizeWorldBankIndicators`, `fetchWorldBankMacro()`
  - `normalizePolymarketEvents`, `parseRssFeedXml`, `matchGeoLocation`, `fetchPolymarketPredictions()`, `fetchCuratedRssNews()`

- [ ] **Step 1: Write failing normalizer unit tests in `tests/collectors-normalizer.test.ts`**

Test cases:
1. `normalizeUsgsEarthquakes` & `normalizeEonetEvents` / `normalizeGdacsEvents` handle missing optional fields, polygon centroids, and alert severities safely.
2. `normalizeGdeltGeoJson` rejects non-JSON rate-limit text cleanly instead of returning silent empty success.
3. `normalizePolymarketEvents` parses stringified `outcomePrices` (`"[\"0.64\", \"0.36\"]"` -> `64%`), deduplicates identical slugs keeping highest volume, and categorizes `geopolitics` vs `finance` vs `crypto_tech`.
4. `normalizeWorldBankIndicators` extracts the most recent non-null year per country (`USA`, `CHN`, `EMU`, `JPN`, `DEU`, `IND`, `VNM`, `SGP`) across GDP growth, nominal GDP, and CPI.
5. `normalizeErApiFx` extracts `USD/VND`, `EUR/USD`, `USD/JPY`, `USD/CNY`, `USD/SGD` accurately.
6. `parseRssFeedXml` + `matchGeoLocation` parses both RSS 2.0 `<item>` and Atom `<entry>` feeds and attaches coordinates (`matchedLat`, `matchedLon`, `matchedLocation`) for titles mentioning `Biển Đông`, `Hormuz`, `Ukraine`, `Đài Loan`, `Việt Nam`, etc.

- [ ] **Step 2: Run Vitest to confirm RED failure**

Run: `npx vitest run tests/collectors-normalizer.test.ts`
Expected: FAIL (missing finance, macro, and polymarket/news collector modules).

- [ ] **Step 3: Implement `markets-crypto.ts`, `macro-worldbank.ts`, and `polymarket-news.ts`**

Implement fault-tolerant sub-branch fetching (`CoinGecko` + `CoinPaprika` fallback, `Alternative.me` Fear & Greed, `open.er-api.com` + ECB XML FX rates including `USD/VND`, Yahoo Finance v8 chart + Stooq fallback for indices/commodities including `S&P 500`, `NASDAQ`, `Nikkei 225`, `VN-Index`, `Gold`, `WTI`, `Brent`), World Bank 8-country macro fetcher, Polymarket Gamma API deduplicator/categorizer, and 10-feed RSS XML parser (`fast-xml-parser`) with geo-keyword coordinate tagging.

- [ ] **Step 4: Run Vitest & typecheck to confirm GREEN**

Run: `npx vitest run && npm run typecheck`
Expected: All unit tests across all test files PASS, 0 TS errors.

- [ ] **Step 5: Commit finance, macro, prediction & RSS collectors**

```bash
git add server/collectors/markets-crypto.ts server/collectors/macro-worldbank.ts server/collectors/polymarket-news.ts tests/collectors-normalizer.test.ts
git commit -m "feat(collectors): add markets, crypto, World Bank macro, Polymarket, and geo-tagged RSS collectors"
```

---

### Task 6: Hono Backend Server & REST Endpoints (`/api/bootstrap`, `/api/live-fast`, `/api/refresh/:collectorName`, `/api/health`)

**Files:**
- Create: `tests/server-api.test.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`

**Interfaces:**
- Consumes: `SnapshotStore`, `CollectorScheduler`, all collectors, `buildStaticGeoBundle()`.
- Produces:
  - `createApp(scheduler)` Hono application instance testable via `app.request(...)`:
    - `GET /api/bootstrap` -> `BootstrapResponse`
    - `GET /api/live-fast` -> `LiveFastResponse`
    - `GET /api/health` -> `{ serverTime: number; sources: SourceHealth[] }`
    - `POST /api/refresh/:collectorName` -> triggers force refresh with `10s` rate-limit protection (`429` if within cooldown, `404` if unknown collector)
  - `server/index.ts`: Hydrates `.cache/`, starts background scheduler, serves Hono on `PORT` (`8787` default) with CORS + compression + optional static serving of `dist/client` in production.

- [ ] **Step 1: Write failing API contract tests in `tests/server-api.test.ts`**

Test `GET /api/bootstrap`, `GET /api/live-fast`, `GET /api/health`, `POST /api/refresh/earthquakes` (200 OK then 429 within 10s cooldown), and `POST /api/refresh/unknown` (404) using `createApp` with injected mock collectors.

- [ ] **Step 2: Run Vitest to confirm RED failure**

Run: `npx vitest run tests/server-api.test.ts`
Expected: FAIL (missing `server/app.ts`).

- [ ] **Step 3: Implement `server/app.ts` and `server/index.ts`**

Wire CORS, gzip compression, all 4 API routes, collector registration table matching Spec §4 intervals & retention windows, `.cache` hydration, and graceful `SIGINT`/`SIGTERM` shutdown.

- [ ] **Step 4: Run Vitest & typecheck to confirm GREEN**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit Hono server**

```bash
git add server/app.ts server/index.ts tests/server-api.test.ts
git commit -m "feat(server): add Hono API routes, bootstrap/live-fast payloads, and rate-limited refresh"
```

---

### Task 7: React 19 + MapLibre GL v5 Tactical Command Center UI & End-to-End Live Verification

**Files:**
- Create: `client/index.html`
- Create: `client/vite.config.ts`
- Create: `client/src/index.css`
- Create: `client/src/main.tsx`
- Create: `client/src/hooks/useMonitorData.ts`
- Create: `client/src/components/TopCommandBar.tsx`
- Create: `client/src/components/LayerControlDock.tsx`
- Create: `client/src/components/WorldMap.tsx`
- Create: `client/src/components/FeatureInspector.tsx`
- Create: `client/src/components/RightIntelPanel.tsx`
- Create: `client/src/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `/api/bootstrap`, `/api/live-fast`, `/api/refresh/:collectorName`, `/api/health`, and all shared types in `shared/types.ts` + `THEATER_PRESETS` from `shared/registries/theaters.ts`.
- Produces: Complete Tactical Command Center web application on `:5173` (proxying `/api` to `:8787`) and production bundle in `dist/client`.

- [ ] **Step 1: Create `client/index.html`, `client/vite.config.ts`, `client/src/index.css`, and `client/src/main.tsx`**

Configure `@tailwindcss/vite`, `@shared` alias, `/api` proxy to `http://localhost:8787`, self-hosted `IBM Plex Sans` + `JetBrains Mono` fonts, MapLibre CSS import, dark tactical CSS variables (`#070b12`, `#0d1420`), `tabular-nums` utility, and themed scrollbars/focus rings.

- [ ] **Step 2: Implement `useMonitorData.ts` data synchronization & filtering hook**

Fetch `/api/bootstrap` on mount, poll `/api/live-fast` every `30s` and full `/api/bootstrap` every `180s` (for predictions/news/macro updates), expose `forceRefresh(collectorId)`, time-window filtering (`6h`, `24h`, `7d`, `all`), cross-domain instant search (`flights`, `quakes`, `disasters`, `geopolitics`, `staticGeo`, `predictions`, `news`), and camera `flyTo` state.

- [ ] **Step 3: Implement `WorldMap.tsx`, `TopCommandBar.tsx`, `LayerControlDock.tsx`, `FeatureInspector.tsx`, `RightIntelPanel.tsx`, and `App.tsx`**

Build:
- `WorldMap.tsx`: MapLibre GL v5 with seamless **2D Mercator ↔ 3D Globe** projection toggle, CARTO Dark Matter / Voyager / Positron basemap selector, canvas-rendered directional aircraft arrow icons rotated by `heading` and color-coded by role (`VIP`, `Bomber`, `AWACS`, `Recon`, `Drone`, `Fighter`, `Tanker`, `Transport`), RainViewer raster radar overlay with dynamic opacity, MultiLineString submarine cables (highlighting Vietnam cables), proportional earthquake circles, clustered/styled geopolitics & natural events, chokepoints, nuclear sites, finance centers, hover tooltips, and click-to-inspect + `flyTo`.
- `TopCommandBar.tsx`: Health telemetry status pill + per-source health/refresh popover, 2D/3D switch, Quick Theater Views (`Toàn cầu`, `VN & Biển Đông`, `Trung Đông`, `Châu Âu`, `Đông Á`, `Bắc Mỹ`), time window filter, `⌘K`/`/` unified search, dual `UTC` / `VN UTC+7` clock, and live ticker bar (`USD/VND`, `BTC`, `Gold`, `Brent`, `S&P 500`, `VN-Index`, `Fear & Greed`).
- `LayerControlDock.tsx`: 9 layer switches with live filtered counts, radar opacity slider, and role/severity legend.
- `FeatureInspector.tsx`: Rich tactical telemetry drawer for any selected map point or submarine cable.
- `RightIntelPanel.tsx`: 3 tabs (`Thị trường & Vĩ mô`, `Dự đoán Polymarket`, `Tin nóng & Sự kiện`) with category pills, Fear & Greed bar, World Bank 8-country comparison table (`VNM` highlighted), Polymarket probability bars, and RSS `Bay tới vị trí` (`flyTo`) buttons.

- [ ] **Step 4: Run `typecheck`, `test`, and production `build`**

Run: `npm run typecheck && npm test && npm run build`
Expected: `0` TypeScript errors, `100%` Vitest pass, clean client + server build in `dist/`.

- [ ] **Step 5: Start live `npm run dev`, verify live upstream `/api/health` & `/api/bootstrap`, and inspect UI in Chrome via `browser` subagent**

Verify all collectors populate real live upstream data (`military`, `earthquakes`, `natural`, `geopolitics`, `weatherRadar`, `markets`, `macro`, `predictions`, `news`), test 2D ↔ 3D Globe toggle, `VN & Biển Đông` preset, layer toggles, feature click inspector, and all 3 RightIntelPanel tabs in live Chrome.

- [ ] **Step 6: Update `README.md` with quickstart commands & architecture overview, then commit**

```bash
git add client README.md
git commit -m "feat(client): build MapLibre 2D/3D tactical command center and complete Phase 1"
```
