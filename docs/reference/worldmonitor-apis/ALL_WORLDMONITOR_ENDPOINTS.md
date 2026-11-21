# Toàn bộ API Endpoints của World Monitor (`api.worldmonitor.app`)

- **Base URL:** `https://api.worldmonitor.app`
- **Tổng số REST/RPC Endpoints trong OpenAPI 3.1:** **248 endpoints** trên **38 services** (+ các route hệ thống `/api/bootstrap`, `/api/wm-session`, `/api/gpsjam`, `/api/oref-alerts`, `/api/telegram-feed`, `/api/x-feed`, `/api/product-catalog`, `/api/health`).
- **File gốc đầy đủ schema JSON:** `openapi.json` (cùng thư mục).
- **Lưu ý Header:** Luôn gửi `User-Agent` hợp lệ (ví dụ `MyMonitor/1.0`) để không bị tường lửa Cloudflare trả `403`.

## Nhóm Core / Bootstrap (Ngoài OpenAPI v1)

| Method | Path | Tham số chính | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/bootstrap` | `tier=fast\|slow&public=1`, hoặc `keys=...&public=1` | Public (`public=1`) | Gói dữ liệu tổng hợp (động đất, thời tiết, bão, mất mạng, dự báo AI, dòng vốn ETF, lãi suất...) |
| `POST` | `/api/wm-session` | Body rỗng | Origin `www.worldmonitor.app` | Cấp token phiên trình duyệt `wms_...` (12h) |
| `GET` | `/api/product-catalog` | Không | Public | Danh mục tính năng, số lượng layer & gói dịch vụ |
| `GET` | `/api/gpsjam` | Không | Public / Session | Ô lưới H3 bị nhiễu/phá sóng GPS hàng không toàn cầu |
| `GET` | `/api/oref-alerts` | Không | Session / Key | Cảnh báo tên lửa/rocket thời gian thực (Pikud HaOref) |
| `GET` | `/api/telegram-feed` | `limit=50` | Session / Key | Luồng tin OSINT từ các kênh Telegram chọn lọc |
| `GET` | `/api/x-feed` | `limit=50` | Session / Key | Luồng bài đăng OSINT từ X/Twitter |
| `GET` | `/api/health` | `compact=1` | Public / Session | Trạng thái sức khỏe của hơn 430 nguồn dữ liệu |

## AviationService (12 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/aviation/v1/get-airport-ops-summary` | `airports`, `J` | API Key / Session | GetAirportOpsSummary |
| `GET` | `/api/aviation/v1/get-carrier-ops` | `airports`, `min_flights`, `J` | API Key / Session | GetCarrierOps |
| `GET` | `/api/aviation/v1/get-flight-status` | `flight_number*`, `date*`, `origin`, `J` | API Key / Session | GetFlightStatus |
| `GET` | `/api/aviation/v1/get-youtube-live-stream-info` | `channel`, `video_id`, `J` | API Key / Session | GetYoutubeLiveStreamInfo |
| `GET` | `/api/aviation/v1/list-aircraft-emergencies` | — | API Key / Session | ListAircraftEmergencies |
| `GET` | `/api/aviation/v1/list-airport-delays` | `P`, `P2`, `region`, `min_severity`, `J` | API Key / Session | ListAirportDelays |
| `GET` | `/api/aviation/v1/list-airport-flights` | `airport*`, `direction`, `limit`, `J` | API Key / Session | ListAirportFlights |
| `GET` | `/api/aviation/v1/list-aviation-news` | `entities`, `window_hours`, `max_items`, `J` | API Key / Session | ListAviationNews |
| `GET` | `/api/aviation/v1/search-flight-prices` | `origin*`, `destination*`, `departure_date*`, `return_date`, `adults`, `cabin`, `nonstop_only`, `max_results`, `currency`, `market`, `J` | API Key / Session | SearchFlightPrices |
| `GET` | `/api/aviation/v1/search-google-dates` | `P3`, `P4`, `start_date`, `end_date`, `trip_duration`, `is_round_trip`, `P5`, `P6`, `P7`, `P8`, `sort_by_price`, `P9`, `J` | API Key / Session | SearchGoogleDates |
| `GET` | `/api/aviation/v1/search-google-flights` | `P3`, `P4`, `departure_date`, `return_date`, `P5`, `P6`, `P7`, `P8`, `sort_by`, `P9`, `J` | API Key / Session | SearchGoogleFlights |
| `GET` | `/api/aviation/v1/track-aircraft` | `icao24`, `callsign`, `sw_lat`, `sw_lon`, `ne_lat`, `ne_lon`, `J` | API Key / Session | TrackAircraft |

## BatchService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/batch/v1/execute` | `P10` + *(JSON body)* | API Key / Session | ExecuteBatch |

