import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { buildCyberAttackArcs } from '@shared/cyber-arcs';
import type {
  BootstrapResponse,
  BreakingAlertItem,
  CollectorId,
  GeoLineFeature,
  GeoPointFeature,
  InspectableFeature,
  LiveFastResponse,
  LivePriceTick,
  MapLayerId,
  NewsItem,
  PredictionItem,
  RealtimeServerEvent,
  TimeWindow,
  VietnamArchipelagoZone,
  VietnamSeaLabel,
} from '@shared/types';

export interface CameraTarget {
  lat: number;
  lon: number;
  zoom: number;
  nonce: number;
}

export interface SearchHit {
  id: string;
  kind: 'map_point' | 'cable' | 'prediction' | 'news';
  badge: string;
  title: string;
  subtitle: string;
  lat?: number;
  lon?: number;
  url?: string;
  inspectable?: InspectableFeature;
}

export type FlashDirection = 'up' | 'down';
export type LayerPresetId = 'clean' | 'cyber' | 'military' | 'all' | 'none';

const TIME_WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
};

const EMPTY_POINTS: GeoPointFeature[] = [];
const EMPTY_LINES: GeoLineFeature[] = [];
const EMPTY_ZONES: VietnamArchipelagoZone[] = [];
const EMPTY_SEA_LABELS: VietnamSeaLabel[] = [];
const EMPTY_NEWS: NewsItem[] = [];
const EMPTY_PREDICTIONS: PredictionItem[] = [];

function filterTimeWindow<T>(items: readonly T[], timeWindow: TimeWindow, getTime: (item: T) => number): T[] {
  const now = Date.now();
  const maxAge = timeWindow === 'all' ? Number.POSITIVE_INFINITY : TIME_WINDOW_MS[timeWindow];
  return items.filter((item) => {
    const ts = getTime(item);
    return ts <= 0 || now - ts <= maxAge;
  });
}

const pointTime = (item: GeoPointFeature) => item.timestamp;
const newsTime = (item: NewsItem) => item.publishedAt;

function updatePaxgQuote(quotes: BootstrapResponse['markets']['quotes'], tick: LivePriceTick | undefined, ts: number): BootstrapResponse['markets']['quotes'] {
  if (!tick) return quotes;
  const index = quotes.findIndex((quote) => quote.symbol === 'PAXG');
  const old = quotes[index];
  if (old && !old.retained && old.price === tick.price && old.changePercent24h === tick.changePercent24h) return quotes;
  const quote = {
    ...(old ?? { symbol: 'PAXG', name: 'PAX Gold / USDT', group: 'commodity' as const, unit: 'USD/oz', source: 'Binance PAXG/USDT Realtime' }),
    price: tick.price, changePercent24h: tick.changePercent24h, updatedAt: ts, retained: false,
  };
  if (index < 0) return [...quotes, quote];
  return quotes.map((item, i) => i === index ? quote : item);
}

function replayRealtimeEvents(data: BootstrapResponse, events: readonly RealtimeServerEvent[], newsSince = data.serverTime): BootstrapResponse {
  let current = data;
  for (const event of events) {
    if ('ts' in event && event.ts < (event.type === 'news_prepend' ? newsSince : data.serverTime)) continue;
    switch (event.type) {
      case 'connected':
        current = { ...current, aisStreamConfigured: event.aisStreamConfigured };
        break;
      case 'military_update':
        current = { ...current, layers: { ...current.layers, military: event.military } };
        break;
      case 'vessels_update':
        current = { ...current, layers: { ...current.layers, vessels: event.vessels } };
        break;
      case 'polymarket_update':
        current = { ...current, predictions: event.predictions };
        break;
      case 'google_trends_update':
        current = { ...current, googleTrends: event.googleTrends };
        break;
      case 'collector_sync':
        current = { ...current, health: event.health };
        break;
      case 'news_prepend': {
        const news = new Map(event.items.map((item) => [item.id, item]));
        for (const item of current.news) if (!news.has(item.id)) news.set(item.id, item);
        current = { ...current, news: [...news.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 160), newsStreamStats: event.stats };
        break;
      }
      case 'price_tick': {
        const ticks = new Map(event.ticks.map((tick) => [tick.symbol, tick]));
        const crypto = current.markets.crypto.map((coin) => {
          const tick = ticks.get(coin.symbol);
          return tick ? { ...coin, marketDataFetchedAt: coin.marketDataFetchedAt ?? coin.updatedAt, priceUsd: tick.price, changePercent24h: tick.changePercent24h, updatedAt: event.ts } : coin;
        });
        const quotes = updatePaxgQuote(current.markets.quotes, ticks.get('PAXG'), event.ts);
        current = { ...current, markets: { ...current.markets, crypto, quotes } };
        break;
      }
    }
  }
  return current;
}

