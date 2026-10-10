'use client';

import clsx from 'clsx';
import { Download, Trash2 } from 'lucide-react';
import type { Feature, FeatureCollection } from 'geojson';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMapStyle } from '@/lib/map/style';
import { areTilesAvailable, getOfflineMapState, removeOfflineMap, saveMapOffline, TripTileSource, type OfflineMapState } from '@/lib/map/tile-source';
import { SchematicTripMap, type MapLeg, type MapStop } from './trip-map-schematic';
import { Button, Notice, ProgressBar, Skeleton } from './ui';

interface TripMapProps {
  stops: MapStop[];
  routes: MapLeg[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  /** Follower view: markers are plain labels (no links into the app) and the offline-download control is hidden. */
  readOnly?: boolean;
}

const ROUTE_SOURCE = 'trip-routes';
const MARKER_DEEP = '#0f3d4e';
const MARKER_ACTIVE = '#a8472b';
const MAX_FIT_ZOOM = 8;
const TILES_SIZE_HINT = 'ca. 60 MB';

let isProtocolRegistered = false;

function hasLocation(stop: MapStop): stop is MapStop & { latitude: number; longitude: number } {
  return stop.latitude !== null && stop.longitude !== null;
}

function markerElement(stop: MapStop, onSelect: ((id: string) => void) | undefined, readOnly: boolean): HTMLElement {
  const link = document.createElement(readOnly ? 'span' : 'a');
  if (link instanceof HTMLAnchorElement) link.href = `/route/${stop.id}`;
  else link.setAttribute('role', 'img');
  link.setAttribute('aria-label', `Station ${stop.sequence}: ${stop.title}`);
  link.title = stop.title.split(' / ')[0] ?? stop.title;
  link.textContent = String(stop.sequence);
  Object.assign(link.style, {
    display: 'flex',
    width: '32px',
    height: '32px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9999px',
    border: '3px solid #fff',
    boxShadow: '0 1px 4px rgba(0,0,0,.35)',
    background: MARKER_DEEP,
    color: '#fff',
    fontSize: '13px',
    fontWeight: '700',
    textDecoration: 'none',
  });
  link.addEventListener('click', (event) => {
    if (readOnly || !onSelect) return;
    event.preventDefault();
    onSelect(stop.id);
  });
  return link;
}

function routeFeatures(stops: MapStop[], routes: MapLeg[]): FeatureCollection {
  const byId = new Map(stops.filter(hasLocation).map((stop) => [stop.id, stop]));
  const features: Feature[] = [];
  for (const route of routes) {
    const from = byId.get(route.from_stop_id);
    const to = byId.get(route.to_stop_id);
    if (!from || !to) continue;
    features.push({
      type: 'Feature',
      properties: { id: route.id },
      geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function paintMarkers(markers: Map<string, { element: HTMLElement }>, selectedId: string | null | undefined): void {
  for (const [id, { element }] of markers) {
    const isActive = id === selectedId;
    element.style.background = isActive ? MARKER_ACTIVE : MARKER_DEEP;
    element.style.zIndex = isActive ? '2' : '1';
    element.style.transform = isActive ? 'scale(1.15)' : '';
  }
}

function TileMap({ stops, routes, selectedId, onSelect, readOnly = false, onFail }: TripMapProps & { onFail: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, { marker: Marker; element: HTMLElement }>>(new Map());
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedIdRef.current = selectedId;
  }, [onSelect, selectedId]);

  useEffect(() => {
    let isCancelled = false;
    const markers = markersRef.current;
    async function init() {
      const [maplibregl, { Protocol, PMTiles }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
      if (isCancelled || !containerRef.current) return;
      if (!isProtocolRegistered) {
        maplibregl.setWorkerUrl('/map/worker/maplibre-gl-worker.mjs');
        const protocol = new Protocol();
        protocol.add(new PMTiles(new TripTileSource()));
        maplibregl.addProtocol('pmtiles', protocol.tile);
        isProtocolRegistered = true;
      }
      let map: MapLibreMap;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(),
          center: [18, -22],
          zoom: 4,
          minZoom: 3,
          maxZoom: 14,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        onFail(); // typically: WebGL unavailable
        return;
      }
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('load', () => {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'trip-routes-line',
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c65a3a', 'line-width': 3, 'line-dasharray': [2, 1.5] },
        });
        setIsLoaded(true);
      });
      mapRef.current = map;
    }
    void init();
    return () => {
      isCancelled = true;
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setIsLoaded(false);
    };
  }, [onFail]);

  // Stops and routes: rebuild markers and the route line, then fit the view.
  const stopKey = stops.map((s) => `${s.id}:${s.sequence}:${s.latitude}:${s.longitude}`).join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    let isCancelled = false;
    (map.getSource(ROUTE_SOURCE) as { setData(data: FeatureCollection): void } | undefined)?.setData(routeFeatures(stops, routes));
    import('maplibre-gl').then((maplibregl) => {
      if (isCancelled) return;
      for (const { marker } of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      const located = stops.filter(hasLocation);
      for (const stop of located) {
        const element = markerElement(stop, (id) => onSelectRef.current?.(id), readOnly);
        const marker = new maplibregl.Marker({ element }).setLngLat([stop.longitude, stop.latitude]).addTo(map);
        markersRef.current.set(stop.id, { marker, element });
      }
      paintMarkers(markersRef.current, selectedIdRef.current); // markers are created asynchronously, after the selection effect ran
      if (located.length === 1 && located[0]) {
        map.jumpTo({ center: [located[0].longitude, located[0].latitude], zoom: MAX_FIT_ZOOM });
      } else if (located.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const stop of located) bounds.extend([stop.longitude, stop.latitude]);
        map.fitBounds(bounds, { padding: 56, maxZoom: MAX_FIT_ZOOM, animate: false });
      }
    });
    return () => {
      isCancelled = true;
    };
    // stopKey captures every field that changes the markers; routes only affect the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, stopKey, routes, readOnly]);

  useEffect(() => {
    paintMarkers(markersRef.current, selectedId);
  }, [selectedId, isLoaded, stopKey]);

  return <div ref={containerRef} role="group" aria-label="Routenkarte mit Stationen" className="h-[26rem] w-full bg-sand-50" />;
}

function OfflineMapControl() {
  const [state, setState] = useState<OfflineMapState | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOfflineMapState().then(setState);
  }, []);

