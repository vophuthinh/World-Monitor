# Danh mục Toàn bộ API Nguồn gốc (Upstream Data Sources) để Tự Xây World Monitor

- **Tổng số nguồn dữ liệu gốc của World Monitor (`source-attribution-manifest.json`):** **1584 nguồn**
  - **API có cấu trúc & trạng thái vận hành (`structured` / `feed+structured` / `operational-status`):** **551 hosts** (liệt kê toàn bộ bên dưới và trong `upstream_apis_only.json`).
  - **Nguồn tin tức RSS / Atom (`feed`):** **1033 hosts** (cấu hình URL RSS chi tiết nằm trong `feeds.ts` và `source-attribution-manifest.json`).
- **Hướng dẫn đăng ký API key miễn phí cho từng nguồn:** xem file `upstream-env-keys.example`.

## 1. Bảng Tóm tắt Các API Gốc Cốt lõi Theo Từng Layer (Dễ tích hợp ngay)

| Mảng dữ liệu | Nhà cung cấp / API gốc | Host chính | Cần API Key? | Ghi chú đăng ký |
| :--- | :--- | :--- | :--- | :--- |
| Động đất toàn cầu | USGS Earthquake Hazards | `earthquake.usgs.gov` | **Không (Miễn phí)** | GeoJSON chuẩn cập nhật mỗi 5 phút |
| Thiên tai Liên Hợp Quốc | GDACS & NASA EONET | `www.gdacs.org`, `eonet.gsfc.nasa.gov` | **Không (Miễn phí)** | Bão, lũ lụt, núi lửa, cháy rừng |
| Cháy rừng vệ tinh | NASA FIRMS (VIIRS/MODIS) | `firms.modaps.eosdis.nasa.gov` | Key miễn phí | Đăng ký tại `firms.modaps.eosdis.nasa.gov` |
| Radar thời tiết & Khí hậu | RainViewer & Open-Meteo & NWS | `api.rainviewer.com`, `api.open-meteo.com`, `api.weather.gov` | **Không (Miễn phí)** | Tile radar mưa + dữ liệu khí tượng toàn cầu |
| Máy bay quân sự (ADS-B) | adsb.lol / OpenSky Network | `api.adsb.lol`, `opensky-network.org` | **Không** (`adsb.lol`) / OAuth miễn phí (`OpenSky`) | Theo dõi máy bay quân sự thời gian thực |
| Tàu biển & Hải quân (AIS) | AISStream.io | `stream.aisstream.io` | Key miễn phí | WebSocket AIS toàn cầu tại `aisstream.io` |
| Sự kiện địa chính trị | GDELT Project | `api.gdeltproject.org` | **Không (Miễn phí)** | Cập nhật mỗi 15 phút (tin tức, biểu tình, trừng phạt, quân sự) |
| Xung đột vũ trang | ACLED & UCDP | `acleddata.com`, `ucdpapi.pcr.uu.se` | Key miễn phí | Đăng ký tài khoản nghiên cứu miễn phí |
| Cảnh báo tên lửa Israel | Pikud HaOref (OREF) | `www.oref.org.il` | **Không** (cần IP Israel/proxy) | Cảnh báo rocket thời gian thực |
| Đứt cáp & Mất Internet | Cloudflare Radar | `api.cloudflare.com` | Token miễn phí | Tạo API token miễn phí trong tài khoản Cloudflare |
| Người tị nạn & Nhân đạo | UNHCR & UN OCHA HAPI | `api.unhcr.org`, `hapi.humdata.org` | **Không (Miễn phí)** | CC BY 4.0 |
| Kinh tế vĩ mô Mỹ & Quốc tế | FRED, BLS, World Bank, ECB, BIS, IMF | `api.stlouisfed.org`, `api.worldbank.org`, `data-api.ecb.europa.eu` | World Bank/ECB/BIS: **Không**; FRED: Key miễn phí | Chuỗi lãi suất, CPI, GDP, tỷ giá |
| Giá dầu & Năng lượng | U.S. EIA & GIE AGSI+ & ENTSO-E | `api.eia.gov`, `agsi.gie.eu` | Key miễn phí | Giá dầu WTI/Brent, tồn kho dầu & khí đốt Châu Âu |
| Chứng khoán & Crypto | Finnhub, Yahoo Finance, CoinGecko, Fear&Greed | `finnhub.io`, `api.coingecko.com`, `api.alternative.me` | CoinGecko demo/Finnhub: Key miễn phí | Giá cổ phiếu, chỉ số, tiền số |
| Thị trường dự đoán | Polymarket Gamma API | `gamma-api.polymarket.com` | **Không (Miễn phí)** | Xác suất sự kiện địa chính trị |
| An ninh mạng (Cyber IOC) | abuse.ch (URLhaus/Feodo), NVD NIST, OTX, AbuseIPDB | `urlhaus-api.abuse.ch`, `services.nvd.nist.gov`, `otx.alienvault.com` | NVD không cần key; OTX/AbuseIPDB key miễn phí | Mối đe dọa mạng & lỗ hổng CVE |
| Bản đồ nền Vector | OpenFreeMap / Protomaps PMTiles | `tiles.openfreemap.org`, `protomaps.com` | **Không (Miễn phí)** | Dùng với MapLibre GL + deck.gl / globe.gl |

## Nhóm `structured` (505 hosts)