// Clean default mode: 6 core situational awareness layers ON; secondary/dense layers 1-click toggleable
const DEFAULT_ACTIVE_LAYERS: Record<MapLayerId, boolean> = {
  military: true,
  vessels: true,
  cyberThreats: false,
  cyberArcs: false,
  gpsOutages: false,
  earthquakes: true,
  natural: false,
  geopolitics: true,
  militaryBases: false,
  aiDatacenters: false,
  chokepoints: true,
  nuclear: false,
  financeCenters: false,
  cables: false,
  weatherRadar: true,
  cyclones: true,
  satellite: false,
};

export function useMonitorData() {
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [fastError, setFastError] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  // Realtime SSE + WebSocket telemetry state
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [liveTickCount, setLiveTickCount] = useState<number>(0);
  const [priceFlashes, setPriceFlashes] = useState<Record<string, FlashDirection>>({});
  const [predictionFlashes, setPredictionFlashes] = useState<Record<string, FlashDirection>>({});
  const [freshNewsIds, setFreshNewsIds] = useState<Set<string>>(new Set());
  const [breakingAlerts, setBreakingAlerts] = useState<BreakingAlertItem[]>([]);
  const [alertsMuted, setAlertsMuted] = useState<boolean>(false);
  const [deadReckoning, setDeadReckoning] = useState<boolean>(true);
  const [militaryAnchorMs, setMilitaryAnchorMs] = useState<number>(() => Date.now());
  const [vesselsAnchorMs, setVesselsAnchorMs] = useState<number>(() => Date.now());

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerId, boolean>>(DEFAULT_ACTIVE_LAYERS);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [windowTick, setWindowTick] = useState(0);
  const [radarOpacity, setRadarOpacity] = useState<number>(0.55);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<InspectableFeature | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  const mountedRef = useRef(true);
  const alertsMutedRef = useRef(alertsMuted);
  alertsMutedRef.current = alertsMuted;
  const flashResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const predFlashResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const bootstrapPendingRef = useRef(false);
  const realtimeBuffersRef = useRef(new Set<RealtimeServerEvent[]>());
  const tickPricesRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!data) return;
    const prices = new Map(data.markets.crypto.map((coin) => [coin.symbol, coin.priceUsd]));
    const paxg = data.markets.quotes.find((quote) => quote.symbol === 'PAXG');
    if (paxg) prices.set('PAXG', paxg.price);
    tickPricesRef.current = prices;
  }, [data?.markets.crypto, data?.markets.quotes]);

  useEffect(() => {
    if (timeWindow === 'all') return;
    const timer = setInterval(() => setWindowTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [timeWindow]);

  const loadBootstrap = useCallback(async (silent = false) => {
    if (bootstrapInFlightRef.current) {
      if (silent) bootstrapPendingRef.current = true;
      return null;
    }
    bootstrapInFlightRef.current = true;
    const events: RealtimeServerEvent[] = [];
    realtimeBuffersRef.current.add(events);
    if (!silent) setLoading(true);
    try {
      const resp = await fetch('/api/bootstrap', { signal: AbortSignal.timeout(20_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as BootstrapResponse;
      if (!mountedRef.current) return json;
      const now = Date.now();
      setData((prev) => {
        if (prev && prev.serverTime > json.serverTime) {
          return replayRealtimeEvents({
            ...json,
            serverTime: prev.serverTime,
            layers: { ...json.layers, military: prev.layers.military, vessels: prev.layers.vessels, earthquakes: prev.layers.earthquakes },
            weatherRadar: prev.weatherRadar,
            tropicalCyclones: prev.tropicalCyclones ?? json.tropicalCyclones,
            weatherSatellite: prev.weatherSatellite ?? json.weatherSatellite,
            markets: { ...json.markets, ...prev.markets, macro: json.markets.macro },
            predictions: prev.predictions,
            googleTrends: prev.googleTrends,
            health: prev.health,
          }, events, json.serverTime);
        }
        return replayRealtimeEvents(json, events);
      });
      setMilitaryAnchorMs(now);
      setVesselsAnchorMs(now);
      setError(null);
      return json;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ API');
      }
      return null;
    } finally {
      realtimeBuffersRef.current.delete(events);
      bootstrapInFlightRef.current = false;
      if (bootstrapPendingRef.current && mountedRef.current) {
        bootstrapPendingRef.current = false;
        queueMicrotask(() => {
          if (mountedRef.current) void loadBootstrap(true);
        });
      }
      if (mountedRef.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  const scheduleCoalescedBootstrap = useCallback(() => {
    if (bootstrapDebounceRef.current) return;
    bootstrapDebounceRef.current = setTimeout(() => {
      bootstrapDebounceRef.current = null;
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadBootstrap(true);
    }, 1_200);
  }, [loadBootstrap]);

  const loadLiveFast = useCallback(async () => {
    const events: RealtimeServerEvent[] = [];
    realtimeBuffersRef.current.add(events);
    try {
      const resp = await fetch('/api/live-fast', { signal: AbortSignal.timeout(20_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const fast = (await resp.json()) as LiveFastResponse;
      if (!mountedRef.current) return;
      setFastError(null);
      const now = Date.now();
      setMilitaryAnchorMs(now);
      setVesselsAnchorMs(now);
      setData((prev) => {
        if (!prev) return prev;
        if (prev.serverTime > fast.serverTime) return prev;
        return replayRealtimeEvents({
          ...prev,
          serverTime: fast.serverTime,
          layers: {
            ...prev.layers,
            military: fast.military,
            vessels: fast.vessels,
            earthquakes: fast.earthquakes,
          },
          weatherRadar: fast.weatherRadar,
          tropicalCyclones: fast.tropicalCyclones ?? prev.tropicalCyclones,
          weatherSatellite: fast.weatherSatellite ?? prev.weatherSatellite,
          markets: {
            ...prev.markets,
            quotes: fast.quotes,
            crypto: fast.crypto,
            fearGreed: fast.fearGreed,
            fred: fast.fred,
            vnMacroPulse: fast.vnMacroPulse,
            expiredMacroNotices: fast.expiredMacroNotices,
            vn30: fast.vn30,
            vnGold: fast.vnGold,
            updatedAt: fast.serverTime,
          },
          predictions: fast.predictions ?? prev.predictions,
          googleTrends: fast.googleTrends === null ? undefined : fast.googleTrends ?? prev.googleTrends,
          health: fast.health,
        }, events);
      });
    } catch (err) {
      if (mountedRef.current) {
        setFastError(err instanceof Error ? err.message : 'Không thể cập nhật dữ liệu nhanh');
      }
    } finally {
      realtimeBuffersRef.current.delete(events);
    }
  }, []);

  const applyPriceTicks = useCallback((ticks: LivePriceTick[], ts: number) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const newDirections: Record<string, FlashDirection> = {};
    for (const tick of ticks) {
      const previous = tickPricesRef.current.get(tick.symbol);
      if (previous !== undefined && tick.price !== previous) {
        newDirections[tick.symbol] = tick.price > previous ? 'up' : 'down';
      }
      if (previous !== undefined || tick.symbol === 'PAXG') tickPricesRef.current.set(tick.symbol, tick.price);
    }

    setData((prev) => {
      if (!prev) return prev;
      const tickMap = new Map(ticks.map((t) => [t.symbol, t]));
      let anyChanged = false;

      const updatedCrypto = prev.markets.crypto.map((coin) => {
        const live = tickMap.get(coin.symbol);
        if (!live || (live.price === coin.priceUsd && live.changePercent24h === coin.changePercent24h)) return coin;
        anyChanged = true;
        return {
          ...coin,
          marketDataFetchedAt: coin.marketDataFetchedAt ?? coin.updatedAt,
          priceUsd: live.price,
          changePercent24h: live.changePercent24h,
          updatedAt: ts,
        };
      });

      const paxgTick = tickMap.get('PAXG');
      const updatedQuotes = updatePaxgQuote(prev.markets.quotes, paxgTick, ts);
      if (paxgTick && updatedQuotes !== prev.markets.quotes) {
        anyChanged = true;
      }

      if (!anyChanged) return prev;

      return {
        ...prev,
        markets: {
          ...prev.markets,
          crypto: updatedCrypto,
          quotes: updatedQuotes,
        },
      };
    });

    const changedSymbols = Object.keys(newDirections);
    if (changedSymbols.length > 0) {
      setLiveTickCount((c) => c + 1);
      setPriceFlashes((prev) => ({ ...prev, ...newDirections }));
      if (flashResetTimerRef.current) clearTimeout(flashResetTimerRef.current);
      flashResetTimerRef.current = setTimeout(() => {
        flashResetTimerRef.current = null;
        if (!mountedRef.current) return;
        setPriceFlashes({});
      }, 650);
    }
  }, []);

  // Connect EventSource (/api/stream) for real-time sub-second push
  useEffect(() => {
    mountedRef.current = true;
    void loadBootstrap(false);

    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/stream');

      es.onopen = () => {
        if (mountedRef.current) setStreamConnected(true);
      };

      es.onerror = () => {
        if (mountedRef.current) setStreamConnected(false);
      };

      es.onmessage = (msg) => {
        if (!mountedRef.current) return;
        try {
          const ev = JSON.parse(msg.data) as RealtimeServerEvent;
          for (const buffer of realtimeBuffersRef.current) buffer.push(ev);
          if (ev.type === 'connected') {
            setStreamConnected(true);
            setData((prev) =>
              prev ? { ...prev, aisStreamConfigured: ev.aisStreamConfigured } : prev,
            );
          } else if (ev.type === 'price_tick') {
            applyPriceTicks(ev.ticks, ev.ts);
          } else if (ev.type === 'military_update') {
            setMilitaryAnchorMs(Date.now());
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    layers: { ...prev.layers, military: ev.military },
                  }
                : prev,
            );
          } else if (ev.type === 'vessels_update') {
            setVesselsAnchorMs(Date.now());
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    layers: { ...prev.layers, vessels: ev.vessels },
                  }
                : prev,
            );
          } else if (ev.type === 'polymarket_update') {
            setData((prev) =>
              prev ? { ...prev, predictions: ev.predictions } : prev,
            );
            const flashes = ev.flashedIds ?? {};
            const changedIds = Object.keys(flashes);
            if (changedIds.length > 0) {
              setLiveTickCount((c) => c + 1);
              setPredictionFlashes((prev) => ({ ...prev, ...flashes }));
              if (predFlashResetTimerRef.current) clearTimeout(predFlashResetTimerRef.current);
              predFlashResetTimerRef.current = setTimeout(() => {
                predFlashResetTimerRef.current = null;
                if (!mountedRef.current) return;
                setPredictionFlashes({});
              }, 900);
            }
          } else if (ev.type === 'google_trends_update') {
            setData((prev) =>
              prev ? { ...prev, googleTrends: ev.googleTrends } : prev,
            );
          } else if (ev.type === 'collector_sync') {
            setData((prev) => (prev ? { ...prev, health: ev.health } : prev));
            // Debounce slower collector syncs into one coalesced bootstrap fetch instead of N concurrent downloads
            if (
              ev.collectorId !== 'military-flights' &&
              ev.collectorId !== 'maritime-vessels' &&
              ev.collectorId !== 'polymarket' &&
              ev.collectorId !== 'google-trends'
            ) {
              scheduleCoalescedBootstrap();
            }
          } else if (ev.type === 'breaking_alert' && !alertsMutedRef.current) {
            const alertId = ev.alert.id;
            setBreakingAlerts((prev) => [ev.alert, ...prev.filter((a) => a.id !== alertId)].slice(0, 2));
            setTimeout(() => {
              if (!mountedRef.current) return;
              setBreakingAlerts((prev) => prev.filter((a) => a.id !== alertId));
            }, 12_000);
          } else if (ev.type === 'news_prepend') {
            const addedIds = ev.items.map((i) => i.id);
            setFreshNewsIds((prev) => {
              const next = new Set(prev);
              for (const id of addedIds) next.add(id);
              return next;
            });
            setTimeout(() => {
              if (!mountedRef.current) return;
              setFreshNewsIds((prev) => {
                const next = new Set(prev);
                for (const id of addedIds) next.delete(id);
                return next;
              });
            }, 6_000);

            setData((prev) => {
              if (!prev) return prev;
              const mergedMap = new Map<string, NewsItem>();
              for (const item of ev.items) mergedMap.set(item.id, item);
              for (const item of prev.news) {
                if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
              }
              const mergedNews = [...mergedMap.values()]
                .sort((a, b) => b.publishedAt - a.publishedAt)
                .slice(0, 160);
              return {
                ...prev,
                news: mergedNews,
                newsStreamStats: ev.stats,
              };
            });
          }
        } catch {
          // Ignore malformed frame
        }
      };
    }

    // Safety fallback poll every 60s in case SSE reconnects
    const safetyTimer = setInterval(() => {
      void loadLiveFast();
    }, 60_000);

    return () => {
      mountedRef.current = false;
      bootstrapPendingRef.current = false;
      es?.close();
      clearInterval(safetyTimer);
      if (flashResetTimerRef.current) clearTimeout(flashResetTimerRef.current);
      if (predFlashResetTimerRef.current) clearTimeout(predFlashResetTimerRef.current);
      if (bootstrapDebounceRef.current) clearTimeout(bootstrapDebounceRef.current);
    };
  }, [applyPriceTicks, loadBootstrap, loadLiveFast, scheduleCoalescedBootstrap]);

  const dismissAlert = useCallback((id: string) => {
    setBreakingAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const forceRefresh = useCallback(
    async (collectorId: CollectorId | 'polymarket-news') => {
      setRefreshingIds((prev) => new Set(prev).add(collectorId));
      try {
        const response = await fetch(`/api/refresh/${collectorId}`, { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (mountedRef.current) {
          setRefreshErrors((prev) => {
            const next = { ...prev };
            delete next[collectorId];
            return next;
          });
        }
        await loadBootstrap(true);
      } catch (err) {
        if (mountedRef.current) {
          setRefreshErrors((prev) => ({
            ...prev,
            [collectorId]: err instanceof Error ? err.message : 'Không thể làm mới',
          }));
        }
      } finally {
        if (mountedRef.current) {
          setRefreshingIds((prev) => {
            const next = new Set(prev);
            next.delete(collectorId);
            return next;
          });
        }
      }
    },
    [loadBootstrap],
  );

  const toggleLayer = useCallback((layerId: MapLayerId) => {
    setActiveLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const applyLayerPreset = useCallback((preset: LayerPresetId) => {
    if (preset === 'clean') {
      setActiveLayers(DEFAULT_ACTIVE_LAYERS);
      return;
    }
    if (preset === 'cyber') {
      setActiveLayers({
        military: false,
        vessels: false,
        cyberThreats: true,
        cyberArcs: true,
        gpsOutages: true,
        earthquakes: false,
        natural: false,
        geopolitics: false,
        militaryBases: false,
        aiDatacenters: true,
        chokepoints: false,
        nuclear: false,
        financeCenters: false,
        cables: true,
        weatherRadar: false,
        cyclones: false,
        satellite: false,
      });
      return;
    }
    if (preset === 'military') {
      setActiveLayers({
        military: true,
        vessels: true,
        cyberThreats: false,
        cyberArcs: false,
        gpsOutages: true,
        earthquakes: false,
        natural: false,
        geopolitics: true,
        militaryBases: true,
        aiDatacenters: false,
        chokepoints: true,
        nuclear: true,
        financeCenters: false,
        cables: false,
        weatherRadar: true,
        cyclones: true,
        satellite: false,
      });
      return;
    }
    const enabled = preset === 'all';
    setActiveLayers({
      military: enabled,
      vessels: enabled,
      cyberThreats: enabled,
      cyberArcs: enabled,
      gpsOutages: enabled,
      earthquakes: enabled,
      natural: enabled,
      geopolitics: enabled,
      militaryBases: enabled,
      aiDatacenters: enabled,
      chokepoints: enabled,
      nuclear: enabled,
      financeCenters: enabled,
      cables: enabled,
      weatherRadar: enabled,
      cyclones: enabled,
      satellite: enabled,
    });
  }, []);

  const setAllLayers = useCallback(
    (enabled: boolean) => {
      applyLayerPreset(enabled ? 'all' : 'none');
    },
    [applyLayerPreset],
  );

  const flyTo = useCallback((lat: number, lon: number, zoom = 5.5) => {
    setCameraTarget({ lat, lon, zoom, nonce: Date.now() + Math.random() });
  }, []);

  const layersRef = data?.layers;
  const staticGeoRef = data?.staticGeo;
  const rawNewsRef = data?.news;
  const rawPredictionsRef = data?.predictions;
  const cyberThreats = useMemo(() => filterTimeWindow(layersRef?.cyberThreats ?? EMPTY_POINTS, timeWindow, pointTime), [layersRef?.cyberThreats, timeWindow, windowTick]);
  const gpsOutages = useMemo(() => filterTimeWindow(layersRef?.gpsOutages ?? EMPTY_POINTS, timeWindow, pointTime), [layersRef?.gpsOutages, timeWindow, windowTick]);
  const earthquakes = useMemo(() => filterTimeWindow(layersRef?.earthquakes ?? EMPTY_POINTS, timeWindow, pointTime), [layersRef?.earthquakes, timeWindow, windowTick]);
  const natural = useMemo(() => filterTimeWindow(layersRef?.natural ?? EMPTY_POINTS, timeWindow, pointTime), [layersRef?.natural, timeWindow, windowTick]);
  const geopolitics = useMemo(() => filterTimeWindow(layersRef?.geopolitics ?? EMPTY_POINTS, timeWindow, pointTime), [layersRef?.geopolitics, timeWindow, windowTick]);
  const news = useMemo(() => filterTimeWindow(rawNewsRef ?? EMPTY_NEWS, timeWindow, newsTime), [rawNewsRef, timeWindow, windowTick]);

  const filteredData = useMemo(() => {
    if (!layersRef || !staticGeoRef) {
      return {
        military: EMPTY_POINTS, vessels: EMPTY_POINTS, cyberThreats: EMPTY_POINTS,
        gpsOutages: EMPTY_POINTS, earthquakes: EMPTY_POINTS, natural: EMPTY_POINTS,
        geopolitics: EMPTY_POINTS, militaryBases: EMPTY_POINTS, aiDatacenters: EMPTY_POINTS,
        chokepoints: EMPTY_POINTS, nuclear: EMPTY_POINTS, financeCenters: EMPTY_POINTS,
        cables: EMPTY_LINES, vietnamSovereignty: EMPTY_POINTS, vietnamZones: EMPTY_ZONES,
        vietnamSeaLabels: EMPTY_SEA_LABELS, news: EMPTY_NEWS, predictions: EMPTY_PREDICTIONS,
      };
    }

    return {
      military: layersRef.military,
      vessels: layersRef.vessels ?? EMPTY_POINTS,
      cyberThreats,
      gpsOutages,
      earthquakes,
      natural,
      geopolitics,
      militaryBases: staticGeoRef.militaryBases ?? EMPTY_POINTS,
      aiDatacenters: staticGeoRef.aiDatacenters ?? EMPTY_POINTS,
      chokepoints: staticGeoRef.chokepoints,
      nuclear: staticGeoRef.nuclear,
      financeCenters: staticGeoRef.financeCenters,
      cables: staticGeoRef.cables,
      vietnamSovereignty: staticGeoRef.vietnamSovereignty ?? EMPTY_POINTS,
      vietnamZones: staticGeoRef.vietnamZones ?? EMPTY_ZONES,
      vietnamSeaLabels: staticGeoRef.vietnamSeaLabels ?? EMPTY_SEA_LABELS,
      news,
      predictions: rawPredictionsRef ?? EMPTY_PREDICTIONS,
    };
  }, [layersRef, staticGeoRef, rawPredictionsRef, cyberThreats, gpsOutages, earthquakes, natural, geopolitics, news]);

  const cyberArcs = useMemo(
    () => (activeLayers.cyberArcs ? buildCyberAttackArcs(filteredData.cyberThreats) : []),
    [activeLayers.cyberArcs, filteredData.cyberThreats],
  );

  const layerCounts = useMemo<Record<MapLayerId, number>>(
    () => ({
      military: filteredData.military.length,
      vessels: filteredData.vessels.length,
      cyberThreats: filteredData.cyberThreats.length,
      cyberArcs: activeLayers.cyberArcs
        ? cyberArcs.length
        : Math.min(26, filteredData.cyberThreats.length),
      gpsOutages: filteredData.gpsOutages.length,
      earthquakes: filteredData.earthquakes.length,
      natural: filteredData.natural.length,
      geopolitics: filteredData.geopolitics.length,
      militaryBases: filteredData.militaryBases.length,
      aiDatacenters: filteredData.aiDatacenters.length,
      chokepoints: filteredData.chokepoints.length,
      nuclear: filteredData.nuclear.length,
      financeCenters: filteredData.financeCenters.length,
      cables: filteredData.cables.length,
      weatherRadar: data?.weatherRadar ? data.weatherRadar.pastFrames.length : 0,
      cyclones: data?.tropicalCyclones?.cyclones.length ?? 0,
      satellite: data?.weatherSatellite ? data.weatherSatellite.frames.length : 0,
    }),
    [filteredData, activeLayers.cyberArcs, cyberArcs.length, data?.weatherRadar, data?.tropicalCyclones, data?.weatherSatellite],
  );

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q || !data) return [];

    const hits: SearchHit[] = [];

    const allPoints: Array<{ badge: string; list: GeoPointFeature[] }> = [
      { badge: 'VN', list: filteredData.vietnamSovereignty },
      { badge: 'MIL', list: filteredData.military },
      { badge: 'AIS', list: filteredData.vessels },
      { badge: 'CYBER', list: filteredData.cyberThreats },
      { badge: 'GPS/BGP', list: filteredData.gpsOutages },
      { badge: 'BASE', list: filteredData.militaryBases },
      { badge: 'AI/DC', list: filteredData.aiDatacenters },
      { badge: 'EQ', list: filteredData.earthquakes },
      { badge: 'NAT', list: filteredData.natural },
      { badge: 'GEO', list: filteredData.geopolitics },
      { badge: 'SEA', list: filteredData.chokepoints },
      { badge: 'NUC', list: filteredData.nuclear },
      { badge: 'FIN', list: filteredData.financeCenters },
    ];

    for (const group of allPoints) {
      for (const pt of group.list) {
        const hay = `${pt.title} ${pt.subtitle ?? ''} ${pt.category} ${Object.values(pt.meta).join(' ')}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({
            id: `pt:${pt.id}`,
            kind: 'map_point',
            badge: group.badge,
            title: pt.title,
            subtitle: pt.subtitle ?? pt.source,
            lat: pt.lat,
            lon: pt.lon,
            inspectable: { kind: 'point', feature: pt },
          });
          if (hits.length >= 18) break;
        }
      }
      if (hits.length >= 18) break;
    }

    for (const cable of filteredData.cables) {
      const hay = `${cable.name} ${cable.owners.join(' ')} ${cable.landingPoints.map((l) => l.city).join(' ')}`.toLowerCase();
      if (hay.includes(q)) {
        const firstLanding = cable.landingPoints[0];
        hits.push({
          id: `cb:${cable.id}`,
          kind: 'cable',
          badge: 'CABLE',
          title: cable.name,
          subtitle: cable.landingPoints.map((l) => l.city).join(' · '),
          lat: firstLanding?.lat ?? 14.5,
          lon: firstLanding?.lon ?? 111.0,
          inspectable: { kind: 'cable', feature: cable },
        });
      }
    }

    for (const pred of filteredData.predictions) {
      if (pred.title.toLowerCase().includes(q)) {
        hits.push({
          id: `pm:${pred.id}`,
          kind: 'prediction',
          badge: `YES ${pred.yesPercent}%`,
          title: pred.title,
          subtitle: `Polymarket · Vol $${(pred.volumeUsd / 1_000_000).toFixed(2)}M`,
          url: pred.url,
        });
        if (hits.length >= 26) break;
      }
    }

    for (const item of filteredData.news) {
      if (
        `${item.title} ${item.titleVi ?? ''} ${item.source} ${item.matchedLocation ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        hits.push({
          id: `nw:${item.id}`,
          kind: 'news',
          badge: 'NEWS',
          title: item.titleVi || item.title,
          subtitle: `${item.source}${item.matchedLocation ? ` · ${item.matchedLocation}` : ''}`,
          lat: item.matchedLat,
          lon: item.matchedLon,
          url: item.url,
        });
        if (hits.length >= 32) break;
      }
    }

    for (const item of data.techCyber?.items ?? []) {
      if (
        `${item.title} ${item.titleVi ?? ''} ${item.source} ${item.cveId ?? ''} ${item.matchedLocation ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        hits.push({
          id: `tc:${item.id}`,
          kind: 'news',
          badge: item.cveId ?? (item.subCategory === 'cyber' ? 'CYBER' : 'AI/TECH'),
          title: item.titleVi || item.title,
          subtitle: `${item.source}${item.matchedLocation ? ` · ${item.matchedLocation}` : ''}`,
          lat: item.matchedLat,
          lon: item.matchedLon,
          url: item.url,
        });
        if (hits.length >= 34) break;
      }
    }

    for (const doc of data.policyLegal?.items ?? []) {
      if (
        `${doc.title} ${doc.docCode ?? ''} ${doc.typeBadge} ${doc.sector} ${doc.source}`
          .toLowerCase()
          .includes(q)
      ) {
        hits.push({
          id: `pl:${doc.id}`,
          kind: 'news',
          badge: doc.docCode ?? doc.typeBadge,
          title: doc.title,
          subtitle: `${doc.source} · ${doc.sector}`,
          url: doc.pdfUrl ?? doc.url,
        });
        if (hits.length >= 36) break;
      }
    }

    for (const hpt of data.hptIntel?.items ?? []) {
      if (`hpt ${hpt.title} ${hpt.badge} ${hpt.source}`.toLowerCase().includes(q)) {
        hits.push({
          id: `hpt:${hpt.id}`,
          kind: 'news',
          badge: `HPT · ${hpt.badge}`,
          title: hpt.title,
          subtitle: `${hpt.source} · ${hpt.dateLabel ?? ''}`,
          url: hpt.pdfUrl ?? hpt.url,
        });
        if (hits.length >= 38) break;
      }
    }

    for (const trend of [
      ...(data.googleTrends?.vn ?? []),
      ...(data.googleTrends?.global ?? []),
    ]) {
      if (
        `${trend.query} ${trend.topNewsTitle ?? ''} ${trend.topNewsTitleVi ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        hits.push({
          id: `gt:${trend.id}`,
          kind: 'news',
          badge: `TREND ${trend.approxTraffic}`,
          title: trend.query,
          subtitle: `Google Trends ${trend.geo} · ${trend.topNewsTitleVi || trend.topNewsTitle || ''}`,
          lat: trend.matchedLat,
          lon: trend.matchedLon,
          url: trend.topNewsUrl ?? trend.trendUrl,
        });
        if (hits.length >= 38) break;
      }
    }

    return hits.slice(0, 24);
  }, [deferredSearchQuery, data, filteredData]);

  return {
    data,
    filteredData,
    cyberArcs,
    layerCounts,
    loading,
    error,
    fastError,
    refreshErrors,
    refreshingIds,
    streamConnected,
    liveTickCount,
    priceFlashes,
    predictionFlashes,
    freshNewsIds,
    breakingAlerts,
    dismissAlert,
    alertsMuted,
    setAlertsMuted,
    deadReckoning,
    setDeadReckoning,
    militaryAnchorMs,
    vesselsAnchorMs,
    activeLayers,
    toggleLayer,
    setAllLayers,
    applyLayerPreset,
    timeWindow,
    setTimeWindow,
    radarOpacity,
    setRadarOpacity,
    searchQuery,
    setSearchQuery,
    searchResults,
    selectedFeature,
    setSelectedFeature,
    cameraTarget,
    flyTo,
    forceRefresh,
    reloadBootstrap: () => loadBootstrap(false),
  };
}