  const save = useCallback(async () => {
    setError(null);
    setProgress(0);
    try {
      await saveMapOffline((loaded, total) => setProgress(total ? (loaded / total) * 100 : null));
      setState('saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Karte konnte nicht gespeichert werden.');
    } finally {
      setProgress(null);
    }
  }, []);

  const remove = useCallback(async () => {
    await removeOfflineMap();
    setState('not_saved');
  }, []);

  if (state === null || state === 'unsupported') return null;
  const isSaving = progress !== null;
  return (
    <div className="border-t border-line bg-white px-3 py-2 text-sm">
      {state === 'saved' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Karte ist auf diesem Gerät gespeichert und funktioniert ohne Netz.</span>
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 size={16} aria-hidden /> Entfernen
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Für unterwegs ohne Netz: Karte von Namibia und Botswana speichern ({TILES_SIZE_HINT}, am besten im WLAN).</span>
            <Button size="sm" variant="secondary" onClick={save} disabled={isSaving}>
              <Download size={16} aria-hidden /> {isSaving ? 'Wird gespeichert …' : 'Offline speichern'}
            </Button>
          </div>
          {isSaving && progress !== null && <ProgressBar value={progress} label="Kartendownload" />}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </div>
  );
}

/**
 * Route map: MapLibre with self-hosted OpenStreetMap tiles (Protomaps/PMTiles), usable offline once saved on the device.
 * Falls back to the schematic SVG map when tiles or WebGL are unavailable (e.g. tiles not installed, first start offline).
 */
export function TripMap(props: TripMapProps) {
  const [mode, setMode] = useState<'checking' | 'tiles' | 'fallback'>('checking');
  const fallBack = useCallback(() => setMode('fallback'), []);

  useEffect(() => {
    let isCancelled = false;
    void areTilesAvailable().then((isAvailable) => {
      if (!isCancelled) setMode(isAvailable ? 'tiles' : 'fallback');
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  if (mode === 'fallback') return <SchematicTripMap {...props} />;
  if (mode === 'checking') return <Skeleton className={clsx('h-[26rem] w-full rounded-lg', props.className)} />;
  return (
    <div className={clsx('overflow-hidden rounded-lg border border-line', props.className)}>
      <TileMap {...props} onFail={fallBack} />
      {!props.readOnly && <OfflineMapControl />}
      <p className="border-t border-line bg-white px-3 py-2 text-xs text-slate">Kartenübersicht, keine Navigation. Pisten und Wasserlöcher sind in den Kartendaten teils unvollständig.</p>
    </div>
  );
}