## ClimateService (7 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/climate/v1/get-co2-monitoring` | — | API Key / Session | GetCo2Monitoring |
| `GET` | `/api/climate/v1/get-ocean-ice-data` | — | API Key / Session | GetOceanIceData |
| `GET` | `/api/climate/v1/list-air-quality-data` | — | API Key / Session | ListAirQualityData |
| `GET` | `/api/climate/v1/list-climate-anomalies` | `P`, `P2`, `min_severity`, `J` | API Key / Session | ListClimateAnomalies |
| `GET` | `/api/climate/v1/list-climate-disasters` | `P11`, `P12` | API Key / Session | ListClimateDisasters |
| `GET` | `/api/climate/v1/list-climate-news` | — | API Key / Session | ListClimateNews |
| `GET` | `/api/climate/v1/list-reservoir-levels` | — | API Key / Session | ListReservoirLevels |

## CompanyMonitoringService (10 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/company-monitoring/v1/create-monitored-company` | `P10` + *(JSON body)* | API Key / Session | CreateMonitoredCompany |
| `GET` | `/api/company-monitoring/v1/get-company-coverage` | `company_id*`, `J` | API Key / Session | GetCompanyCoverage |
| `GET` | `/api/company-monitoring/v1/get-company-material-event` | `impact_id*`, `J` | API Key / Session | GetCompanyMaterialEvent |
| `GET` | `/api/company-monitoring/v1/get-company-monitoring-status` | — | API Key / Session | GetCompanyMonitoringStatus |
| `POST` | `/api/company-monitoring/v1/import-monitored-company-batch` | *(JSON body)* | API Key / Session | ImportMonitoredCompanyBatch |
| `GET` | `/api/company-monitoring/v1/list-company-event-changes` | `cursor*`, `page_size`, `J` | API Key / Session | ListCompanyEventChanges |
| `GET` | `/api/company-monitoring/v1/list-company-event-impacts` | `company_id`, `direction`, `lifecycle`, `P13`, `P14`, `J` | API Key / Session | ListCompanyEventImpacts |
| `GET` | `/api/company-monitoring/v1/list-monitored-companies` | `lifecycle`, `coverage`, `P13`, `P14`, `J` | API Key / Session | ListMonitoredCompanies |
| `POST` | `/api/company-monitoring/v1/set-monitored-company-state` | `P10` + *(JSON body)* | API Key / Session | SetMonitoredCompanyState |
| `POST` | `/api/company-monitoring/v1/update-monitored-company` | `P10` + *(JSON body)* | API Key / Session | UpdateMonitoredCompany |

## ConflictService (5 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/conflict/v1/get-humanitarian-summary` | `country_code*`, `J` | API Key / Session | GetHumanitarianSummary |
| `POST` | `/api/conflict/v1/get-humanitarian-summary-batch` | `P10` + *(JSON body)* | API Key / Session | GetHumanitarianSummaryBatch |
| `GET` | `/api/conflict/v1/list-acled-events` | `P15`, `P16`, `P`, `P2`, `P17` | API Key / Session | ListAcledEvents |
| `GET` | `/api/conflict/v1/list-iran-events` | — | API Key / Session | ListIranEvents |
| `GET` | `/api/conflict/v1/list-ucdp-events` | `P18`, `P19`, `P`, `P2`, `P17` | API Key / Session | ListUcdpEvents |

## ConsumerPricesService (6 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/consumer-prices/v1/get-consumer-price-basket-series` | `market_code`, `basket_slug`, `P20`, `J` | API Key / Session | GetConsumerPriceBasketSeries |
| `GET` | `/api/consumer-prices/v1/get-consumer-price-freshness` | `market_code`, `J` | API Key / Session | GetConsumerPriceFreshness |
| `GET` | `/api/consumer-prices/v1/get-consumer-price-overview` | `market_code`, `basket_slug`, `J` | API Key / Session | GetConsumerPriceOverview |
| `GET` | `/api/consumer-prices/v1/list-consumer-price-categories` | `P21`, `basket_slug`, `P20`, `J` | API Key / Session | ListConsumerPriceCategories |
| `GET` | `/api/consumer-prices/v1/list-consumer-price-movers` | `P21`, `range`, `limit*`, `category_slug`, `J` | API Key / Session | ListConsumerPriceMovers |
| `GET` | `/api/consumer-prices/v1/list-retailer-price-spreads` | `P21`, `basket_slug`, `J` | API Key / Session | ListRetailerPriceSpreads |

## CyberService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/cyber/v1/list-cyber-threats` | `P18`, `P19`, `P11`, `P12`, `type`, `source`, `min_severity`, `J` | API Key / Session | ListCyberThreats |

## DisplacementService (4 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/displacement/v1/get-cross-border-movements` | `country_code`, `route`, `J` | API Key / Session | GetCrossBorderMovements |
| `GET` | `/api/displacement/v1/get-displacement-summary` | `year`, `country_limit`, `flow_limit`, `J` | API Key / Session | GetDisplacementSummary |
| `GET` | `/api/displacement/v1/get-internal-displacement` | `country_code`, `J` | API Key / Session | GetInternalDisplacement |
| `GET` | `/api/displacement/v1/get-population-exposure` | `mode`, `lat`, `lon`, `radius`, `J` | API Key / Session | GetPopulationExposure |

