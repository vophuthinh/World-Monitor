import { useEffect, useState } from 'react';
import { ArrowsClockwise, SidebarSimple, WarningDiamond } from '@phosphor-icons/react';
import type { BasemapTheme, TheaterViewPreset } from '@shared/types';
import { FeatureInspector } from './components/FeatureInspector';
import { LayerControlDock } from './components/LayerControlDock';
import { LiveAlertStack, LiveTvPipWindow } from './components/LiveOverlays';
import { RightIntelPanel } from './components/RightIntelPanel';
import { TopCommandBar } from './components/TopCommandBar';
import { WorldMap } from './components/WorldMap';
import { type SearchHit, useMonitorData } from './hooks/useMonitorData';

export function App() {
  const {
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
    reloadBootstrap,
  } = useMonitorData();

  const [isGlobe, setIsGlobe] = useState<boolean>(false);
  const [basemap, setBasemap] = useState<BasemapTheme>('dark-matter');
  const [activeTheaterId, setActiveTheaterId] = useState<string>('east-sea-vn');
  const [mobileIntelOpen, setMobileIntelOpen] = useState<boolean>(false);
  const [liveTvOpen, setLiveTvOpen] = useState<boolean>(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFeature(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelectedFeature]);

  const handleSelectTheater = (preset: TheaterViewPreset) => {
    setActiveTheaterId(preset.id);
    flyTo(preset.lat, preset.lon, preset.zoom);
  };

  const handlePickSearchHit = (hit: SearchHit) => {
    setSearchQuery('');
    if (hit.inspectable) {
      setSelectedFeature(hit.inspectable);
    }
    if (hit.lat !== undefined && hit.lon !== undefined) {
      flyTo(hit.lat, hit.lon, 6.2);
    } else if (hit.url) {
      window.open(hit.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070b12] text-slate-100">
      <TopCommandBar
        isGlobe={isGlobe}
        onToggleGlobe={() => setIsGlobe((v) => !v)}
        basemap={basemap}
        onChangeBasemap={setBasemap}
        theaters={data?.theaters ?? []}
        activeTheaterId={activeTheaterId}
        onSelectTheater={handleSelectTheater}
        timeWindow={timeWindow}
        onChangeTimeWindow={setTimeWindow}
        searchQuery={searchQuery}
        onChangeSearch={setSearchQuery}
        searchResults={searchResults}
        onPickSearchHit={handlePickSearchHit}
        health={data?.health ?? []}
        refreshingIds={refreshingIds}
        onForceRefresh={forceRefresh}
        quotes={data?.markets.quotes ?? []}
        crypto={data?.markets.crypto ?? []}
        fearGreed={data?.markets.fearGreed ?? null}
        layerCounts={layerCounts}
        streamConnected={streamConnected}
        liveTickCount={liveTickCount}
        priceFlashes={priceFlashes}
        deadReckoning={deadReckoning}
        onToggleDeadReckoning={() => setDeadReckoning((v) => !v)}
        liveTvOpen={liveTvOpen}
        onToggleLiveTv={() => setLiveTvOpen((v) => !v)}
      />

      {error && (
        <div className="flex items-center justify-between border-b border-rose-500/40 bg-rose-950/75 px-4 py-1.5 text-xs text-rose-200">
          <span className="flex items-center gap-2">
            <WarningDiamond size={15} weight="fill" className="text-rose-400" />
            Lỗi kết nối Backend API: {error}
          </span>
          <button
            type="button"
            onClick={() => void reloadBootstrap()}
            className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/20 px-2 py-0.5 font-medium hover:bg-rose-500/30"
          >
            <ArrowsClockwise size={13} />
            Thử lại
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Map Canvas Viewport */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <WorldMap
            isGlobe={isGlobe}
            basemap={basemap}
            activeLayers={activeLayers}
            radarOpacity={radarOpacity}
            weatherRadar={data?.weatherRadar ?? null}
            military={filteredData.military}
            vessels={filteredData.vessels}
            cyberThreats={filteredData.cyberThreats}
            cyberArcs={cyberArcs}
            militaryAnchorMs={militaryAnchorMs}
            vesselsAnchorMs={vesselsAnchorMs}
            deadReckoning={deadReckoning}
            earthquakes={filteredData.earthquakes}
            natural={filteredData.natural}
            geopolitics={filteredData.geopolitics}
            militaryBases={filteredData.militaryBases}
            aiDatacenters={filteredData.aiDatacenters}
            chokepoints={filteredData.chokepoints}
            nuclear={filteredData.nuclear}
            financeCenters={filteredData.financeCenters}
            cables={filteredData.cables}
            vietnamSovereignty={filteredData.vietnamSovereignty}
            vietnamZones={filteredData.vietnamZones}
            vietnamSeaLabels={filteredData.vietnamSeaLabels}
            cameraTarget={cameraTarget}
            onSelectFeature={setSelectedFeature}
          />

          {/* Floating Left Layer Control Dock */}
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2.5">
            <LayerControlDock
              activeLayers={activeLayers}
              layerCounts={layerCounts}
              onToggleLayer={toggleLayer}
              onSetAllLayers={setAllLayers}
              radarOpacity={radarOpacity}
              onChangeRadarOpacity={setRadarOpacity}
              weatherRadar={data?.weatherRadar ?? null}
              aisStreamConfigured={data?.aisStreamConfigured}
            />
          </div>

          {/* Floating Top-Right Breaking Alert Stack */}
          <div className="pointer-events-none absolute right-3 top-14 z-20 lg:top-3">
            <LiveAlertStack
              alerts={breakingAlerts}
              onDismiss={dismissAlert}
              onMuteAll={() => {
                setAlertsMuted(true);
              }}
              onFlyTo={flyTo}
            />
          </div>

          {/* Floating Bottom-Left Feature Inspector */}
          {selectedFeature && (
            <div className="pointer-events-none absolute bottom-4 left-3 z-20">
              <FeatureInspector
                selected={selectedFeature}
                onClose={() => setSelectedFeature(null)}
                onFlyTo={flyTo}
              />
            </div>
          )}

          {/* Floating Bottom-Right Live News TV PiP */}
          <div className="pointer-events-none absolute bottom-10 right-12 z-20">
            <LiveTvPipWindow open={liveTvOpen} onClose={() => setLiveTvOpen(false)} />
          </div>

          {/* Initial Boot Loading Skeleton Badge */}
          {loading && !data && (
            <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center">
              <div className="flex items-center gap-2 rounded-md border border-cyan-500/40 bg-[#090f1a]/95 px-4 py-2 font-mono text-xs text-cyan-200 shadow-2xl">
                <ArrowsClockwise size={15} className="animate-spin text-cyan-400" />
                Đang đồng bộ luồng dữ liệu Realtime từ các trạm Upstream toàn cầu...
              </div>
            </div>
          )}

          {/* Mobile/Tablet Right Panel Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileIntelOpen((v) => !v)}
            className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-[#090f1a]/95 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 shadow-lg lg:hidden"
          >
            <SidebarSimple size={15} />
            <span>{mobileIntelOpen ? 'Đóng Intel' : 'Bảng Intel'}</span>
          </button>
        </main>

        {/* Desktop Right Intelligence Column */}
        <div className="hidden h-full shrink-0 lg:block">
          <RightIntelPanel
            markets={
              data?.markets ?? {
                quotes: [],
                crypto: [],
                fearGreed: null,
                macro: [],
                updatedAt: 0,
              }
            }
            predictions={filteredData.predictions}
            googleTrends={data?.googleTrends}
            news={filteredData.news}
            techCyber={data?.techCyber}
            policyLegal={data?.policyLegal}
            military={filteredData.military}
            vessels={filteredData.vessels}
            earthquakes={filteredData.earthquakes}
            geopolitics={filteredData.geopolitics}
            cyberThreats={filteredData.cyberThreats}
            newsStreamStats={data?.newsStreamStats}
            freshNewsIds={freshNewsIds}
            priceFlashes={priceFlashes}
            predictionFlashes={predictionFlashes}
            refreshingIds={refreshingIds}
            onForceRefresh={forceRefresh}
            streamConnected={streamConnected}
            onFlyToLocation={(lat, lon, zoom) => {
              flyTo(lat, lon, zoom ?? 5.5);
            }}
          />
        </div>

        {/* Mobile Slide-Over Right Intelligence Drawer */}
        {mobileIntelOpen && (
          <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[400px] shadow-2xl lg:hidden">
            <RightIntelPanel
              markets={
                data?.markets ?? {
                  quotes: [],
                  crypto: [],
                  fearGreed: null,
                  macro: [],
                  updatedAt: 0,
                }
              }
              predictions={filteredData.predictions}
              googleTrends={data?.googleTrends}
              news={filteredData.news}
              techCyber={data?.techCyber}
              policyLegal={data?.policyLegal}
              military={filteredData.military}
              vessels={filteredData.vessels}
              earthquakes={filteredData.earthquakes}
              geopolitics={filteredData.geopolitics}
              cyberThreats={filteredData.cyberThreats}
              newsStreamStats={data?.newsStreamStats}
              freshNewsIds={freshNewsIds}
              priceFlashes={priceFlashes}
              predictionFlashes={predictionFlashes}
              refreshingIds={refreshingIds}
              onForceRefresh={forceRefresh}
              streamConnected={streamConnected}
              onFlyToLocation={(lat, lon, zoom) => {
                setMobileIntelOpen(false);
                flyTo(lat, lon, zoom ?? 5.5);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