| Provider | Host | License | File tham chiếu trong mã nguồn |
| :--- | :--- | :--- | :--- |
| Alberta 511 | `511.alberta.ca` | Alberta 511 terms (https://511.alberta.ca/about/about): non-commercial/educational reproduction allowed; commercial reproduction needs written permission from Alberta Transportation and Economic Corridors. https://511.alberta.ca/help/terms returned 404. | `{'path': 'scripts/lib/provincial-511.mjs'}` |
| Alberta Emergency Alert | `www.alberta.ca` | Alberta.ca terms of use. Open Government Licence - Alberta exists on the open.alberta.ca licence page but is not bound to the AEA Atom feed on a live dataset page (the alberta-emergency-alert.aspx page has no OGL statement). | `{'path': 'scripts/lib/alberta-emergency-alert.mjs'}`, `{'path': 'scripts/source-attribution.mjs'}` |
| Alternative.me Fear & Greed Index | `api.alternative.me` | Alternative.me API terms; attribution and redistribution require review | `{'path': 'scripts/seed-economy.mjs'}` |
| AusTender | `www.tenders.gov.au` | Australian Government data and feed terms | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| Axiom telemetry | `api.axiom.co` | Excluded: World Monitor operational telemetry, not an external data provider | `{'path': 'api/_usage-telemetry.js'}`, `{'path': 'scripts/deploy-error-canary.mjs'}` (+4) |
| B.C. Evacuation Orders and Alerts | `catalogue.data.gov.bc.ca` | Open Government Licence - British Columbia (OGL-BC). The B.C. Data Catalogue record 7efd46d0-b5d3-4dff-af80-d376c42aec33 explicitly assigns OGL-BC to this ArcGIS layer. | `{'path': 'scripts/lib/bc-emergency-info.mjs'}` |
| B.C. Evacuation Orders and Alerts | `services6.arcgis.com` | Open Government Licence - British Columbia (OGL-BC). The B.C. Data Catalogue record 7efd46d0-b5d3-4dff-af80-d376c42aec33 explicitly assigns OGL-BC to this ArcGIS layer. | `{'path': 'scripts/lib/bc-emergency-info.mjs'}` |
| BC Open511 | `api.open511.gov.bc.ca` | Open Government Licence - British Columbia (OGL-BC). Confirmed on https://api.open511.gov.bc.ca/help. API Terms of Use for OGL-BC information also apply. | `{'path': 'scripts/lib/open511.mjs'}` |
| BC Wildfire Service (OpenMaps) | `openmaps.gov.bc.ca` | Open Government Licence - British Columbia; redistribution granted (copy, modify, publish, distribute, including commercial use) with attribution | `{'path': 'scripts/wildfire/bc-fire-points.mjs'}` |
| Bank of Canada | `www.bankofcanada.ca` | Bank of Canada Terms of Use — permission to freely use, copy, distribute and transmit website content with attribution (https://www.bankofcanada.ca/terms/) | `{'path': 'scripts/lib/boc-valet.mjs'}`, `{'path': 'scripts/seed-yield-curve-ca.mjs'}` |
| Barchart | `www.barchart.com` | Barchart terms; redistribution requires review | `{'path': 'scripts/seed-fear-greed.mjs'}` |
| Brave Search API | `api.search.brave.com` | Brave Search API terms | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'server/worldmonitor/market/v1/stock-news-search.ts'}` |
| British Geological Survey World Mineral Statistics | `ogcapi.bgs.ac.uk` | BGS mineral statistics terms; attribution required; redistribution restricted | `{'path': 'scripts/seed-mineral-production.mjs'}` |
| British Geological Survey World Mineral Statistics | `www.bgs.ac.uk` | BGS mineral statistics terms; attribution required; redistribution restricted | `{'path': 'scripts/seed-supply-vulnerability.mjs'}` |
| CFTC Commitments of Traders | `publicreporting.cftc.gov` | U.S. government public data; endpoint terms apply | `{'path': 'scripts/seed-cot.mjs'}` |
| CFTC public notices | `www.cftc.gov` | U.S. government public data; CFTC terms apply | `{'path': 'scripts/seed-regulatory-actions.mjs'}` |
| CWFIS / CWFIF (NRCan) | `geoserver.cwfif.nrcan.gc.ca` | Open Government Licence - Canada; redistribution granted (copy, modify, publish, distribute, including commercial use) with attribution | `{'path': 'scripts/wildfire/cwfis-wfs.mjs'}` |
| CelesTrak | `celestrak.org` | Public U.S. Space Force GP orbit elements republished by CelesTrak; CelesTrak usage terms apply and require review | `{'path': 'scripts/_orbital-catalog.mjs'}`, `{'path': 'scripts/ais-relay.cjs'}` |
| ChatGPT link | `chatgpt.com` | Excluded: documentation/UI link | `{'path': 'api/oauth/_client-metadata.js'}` |
| City of Toronto Open Data | `ckan0.cf.opendata.inter.prod-toronto.ca` | CKAN package_show for police-annual-statistical-report-calls-for-service-attended (package id bfffadee-e6e5-4404-8455-e67e9ea11ba7) returned license_id=notspecified, license_title="License not specified", and isopen=false on 2026-09-03. The portal dataset page displays Open Government Licence - Toronto, but that claim is not data-bound to the CKAN package metadata. | `{'path': 'scripts/lib/tps-open-data.mjs'}` |
| City of Toronto Open Data | `open.toronto.ca` | CKAN package_show for police-annual-statistical-report-calls-for-service-attended (package id bfffadee-e6e5-4404-8455-e67e9ea11ba7) returned license_id=notspecified, license_title="License not specified", and isopen=false on 2026-09-03. The portal dataset page displays Open Government Licence - Toronto, but that claim is not data-bound to the CKAN package metadata. | `{'path': 'scripts/lib/tps-open-data.mjs'}` |
| City of Toronto Open Data | `secure.toronto.ca` | CKAN package_show for road-restrictions: license_id=notspecified, license_title="License not specified" (https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=road-restrictions). Portal dataset page chrome links OGL-Toronto but is not data-bound to this dataset. | `{'path': 'scripts/lib/toronto-road-restrictions.mjs'}` |
| Claude link | `claude.ai` | Excluded: documentation/UI link | `{'path': 'api/oauth/_client-metadata.js'}`, `{'path': 'src/config/mcp-agent-clients.ts'}` |
| Clerk identity service | `api.clerk.com` | Excluded: authentication/control-plane service | `{'path': 'api/_desktop-auth.ts'}`, `{'path': 'api/user/passkey-offer.ts'}` (+1) |
| Cloudflare Browser MCP | `browser.mcp.cloudflare.com` | Excluded: optional rendering/automation connector | `{'path': 'src/services/mcp-store.ts'}` |
| Cloudflare Radar MCP | `radar.mcp.cloudflare.com` | Excluded: optional user-configured MCP connector | `{'path': 'src/services/mcp-store.ts'}` |
| CoinPaprika | `api.coinpaprika.com` | CoinPaprika API terms | `{'path': 'scripts/_seed-utils.mjs'}`, `{'path': 'scripts/ais-relay.cjs'}` (+1) |
| ENTSO-E Transparency Platform | `web-api.tp.entsoe.eu` | ENTSO-E Transparency Platform terms | `{'path': 'scripts/seed-electricity-prices.mjs'}` |
| EPA RadNet | `radnet.epa.gov` | U.S. government public data; EPA terms apply | `{'path': 'scripts/seed-radiation-watch.mjs'}` |
| EUMETSAT EUMETView | `view.eumetsat.int` | EUMETSAT Data Policy: Meteosat advanced image products are Core data, free and unrestricted for any use | `{'path': 'src/services/orbital/archive-eumetsat.ts'}`, `{'path': 'src/services/orbital/crop-url.ts'}` |
| Earthquakes Canada (NRCan) | `www.earthquakescanada.nrcan.gc.ca` | Earthquakes Canada citation terms; live Atom redistribution not explicitly granted (historical catalogues on the Open Government Portal are OGL-Canada) | `{'path': 'scripts/seismology/nrcan-atom.mjs'}` |
| Element84 Earth Search STAC | `earth-search.aws.element84.com` | AWS Open Data and dataset-specific collection licenses | `{'path': 'scripts/generate-orbital-mission-coverage.mjs'}`, `{'path': 'server/worldmonitor/imagery/v1/search-imagery.ts'}` |
| Ember electricity data | `files.ember-energy.org` | CC BY 4.0 (Ember dataset) | `{'path': 'scripts/seed-ember-electricity.mjs'}` |
| Environment and Climate Change Canada (ECCC) | `api.weather.gc.ca` | ECCC Data Server End-use Licence; Government of Canada open data | `{'path': 'scripts/_weather-alert-select.mjs'}` |
| Example domain placeholder | `example.com` | Excluded: documentation/test placeholder | `{'path': 'scripts/mcp-live-smoke.mjs'}`, `{'path': 'scripts/openapi-inject-examples.mjs'}` (+2) |
| FAOSTAT | `api.data.apps.fao.org` | FAOSTAT CC-BY; attribution to FAO required | `{'path': 'scripts/seed-food-stocks.mjs'}` |
| FAOSTAT | `data.apps.fao.org` | FAOSTAT CC-BY; attribution to FAO required | `{'path': 'scripts/seed-food-stocks.mjs'}` |
| FAOSTAT | `fenixservices.fao.org` | FAOSTAT CC-BY; attribution to FAO required | — |
| FINRA | `feeds.finra.org` | FINRA feed terms | `{'path': 'scripts/seed-regulatory-actions.mjs'}` |
| Financial Action Task Force (FATF) | `www.fatf-gafi.org` | FATF website and publication terms | `{'path': 'scripts/seed-fatf-listing.mjs'}` |
| Firecrawl | `api.firecrawl.dev` | Firecrawl API terms | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-grocery-basket.mjs'}` |
| GTA Update | `gtaupdate.com` | Reuse permission held by WorldMonitor, as confirmed by the repository owner on 2026-08-21. The private grant is not stored in this public repository. Production activation remains separately blocked on official TPS/TFS upstream provenance and the safety, cadence, capacity, and product acceptance gates in issue #7012. | `{'path': 'scripts/lib/gta-update.mjs'}` |
| Global Affairs Canada (SEMA consolidated sanctions) | `www.international.gc.ca` | Government of Canada website terms; no explicit redistribution licence on the SEMA XML. Canada.ca terms restrict commercial reproduction unless otherwise specified. The Open Government Licence page on this host covers international-assistance open data sets, not this sanctions list. | `{'path': 'scripts/_sema-sanctions.mjs'}` |
| Global Energy Monitor | `globalenergymonitor.org` | CC BY 4.0 for published datasets unless the dataset page states otherwise | `{'path': 'scripts/import-gem-pipelines.mjs'}`, `{'path': 'src/components/PipelineStatusPanel.ts'}` (+1) |
| Google account sign-in | `accounts.google.com` | Excluded: authentication/UI link | `{'path': 'src/components/LiveNewsPanel.ts'}` |
| Hyperliquid | `api.hyperliquid.xyz` | Hyperliquid API terms | `{'path': 'scripts/seed-hyperliquid-flow.mjs'}` |
| ILOSTAT | `sdmx.ilo.org` | ILOSTAT datasets and metadata published from 3 May 2023 are licensed under CC BY 4.0. | `{'path': 'scripts/_demographics-capability-source.mjs'}` |
| India Meteorological Department | `api.imd.gov.in` | IMD public API is account- and key-gated. RTI IMETD/R/E/25/00381 states APIs are without charges for non-commercial use only. World Monitor public-display and redistribution rights are validated. | `{'path': 'scripts/lib/imd-cyclone-marine.mjs'}` |
| India Meteorological Department | `mausam.imd.gov.in` | Public IMD sea-area and coastal bulletin pages, parsed without an account or key. The RTI IMETD/R/E/25/00381 non-commercial-only terms recorded for the IMD API apply to these pages too. World Monitor public-display and redistribution rights are validated. | `{'path': 'scripts/lib/imd-cyclone-marine.mjs'}`, `{'path': 'src/app/data-loader.ts'}` |
| India Meteorological Department | `rsmcnewdelhi.imd.gov.in` | Official RSMC New Delhi visualization pages cited for attribution and source links, not scraped. | `{'path': 'scripts/lib/imd-cyclone-marine.mjs'}` |
| Internal example placeholder | `internal.example.com` | Excluded: documentation/test placeholder | — |
| International Forum of Sovereign Wealth Funds | `www.ifswf.org` | Provider terms; attribution and redistribution require review | `{'path': 'scripts/seed-sovereign-wealth.mjs'}` |
| International Trade Administration (US Consolidated Screening List) | `data.trade.gov` | US government work. The ITA Data API terms of service (developer.trade.gov/terms-of-service) require the notice: This product uses the International Trade Administration's Data API but is not endorsed or certified by the International Trade Administration. | `{'path': 'scripts/_csl-sanctions.mjs'}` |
| Kalshi | `api.elections.kalshi.com` | Kalshi API terms; commercial-use and redistribution terms require review | `{'path': 'scripts/_forecast-market-settlements.mjs'}`, `{'path': 'scripts/seed-prediction-markets.mjs'}` |
| Linear MCP | `mcp.linear.app` | Excluded: optional user-configured MCP connector | `{'path': 'src/services/mcp-store.ts'}` |
| Local development transport | `localhost` | Excluded: local development/test transport | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'server/worldmonitor/research/v1/list-tech-events.ts'}` (+2) |
| Local loopback transport | `127.0.0.1` | Excluded: local development/desktop transport | `{'path': 'scripts/measure-trade-animation-rebuild.mjs'}`, `{'path': 'scripts/profile-news-hybrid-clustering-7782-dashboard.mjs'}` (+2) |
| Manitoba 511 | `www.manitoba511.ca` | Contains information from the Government of Manitoba, licensed under the OpenMB Information and Data Use License (Manitoba.ca/OpenMB). Manitoba 511 developer copy permits creating traffic apps; no separate developer access agreement is published. | `{'path': 'scripts/lib/provincial-511.mjs'}` |
| Microsoft Planetary Computer | `planetarycomputer.microsoft.com` | Copernicus Sentinel data under the Copernicus open licence; Landsat data are USGS public domain; Planetary Computer terms of use apply | `{'path': 'scripts/_orbital-change.mjs'}`, `{'path': 'scripts/_orbital-sites.mjs'}` (+6) |
| NASA Earthdata CMR | `cmr.earthdata.nasa.gov` | U.S. government public metadata; NASA Earthdata terms apply | `{'path': 'scripts/_reservoir-levels.mjs'}` |
| NASA FIRMS | `firms.modaps.eosdis.nasa.gov` | NASA FIRMS provider terms apply; redistribution terms require review | `{'path': 'scripts/wildfire/firms-area.mjs'}` |
| NASA FIRMS | `firms2.modaps.eosdis.nasa.gov` | NASA FIRMS provider terms apply; redistribution terms require review | — |
| NASA GIBS | `gibs.earthdata.nasa.gov` | NASA Earth science data are openly shared without restriction (CC0 unless marked); GIBS asks clients to acknowledge it | `{'path': 'src/services/orbital/archive-gibs.ts'}`, `{'path': 'src/services/orbital/crop-url.ts'}` |
| NSIDC | `noaadata.apps.nsidc.org` | U.S. government/public dataset terms; collection-specific license applies | `{'path': 'scripts/seed-climate-ocean-ice.mjs'}` |
| NSIDC | `nsidc.org` | U.S. government/public dataset terms; collection-specific license applies | `{'path': 'scripts/seed-reservoir-levels.mjs'}`, `{'path': 'src/components/reservoir-levels-view.ts'}` |
| NVD (NIST) | `nvd.nist.gov` | Public domain (US Federal Government work) | `{'path': 'scripts/seed-cve-reference.mjs'}` |
| NVD (NIST) | `services.nvd.nist.gov` | Public domain (US Federal Government work) | `{'path': 'scripts/seed-cve-reference.mjs'}` |
| Ontario 511 | `511on.ca` | Ontario 511 API terms; Government of Ontario data; attribution required | `{'path': 'scripts/lib/provincial-511.mjs'}` |
| OpenAQ | `api.openaq.org` | CC BY 4.0 (dataset/API terms may vary by measurement source) | `{'path': 'scripts/seed-health-air-quality.mjs'}` |
| OpenSanctions | `api.opensanctions.org` | OpenSanctions terms; dataset-specific license varies by source | — |
| Our World in Data | `ourworldindata.org` | CC BY 4.0 for the dataset unless the dataset page states otherwise | `{'path': 'scripts/seed-low-carbon-generation.mjs'}`, `{'path': 'server/worldmonitor/resilience/v1/_dimension-scorers.ts'}` (+1) |
| Our World in Data | `owid-public.owid.io` | CC BY 4.0 for the dataset unless the dataset page states otherwise | `{'path': 'scripts/seed-owid-energy-mix.mjs'}` |
| PURL namespace | `purl.org` | Excluded: schema/namespace reference | `{'path': 'src/services/rss.ts'}` |
| Parallel Search MCP | `search.parallel.ai` | Excluded: optional user-configured MCP connector | `{'path': 'src/services/mcp-store.ts'}` |
| Proxy URL placeholder | `user` | Excluded: URL-format example | `{'path': 'scripts/_proxy-utils.cjs'}`, `{'path': 'scripts/ais-relay.cjs'}` |
| ReliefWeb (UN OCHA) | `api.reliefweb.int` | UN OCHA/ReliefWeb terms | `{'path': 'scripts/seed-climate-disasters.mjs'}` |
| Reporters Without Borders (RSF) | `rsf.org` | RSF terms; attribution required | `{'path': 'scripts/seed-resilience-static.mjs'}` |
| Resend email service | `api.resend.com` | Excluded: transactional email/control-plane service | `{'path': 'server/worldmonitor/leads/v1/register-interest.ts'}`, `{'path': 'server/worldmonitor/leads/v1/submit-contact.ts'}` |
| Robtex MCP | `mcp.robtex.com` | Excluded: optional user-configured MCP connector | `{'path': 'src/services/mcp-store.ts'}` |
| SEC EDGAR | `data.sec.gov` | U.S. government public data; SEC terms apply | `{'path': 'server/_shared/sec-edgar.ts'}` |
| SEC EDGAR Full-Text Search | `efts.sec.gov` | U.S. government public data; SEC terms apply | `{'path': 'server/_shared/sec-edgar.ts'}` |
| SIPRI Arms Transfers Database | `atbackend.sipri.org` | SIPRI fair use permits limited non-commercial use; commercial use requires prior authorization and may require a royalty | `{'path': 'scripts/_defense-industrial-source.mjs'}` |
| SWF Institute | `www.swfinstitute.org` | Provider terms; attribution and redistribution require review | `{'path': 'scripts/seed-sovereign-wealth.mjs'}` |
| Safecast | `api.safecast.org` | Safecast data/API terms; verify dataset license by endpoint | `{'path': 'scripts/seed-radiation-watch.mjs'}` |
| SaskAlert | `emergencyalert.saskatchewan.ca` | Public SaskAlert mobile JSON at /sapublic/feed.json plus same-host CAP 1.2 JSON details. Government of Saskatchewan website terms exclude some connected subsites; this host is the official public alert feed authorized for canadaAlerts ingest under #6659. Not Pelmorex LMD. | `{'path': 'scripts/lib/saskalert.mjs'}`, `{'path': 'scripts/source-attribution.mjs'}` |
| Sentry error tracking | `us.sentry.io` | Excluded: World Monitor operational telemetry, not an external data provider | `{'path': 'scripts/audit-sentry-resolve-pins.mjs'}`, `{'path': 'scripts/sync-sentry-convex-probe-filters.mjs'}` |
| SerpAPI | `serpapi.com` | SerpAPI terms | `{'path': 'server/worldmonitor/market/v1/stock-news-search.ts'}` |
| Shanghai Financial Portal | `jrj.sh.gov.cn` | Shanghai Financial Portal copyright statement section 2 (https://jrj.sh.gov.cn/BQSM/index.html), reviewed 2026-10-24. Numeric facts and publication metadata only; retain the credited underlying source. No article prose or third-party media redistribution. | `{'path': 'scripts/_china-macro-contract.mjs'}`, `{'path': 'scripts/china-macro/source-contracts.mjs'}` |
| SlideRule Earth | `sliderule.slideruleearth.io` | Public NASA-funded processing service; output carries the source dataset terms (ICESat-2 ATL13 and ATL06, NSIDC) | `{'path': 'scripts/_reservoir-levels.mjs'}` |
| SlideRule Earth | `slideruleearth.io` | Public NASA-funded processing service; output carries the source dataset terms (ICESat-2 ATL13 and ATL06, NSIDC) | `{'path': 'scripts/seed-reservoir-levels.mjs'}`, `{'path': 'src/components/reservoir-levels-view.ts'}` |
| Statistics Canada | `www150.statcan.gc.ca` | Statistics Canada Open Licence (Open Government Licence — Canada); use, reproduce, publish, freely distribute or sell with attribution (https://www.statcan.gc.ca/en/terms-conditions/open-licence) | `{'path': 'scripts/lib/statcan-wds.mjs'}`, `{'path': 'server/worldmonitor/resilience/v1/_canada-national-overlay.ts'}` (+1) |
| TeleGeography Submarine Cable Map | `www.submarinecablemap.com` | TeleGeography proprietary/provider terms | `{'path': 'scripts/check-submarine-cable-gaps.mjs'}`, `{'path': 'scripts/seed-submarine-cables.mjs'}` |
| Toronto Fire Services | `www.toronto.ca` | Direct permission: World Monitor's owner confirmed on 2026-08-21 that World Monitor holds redistribution and public-display rights for the Toronto Fire Services live CAD XML. This does not claim that the feed is licensed under the City of Toronto Open Government Licence: no data-bound CKAN package was found for toronto-fire-active-incidents or livecad.xml. City of Toronto copyright and the source-specific permission still apply. Not the historical fire-incidents CKAN datasets. | `{'path': 'scripts/lib/toronto-official-cad.mjs'}` |
| Toronto Police Service | `services.arcgis.com` | Open Government Licence – Ontario as published on the TPS Calls for Service Experience item a22f5295933e48a5b0a4c90cd3c4cae1 (licenseInfo), plus TPS Public Safety Data Portal terms on that item: no identification of individuals, no TPS marks. Layer C4S_Public_NoGO is the privacy-filtered public Calls-for-Service map (refresh ~20 min). Not Major Crime Indicators / YTD. | `{'path': 'scripts/lib/toronto-official-cad.mjs'}`, `{'path': 'scripts/lib/tps-open-data.mjs'}` |
| Toronto Police Service Open Data | `data.tps.ca` | Custom licence based on the Open Government Licence - Ontario. The Major Crime Indicators FeatureServer (serviceItemId 0a239a5563a344a3bbf8452504ed8d68) requires: "Contains information licensed under the Open Government Licence - Ontario." Credit Toronto Police Service without crests, logos, flags, or official marks. No TPS endorsement. Locations are deliberately offset; do not present them as precise addresses. Do not merge or link the data with other databases for the purpose of identifying a person, business, or organization. Do not fill privacy exclusions from GTA Update, news, radio, or another source. Evidence: https://www.tps.ca/data-maps/open-data/ and the item-level FeatureServer description on https://data.tps.ca/. | `{'path': 'scripts/lib/tps-open-data.mjs'}` |
| Toronto Police Service Open Data | `www.tps.ca` | Custom licence based on the Open Government Licence - Ontario. The Major Crime Indicators FeatureServer (serviceItemId 0a239a5563a344a3bbf8452504ed8d68) requires: "Contains information licensed under the Open Government Licence - Ontario." Credit Toronto Police Service without crests, logos, flags, or official marks. No TPS endorsement. Locations are deliberately offset; do not present them as precise addresses. Do not merge or link the data with other databases for the purpose of identifying a person, business, or organization. Do not fill privacy exclusions from GTA Update, news, radio, or another source. Evidence: https://www.tps.ca/data-maps/open-data/ and the item-level FeatureServer description on https://data.tps.ca/. | `{'path': 'scripts/lib/tps-open-data.mjs'}` |
| Toronto Transit Commission (TTC) GTFS-RT | `gtfsrt.ttc.ca` | CKAN package_show for ttc-gtfs-realtime-gtfs-rt: license_id=notspecified, isopen=false (https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-gtfs-realtime-gtfs-rt). Portal dataset page chrome links OGL-Toronto but is not data-bound to this dataset. | `{'path': 'scripts/seed-ttc-alerts.mjs'}` |
| TradingView | `scanner.tradingview.com` | TradingView terms; the screener scan endpoint is undocumented and redistribution requires review | `{'path': 'scripts/_sp500-breadth.mjs'}` |
| Travelpayouts flight-price data | `api.travelpayouts.com` | Travelpayouts API terms; commercial use and redistribution require review | `{'path': 'server/worldmonitor/aviation/v1/_providers/travelpayouts_data.ts'}` |
| UNDP Human Development Report | `hdr.undp.org` | UNDP data terms; dataset-specific license applies | `{'path': 'scripts/benchmark-resilience-external.mjs'}` |
| US Restricted Parties feed (Tensorust LLC) | `release-assets.githubusercontent.com` | CC BY 4.0 (Creative Commons Attribution 4.0 International) | `{'path': 'scripts/_us-restricted-sanctions.mjs'}` |
| USDA FAS PSD | `api.fas.usda.gov` | U.S. government public-domain PSD Open Data | `{'path': 'scripts/seed-food-stocks.mjs'}` |
| USDA FAS PSD | `apps.fas.usda.gov` | U.S. government public-domain PSD Open Data | — |
| USGS ScienceBase (Mineral Commodity Summaries) | `www.sciencebase.gov` | U.S. government public-domain mineral statistics (USGS MCS data release) | `{'path': 'scripts/seed-mineral-production.mjs'}`, `{'path': 'scripts/seed-supply-vulnerability.mjs'}` |
| USPTO Open Data Portal | `api.uspto.gov` | U.S. government public data; USPTO terms apply | `{'path': 'scripts/_defense-patents-source.mjs'}` |
| USPTO Open Data Portal | `data.uspto.gov` | U.S. government public data; USPTO terms apply | `{'path': 'scripts/_defense-patents-source.mjs'}` |
| United Nations Population Division | `population.un.org` | UN World Population Prospects 2024 is licensed under CC BY 3.0 IGO. | `{'path': 'scripts/_demographics-capability-source.mjs'}` |
| VIA Rail Tracker (unofficial) | `tsimobile.viarail.ca` | VIA Rail Site Terms prohibit commercial use of the Site (https://www.viarail.ca/en/terms-and-conditions). Developer Resources publish GTFS only under Open Government Licence – Canada v2 (https://www.viarail.ca/en/developer-resources); that OGL grant does not cover tsimobile.viarail.ca unofficial live JSON. Terms require review. | `{'path': 'scripts/viarail-live.mjs'}` |
| Vision of Humanity / Global Peace Index | `www.visionofhumanity.org` | Vision of Humanity terms; attribution required | `{'path': 'scripts/seed-resilience-static.mjs'}` |
| W3C schema reference | `www.w3.org` | Excluded: schema/standards reference | `{'path': 'src/components/MapLocateControl.ts'}`, `{'path': 'src/embed/panels/fear-greed.ts'}` |
| Wikidata | `query.wikidata.org` | Creative Commons CC0 1.0 Universal | `{'path': 'scripts/freeze-resilience-ranking.mjs'}`, `{'path': 'server/worldmonitor/intelligence/v1/get-country-facts.ts'}` |
| World Air Quality Index (WAQI) | `api.waqi.info` | WAQI API terms; attribution required | `{'path': 'scripts/seed-health-air-quality.mjs'}` |
| World Bank Open Data | `api.worldbank.org` | World Development Indicators are licensed under CC BY 4.0. UNESCO UIS indicators mirrored through WDI also require the UIS attribution stated in the public source documentation. | `{'path': 'scripts/_defense-industrial-source.mjs'}`, `{'path': 'scripts/_demographics-capability-source.mjs'}` (+16) |
| World Bank Open Data | `datacatalogfiles.worldbank.org` | Worldwide Governance Indicators: Creative Commons Attribution 4.0 (CC BY 4.0). | `{'path': 'scripts/seed-cii-structural-prior.mjs'}` |
| World Monitor proxy | `proxy.worldmonitor.app` | Excluded: World Monitor own service/control plane | `{'path': 'api/widget-agent.ts'}`, `{'path': 'scripts/seed-security-advisories.mjs'}` (+1) |
| World Monitor web app | `worldmonitor.app` | Excluded: World Monitor own web application | `{'path': 'api/_agent-metadata.ts'}`, `{'path': 'api/a2a.ts'}` (+54) |
| World Monitor web app | `www.worldmonitor.app` | Excluded: World Monitor own web application | `{'path': 'api/_cors.js'}`, `{'path': 'api/a2a.ts'}` (+63) |
| WorldMonitor test origin | `worldmonitor.invalid` | Excluded: test-only origin | `{'path': 'api/_md-url-twin.ts'}`, `{'path': 'src/shared/public-rpc-cache.ts'}` (+1) |
| X API | `api.x.com` | X Developer Agreement and Policy; ingest and retain only allowed fields and honor deletion, protection, and withholding signals | `{'path': 'scripts/cross-strait-activity/japan-x.mjs'}`, `{'path': 'scripts/lib/company-monitoring-x-provider.mjs'}` (+3) |
| abacus.worldmonitor.app | `abacus.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/check-analytics-collector.mjs'}`, `{'path': 'scripts/seo-umami-collect.mjs'}` (+1) |
| acleddata.com | `acleddata.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-conflict-intel.mjs'}`, `{'path': 'scripts/seed-unrest-events.mjs'}` (+3) |
| admin.gse.com.ge | `admin.gse.com.ge` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| adsb.fi Open Data | `opendata.adsb.fi` | Public API restricted to personal, non-commercial use; 1 request/second limit | `{'path': 'scripts/seed-military-flights.mjs'}`, `{'path': 'src/components/MapPopup.ts'}` |
| adsb.lol | `api.adsb.lol` | Open Database License (ODbL) 1.0 | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-military-flights.mjs'}` (+2) |
| ae.usembassy.gov | `ae.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| aerotime.aero | `aerotime.aero` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| agentskills.io | `agentskills.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/skills/fetch-agentskills.ts'}` |
| agriculture.ld.admin.ch | `agriculture.ld.admin.ch` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/foag.mjs'}` |
| agsi.gie.eu | `agsi.gie.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-gas-storage-countries.mjs'}`, `{'path': 'scripts/seed-gie-gas-storage.mjs'}` |
| airlinegeeks.com | `airlinegeeks.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| airplanes.live | `api.airplanes.live` | Public API restricted to non-commercial use; 1 request/second limit | `{'path': 'scripts/seed-military-flights.mjs'}`, `{'path': 'src/components/MapPopup.ts'}` |
| ammancity.gov.jo | `ammancity.gov.jo` | Site footer: "All rights reserved © 2001 - 2026 - Greater Amman Municipality"; displayed with attribution under the free-dashboard posture | `{'path': 'scripts/lib/food-prices-adapters/amman.mjs'}` |
| api-nms.aim.faa.gov | `api-nms.aim.faa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-notam-nms.mjs'}` |
| api.abuseipdb.com | `api.abuseipdb.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| api.anthropic.com | `api.anthropic.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'server/_shared/llm-anthropic.ts'}` |
| api.aviationstack.com | `api.aviationstack.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-aviation.mjs'}` |
| api.cammesa.com | `api.cammesa.com` | All rights reserved | `{'path': 'scripts/_regional-energy-source.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| api.cloudflare.com | `api.cloudflare.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_kv-storage.mjs'}`, `{'path': 'scripts/_r2-storage.mjs'}` (+3) |
| api.coingecko.com | `api.coingecko.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| api.data.gov.my | `api.data.gov.my` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_dosm-product-demand.mjs'}`, `{'path': 'scripts/backfill-fuel-prices-prev.mjs'}` (+1) |
| api.datos.gob.mx | `api.datos.gob.mx` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/backfill-fuel-prices-prev.mjs'}` |
| api.e-stat.go.jp | `api.e-stat.go.jp` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-world-cpi-estat.mjs'}` |
| api.eia.gov | `api.eia.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/backfill-fuel-prices-prev.mjs'}`, `{'path': 'scripts/seed-economy.mjs'}` (+4) |
| api.exa.ai | `api.exa.ai` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/lib/company-monitoring-exa.mjs'}` (+3) |
| api.fiscaldata.treasury.gov | `api.fiscaldata.treasury.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-national-debt.mjs'}`, `{'path': 'scripts/seed-supply-chain-trade.mjs'}` |
| api.gdeltproject.org | `api.gdeltproject.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-gdelt-intel.mjs'}`, `{'path': 'scripts/seed-unrest-events.mjs'}` |
| api.gdeltproject.org | `storage.googleapis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_conflict-gdelt-bulk.mjs'}`, `{'path': 'scripts/_gdelt-bulk-materializer.mjs'}` |
| api.github.com | `api.github.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/_github-release.js'}`, `{'path': 'scripts/check-review-pr-token.mjs'}` (+5) |
| api.groq.com | `api.groq.com` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| api.iea.org | `api.iea.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-iea-oil-stocks.mjs'}` |
| api.imf.org | `api.imf.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_seed-utils.mjs'}`, `{'path': 'scripts/backtest-capital-flow-episodes.mjs'}` (+3) |
| api.indexnow.org | `api.indexnow.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seo-indexnow-submit.mjs'}` |
| api.mercadopublico.cl | `api.mercadopublico.cl` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| api.ossinsight.io | `api.ossinsight.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-research.mjs'}` |
| api.planespotters.net | `api.planespotters.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/military/v1/get-wingbits-live-flight.ts'}` |
| api.rainviewer.com | `api.rainviewer.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'src/components/DeckGLMap.ts'}` |
| api.riksbank.se | `api.riksbank.se` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-se.mjs'}` |
| api.sam.gov | `api.sam.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| api.scrapecreators.com | `api.scrapecreators.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| api.spdrgoldshares.com | `api.spdrgoldshares.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-gold-etf-flows.mjs'}` |
| api.statistiken.bundesbank.de | `api.statistiken.bundesbank.de` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-de.mjs'}` |
| api.stlouisfed.org | `api.stlouisfed.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-economic-calendar.mjs'}`, `{'path': 'scripts/seed-oecd-lt-rates.mjs'}` (+2) |
| api.ted.europa.eu | `api.ted.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| api.telegram.org | `api.telegram.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/notification-relay.cjs'}`, `{'path': 'scripts/seed-digest-notifications.mjs'}` |
| api.typesafe.ai | `api.typesafe.ai` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/lib/internal-links.mjs'}` |
| api.tzevaadom.co.il | `api.tzevaadom.co.il` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| api.unhcr.org | `api.unhcr.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-displacement-summary.mjs'}` |
| api.usaspending.gov | `api.usaspending.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-usa-spending.mjs'}` |
| api.weather.gov | `api.weather.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_weather-alert-select.mjs'}`, `{'path': 'scripts/lib/grid-clock-sources.mjs'}` |
| api.windy.com | `api.windy.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/mcp/registry/webcam-tools.ts'}`, `{'path': 'api/mcp/skill-extension/generated.ts'}` (+2) |
| api.wto.org | `api.wto.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-supply-chain-trade.mjs'}` |
| archive-api.open-meteo.com | `archive-api.open-meteo.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_open-meteo-archive.mjs'}` |
| arxiv.org | `arxiv.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-research.mjs'}` |
| aws.amazon.com | `aws.amazon.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| basemaps.cartocdn.com | `basemaps.cartocdn.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/basemap-styles.ts'}` |
| bd.usembassy.gov | `bd.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| besttime.app | `besttime.app` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| bothsidesofthetable.com | `bothsidesofthetable.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| budgetlab.yale.edu | `budgetlab.yale.edu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_trade-parse-utils.mjs'}` |
| canadabuys.canada.ca | `canadabuys.canada.ca` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| cdn.debugbear.com | `cdn.debugbear.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/bootstrap/debugbear-rum.ts'}` |
| challenges.cloudflare.com | `challenges.cloudflare.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'server/_shared/turnstile.ts'}` |
| climate.copernicus.eu | `climate.copernicus.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| cloudflare-dns.com | `cloudflare-dns.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/_notification-webhook-ssrf.ts'}`, `{'path': 'api/mcp-proxy.ts'}` (+2) |
| co.usembassy.gov | `co.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| collisionconf.com | `collisionconf.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| commodity.worldmonitor.app | `commodity.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/app/panel-layout.ts'}`, `{'path': 'src/config/variant-meta.ts'}` |
| comtradeapi.un.org | `comtradeapi.un.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-comtrade-bilateral-hs4.mjs'}`, `{'path': 'scripts/seed-oil-trade-series.mjs'}` (+5) |
| contxto.com | `contxto.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| corridorrisk.io | `corridorrisk.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| creativecommons.org | `creativecommons.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/build-open-data-chokepoints.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` (+1) |
| creg.gov.co | `creg.gov.co` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| cursor.com | `cursor.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/mcp-agent-clients.ts'}` |
| customer.dodopayments.com | `customer.dodopayments.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/services/billing.ts'}` |
| dados.ons.org.br | `dados.ons.org.br` | CC-BY | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| data-api.ecb.europa.eu | `data-api.ecb.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/yield-curves/oecd-lt.mjs'}`, `{'path': 'scripts/seed-ecb-fx-rates.mjs'}` (+2) |
| data.1212.mn | `data.1212.mn` | Table metadata names the National Statistics Office of Mongolia as source; no reuse licence stated; displayed with attribution under the free-dashboard posture | `{'path': 'scripts/lib/food-prices-adapters/nsomn.mjs'}` |
| data.api.abs.gov.au | `data.api.abs.gov.au` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-world-cpi-abs.mjs'}` |
| data.ecb.europa.eu | `data.ecb.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-fsi-eu.mjs'}` |
| data.humdata.org | `data.humdata.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_conflict-hapi.mjs'}`, `{'path': 'scripts/benchmark-resilience-external.mjs'}` (+2) |
| data.moa.gov.tw | `data.moa.gov.tw` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/twmoa.mjs'}` |
| data.norges-bank.no | `data.norges-bank.no` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-no.mjs'}` |
| data.snb.ch | `data.snb.ch` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-ch.mjs'}` |
| data.ssb.no | `data.ssb.no` | CC BY 4.0 (SSB Public APIs and Licence pages) | `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| data.stat.gov.lv | `data.stat.gov.lv` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/csblv.mjs'}` |
| data.stats.gov.cn | `data.stats.gov.cn` | NBS Terms of Service section III permits statistical data download and use, with NBS attribution (https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html; checked 2026-10-24). Saved-response extraction only; canonical publication remains blocked by missing source clocks. No authenticated download, application-code reuse or access bypass. | `{'path': 'scripts/china-macro/extract-nbs-national-data.mjs'}` |
| data.unhcr.org | `data.unhcr.org` | ODP footer states datasets are CC BY 4.0 (observed 2026-10-19). | `{'path': 'scripts/seed-cross-border-arrivals.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` |
| data.weather.gov.hk | `data.weather.gov.hk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/natural/western-pacific-cyclones.mjs'}` |
| data.worldbank.org | `data.worldbank.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seed-education-attainment.mjs'}`, `{'path': 'scripts/seed-wb-external-debt.mjs'}` |
| datalab.wto.org | `datalab.wto.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-hormuz.mjs'}` |
| dataservices.icao.int | `dataservices.icao.int` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-aviation.mjs'}` |
| datosabiertos.dgcp.gob.do | `datosabiertos.dgcp.gob.do` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| de.usembassy.gov | `de.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| dev.events | `dev.events` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-research.mjs'}` (+1) |
| discord.com | `discord.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/channel-oauth-bind.ts'}`, `{'path': 'api/discord/oauth/callback.ts'}` (+1) |
| discord.gg | `discord.gg` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| disrupt-africa.com | `disrupt-africa.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| do.usembassy.gov | `do.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| doe.gov.ph | `d24qbtp4vooyzi.cloudfront.net` | Public domain unless otherwise stated (site footer) | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}` |
| doe.gov.ph | `doe.gov.ph` | Public domain unless otherwise stated (site footer) | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| drmkc.jrc.ec.europa.eu | `drmkc.jrc.ec.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/benchmark-resilience-external.mjs'}` |
| dtmapi.iom.int | `dtmapi.iom.int` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-dtm-displacement.mjs'}` |
| earthobservatory.nasa.gov | `earthobservatory.nasa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| earthquake.usgs.gov | `earthquake.usgs.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/mcp/skill-extension/generated.ts'}`, `{'path': 'scripts/seed-earthquakes.mjs'}` |
| en.sge.com.cn | `en.sge.com.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-physical-premiums.mjs'}` |
| en.sse.net.cn | `en.sse.net.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-supply-chain-trade.mjs'}` |
| en.wikipedia.org | `en.wikipedia.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-sovereign-wealth.mjs'}`, `{'path': 'server/worldmonitor/intelligence/v1/get-country-facts.ts'}` |
| energy.ec.europa.eu | `energy.ec.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/backfill-fuel-prices-prev.mjs'}`, `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| energy.worldmonitor.app | `energy.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/app/panel-layout.ts'}`, `{'path': 'src/config/variant-meta.ts'}` |
| english.customs.gov.cn | `english.customs.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-macro/source-contracts.mjs'}` |
| eonet.gsfc.nasa.gov | `eonet.gsfc.nasa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-natural-events.mjs'}` |
| epads.gov.pk | `epads.gov.pk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| epms.ppra.gov.pk | `epms.ppra.gov.pk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| erp.powergrid.gov.bd | `erp.powergrid.gov.bd` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| evn.com.vn | `evn.com.vn` | All rights reserved | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| ezamowienia.gov.pl | `ezamowienia.gov.pl` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| factchecktools.googleapis.com | `factchecktools.googleapis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/_shared/fact-checks.ts'}` |
| fawazahmed0 currency-api | `currency-api.pages.dev` | CC0-1.0 per the project repository (github.com/fawazahmed0/exchange-api); aggregated daily exchange rates, upstream sources not itemised by the project | `{'path': 'scripts/_currency-api.mjs'}` |
| fc.yahoo.com | `fc.yahoo.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_yahoo-sector-valuations.cjs'}` |
| fccc.gov.fj | `fccc.gov.fj` | All rights reserved; robots content-signal ai-train=no, use=reference | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| fdw.fews.net | `fdw.fews.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/fews.mjs'}` |
| feodotracker.abuse.ch | `feodotracker.abuse.ch` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| finance.worldmonitor.app | `finance.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/app/panel-layout.ts'}`, `{'path': 'src/config/variant-meta.ts'}` |
| finnhub.io | `finnhub.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/symbol-search.ts'}`, `{'path': 'scripts/ais-relay.cjs'}` (+6) |
| fonts.googleapis.com | `fonts.googleapis.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'server/_shared/brief-carousel-render.ts'}` |
| fred.stlouisfed.org | `fred.stlouisfed.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-oecd-lt-rates.mjs'}` |
| freeipapi.com | `freeipapi.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| gain.nd.edu | `gain.nd.edu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/benchmark-resilience-external.mjs'}` |
| gamma-api.polymarket.com | `gamma-api.polymarket.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_forecast-market-settlements.mjs'}`, `{'path': 'scripts/ais-relay.cjs'}` (+1) |
| geospatial-usace.opendata.arcgis.com | `geospatial-usace.opendata.arcgis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/fetch-mirta-bases.mjs'}` |
| ghoapi.azureedge.net | `ghoapi.azureedge.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-resilience-static.mjs'}` |
| github.com | `github.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/download.js'}`, `{'path': 'api/health.js'}` (+13) |
| gml.noaa.gov | `gml.noaa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-co2-monitoring.mjs'}` |
| gpsjam.org | `gpsjam.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/fetch-gpsjam.mjs'}` |
| hacker-news.firebaseio.com | `hacker-news.firebaseio.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-research.mjs'}` |
| hapi.humdata.org | `hapi.humdata.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_conflict-hapi.mjs'}` |
| happy.worldmonitor.app | `happy.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/variant-meta.ts'}` |
| home.treasury.gov | `home.treasury.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-us-treasury-par-yield.mjs'}` |
| hormuz.data-tracking.net | `hormuz.data-tracking.net` | Documented public API, no key (https://hormuz.data-tracking.net/api-docs, reviewed 2026-10-29): data reusable including commercially under CC BY 4.0 with attribution to hormuz.data-tracking.net; republished UKMTO incident reports stay under the Open Government Licence v3.0. The publisher refreshes every 30 minutes and asks clients not to poll faster. | `{'path': 'scripts/seed-ukmto-incidents.mjs'}` |
| hts.usitc.gov | `hts.usitc.gov` | Harmonized Tariff Schedule of the United States, published by the US International Trade Commission; a US federal government work, not subject to copyright (17 U.S.C. 105) | `{'path': 'api/mcp/skill-extension/generated.ts'}`, `{'path': 'scripts/seed-supply-chain-trade.mjs'}` (+1) |
| hub.arcgis.com | `hub.arcgis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-portwatch.mjs'}` |
| iccc.gov.pg | `iccc.gov.pg` | All rights reserved | `{'path': 'scripts/lib/regional-energy-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| id.usembassy.gov | `id.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| identity.dataspace.copernicus.eu | `identity.dataspace.copernicus.eu` | Copernicus Sentinel data policy: free, full and open access, including commercial use and redistribution, with the Copernicus credit | `{'path': 'scripts/seed-no2-activity.mjs'}` |
| in.usembassy.gov | `in.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| insideclimatenews.org | `insideclimatenews.org` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| ipinfo.io | `ipinfo.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| iss.moex.com | `iss.moex.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_country-stock-index-moex.mjs'}` |
| it.usembassy.gov | `it.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| jmespath.org | `jmespath.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/mcp/constants.ts'}` |
| jsDelivr asset CDN | `cdn.jsdelivr.net` | Excluded: presentation asset/CDN | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'server/_shared/brief-carousel-render.ts'}` |
| kalshi.com | `kalshi.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_bet-templates-markets.mjs'}`, `{'path': 'scripts/seed-prediction-markets.mjs'}` |
| kh.usembassy.gov | `kh.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| lavca.org | `lavca.org` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| lindas.cz-aws.net | `lindas.cz-aws.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/foag.mjs'}` |
| live.dodopayments.com | `live.dodopayments.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/product-catalog.js'}`, `{'path': 'scripts/ais-relay.cjs'}` |
| liveuamap.com | `liveuamap.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| lustat.statec.lu | `lustat.statec.lu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/statec.mjs'}` |
| madr.gov.dz | `madr.gov.dz` | Site footer: "حقوق الطبع والنشر, وزارة الفلاحة و التنمية الريفية 2021" (copyright, Ministry of Agriculture and Rural Development); no reuse licence stated; displayed with attribution under the free-dashboard posture | `{'path': 'scripts/lib/food-prices-adapters/madr.mjs'}` |
| makstat.stat.gov.mk | `makstat.stat.gov.mk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/makstat.mjs'}` |
| maps.worldmonitor.app | `maps.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/services/country-geometry.ts'}` |
| mapservices.weather.noaa.gov | `mapservices.weather.noaa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-natural-events.mjs'}` |
| massoutage.com | `massoutage.com` | MassOutage API and compilations CC BY 4.0. Upstream terms continue to apply. | `{'path': 'scripts/lib/grid-clock-sources.mjs'}` |
| me.liveuamap.com | `me.liveuamap.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| mem.gob.gt | `mem.gob.gt` | Data licence unconfirmed; robots content-signal ai-train=no, use=reference | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| mempool.space | `mempool.space` | mempool.space API terms; underlying Bitcoin data is public but endpoint terms apply | `{'path': 'scripts/seed-economy.mjs'}` |
| mercadocentral.gob.ar | `mercadocentral.gob.ar` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/mcba.mjs'}` |
| mm.usembassy.gov | `mm.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| msi.nga.mil | `msi.nga.mil` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/_shared/nga-broadcast-warnings.ts'}` |
| mx.usembassy.gov | `mx.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| my.usembassy.gov | `my.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| myprocurement.treasury.gov.my | `myprocurement.treasury.gov.my` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| nasstatus.faa.gov | `nasstatus.faa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}` |
| nominatim.openstreetmap.org | `nominatim.openstreetmap.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/reverse-geocode.js'}`, `{'path': 'server/worldmonitor/infrastructure/v1/reverse-geocode.ts'}` (+1) |
| npa.gov.gh | `npa.gov.gh` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| oauth.reddit.com | `oauth.reddit.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| oauth2.googleapis.com | `oauth2.googleapis.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seo-gsc-collect.mjs'}` |
| ocds-api.etenders.gov.za | `ocds-api.etenders.gov.za` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| offnadir-delta.com | `offnadir-delta.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| onemileatatime.com | `onemileatatime.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| open-meteo.caseyjhand.com | `open-meteo.caseyjhand.com` | Community-hosted MCP service. Open-Meteo weather data is CC BY 4.0; free API access is non-commercial only. Commercial access requires a paid Open-Meteo plan and compatible hosting. | `{'path': 'src/services/mcp-store.ts'}` |
| open.alberta.ca | `open.alberta.ca` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| open.dosm.gov.my | `open.dosm.gov.my` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_dosm-sitc-trade.mjs'}` |
| open.iub.gov.lv | `open.iub.gov.lv` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| openrouter.ai | `openrouter.ai` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/eval-classify-labels.mjs'}`, `{'path': 'scripts/lib/brief-dedup-consts.mjs'}` (+2) |
| opensky-network.org | `auth.opensky-network.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-military-flights.mjs'}` |
| opensky-network.org | `opensky-network.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-military-flights.mjs'}` (+2) |
| openstreetmap.org | `openstreetmap.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/basemap-styles.ts'}` |
| otx.alienvault.com | `otx.alienvault.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| outbreaknewstoday.com | `outbreaknewstoday.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| overpass-api.de | `overpass-api.de` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/fetch-osm-bases.mjs'}` |
| patents.google.com | `patents.google.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_defense-patents-source.mjs'}` |
| petrobangla.org.bd | `petrobangla.org.bd` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| ph.usembassy.gov | `ph.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| phys.org | `phys.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| pk.usembassy.gov | `pk.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| pl.usembassy.gov | `pl.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| pncp.gov.br | `pncp.gov.br` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| polymarket.com | `polymarket.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/mcp/skill-extension/generated.ts'}`, `{'path': 'scripts/_bet-templates-markets.mjs'}` (+1) |
| portal.korem.kz | `portal.korem.kz` | Unconfirmed | `{'path': 'scripts/lib/regional-energy-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| portwatch.imf.org | `portwatch.imf.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/build-chokepoint-transit-snapshot.mjs'}`, `{'path': 'scripts/seed-oil-trade-series.mjs'}` |
| precios.maga.gob.gt | `precios.maga.gob.gt` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/maga.mjs'}` |
| pro-api.coingecko.com | `pro-api.coingecko.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| production.dataviz.cnn.io | `production.dataviz.cnn.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-fear-greed.mjs'}` |
| protomaps.com | `protomaps.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/basemap-styles.ts'}` |
| public-api.prozorro.gov.ua | `public-api.prozorro.gov.ua` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| public.govdelivery.com | `public.govdelivery.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-regulatory-actions.mjs'}` |
| publicacionexterna.azurewebsites.net | `publicacionexterna.azurewebsites.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| qevdnlpgjxpwusesmtpx.supabase.co | `qevdnlpgjxpwusesmtpx.supabase.co` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/fetch-pizzint-bases.mjs'}` |
| query.sse.com.cn | `query.sse.com.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-corporate-disclosures/adapters.mjs'}` |
| query1.finance.yahoo.com | `query1.finance.yahoo.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_seed-utils.mjs'}`, `{'path': 'scripts/_yahoo-fetch.mjs'}` (+13) |
| radar.cloudflare.com | `radar.cloudflare.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/resilience/v1/_indicator-source-policy.ts'}` |
| raw.githubusercontent.com | `raw.githubusercontent.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/build-plane-alert-watchlist.mjs'}` (+6) |
| reddit.com | `reddit.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/lib/wsb-tickers.cjs'}` (+1) |
| registry.modelcontextprotocol.io | `registry.modelcontextprotocol.io` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/publish-mcp-registry.mjs'}` |
| reliefweb.int | `reliefweb.int` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| restcountries.com | `restcountries.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| sanctionslistservice.ofac.treas.gov | `sanctionslistservice.ofac.treas.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-sanctions-pressure.mjs'}` |
| sccd.royalnavy.mod.uk | `sccd.royalnavy.mod.uk` | UKMTO terms sections 20-23 permit reuse under the Open Government Licence v3.0, subject to excluded third-party rights. Website JSON backend; no verified external developer support contract. | — |
| schema.org | `schema.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/ask.ts'}`, `{'path': 'scripts/build-accuracy-page.mjs'}` (+4) |
| schemas.agentskills.io | `schemas.agentskills.io` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/build-agent-skills-index.mjs'}` |
| sdmx.oecd.org | `sdmx.oecd.org` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| sealevel.nasa.gov | `sealevel.nasa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-ocean-ice.mjs'}` |
| search.seznam.cz | `search.seznam.cz` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| search.worldbank.org | `search.worldbank.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| search.yahoo.com | `search.yahoo.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/services/rss.ts'}` |
| searchadvisor.naver.com | `searchadvisor.naver.com` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| searchconsole.googleapis.com | `searchconsole.googleapis.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seo-gsc-collect.mjs'}` |
| sedeaplicaciones.minetur.gob.es | `sedeaplicaciones.minetur.gob.es` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/backfill-fuel-prices-prev.mjs'}`, `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| services7.arcgis.com | `services7.arcgis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/fetch-mirta-bases.mjs'}` |
| services9.arcgis.com | `services9.arcgis.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/build-chokepoint-transit-snapshot.mjs'}`, `{'path': 'scripts/seed-oil-trade-series.mjs'}` (+4) |
| severeweather.wmo.int | `severeweather.wmo.int` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_weather-alert-select.mjs'}` |
| sg.usembassy.gov | `sg.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| sh.dataspace.copernicus.eu | `sh.dataspace.copernicus.eu` | Copernicus Sentinel data policy: free, full and open access, including commercial use and redistribution, with the Copernicus credit | `{'path': 'scripts/seed-no2-activity.mjs'}` |
| simaniger.net | `simaniger.net` | SIMA Niger asks for the citation "SIMA Niger" and to be contacted before commercial use or mass extraction; polled one weekly bulletin per run | `{'path': 'scripts/lib/food-prices-adapters/sima.mjs'}` |
| simpleflying.com | `simpleflying.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| slack.com | `slack.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/channel-oauth-bind.ts'}`, `{'path': 'api/slack/oauth/callback.ts'}` (+1) |
| ssl.bing.com | `ssl.bing.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seo-bing-collect.mjs'}` |
| stat.gov.kg | `stat.gov.kg` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/nsckg.mjs'}` |
| stat.gov.kz | `stat.gov.kz` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/statkz.mjs'}` |
| stat.ripe.net | `stat.ripe.net` | RIPEstat Service Terms section 3.3: commercial reuse and redistribution require prior written RIPE NCC permission. Integration disabled by default until authorized. | `{'path': 'server/worldmonitor/cyber/v1/get-network-info.ts'}`, `{'path': 'src/components/cyber-network-info.ts'}` |
| stat.uz | `api.siat.stat.uz` | CC BY 4.0 (stat.uz site footer and ODI open-data certificate); a link to www.stat.uz is required | `{'path': 'scripts/lib/food-prices-adapters/statuz.mjs'}` |
| stat.uz | `stat.uz` | CC BY 4.0 (stat.uz site footer and ODI open-data certificate); a link to www.stat.uz is required | `{'path': 'scripts/lib/food-prices-adapters/statuz.mjs'}` |
| stats.bis.org | `stats.bis.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-bis-data.mjs'}`, `{'path': 'scripts/seed-bis-extended.mjs'}` (+2) |
| status.worldmonitor.app | `status.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/status-page-smoke.mjs'}` |
| storage.data.gov.my | `storage.data.gov.my` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/pricecatcher.mjs'}` |
| storage.dosm.gov.my | `storage.dosm.gov.my` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_dosm-sitc-trade.mjs'}` |
| storage.eop.bg | `storage.eop.bg` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| t.me | `t.me` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/telegram-feed.js'}`, `{'path': 'scripts/ais-relay.cjs'}` (+3) |
| tcb.gov.bd | `tcb.gov.bd` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/tcb.mjs'}` |
| tech.worldmonitor.app | `tech.worldmonitor.app` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/app/panel-layout.ts'}`, `{'path': 'src/config/variant-meta.ts'}` |
| tenders.go.ke | `tenders.go.ke` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| tenders.procurement.gov.ge | `tenders.procurement.gov.ge` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| test | `test` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seed-forecasts.mjs'}` |
| test.dodopayments.com | `test.dodopayments.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/product-catalog.js'}`, `{'path': 'scripts/ais-relay.cjs'}` |
| th.usembassy.gov | `th.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| thepointsguy.com | `thepointsguy.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| thinkglobalhealth.github.io | `thinkglobalhealth.github.io` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}`, `{'path': 'scripts/seed-vpd-tracker.mjs'}` |
| tiles.openfreemap.org | `tiles.openfreemap.org` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/basemap.ts'}` |
| tools.cdc.gov | `tools.cdc.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}` |
| travel.state.gov | `travel.state.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| tts.baidu.com | `tts.baidu.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/main.ts'}` |
| twitter.com | `twitter.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/services/story-share.ts'}` |
| ua.usembassy.gov | `ua.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| ucdpapi.pcr.uu.se | `ucdpapi.pcr.uu.se` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-ucdp-events.mjs'}` |
| ugandacoffee.go.ug | `ugandacoffee.go.ug` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/ucda.mjs'}` |
| uis.unesco.org | `uis.unesco.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/resilience/v1/_indicator-source-policy.ts'}` |
| unstats.un.org | `unstats.un.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/build-un-m49-regions.mjs'}` |
| urlhaus-api.abuse.ch | `urlhaus-api.abuse.ch` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-cyber-threats.mjs'}` |
| viewfromthewing.com | `viewfromthewing.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| vn.usembassy.gov | `vn.usembassy.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| vscode.dev | `vscode.dev` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/config/mcp-agent-clients.ts'}` |
| wa.me | `wa.me` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'server/worldmonitor/leads/v1/register-interest.ts'}`, `{'path': 'src/services/story-share.ts'}` |
| wabi-europe-north-b-api.analysis.windows.net | `wabi-europe-north-b-api.analysis.windows.net` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-hormuz.mjs'}` |
| web.archive.org | `web.archive.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-fatf-listing.mjs'}` |
| web.cbr.ru | `web.cbr.ru` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seed-cbr-rates.mjs'}` |
| webcams.windy.com | `webcams.windy.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'shared/pinned-webcams.ts'}` |
| websummit.com | `websummit.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| wingbits.com | `customer-api.wingbits.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-military-flights.mjs'}` (+1) |
| wingbits.com | `ecs-api.wingbits.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/military/v1/get-wingbits-live-flight.ts'}` |
| wingbits.com | `wingbits.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/components/MapPopup.ts'}` |
| wits.worldbank.org | `wits.worldbank.org` | UNCTAD TRAINS tariff data served through the World Bank WITS API; redistribution to paying API customers confirmed by the owner on 2026-10-10 | `{'path': 'api/mcp/skill-extension/generated.ts'}`, `{'path': 'scripts/ais-relay.cjs'}` (+2) |
| workos.com | `workos.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/oauth-authorization-server.ts'}` |
| worldmonitor.mintlify.dev | `worldmonitor.mintlify.dev` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/docs-mcp.ts'}`, `{'path': 'src/config/docs-locale-seo.ts'}` |
| ws.cso.ie | `ws.cso.ie` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/cso.mjs'}` |
| www.aaii.com | `www.aaii.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aaii-sentiment.mjs'}`, `{'path': 'scripts/seed-fear-greed.mjs'}` |
| www.aaronsw.com | `www.aaronsw.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.afro.who.int | `www.afro.who.int` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| www.alphavantage.co | `www.alphavantage.co` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_shared-av.mjs'}`, `{'path': 'server/worldmonitor/market/v1/_quote-provider.ts'}` |
| www.anp.tl | `www.anp.tl` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.app.gov.al | `www.app.gov.al` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| www.applytosupply.digitalmarketplace.service.gov.uk | `www.applytosupply.digitalmarketplace.service.gov.uk` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| www.armeps.am | `www.armeps.am` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| www.aviationpros.com | `www.aviationpros.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| www.aviationweek.com | `www.aviationweek.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| www.bankofengland.co.uk | `www.bankofengland.co.uk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-gb.mjs'}` |
| www.bi.go.id | `www.bi.go.id` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-fetch.mjs'}` |
| www.bing.com | `www.bing.com` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| www.cac.gov.cn | `www.cac.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-policy/adapters.mjs'}` |
| www.caiso.com | `www.caiso.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/grid-clock-sources.mjs'}` |
| www.carbonbrief.org | `www.carbonbrief.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| www.cbp.gov | `www.cbp.gov` | US government public-domain work unless otherwise noted. Copyright notice reviewed 2026-10-19 for the Nationwide Encounters CSV. | `{'path': 'scripts/lib/border-route-sources.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` |
| www.cbr.ru | `www.cbr.ru` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-cbr-rates.mjs'}` |
| www.cbsl.gov.lk | `www.cbsl.gov.lk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices.mjs'}` |
| www.chinamoney.com.cn | `www.chinamoney.com.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-macro/calendar.mjs'}` |
| www.cidrap.umn.edu | `www.cidrap.umn.edu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}` |
| www.climatecentral.org | `www.climatecentral.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| www.coes.org.pe | `www.coes.org.pe` | Unconfirmed | `{'path': 'scripts/lib/regional-energy-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.comcom.govt.nz | `www.comcom.govt.nz` | Creative Commons Attribution 4.0 International (https://www.comcom.govt.nz/using-our-website/copyright/) | `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| www.contractsfinder.service.gov.uk | `www.contractsfinder.service.gov.uk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| www.da.gov.ph | `www.da.gov.ph` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices.mjs'}` |
| www.datos.gov.co | `www.datos.gov.co` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_global-tender-feeds.mjs'}` |
| www.ecb.europa.eu | `www.ecb.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-economic-calendar.mjs'}` |
| www.ecdc.europa.eu | `www.ecdc.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}`, `{'path': 'scripts/seed-security-advisories.mjs'}` |
| www.economia-sniim.gob.mx | `www.economia-sniim.gob.mx` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-fetch.mjs'}` |
| www.epdk.gov.tr | `www.epdk.gov.tr` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_epdk-crude-imports.mjs'}` |
| www.erb.org.zm | `www.erb.org.zm` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.eskom.co.za | `www.eskom.co.za` | Site terms apply; open data licence unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.facebook.com | `www.facebook.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'src/services/story-share.ts'}` |
| www.factal.com | `www.factal.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| www.flightglobal.com | `www.flightglobal.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-aviation.mjs'}`, `{'path': 'server/worldmonitor/aviation/v1/list-aviation-news.ts'}` |
| www.frontex.europa.eu | `www.frontex.europa.eu` | Used with permission; repository owner confirmed reuse permission on 2026-10-20. | `{'path': 'scripts/lib/border-route-sources.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` |
| www.fwdstart.me | `www.fwdstart.me` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.gdacs.org | `www.gdacs.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/mcp/registry/_travel-risk-document.ts'}`, `{'path': 'scripts/build-seasonal-hazard-calendar.mjs'}` (+1) |
| www.geostat.ge | `www.geostat.ge` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/geostat.mjs'}` |
| www.gets.govt.nz | `www.gets.govt.nz` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-global-tenders.mjs'}` |
| www.gitex.com | `www.gitex.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.google.com | `www.google.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'src/components/AviationCommandBar.ts'}` (+1) |
| www.googleapis.com | `www.googleapis.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/seo-gsc-collect.mjs'}` |
| www.gov.br | `www.gov.br` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-fuel-prices.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.gub.uy | `www.gub.uy` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.handybulk.com | `www.handybulk.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-supply-chain-trade.mjs'}` |
| www.iea.org | `www.iea.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-energy-intelligence.mjs'}`, `{'path': 'src/components/EnergyCrisisPanel.ts'}` |
| www.jodidata.org | `api.publisher.jodidata.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-jodi-gas.mjs'}` |
| www.jodidata.org | `www.jodidata.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-jodi-gas.mjs'}`, `{'path': 'scripts/seed-jodi-oil.mjs'}` (+1) |
| www.linkedin.com | `www.linkedin.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}`, `{'path': 'server/worldmonitor/leads/v1/register-interest.ts'}` (+1) |
| www.mbie.govt.nz | `www.mbie.govt.nz` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.migracion.gob.pa | `www.migracion.gob.pa` | Used with permission; repository owner confirmed reuse permission on 2026-10-20. | `{'path': 'scripts/lib/border-route-sources.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` |
| www.miit.gov.cn | `www.miit.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/miit-news.js'}`, `{'path': 'scripts/china-policy/adapters.mjs'}` |
| www.mnd.gov.tw | `www.mnd.gov.tw` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/cross-strait-activity/adapters.mjs'}`, `{'path': 'src/components/cross-strait-activity-summary.ts'}` |
| www.mod.go.jp | `www.mod.go.jp` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/cross-strait-activity/adapters.mjs'}`, `{'path': 'src/components/cross-strait-activity-summary.ts'}` |
| www.mof.go.jp | `www.mof.go.jp` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-jp.mjs'}` |
| www.nabc.go.th | `www.nabc.go.th` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/nabc.mjs'}` |
| www.nationalarchives.gov.uk | `www.nationalarchives.gov.uk` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/lib/border-route-sources.mjs'}`, `{'path': 'server/worldmonitor/displacement/v1/cross-border-data.ts'}` (+1) |
| www.ncei.noaa.gov | `www.ncei.noaa.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-ocean-ice.mjs'}` |
| www.newyorkfed.org | `www.newyorkfed.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| www.nfx.com | `www.nfx.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.niggrid.org | `www.niggrid.org` | All rights reserved | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.ocpv-ci.com | `www.ocpv-ci.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/ocpv.mjs'}` |
| www.onagri.nat.tn | `www.onagri.nat.tn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices.mjs'}` |
| www.opec.org | `www.opec.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-energy-intelligence.mjs'}` |
| www.oref.org.il | `www.oref.org.il` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| www.pbc.gov.cn | `www.pbc.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-macro/source-contracts.mjs'}` |
| www.pbs.gov.pk | `www.pbs.gov.pk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices.mjs'}` |
| www.pizzint.watch | `www.pizzint.watch` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-conflict-intel.mjs'}` |
| www.qatarenergy.qa | `www.qatarenergy.qa` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.ransomware.live | `www.ransomware.live` | Provider terms for this feed publisher; verify before redistribution | — |
| www.rba.gov.au | `www.rba.gov.au` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-yield-curve-au.mjs'}` |
| www.reddit.com | `www.reddit.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}` |
| www.safe.gov.cn | `www.safe.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-macro/source-contracts.mjs'}` |
| www.samr.gov.cn | `www.samr.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-policy/adapters.mjs'}` |
| www.sequoiacap.com | `www.sequoiacap.com` | Provider terms for this feed publisher; verify before redistribution | — |
| www.smartraveller.gov.au | `www.smartraveller.gov.au` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| www.sonabhy.bf | `king-prawn-app-6bsvl.ondigitalocean.app` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}` |
| www.sonabhy.bf | `www.sonabhy.bf` | Unconfirmed | `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www.spdrgoldshares.com | `www.spdrgoldshares.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-gold-etf-flows.mjs'}` |
| www.statcan.gc.ca | `www.statcan.gc.ca` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/resilience/v1/_indicator-source-policy.ts'}` |
| www.stats.gov.cn | `www.stats.gov.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-macro/calendar.mjs'}`, `{'path': 'scripts/china-macro/source-contracts.mjs'}` |
| www.szse.cn | `www.szse.cn` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/china-corporate-disclosures/adapters.mjs'}`, `{'path': 'scripts/china-stock-connect/adapters.mjs'}` |
| www.techstars.com | `www.techstars.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.token2049.com | `www.token2049.com` | Provider terms for this upstream API/dataset; verify before redistribution | — |
| www.unep.org | `www.unep.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}` |
| www.unognewsroom.org | `www.unognewsroom.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}` |
| www.vendr.com | `www.vendr.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}` |
| www.viwanda.go.tz | `www.viwanda.go.tz` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/lib/food-prices-adapters/mit.mjs'}` |
| www.weather.gov.hk | `www.weather.gov.hk` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/natural/western-pacific-cyclones.mjs'}` |
| www.windy.com | `www.windy.com` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'api/mcp/registry/webcam-tools.ts'}`, `{'path': 'api/mcp/skill-extension/generated.ts'}` (+2) |
| www.worldbank.org | `www.worldbank.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'server/worldmonitor/resilience/v1/_indicator-source-policy.ts'}` |
| www.zera.co.zw | `www.zera.co.zw` | Unconfirmed | `{'path': 'scripts/lib/regional-fuel-feeds.mjs'}`, `{'path': 'scripts/shared/regional-energy-feeds.json'}` |
| www2.moeaea.gov.tw | `www2.moeaea.gov.tw` | Public Taiwan MOEA Energy Administration oil111 survey; reuse licence unconfirmed | `{'path': 'scripts/seed-fuel-prices.mjs'}` |
| wwwmobile.caiso.com | `wwwmobile.caiso.com` | California ISO public website terms. Use factual emergency notice types and times. | `{'path': 'scripts/lib/grid-clock-sources.mjs'}` |
| wwwnc.cdc.gov | `wwwnc.cdc.gov` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/seed-security-advisories.mjs'}` |
| x.com | `x.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'scripts/comparison-shortlist.mjs'}`, `{'path': 'scripts/cross-strait-activity/japan-x.mjs'}` (+1) |
| yandex.com | `yandex.com` | Excluded: first-party, control-plane, UI, or rendering transport | — |
| your-app.convex.site | `your-app.convex.site` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/import-bounced-emails.mjs'}` |