## EconomicService (36 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/economic/v1/get-bis-credit` | — | API Key / Session | GetBisCredit |
| `GET` | `/api/economic/v1/get-bis-exchange-rates` | — | API Key / Session | GetBisExchangeRates |
| `GET` | `/api/economic/v1/get-bis-policy-rates` | — | API Key / Session | GetBisPolicyRates |
| `GET` | `/api/economic/v1/get-bls-series` | `series_id`, `limit`, `J` | API Key / Session | GetBlsSeries |
| `GET` | `/api/economic/v1/get-china-activity-nowcast` | — | API Key / Session | GetChinaActivityNowcast |
| `GET` | `/api/economic/v1/get-china-macro-snapshot` | — | API Key / Session | GetChinaMacroSnapshot |
| `GET` | `/api/economic/v1/get-crude-inventories` | — | API Key / Session | GetCrudeInventories |
| `GET` | `/api/economic/v1/get-ecb-fx-rates` | — | API Key / Session | GetEcbFxRates |
| `GET` | `/api/economic/v1/get-economic-calendar` | `P23`, `P24` | API Key / Session | GetEconomicCalendar |
| `GET` | `/api/economic/v1/get-economic-stress` | — | API Key / Session | GetEconomicStress |
| `GET` | `/api/economic/v1/get-energy-capacity` | `energy_sources`, `years`, `J` | API Key / Session | GetEnergyCapacity |
| `GET` | `/api/economic/v1/get-energy-crisis-policies` | `country_code`, `category`, `J` | API Key / Session | GetEnergyCrisisPolicies |
| `GET` | `/api/economic/v1/get-energy-prices` | `commodities`, `J` | API Key / Session | GetEnergyPrices |
| `GET` | `/api/economic/v1/get-eu-fsi` | — | API Key / Session | GetEuFsi |
| `GET` | `/api/economic/v1/get-eu-gas-storage` | — | API Key / Session | GetEuGasStorage |
| `GET` | `/api/economic/v1/get-eu-yield-curve` | — | API Key / Session | GetEuYieldCurve |
| `GET` | `/api/economic/v1/get-eurostat-country-data` | — | API Key / Session | GetEurostatCountryData |
| `GET` | `/api/economic/v1/get-fao-food-price-index` | — | API Key / Session | GetFaoFoodPriceIndex |
| `GET` | `/api/economic/v1/get-fred-series` | `series_id*`, `limit`, `J` | API Key / Session | GetFredSeries |
| `POST` | `/api/economic/v1/get-fred-series-batch` | `P10` + *(JSON body)* | API Key / Session | GetFredSeriesBatch |
| `GET` | `/api/economic/v1/get-government-yield-curve` | `country*`, `history`, `P25`, `J` | API Key / Session | GetGovernmentYieldCurve |
| `GET` | `/api/economic/v1/get-macro-signals` | — | API Key / Session | GetMacroSignals |
| `GET` | `/api/economic/v1/get-nat-gas-storage` | — | API Key / Session | GetNatGasStorage |
| `GET` | `/api/economic/v1/get-national-debt` | — | API Key / Session | GetNationalDebt |
| `GET` | `/api/economic/v1/get-no2-activity` | `country_code`, `region_id`, `kind`, `J` | API Key / Session | GetNo2Activity |
| `GET` | `/api/economic/v1/get-oil-inventories` | — | API Key / Session | GetOilInventories |
| `GET` | `/api/economic/v1/get-oil-stocks-analysis` | — | API Key / Session | GetOilStocksAnalysis |
| `GET` | `/api/economic/v1/get-us-cpi-monthly` | `history`, `P25`, `J` | API Key / Session | GetUsCpiMonthly |
| `GET` | `/api/economic/v1/get-us-interest-rates` | `history`, `P25`, `J` | API Key / Session | GetUsInterestRates |
| `GET` | `/api/economic/v1/get-us-treasury-par-yield-curve` | `history`, `P25`, `J` | API Key / Session | GetUsTreasuryParYieldCurve |
| `GET` | `/api/economic/v1/get-world-cpi-monthly` | `history`, `country`, `P25`, `J` | API Key / Session | GetWorldCpiMonthly |
| `GET` | `/api/economic/v1/list-bigmac-prices` | — | API Key / Session | ListBigMacPrices |
| `GET` | `/api/economic/v1/list-fuel-prices` | — | API Key / Session | ListFuelPrices |
| `GET` | `/api/economic/v1/list-global-tenders` | `country`, `countries`, `region`, `source`, `status`, `deadline_from`, `deadline_to`, `min_value`, `max_value`, `currency`, `category`, `query`, `page_size`, `cursor`, `sort`, `buyer`, `published_from`, `published_to`, `min_automation_score`, `J` | API Key / Session | ListGlobalTenders |
| `GET` | `/api/economic/v1/list-grocery-basket-prices` | — | API Key / Session | ListGroceryBasketPrices |
| `GET` | `/api/economic/v1/list-world-bank-indicators` | `indicator_code*`, `country_code`, `year`, `P22`, `P2`, `J` | API Key / Session | ListWorldBankIndicators |

