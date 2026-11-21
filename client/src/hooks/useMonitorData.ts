import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const TIME_WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
};

const DEFAULT_ACTIVE_LAYERS: Record<MapLayerId, boolean> = {
  military: true,
  vessels: true,
  earthquakes: true,
  natural: true,
  geopolitics: true,
  chokepoints: true,
  nuclear: true,
  financeCenters: true,
  cables: true,
  weatherRadar: true,
};

export function useMonitorData() {
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  // Realtime SSE + WebSocket telemetry state
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [liveTickCount, setLiveTickCount] = useState<number>(0);
  const [priceFlashes, setPriceFlashes] = useState<Record<string, FlashDirection>>({});
  const [breakingAlerts, setBreakingAlerts] = useState<BreakingAlertItem[]>([]);
  const [alertsMuted, setAlertsMuted] = useState<boolean>(false);
  const [deadReckoning, setDeadReckoning] = useState<boolean>(true);
  const [militaryAnchorMs, setMilitaryAnchorMs] = useState<number>(() => Date.now());
  const [vesselsAnchorMs, setVesselsAnchorMs] = useState<number>(() => Date.now());

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerId, boolean>>(DEFAULT_ACTIVE_LAYERS);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [radarOpacity, setRadarOpacity] = useState<number>(0.55);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<InspectableFeature | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  const mountedRef = useRef(true);
  const alertsMutedRef = useRef(alertsMuted);
  alertsMutedRef.current = alertsMuted;
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadBootstrap = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch('/api/bootstrap');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as BootstrapResponse;
      if (!mountedRef.current) return json;
      const now = Date.now();
      setData(json);
      setMilitaryAnchorMs(now);
      setVesselsAnchorMs(now);
      setError(null);
      return json;
    } catch (err) {
      if (mountedRef.current && !silent) {
        setError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ API');
      }
      return null;
    } finally {
      if (mountedRef.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadLiveFast = useCallback(async () => {
    try {
      const resp = await fetch('/api/live-fast');
      if (!resp.ok) return;
      const fast = (await resp.json()) as LiveFastResponse;
      if (!mountedRef.current) return;
      const now = Date.now();
      setMilitaryAnchorMs(now);
      setVesselsAnchorMs(now);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          serverTime: fast.serverTime,
          layers: {
            ...prev.layers,
            military: fast.military,
            vessels: fast.vessels,
            earthquakes: fast.earthquakes,
          },
          weatherRadar: fast.weatherRadar ?? prev.weatherRadar,
          markets: {
            ...prev.markets,
            quotes: fast.quotes.length > 0 ? fast.quotes : prev.markets.quotes,
            crypto: fast.crypto.length > 0 ? fast.crypto : prev.markets.crypto,
            fearGreed: fast.fearGreed ?? prev.markets.fearGreed,
            updatedAt: fast.serverTime,
          },
          health: fast.health,
        };
      });
    } catch {
      // Silent fallback poll miss
    }
  }, []);

  const applyPriceTicks = useCallback((ticks: LivePriceTick[], ts: number) => {
    const newDirections: Record<string, FlashDirection> = {};

    setData((prev) => {
      if (!prev) return prev;
      const tickMap = new Map(ticks.map((t) => [t.symbol, t]));

      const updatedCrypto = prev.markets.crypto.map((coin) => {
        const live = tickMap.get(coin.symbol);
        if (!live) return coin;
        if (live.price > coin.priceUsd) newDirections[coin.symbol] = 'up';
        else if (live.price < coin.priceUsd) newDirections[coin.symbol] = 'down';
        return {
          ...coin,
          priceUsd: live.price,
          changePercent24h: live.changePercent24h,
          updatedAt: ts,
        };
      });

      const goldTick = tickMap.get('Gold');
      let updatedQuotes = prev.markets.quotes;
      if (goldTick) {
        const idx = prev.markets.quotes.findIndex((q) => q.symbol === 'Gold');
        if (idx >= 0) {
          const prevGold = prev.markets.quotes[idx];
          if (goldTick.price > prevGold.price) newDirections.Gold = 'up';
          else if (goldTick.price < prevGold.price) newDirections.Gold = 'down';
          updatedQuotes = [...prev.markets.quotes];
          updatedQuotes[idx] = {
            ...prevGold,
            price: goldTick.price,
            changePercent24h: goldTick.changePercent24h,
            updatedAt: ts,
          };
        } else {
          updatedQuotes = [
            ...prev.markets.quotes,
            {
              symbol: 'Gold',
              name: 'Vàng giao ngay (PAXG/USD Live)',
              group: 'commodity',
              price: goldTick.price,
              changePercent24h: goldTick.changePercent24h,
              unit: 'USD/oz',
              updatedAt: ts,
              source: 'Binance PAXG/USDT Realtime',
            },
          ];
        }
      }

      return {
        ...prev,
        markets: {
          ...prev.markets,
          crypto: updatedCrypto,
          quotes: updatedQuotes,
          updatedAt: ts,
        },
      };
    });

    const changedSymbols = Object.keys(newDirections);
    if (changedSymbols.length > 0) {
      setPriceFlashes((prev) => ({ ...prev, ...newDirections }));
      for (const sym of changedSymbols) {
        const existingTimer = flashTimersRef.current.get(sym);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          if (!mountedRef.current) return;
          setPriceFlashes((curr) => {
            const copy = { ...curr };
            delete copy[sym];
            return copy;
          });
          flashTimersRef.current.delete(sym);
        }, 680);
        flashTimersRef.current.set(sym, timer);
      }
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
          if (ev.type === 'connected') {
            setStreamConnected(true);
            setData((prev) =>
              prev ? { ...prev, aisStreamConfigured: ev.aisStreamConfigured } : prev,
            );
          } else if (ev.type === 'price_tick') {
            setLiveTickCount((c) => c + 1);
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
          } else if (ev.type === 'collector_sync') {
            setData((prev) => (prev ? { ...prev, health: ev.health } : prev));
            // Pull updated layer/news/predictions immediately when slower collectors finish
            if (ev.collectorId !== 'military-flights' && ev.collectorId !== 'maritime-vessels') {
              void loadBootstrap(true);
            }
          } else if (ev.type === 'breaking_alert' && !alertsMutedRef.current) {
            setBreakingAlerts((prev) => [ev.alert, ...prev.filter((a) => a.id !== ev.alert.id)].slice(0, 4));
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
      es?.close();
      clearInterval(safetyTimer);
      for (const timer of flashTimersRef.current.values()) {
        clearTimeout(timer);
      }
      flashTimersRef.current.clear();
    };
  }, [applyPriceTicks, loadBootstrap, loadLiveFast]);

  const dismissAlert = useCallback((id: string) => {
    setBreakingAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const forceRefresh = useCallback(
    async (collectorId: CollectorId | 'polymarket-news') => {
      setRefreshingIds((prev) => new Set(prev).add(collectorId));
      try {
        await fetch(`/api/refresh/${collectorId}`, { method: 'POST' });
        await loadBootstrap(true);
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

  const setAllLayers = useCallback((enabled: boolean) => {
    setActiveLayers({
      military: enabled,
      vessels: enabled,
      earthquakes: enabled,
      natural: enabled,
      geopolitics: enabled,
      chokepoints: enabled,
      nuclear: enabled,
      financeCenters: enabled,
      cables: enabled,
      weatherRadar: enabled,
    });
  }, []);

  const flyTo = useCallback((lat: number, lon: number, zoom = 5.5) => {
    setCameraTarget({ lat, lon, zoom, nonce: Date.now() + Math.random() });
  }, []);

  const filteredData = useMemo(() => {
    if (!data) {
      return {
        military: [] as GeoPointFeature[],
        vessels: [] as GeoPointFeature[],
        earthquakes: [] as GeoPointFeature[],
        natural: [] as GeoPointFeature[],
        geopolitics: [] as GeoPointFeature[],
        chokepoints: [] as GeoPointFeature[],
        nuclear: [] as GeoPointFeature[],
        financeCenters: [] as GeoPointFeature[],
        cables: [] as GeoLineFeature[],
        news: [] as NewsItem[],
        predictions: [] as PredictionItem[],
      };
    }

    const now = Date.now();
    const maxAge = timeWindow === 'all' ? Number.POSITIVE_INFINITY : TIME_WINDOW_MS[timeWindow];
    const withinWindow = (ts: number) => ts <= 0 || now - ts <= maxAge;

    return {
      military: data.layers.military,
      vessels: data.layers.vessels ?? [],
      earthquakes: data.layers.earthquakes.filter((f) => withinWindow(f.timestamp)),
      natural: data.layers.natural.filter((f) => withinWindow(f.timestamp)),
      geopolitics: data.layers.geopolitics.filter((f) => withinWindow(f.timestamp)),
      chokepoints: data.staticGeo.chokepoints,
      nuclear: data.staticGeo.nuclear,
      financeCenters: data.staticGeo.financeCenters,
      cables: data.staticGeo.cables,
      news: data.news.filter((n) => withinWindow(n.publishedAt)),
      predictions: data.predictions,
    };
  }, [data, timeWindow]);

  const layerCounts = useMemo<Record<MapLayerId, number>>(
    () => ({
      military: filteredData.military.length,
      vessels: filteredData.vessels.length,
      earthquakes: filteredData.earthquakes.length,
      natural: filteredData.natural.length,
      geopolitics: filteredData.geopolitics.length,
      chokepoints: filteredData.chokepoints.length,
      nuclear: filteredData.nuclear.length,
      financeCenters: filteredData.financeCenters.length,
      cables: filteredData.cables.length,
      weatherRadar: data?.weatherRadar ? data.weatherRadar.pastFrames.length : 0,
    }),
    [filteredData, data?.weatherRadar],
  );

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !data) return [];

    const hits: SearchHit[] = [];

    const allPoints: Array<{ badge: string; list: GeoPointFeature[] }> = [
      { badge: 'MIL', list: filteredData.military },
      { badge: 'AIS', list: filteredData.vessels },
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
      if (`${item.title} ${item.source} ${item.matchedLocation ?? ''}`.toLowerCase().includes(q)) {
        hits.push({
          id: `nw:${item.id}`,
          kind: 'news',
          badge: 'NEWS',
          title: item.title,
          subtitle: `${item.source}${item.matchedLocation ? ` · ${item.matchedLocation}` : ''}`,
          lat: item.matchedLat,
          lon: item.matchedLon,
          url: item.url,
        });
        if (hits.length >= 32) break;
      }
    }

    return hits.slice(0, 24);
  }, [searchQuery, data, filteredData]);

  return {
    data,
    filteredData,
    layerCounts,
    loading,
    error,
    refreshingIds,
    streamConnected,
    liveTickCount,
    priceFlashes,
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
