import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BootstrapResponse,
  CollectorId,
  GeoLineFeature,
  GeoPointFeature,
  InspectableFeature,
  LiveFastResponse,
  MapLayerId,
  NewsItem,
  PredictionItem,
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

const TIME_WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
};

const DEFAULT_ACTIVE_LAYERS: Record<MapLayerId, boolean> = {
  military: true,
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
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const [activeLayers, setActiveLayers] = useState<Record<MapLayerId, boolean>>(DEFAULT_ACTIVE_LAYERS);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [radarOpacity, setRadarOpacity] = useState<number>(0.55);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<InspectableFeature | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  const mountedRef = useRef(true);

  const loadBootstrap = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch('/api/bootstrap');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as BootstrapResponse;
      if (!mountedRef.current) return json;
      setData(json);
      setError(null);
      setLastSyncAt(Date.now());
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
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          serverTime: fast.serverTime,
          layers: {
            ...prev.layers,
            military: fast.military,
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
      setLastSyncAt(Date.now());
    } catch {
      // Silent background poll miss; health state remains intact
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let followup1: ReturnType<typeof setTimeout> | undefined;
    let followup2: ReturnType<typeof setTimeout> | undefined;

    void loadBootstrap(false).then((initial) => {
      // If server just cold-started and collectors are still warming, run quick follow-up syncs
      const hasWarming = initial?.health.some((h) => h.status === 'warming');
      if (hasWarming) {
        followup1 = setTimeout(() => void loadBootstrap(true), 3_500);
        followup2 = setTimeout(() => void loadBootstrap(true), 9_500);
      }
    });

    const fastTimer = setInterval(() => {
      void loadLiveFast();
    }, 30_000);

    const fullTimer = setInterval(() => {
      void loadBootstrap(true);
    }, 180_000);

    return () => {
      mountedRef.current = false;
      clearInterval(fastTimer);
      clearInterval(fullTimer);
      if (followup1) clearTimeout(followup1);
      if (followup2) clearTimeout(followup2);
    };
  }, [loadBootstrap, loadLiveFast]);

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
      // Military flights represent live airborne traffic; always keep active snapshot
      military: data.layers.military,
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
    lastSyncAt,
    refreshingIds,
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