## ForecastService (5 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/forecast/v1/get-forecast-scorecard` | — | API Key / Session | GetForecastScorecard |
| `GET` | `/api/forecast/v1/get-forecasts` | `domain`, `region`, `J` | API Key / Session | GetForecasts |
| `GET` | `/api/forecast/v1/get-simulation-outcome` | `runId`, `J` | API Key / Session | GetSimulationOutcome |
| `GET` | `/api/forecast/v1/get-simulation-package` | `runId`, `J` | API Key / Session | GetSimulationPackage |
| `POST` | `/api/forecast/v1/trigger-simulation` | `P10` + *(JSON body)* | API Key / Session | TriggerSimulation |

## GivingService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/giving/v1/get-giving-summary` | `platform_limit`, `category_limit`, `J` | API Key / Session | GetGivingSummary |

## HealthService (2 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health/v1/list-air-quality-alerts` | — | API Key / Session | ListAirQualityAlerts |
| `GET` | `/api/health/v1/list-disease-outbreaks` | — | API Key / Session | ListDiseaseOutbreaks |

## ImageryService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/imagery/v1/search-imagery` | `bbox`, `datetime`, `source`, `limit`, `J` | API Key / Session | SearchImagery |

## InfrastructureService (11 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/infrastructure/v1/get-bootstrap-data` | `tier`, `keys`, `J` | API Key / Session | GetBootstrapData |
| `GET` | `/api/infrastructure/v1/get-cable-health` | — | API Key / Session | GetCableHealth |
| `GET` | `/api/infrastructure/v1/get-ip-geo` | — | API Key / Session | GetIpGeo |
| `GET` | `/api/infrastructure/v1/get-temporal-baseline` | `type*`, `region`, `count`, `J` | API Key / Session | GetTemporalBaseline |
| `GET` | `/api/infrastructure/v1/list-internet-ddos-attacks` | — | API Key / Session | ListInternetDdosAttacks |
| `GET` | `/api/infrastructure/v1/list-internet-outages` | `P15`, `P16`, `P22`, `P2`, `P17` | API Key / Session | ListInternetOutages |
| `GET` | `/api/infrastructure/v1/list-internet-traffic-anomalies` | `country`, `J` | API Key / Session | ListInternetTrafficAnomalies |
| `GET` | `/api/infrastructure/v1/list-service-statuses` | `status`, `J` | API Key / Session | ListServiceStatuses |
| `GET` | `/api/infrastructure/v1/list-temporal-anomalies` | — | API Key / Session | ListTemporalAnomalies |
| `POST` | `/api/infrastructure/v1/record-baseline-snapshot` | `P10` + *(JSON body)* | API Key / Session | RecordBaselineSnapshot |
| `GET` | `/api/infrastructure/v1/reverse-geocode` | `lat`, `lon`, `J` | API Key / Session | ReverseGeocode |