## Nhóm `feed+structured` (16 hosts)

| Provider | Host | License | File tham chiếu trong mã nguồn |
| :--- | :--- | :--- | :--- |
| SEC | `www.sec.gov` | U.S. government public data; SEC terms apply | `{'path': 'scripts/openapi-inject-examples.mjs'}`, `{'path': 'scripts/seed-regulatory-actions.mjs'}` (+3) |
| World Monitor hosted API | `api.worldmonitor.app` | Excluded: World Monitor own service/control plane | `{'path': 'api/a2a.ts'}`, `{'path': 'api/internal/mcp-grant-mint.ts'}` (+24) |
| ec.europa.eu | `ec.europa.eu` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/_eurostat-utils.mjs'}`, `{'path': 'scripts/seed-economic-calendar.mjs'}` (+4) |
| export.arxiv.org | `export.arxiv.org` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-research.mjs'}`, `{'path': 'shared/news-catalog.json'}` |
| news.google.com | `news.google.com` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/source-catalog-identity.mjs'}`, `{'path': 'server/worldmonitor/intelligence/v1/_country-coverage-feeds.ts'}` (+3) |
| news.usni.org | `news.usni.org` | Provider terms for this upstream API/dataset; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'shared/news-catalog.json'}` |
| oilprice.com | `oilprice.com` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-energy-intelligence.mjs'}`, `{'path': 'shared/news-catalog.json'}` |
| www.eia.gov | `www.eia.gov` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-oil-trade-series.mjs'}`, `{'path': 'shared/news-catalog.json'}` |
| www.euronews.com | `www.euronews.com` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'shared/news-catalog.json'}`, `{'path': 'src/main.ts'}` |
| www.fao.org | `www.fao.org` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/lib/food-prices-fetch.mjs'}`, `{'path': 'scripts/lib/food-prices.mjs'}` (+2) |
| www.federalreserve.gov | `www.federalreserve.gov` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-economic-calendar.mjs'}`, `{'path': 'scripts/seed-regulatory-actions.mjs'}` (+1) |
| www.gov.uk | `www.gov.uk` | GOV.UK Open Government Licence v3.0 for Home Office small-boat arrival statistics; other publishers on this host retain their source terms. | `{'path': 'scripts/lib/border-route-sources.mjs'}`, `{'path': 'scripts/seed-fuel-prices.mjs'}` (+3) |
| www.techmeme.com | `www.techmeme.com` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/ais-relay.cjs'}`, `{'path': 'scripts/seed-research.mjs'}` (+2) |
| www.theguardian.com | `www.theguardian.com` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-climate-news.mjs'}`, `{'path': 'shared/news-catalog.json'}` |
| www.who.int | `www.who.int` | Provider terms for this feed publisher; verify before redistribution | `{'path': 'scripts/seed-disease-outbreaks.mjs'}`, `{'path': 'scripts/seed-security-advisories.mjs'}` (+1) |
| www.youtube.com | `www.youtube.com` | Excluded: first-party, control-plane, UI, or rendering transport | `{'path': 'api/youtube/embed.js'}`, `{'path': 'api/youtube/live.js'}` (+5) |

