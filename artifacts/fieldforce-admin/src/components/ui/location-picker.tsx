import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, GoogleMap, Marker } from '@react-google-maps/api';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapTypeToggle, type MapView } from '@/components/ui/map-type-toggle';
import { GOOGLE_MAPS_API_KEY, useGoogleMaps } from '@/lib/google-maps';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const DEFAULT_ZOOM = 11;
const PICKED_ZOOM = 16;

export interface PickedLocation {
  latitude: number | null;
  longitude: number | null;
  address: string;
  city?: string | null;
  state?: string | null;
}

interface PlaceMatch {
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
}

async function geoApi<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}

interface LocationPickerProps {
  value: PickedLocation;
  onChange: (next: PickedLocation) => void;
  /** Geofence radius in metres — drawn as a circle so the admin can see the coverage. */
  radiusM?: number;
  className?: string;
}

export function LocationPicker({ value, onChange, radiusM = 200, className }: LocationPickerProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapView, setMapView] = useState<MapView>('roadmap');
  // Guards against a slow reverse-geocode overwriting a newer pin position.
  const lookupSeq = useRef(0);

  const hasPosition = value.latitude != null && value.longitude != null;
  const position = hasPosition ? { lat: value.latitude!, lng: value.longitude! } : null;

  // The map view is uncontrolled: passing a fresh center/zoom on every render
  // would snap the map back while the admin is panning around.
  const initialView = useRef({
    center: position ?? DEFAULT_CENTER,
    zoom: position ? PICKED_ZOOM : DEFAULT_ZOOM,
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    mapTypeId: mapView,
    mapTypeControl: false, // replaced by the in-app Map/Satellite toggle
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    // POI clicks would swallow the map click that places the pin.
    clickableIcons: false,
  }), [mapView]);

  // Follow the pin only when it lands off-screen — e.g. coordinates typed into
  // the form by hand. Clicks and drags are already in view, so leave those be.
  useEffect(() => {
    const map = mapRef.current;
    if (!isLoaded || !map || value.latitude == null || value.longitude == null) return;
    const point = { lat: value.latitude, lng: value.longitude };
    const bounds = map.getBounds();
    if (bounds?.contains(point)) return;
    map.panTo(point);
  }, [isLoaded, value.latitude, value.longitude]);

  /** Drop the pin and look the address up from the coordinate. */
  const pickCoordinate = useCallback(
    (latitude: number, longitude: number) => {
      const firstPick = value.latitude == null || value.longitude == null;
      const picked: PickedLocation = { ...value, latitude, longitude };
      onChange(picked);
      setError(null);
      if (firstPick) {
        mapRef.current?.panTo({ lat: latitude, lng: longitude });
        mapRef.current?.setZoom(PICKED_ZOOM);
      }

      const seq = ++lookupSeq.current;
      setResolving(true);
      geoApi<{ address: string | null; city: string | null; state: string | null }>(
        `/api/geo/reverse?latitude=${latitude}&longitude=${longitude}`,
      )
        .then(body => {
          if (seq !== lookupSeq.current) return;
          onChange({
            ...picked,
            ...(body.address ? { address: body.address } : {}),
            city: body.city,
            state: body.state,
          });
        })
        .catch(() => {
          if (seq !== lookupSeq.current) return;
          setError('Could not look the address up — type it in manually.');
        })
        .finally(() => {
          if (seq === lookupSeq.current) setResolving(false);
        });
    },
    [onChange, value],
  );

  /** Jump to a search result: coordinates and address both come from the match. */
  const pickPlace = useCallback(
    (place: PlaceMatch) => {
      lookupSeq.current++;
      setResolving(false);
      onChange({
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.label,
        city: place.city,
        state: place.state,
      });
      setResults(null);
      setQuery(place.label);
      mapRef.current?.panTo({ lat: place.latitude, lng: place.longitude });
      mapRef.current?.setZoom(PICKED_ZOOM);
    },
    [onChange],
  );

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      const bounds = mapRef.current?.getBounds();
      if (bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        params.set('swLat', String(sw.lat()));
        params.set('swLng', String(sw.lng()));
        params.set('neLat', String(ne.lat()));
        params.set('neLng', String(ne.lng()));
      }
      const body = await geoApi<{ results: PlaceMatch[] }>(`/api/geo/search?${params}`);
      setResults(body.results);
      if (body.results.length === 0) setError('No place matched that search.');
    } catch (searchError) {
      setResults(null);
      setError(searchError instanceof Error ? searchError.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser cannot report your location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      fix => {
        pickCoordinate(fix.coords.latitude, fix.coords.longitude);
        mapRef.current?.panTo({ lat: fix.coords.latitude, lng: fix.coords.longitude });
        mapRef.current?.setZoom(PICKED_ZOOM);
      },
      () => setError('Location permission was denied.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [pickCoordinate]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                // The picker lives inside the hub form — Enter must search, not submit.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void runSearch();
                }
                if (event.key === 'Escape') setResults(null);
              }}
              placeholder="Search a place, landmark or address…"
              className="pl-9"
              aria-label="Search for the hub location"
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void runSearch()} disabled={searching}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </Button>
          <Button type="button" variant="outline" onClick={useCurrentLocation} title="Use my current location">
            <Crosshair className="w-4 h-4" />
          </Button>
        </div>

        {results && results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-lg">
            {results.map((place, index) => (
              <li key={`${place.latitude},${place.longitude},${index}`}>
                <button
                  type="button"
                  onClick={() => pickPlace(place)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex gap-2 items-start"
                >
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    {place.label}
                    <span className="block text-xs text-muted-foreground font-mono">
                      {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative h-80 rounded-lg overflow-hidden border">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center gap-1 p-6 text-center">
            <MapPin className="w-6 h-6 text-muted-foreground" />
            <div className="font-semibold text-sm">Map unavailable</div>
            <p className="text-xs text-muted-foreground">
              Set VITE_GOOGLE_MAPS_API_KEY to pick a point visually. Search above still works.
            </p>
          </div>
        ) : loadError ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-destructive">
            Failed to load Google Maps — check your API key.
          </div>
        ) : !isLoaded ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">
            Loading map…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={initialView.current.center}
            zoom={initialView.current.zoom}
            onLoad={onMapLoad}
            onClick={event => {
              if (event.latLng) pickCoordinate(event.latLng.lat(), event.latLng.lng());
            }}
            options={mapOptions}
          >
            {position && (
              <>
                <Circle
                  center={position}
                  radius={radiusM}
                  options={{
                    strokeColor: '#7c3aed',
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: '#7c3aed',
                    fillOpacity: 0.12,
                    clickable: false,
                  }}
                />
                <Marker
                  position={position}
                  draggable
                  onDragEnd={event => {
                    if (event.latLng) pickCoordinate(event.latLng.lat(), event.latLng.lng());
                  }}
                  title="Drag to fine-tune the hub location"
                />
              </>
            )}
          </GoogleMap>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <span className="rounded-md bg-background/95 backdrop-blur-sm border px-2.5 py-1.5 text-xs font-mono shadow-sm">
            {hasPosition
              ? `${value.latitude!.toFixed(6)}, ${value.longitude!.toFixed(6)}`
              : 'Click the map to place the hub'}
          </span>
          {hasPosition && (
            <span className="rounded-md bg-background/95 backdrop-blur-sm border px-2.5 py-1.5 text-xs shadow-sm">
              {radiusM} m geofence
            </span>
          )}
        </div>
      </div>

      {resolving && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Looking up the address…
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