## IntelligenceService (34 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/intelligence/v1/classify-event` | `title*`, `description`, `source`, `country`, `J` | API Key / Session | ClassifyEvent |
| `GET` | `/api/intelligence/v1/compute-energy-shock` | `country_code`, `chokepoint_id`, `disruption_pct`, `fuel_mode`, `J` | API Key / Session | ComputeEnergyShockScenario |
| `POST` | `/api/intelligence/v1/deduct-situation` | `P10` + *(JSON body)* | API Key / Session | DeductSituation |
| `GET` | `/api/intelligence/v1/get-china-decision-signals` | — | Public | GetChinaDecisionSignals |
| `GET` | `/api/intelligence/v1/get-company-enrichment` | `domain`, `name`, `P27`, `J` | API Key / Session | GetCompanyEnrichment |
| `GET` | `/api/intelligence/v1/get-country-coverage` | `P26`, `window_hours`, `limit`, `J` | API Key / Session | GetCountryCoverage |
| `GET` | `/api/intelligence/v1/get-country-energy-profile` | `country_code`, `J` | API Key / Session | GetCountryEnergyProfile |
| `GET` | `/api/intelligence/v1/get-country-facts` | `country_code*`, `J` | API Key / Session | GetCountryFacts |
| `GET` | `/api/intelligence/v1/get-country-history` | `country*`, `days`, `J` | API Key / Session | GetCountryHistory |
| `GET` | `/api/intelligence/v1/get-country-intel-brief` | `P26`, `framework`, `J` | API Key / Session | GetCountryIntelBrief |
| `GET` | `/api/intelligence/v1/get-country-port-activity` | `country_code`, `J` | API Key / Session | GetCountryPortActivity |
| `GET` | `/api/intelligence/v1/get-country-risk` | `P26` | API Key / Session | GetCountryRisk |
| `GET` | `/api/intelligence/v1/get-gdelt-topic-timeline` | `topic`, `J` | API Key / Session | GetGdeltTopicTimeline |
| `GET` | `/api/intelligence/v1/get-intel-timeline` | `domain`, `country`, `from`, `to`, `limit`, `cursor`, `J` | API Key / Session | GetIntelTimeline |
| `GET` | `/api/intelligence/v1/get-regime-history` | `P28`, `limit`, `J` | API Key / Session | GetRegimeHistory |
| `GET` | `/api/intelligence/v1/get-regional-brief` | `region_id*`, `J` | API Key / Session | GetRegionalBrief |
| `GET` | `/api/intelligence/v1/get-regional-snapshot` | `P28` | API Key / Session | GetRegionalSnapshot |
| `GET` | `/api/intelligence/v1/get-risk-scores` | `region`, `J` | API Key / Session | GetRiskScores |
| `POST` | `/api/intelligence/v1/get-similar-events` | `P10` + *(JSON body)* | API Key / Session | GetSimilarEvents |
| `GET` | `/api/intelligence/v1/get-social-velocity` | — | API Key / Session | GetSocialVelocity |
| `GET` | `/api/intelligence/v1/list-company-signals` | `company`, `domain`, `P27`, `J` | API Key / Session | ListCompanySignals |
| `GET` | `/api/intelligence/v1/list-cross-source-signals` | — | API Key / Session | ListCrossSourceSignals |
| `GET` | `/api/intelligence/v1/list-gps-interference` | `region`, `J` | API Key / Session | ListGpsInterference |
| `GET` | `/api/intelligence/v1/list-market-implications` | `frameworkId`, `J` | API Key / Session | ListMarketImplications |
| `GET` | `/api/intelligence/v1/list-material-events` | `item_code`, `limit`, `J` | API Key / Session | ListMaterialEvents |
| `GET` | `/api/intelligence/v1/list-oref-alerts` | `mode`, `J` | API Key / Session | ListOrefAlerts |
| `GET` | `/api/intelligence/v1/list-satellites` | `country`, `J` | API Key / Session | ListSatellites |
| `GET` | `/api/intelligence/v1/list-security-advisories` | — | API Key / Session | ListSecurityAdvisories |
| `GET` | `/api/intelligence/v1/list-telegram-feed` | `limit`, `topic`, `channel`, `J` | API Key / Session | ListTelegramFeed |
| `GET` | `/api/intelligence/v1/list-wsb-tickers` | — | API Key / Session | ListWsbTickers |
| `GET` | `/api/intelligence/v1/list-x-feed` | `limit`, `topic`, `account`, `J` | API Key / Session | ListXFeed |
| `GET` | `/api/intelligence/v1/search-gdelt-documents` | `query*`, `max_records`, `timespan`, `tone_filter`, `sort`, `J` | API Key / Session | SearchGdeltDocuments |
| `POST` | `/api/intelligence/v1/search-intel-history` | `P10` + *(JSON body)* | API Key / Session | SearchIntelHistory |
| `GET` | `/api/intelligence/v1/search-sec-filings` | `query*`, `forms`, `start_date`, `end_date`, `limit`, `J` | API Key / Session | SearchSecFilings |

## LeadsService (2 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/leads/v1/register-interest` | `P10` + *(JSON body)* | Public | RegisterInterest |
| `POST` | `/api/leads/v1/submit-contact` | `P10` + *(JSON body)* | Public | SubmitContact |

## MaritimeService (2 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/maritime/v1/get-vessel-snapshot` | `P29`, `P30`, `P31`, `P32`, `include_candidates`, `include_tankers`, `J` | API Key / Session | GetVesselSnapshot |
| `GET` | `/api/maritime/v1/list-navigational-warnings` | `P`, `P2`, `area`, `J` | API Key / Session | ListNavigationalWarnings |