## Nhóm `operational-status` (30 hosts)

| Provider | Host | License | File tham chiếu trong mã nguồn |
| :--- | :--- | :--- | :--- |
| azure.status.microsoft | `azure.status.microsoft` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| bitbucket.status.atlassian.com | `bitbucket.status.atlassian.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| confluence.status.atlassian.com | `confluence.status.atlassian.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| discordstatus.com | `discordstatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| health.aws.amazon.com | `health.aws.amazon.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| jira-software.status.atlassian.com | `jira-software.status.atlassian.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| linearstatus.com | `linearstatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| railway.instatus.com | `railway.instatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| slack-status.com | `slack-status.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.circleci.com | `status.circleci.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.claude.com | `status.claude.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.cloud.google.com | `status.cloud.google.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.datadoghq.com | `status.datadoghq.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.digitalocean.com | `status.digitalocean.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.gitlab.com | `status.gitlab.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.npmjs.org | `status.npmjs.org` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.openai.com | `status.openai.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.render.com | `status.render.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.sentry.io | `status.sentry.io` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.stripe.com | `status.stripe.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.supabase.com | `status.supabase.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| status.twilio.com | `status.twilio.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.cloudflarestatus.com | `www.cloudflarestatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.dockerstatus.com | `www.dockerstatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.githubstatus.com | `www.githubstatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.netlifystatus.com | `www.netlifystatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.notion-status.com | `www.notion-status.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.replicatestatus.com | `www.replicatestatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.vercel-status.com | `www.vercel-status.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
| www.zoomstatus.com | `www.zoomstatus.com` | Provider terms for this service-status endpoint; verify before redistribution | `{'path': 'server/worldmonitor/infrastructure/v1/list-service-statuses.ts'}` |
