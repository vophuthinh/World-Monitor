import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [predictionFlashes, setPredictionFlashes] = useState<Record<string, FlashDirection>>({});
  const [freshNewsIds, setFreshNewsIds] = useState<Set<string>>(new Set());
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
  const predFlashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
          predictions:
            fast.predictions && fast.predictions.length > 0 ? fast.predictions : prev.predictions,
          googleTrends: fast.googleTrends ?? prev.googleTrends,
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
          } else if (ev.type === 'polymarket_update') {
            setData((prev) =>
              prev ? { ...prev, predictions: ev.predictions } : prev,
            );
            const flashes = ev.flashedIds ?? {};
            const changedIds = Object.keys(flashes);
            if (changedIds.length > 0) {
              setLiveTickCount((c) => c + 1);
              setPredictionFlashes((prev) => ({ ...prev, ...flashes }));
              for (const id of changedIds) {
                const existing = predFlashTimersRef.current.get(id);
                if (existing) clearTimeout(existing);
                const timer = setTimeout(() => {
                  if (!mountedRef.current) return;
                  setPredictionFlashes((curr) => {
                    const copy = { ...curr };
                    delete copy[id];
                    return copy;
                  });
                  predFlashTimersRef.current.delete(id);
                }, 950);
                predFlashTimersRef.current.set(id, timer);
              }
            }
          } else if (ev.type === 'google_trends_update') {
            setData((prev) =>
              prev ? { ...prev, googleTrends: ev.googleTrends } : prev,
            );
          } else if (ev.type === 'collector_sync') {
            setData((prev) => (prev ? { ...prev, health: ev.health } : prev));
            // Pull updated layer/news immediately when slower collectors finish (streamed collectors already push directly)
            if (
              ev.collectorId !== 'military-flights' &&
              ev.collectorId !== 'maritime-vessels' &&
              ev.collectorId !== 'polymarket' &&
              ev.collectorId !== 'google-trends'
            ) {
              void loadBootstrap(true);
            }
          } else if (ev.type === 'breaking_alert' && !alertsMutedRef.current) {
            setBreakingAlerts((prev) => [ev.alert, ...prev.filter((a) => a.id !== ev.alert.id)].slice(0, 4));
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
      es?.close();
      clearInterval(safetyTimer);
      for (const timer of flashTimersRef.current.values()) {
        clearTimeout(timer);
      }
      flashTimersRef.current.clear();
      for (const timer of predFlashTimersRef.current.values()) {
        clearTimeout(timer);
      }
      predFlashTimersRef.current.clear();
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

  const filteredData = useMemo(() => {
    if (!layersRef || !staticGeoRef) {
      return {
        military: [] as GeoPointFeature[],
        vessels: [] as GeoPointFeature[],
        cyberThreats: [] as GeoPointFeature[],
        gpsOutages: [] as GeoPointFeature[],
        earthquakes: [] as GeoPointFeature[],
        natural: [] as GeoPointFeature[],
        geopolitics: [] as GeoPointFeature[],
        militaryBases: [] as GeoPointFeature[],
        aiDatacenters: [] as GeoPointFeature[],
        chokepoints: [] as GeoPointFeature[],
        nuclear: [] as GeoPointFeature[],
        financeCenters: [] as GeoPointFeature[],
        cables: [] as GeoLineFeature[],
        vietnamSovereignty: [] as GeoPointFeature[],
        vietnamZones: [] as VietnamArchipelagoZone[],
        vietnamSeaLabels: [] as VietnamSeaLabel[],
        news: [] as NewsItem[],
        predictions: [] as PredictionItem[],
      };
    }

    const now = Date.now();
    const maxAge = timeWindow === 'all' ? Number.POSITIVE_INFINITY : TIME_WINDOW_MS[timeWindow];
    const withinWindow = (ts: number) => ts <= 0 || now - ts <= maxAge;

    return {
      military: layersRef.military,
      vessels: layersRef.vessels ?? [],
      cyberThreats: (layersRef.cyberThreats ?? []).filter((f) => withinWindow(f.timestamp)),
      gpsOutages: (layersRef.gpsOutages ?? []).filter((f) => withinWindow(f.timestamp)),
      earthquakes: layersRef.earthquakes.filter((f) => withinWindow(f.timestamp)),
      natural: layersRef.natural.filter((f) => withinWindow(f.timestamp)),
      geopolitics: layersRef.geopolitics.filter((f) => withinWindow(f.timestamp)),
      militaryBases: staticGeoRef.militaryBases ?? [],
      aiDatacenters: staticGeoRef.aiDatacenters ?? [],
      chokepoints: staticGeoRef.chokepoints,
      nuclear: staticGeoRef.nuclear,
      financeCenters: staticGeoRef.financeCenters,
      cables: staticGeoRef.cables,
      vietnamSovereignty: staticGeoRef.vietnamSovereignty ?? [],
      vietnamZones: staticGeoRef.vietnamZones ?? [],
      vietnamSeaLabels: staticGeoRef.vietnamSeaLabels ?? [],
      news: (rawNewsRef ?? []).filter((n) => withinWindow(n.publishedAt)),
      predictions: rawPredictionsRef ?? [],
    };
  }, [layersRef, staticGeoRef, rawNewsRef, rawPredictionsRef, timeWindow]);

  const cyberArcs = useMemo(
    () => buildCyberAttackArcs(filteredData.cyberThreats),
    [filteredData.cyberThreats],
  );

  const layerCounts = useMemo<Record<MapLayerId, number>>(
    () => ({
      military: filteredData.military.length,
      vessels: filteredData.vessels.length,
      cyberThreats: filteredData.cyberThreats.length,
      cyberArcs: cyberArcs.length,
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
    }),
    [filteredData, cyberArcs.length, data?.weatherRadar],
  );

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
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
  }, [searchQuery, data, filteredData]);

  return {
    data,
    filteredData,
    cyberArcs,
    layerCounts,
    loading,
    error,
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