## MarketService (26 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/market/v1/analyze-stock` | `symbol*`, `P34`, `include_news`, `J` | API Key / Session | AnalyzeStock |
| `GET` | `/api/market/v1/backtest-stock` | `symbol*`, `P34`, `eval_window_days`, `J` | API Key / Session | BacktestStock |
| `GET` | `/api/market/v1/get-cot-positioning` | — | API Key / Session | GetCotPositioning |
| `GET` | `/api/market/v1/get-country-stock-index` | `country_code*`, `J` | API Key / Session | GetCountryStockIndex |
| `GET` | `/api/market/v1/get-fear-greed-index` | — | API Key / Session | GetFearGreedIndex |
| `GET` | `/api/market/v1/get-gold-intelligence` | — | API Key / Session | GetGoldIntelligence |
| `GET` | `/api/market/v1/get-hyperliquid-flow` | — | API Key / Session | GetHyperliquidFlow |
| `GET` | `/api/market/v1/get-insider-transactions` | `symbol*`, `J` | API Key / Session | GetInsiderTransactions |
| `GET` | `/api/market/v1/get-market-breadth-history` | — | API Key / Session | GetMarketBreadthHistory |
| `GET` | `/api/market/v1/get-physical-divergence-index` | `P33` | API Key / Session | GetPhysicalDivergenceIndex |
| `GET` | `/api/market/v1/get-physical-premiums` | `P33` | API Key / Session | GetPhysicalPremiums |
| `GET` | `/api/market/v1/get-price-history` | `symbols*`, `range`, `J` | API Key / Session | GetPriceHistory |
| `GET` | `/api/market/v1/get-sector-summary` | `period`, `J` | API Key / Session | GetSectorSummary |
| `GET` | `/api/market/v1/get-stock-analysis-history` | `symbols`, `limit_per_symbol`, `include_news`, `J` | API Key / Session | GetStockAnalysisHistory |
| `GET` | `/api/market/v1/list-ai-tokens` | — | API Key / Session | ListAiTokens |
| `GET` | `/api/market/v1/list-commodity-quotes` | `symbols`, `J` | API Key / Session | ListCommodityQuotes |
| `GET` | `/api/market/v1/list-crypto-quotes` | `ids`, `J` | API Key / Session | ListCryptoQuotes |
| `GET` | `/api/market/v1/list-crypto-sectors` | — | API Key / Session | ListCryptoSectors |
| `GET` | `/api/market/v1/list-defi-tokens` | — | API Key / Session | ListDefiTokens |
| `GET` | `/api/market/v1/list-earnings-calendar` | `P23`, `P24` | API Key / Session | ListEarningsCalendar |
| `GET` | `/api/market/v1/list-etf-flows` | — | API Key / Session | ListEtfFlows |
| `GET` | `/api/market/v1/list-gulf-quotes` | — | API Key / Session | ListGulfQuotes |
| `GET` | `/api/market/v1/list-market-quotes` | `symbols`, `J` | API Key / Session | ListMarketQuotes |
| `GET` | `/api/market/v1/list-other-tokens` | — | API Key / Session | ListOtherTokens |
| `GET` | `/api/market/v1/list-stablecoin-markets` | `coins`, `J` | API Key / Session | ListStablecoinMarkets |
| `GET` | `/api/market/v1/list-stored-stock-backtests` | `symbols`, `eval_window_days`, `J` | API Key / Session | ListStoredStockBacktests |

## MilitaryService (10 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/military/v1/get-aircraft-details` | `icao24*`, `J` | API Key / Session | GetAircraftDetails |
| `POST` | `/api/military/v1/get-aircraft-details-batch` | `P10` + *(JSON body)* | API Key / Session | GetAircraftDetailsBatch |
| `GET` | `/api/military/v1/get-defense-industrial-base` | `P26` | API Key / Session | GetDefenseIndustrialBase |
| `GET` | `/api/military/v1/get-theater-posture` | `theater`, `J` | API Key / Session | GetTheaterPosture |
| `GET` | `/api/military/v1/get-usni-fleet-report` | `force_refresh`, `J` | API Key / Session | GetUSNIFleetReport |
| `GET` | `/api/military/v1/get-wingbits-live-flight` | `icao24*`, `J` | API Key / Session | GetWingbitsLiveFlight |
| `GET` | `/api/military/v1/get-wingbits-status` | — | API Key / Session | GetWingbitsStatus |
| `GET` | `/api/military/v1/list-defense-patents` | `cpc_code`, `assignee`, `limit`, `J` | API Key / Session | ListDefensePatents |
| `GET` | `/api/military/v1/list-military-bases` | `ne_lat`, `ne_lon`, `sw_lat`, `sw_lon`, `zoom`, `type`, `kind`, `country`, `J` | API Key / Session | ListMilitaryBases |
| `GET` | `/api/military/v1/list-military-flights` | `page_size`, `cursor`, `P29`, `P30`, `P31`, `P32`, `operator`, `aircraft_type`, `J` | API Key / Session | ListMilitaryFlights |

## NaturalService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/natural/v1/list-natural-events` | `days`, `J` | API Key / Session | ListNaturalEvents |

## NewsService (7 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/news/v1/list-country-headlines` | `country_codes*`, `J` | API Key / Session | ListCountryHeadlines |
| `GET` | `/api/news/v1/list-feed-digest` | `variant`, `lang`, `J` | API Key / Session | ListFeedDigest |
| `GET` | `/api/news/v1/list-media-perspective` | `subject_country*`, `outlet_countries`, `audience`, `window_hours`, `outlet_regions`, `J` | API Key / Session | ListMediaPerspective |
| `GET` | `/api/news/v1/list-news-pool` | `languages`, `editions`, `category`, `J` | API Key / Session | ListNewsPool |
| `GET` | `/api/news/v1/list-sent-alerts` | — | API Key / Session | ListSentAlerts |
| `POST` | `/api/news/v1/summarize-article` | `P10` + *(JSON body)* | API Key / Session | SummarizeArticle |
| `GET` | `/api/news/v1/summarize-article-cache` | `cache_key`, `J` | API Key / Session | GetSummarizeArticleCache |

## PositiveEventsService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/positive-events/v1/list-positive-geo-events` | — | API Key / Session | ListPositiveGeoEvents |

## PredictionService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/prediction/v1/list-prediction-markets` | `P11`, `P2`, `category`, `query`, `min_liquidity`, `J` | API Key / Session | ListPredictionMarkets |

## RadiationService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/radiation/v1/list-radiation-observations` | `max_items`, `J` | API Key / Session | ListRadiationObservations |

## ResearchService (4 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/research/v1/list-arxiv-papers` | `P11`, `P2`, `category`, `query`, `J` | API Key / Session | ListArxivPapers |
| `GET` | `/api/research/v1/list-hackernews-items` | `P11`, `P12`, `feed_type`, `J` | API Key / Session | ListHackernewsItems |
| `GET` | `/api/research/v1/list-tech-events` | `type`, `mappable`, `limit`, `days`, `J` | API Key / Session | ListTechEvents |
| `GET` | `/api/research/v1/list-trending-repos` | `P11`, `P12`, `language`, `period`, `J` | API Key / Session | ListTrendingRepos |

## ResilienceService (6 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/resilience/v1/get-demographics-capability` | `P35` | API Key / Session | GetDemographicsCapability |
| `GET` | `/api/resilience/v1/get-food-stocks` | `countryCode`, `commodity`, `J` | API Key / Session | GetFoodStocks |
| `GET` | `/api/resilience/v1/get-resilience-indicators` | `P35` | API Key / Session | GetResilienceIndicators |
| `GET` | `/api/resilience/v1/get-resilience-ranking` | — | API Key / Session | GetResilienceRanking |
| `GET` | `/api/resilience/v1/get-resilience-score` | `countryCode*`, `J` | API Key / Session | GetResilienceScore |
| `GET` | `/api/resilience/v1/get-runtime-manifest` | — | Public | GetResilienceRuntimeManifest |

## SafetyService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/safety/v1/get-toronto-safety` | `dataset`, `limit`, `division`, `neighbourhood`, `offence`, `year`, `J` | API Key / Session | GetTorontoSafety |

## SanctionsService (2 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/sanctions/v1/list-sanctions-pressure` | `max_items`, `J` | API Key / Session | ListSanctionsPressure |
| `GET` | `/api/sanctions/v1/lookup-sanction-entity` | `q`, `max_results`, `J` | API Key / Session | LookupSanctionEntity |

## ScenarioService (3 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/scenario/v1/get-scenario-status` | `jobId*`, `J` | API Key / Session | GetScenarioStatus |
| `GET` | `/api/scenario/v1/list-scenario-templates` | — | API Key / Session | ListScenarioTemplates |
| `POST` | `/api/scenario/v1/run-scenario` | `P10` + *(JSON body)* | API Key / Session | RunScenario |

## ScorecardService (3 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/scorecard/v1/get-bloc-scorecard` | `preset`, `members`, `J` | Public | GetBlocScorecard |
| `GET` | `/api/scorecard/v1/get-five-factor-scorecard` | `countryCode*`, `J` | Public | GetFiveFactorScorecard |
| `GET` | `/api/scorecard/v1/list-five-factor-scorecards` | — | Public | ListFiveFactorScorecards |

## SeismologyService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/seismology/v1/list-earthquakes` | `P18`, `P19`, `page_size`, `P2`, `min_magnitude`, `J` | API Key / Session | ListEarthquakes |

## ShippingV2Service (3 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v2/shipping/route-intelligence` | `fromIso2*`, `toIso2*`, `cargoType`, `hs2`, `J` | API Key / Session | RouteIntelligence |
| `GET` | `/api/v2/shipping/webhooks` | — | API Key / Session | ListWebhooks |
| `POST` | `/api/v2/shipping/webhooks` | `P10` + *(JSON body)* | API Key / Session | RegisterWebhook |

## SupplyChainService (25 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/supply-chain/v1/get-bypass-options` | `chokepointId*`, `cargoType`, `closurePct`, `J` | API Key / Session | GetBypassOptions |
| `GET` | `/api/supply-chain/v1/get-china-corridor-control-towers` | — | API Key / Session | GetChinaCorridorControlTowers |
| `GET` | `/api/supply-chain/v1/get-chokepoint-dependencies` | `chokepointId*`, `pageSize`, `J` | API Key / Session | GetChokepointDependencies |
| `GET` | `/api/supply-chain/v1/get-chokepoint-history` | `chokepointId*`, `J` | API Key / Session | GetChokepointHistory |
| `GET` | `/api/supply-chain/v1/get-chokepoint-status` | — | API Key / Session | GetChokepointStatus |
| `GET` | `/api/supply-chain/v1/get-country-chokepoint-index` | `iso2*`, `hs2`, `J` | API Key / Session | GetCountryChokepointIndex |
| `GET` | `/api/supply-chain/v1/get-country-cost-shock` | `P36`, `P37`, `hs2`, `J` | API Key / Session | GetCountryCostShock |
| `GET` | `/api/supply-chain/v1/get-country-products` | `iso2*`, `hs4`, `J` | API Key / Session | GetCountryProducts |
| `GET` | `/api/supply-chain/v1/get-country-vulnerabilities` | `iso2*`, `J` | API Key / Session | GetCountryVulnerabilities |
| `GET` | `/api/supply-chain/v1/get-critical-minerals` | — | API Key / Session | GetCriticalMinerals |
| `GET` | `/api/supply-chain/v1/get-fuel-shortage-detail` | `shortageId*`, `J` | API Key / Session | GetFuelShortageDetail |
| `GET` | `/api/supply-chain/v1/get-mineral-production` | `commodity`, `iso2`, `stage`, `J` | API Key / Session | GetMineralProduction |
| `GET` | `/api/supply-chain/v1/get-multi-sector-cost-shock` | `P36`, `P37`, `closureDays`, `J` | API Key / Session | GetMultiSectorCostShock |
| `GET` | `/api/supply-chain/v1/get-pipeline-detail` | `pipelineId*`, `J` | API Key / Session | GetPipelineDetail |
| `GET` | `/api/supply-chain/v1/get-route-explorer-lane` | `fromIso2*`, `toIso2*`, `hs2*`, `cargoType*`, `J` | API Key / Session | GetRouteExplorerLane |
| `GET` | `/api/supply-chain/v1/get-route-impact` | `fromIso2*`, `toIso2*`, `hs2*`, `J` | API Key / Session | GetRouteImpact |
| `GET` | `/api/supply-chain/v1/get-sector-dependency` | `iso2*`, `hs2*`, `J` | API Key / Session | GetSectorDependency |
| `GET` | `/api/supply-chain/v1/get-shipping-rates` | — | API Key / Session | GetShippingRates |
| `GET` | `/api/supply-chain/v1/get-shipping-stress` | — | API Key / Session | GetShippingStress |
| `GET` | `/api/supply-chain/v1/get-storage-facility-detail` | `facilityId*`, `J` | API Key / Session | GetStorageFacilityDetail |
| `GET` | `/api/supply-chain/v1/list-energy-disruptions` | `assetId`, `assetType`, `ongoingOnly`, `J` | API Key / Session | ListEnergyDisruptions |
| `GET` | `/api/supply-chain/v1/list-fuel-shortages` | `country`, `product`, `severity`, `J` | API Key / Session | ListFuelShortages |
| `GET` | `/api/supply-chain/v1/list-pipelines` | `commodityType`, `J` | API Key / Session | ListPipelines |
| `GET` | `/api/supply-chain/v1/list-storage-facilities` | `facilityType`, `J` | API Key / Session | ListStorageFacilities |
| `GET` | `/api/supply-chain/v1/list-vulnerability-rankings` | `commodityId`, `band`, `state`, `pageSize`, `J` | API Key / Session | ListVulnerabilityRankings |

## ThermalService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/thermal/v1/list-thermal-escalations` | `max_items`, `J` | API Key / Session | ListThermalEscalations |

## TradeService (8 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/trade/v1/get-bilateral-tariff` | `reporting_country*`, `partner_country*`, `hs_code*`, `year`, `J` | API Key / Session | GetBilateralTariff |
| `GET` | `/api/trade/v1/get-customs-revenue` | — | API Key / Session | GetCustomsRevenue |
| `GET` | `/api/trade/v1/get-tariff-trends` | `P40`, `partner_country`, `product_sector`, `P41`, `J` | API Key / Session | GetTariffTrends |
| `GET` | `/api/trade/v1/get-trade-barriers` | `P38`, `measure_type`, `P39`, `J` | API Key / Session | GetTradeBarriers |
| `GET` | `/api/trade/v1/get-trade-flows` | `P40`, `partner_country`, `P41`, `J` | API Key / Session | GetTradeFlows |
| `GET` | `/api/trade/v1/get-trade-restrictions` | `P38`, `P39` | API Key / Session | GetTradeRestrictions |
| `GET` | `/api/trade/v1/get-us-import-duty` | `hs_code*`, `partner_country*`, `J` | API Key / Session | GetUsImportDuty |
| `GET` | `/api/trade/v1/list-comtrade-flows` | `reporter_code`, `cmd_code`, `anomalies_only`, `J` | API Key / Session | ListComtradeFlows |

## UnrestService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/unrest/v1/list-unrest-events` | `P15`, `P16`, `P`, `P2`, `P17`, `min_severity`, `ne_lat`, `ne_lon`, `sw_lat`, `sw_lon`, `J` | API Key / Session | ListUnrestEvents |

## WebcamService (2 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/webcam/v1/get-webcam-image` | `webcam_id`, `J` | API Key / Session | GetWebcamImage |
| `GET` | `/api/webcam/v1/list-webcams` | `zoom`, `bound_w`, `bound_s`, `bound_e`, `bound_n`, `J` | API Key / Session | ListWebcams |

## WildfireService (1 endpoints)

| Method | Path | Tham số (`*` = bắt buộc) | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/wildfire/v1/list-fire-detections` | `P18`, `P19`, `P`, `P2`, `ne_lat`, `ne_lon`, `sw_lat`, `sw_lon`, `J` | API Key / Session | ListFireDetections |
