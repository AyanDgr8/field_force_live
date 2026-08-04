import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { GoogleMap, OverlayView } from '@react-google-maps/api';
import { Bike } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, useGoogleMaps } from '@/lib/google-maps';
import { MapTypeToggle, type MapView } from '@/components/ui/map-type-toggle';
import { cn } from '@/lib/utils';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 };

// ─── Unified position — covers both MOBILE_APP and GPS_DEVICE ─────────────────
export interface UnifiedPosition {
  // Discriminator
  sourceType: 'MOBILE_APP' | 'GPS_DEVICE';
  latitude: number;
  longitude: number;
  speedKph?: number | null;
  recordedAt: string;

  // Mobile
  userId?: number;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  liveStatus?: string;
  emergencyActive?: boolean;

  // GPS Device
  deviceId?: number;
  deviceName?: string;
  vendorKey?: string;
  /** Vendor-reported hardware type — BOLT `type`: "bike" | "car" | "personal" | … */
  vendorType?: string | null;
  deviceCategoryId?: number;
  deviceCategoryKey?: string;
  deviceCategoryColor?: string;
  deviceCategoryIconKey?: string;
  imei?: string;
  ignition?: boolean | null;
  alarm?: string | null;
  courseDeg?: number | null;
  assignedUserId?: number | null;
  assignedUserName?: string | null;
}

// ─── Category definitions (colors + shape names) ──────────────────────────────
const CATEGORY_DEFAULTS: Record<string, { color: string; label: string }> = {
  MOBILE_APP:        { color: '#7c3aed', label: 'Mobile App' },
  VEHICLE_TRACKER:   { color: '#f97316', label: 'Vehicle Tracker' },
  PERSONAL_TRACKER:  { color: '#a855f7', label: 'Personal Tracker' },
  ASSET_TAG:         { color: '#14b8a6', label: 'Asset Tag' },
};

const MOBILE_STATUS_COLORS = {
  DEFAULT: '#7c3aed',
  IDLE: '#2563eb',
  BUSY: '#f59e0b',
  OFFLINE: '#000000',
  EMERGENCY: '#dc2626',
} as const;

function getCategoryColor(pos: UnifiedPosition): string {
  if (pos.sourceType === 'MOBILE_APP') {
    if (pos.emergencyActive) return MOBILE_STATUS_COLORS.EMERGENCY;
    if (pos.liveStatus === 'ON_SHIFT_IDLE') return MOBILE_STATUS_COLORS.IDLE;
    if (pos.liveStatus === 'BUSY') return MOBILE_STATUS_COLORS.BUSY;
    if (pos.liveStatus === 'OFFLINE') return MOBILE_STATUS_COLORS.OFFLINE;
    return MOBILE_STATUS_COLORS.DEFAULT;
  }
  return pos.deviceCategoryColor ?? CATEGORY_DEFAULTS[pos.deviceCategoryKey ?? 'VEHICLE_TRACKER']?.color ?? '#f97316';
}

// ─── SVG Marker shapes per category ──────────────────────────────────────────

function MobilePin({ color, initials, emergency, stale }: { color: string; initials: string; emergency?: boolean; stale?: boolean }) {
  const fill = stale ? '#94a3b8' : color;
  return (
    <div className="relative flex flex-col items-center" style={{ transform: 'translate(-50%, -100%)' }}>
      {emergency && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: fill, opacity: 0.4 }} />}
      <div className="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold"
        style={{ backgroundColor: fill }}>
        {initials}
      </div>
      <div className="w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${fill}` }} />
    </div>
  );
}

function VehiclePin({ color, courseDeg, ignition, alarm, stale }: { color: string; courseDeg?: number | null; ignition?: boolean | null; alarm?: string | null; stale?: boolean }) {
  const fill = stale ? '#94a3b8' : color;
  const rotation = courseDeg ?? 0;
  return (
    <div className="relative" style={{ transform: 'translate(-50%, -50%)' }}>
      {alarm && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white z-10" />}
      <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: `rotate(${rotation}deg)`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
        {/* Car silhouette arrow-pin shape */}
        <polygon points="14,2 24,22 14,18 4,22" fill={fill} stroke="white" strokeWidth="2" />
        {/* Ignition indicator: hollow vs solid */}
        <circle cx="14" cy="13" r="3" fill={ignition ? 'white' : 'none'} stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/**
 * Two-wheeler marker. The bike glyph stays upright so it stays readable at any
 * heading; the arrow orbiting the badge carries the direction of travel instead.
 * Ignition OFF renders hollow (spec: solid when on, outline when off).
 */
function BikePin({ color, courseDeg, ignition, alarm, stale }: { color: string; courseDeg?: number | null; ignition?: boolean | null; alarm?: string | null; stale?: boolean }) {
  const fill = stale ? '#94a3b8' : color;
  const off = ignition === false;
  return (
    <div className="relative w-8 h-8" style={{ transform: 'translate(-50%, -50%)' }}>
      {courseDeg != null && (
        <div className="absolute inset-0 flex justify-center" style={{ transform: `rotate(${courseDeg}deg)` }}>
          <svg width="10" height="8" viewBox="0 0 10 8" style={{ marginTop: -10 }}>
            <polygon points="5,0 10,8 0,8" fill={fill} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div
        className="w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-lg"
        style={{ backgroundColor: off ? 'white' : fill, borderColor: off ? fill : 'white' }}
      >
        <Bike className="w-[18px] h-[18px]" strokeWidth={2.25} style={{ color: off ? fill : 'white' }} />
      </div>
      {alarm && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border border-white z-10" />}
    </div>
  );
}

function PersonPin({ color, stale }: { color: string; stale?: boolean }) {
  const fill = stale ? '#94a3b8' : color;
  return (
    <div style={{ transform: 'translate(-50%, -100%)' }}>
      <svg width="24" height="32" viewBox="0 0 24 32" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
        <ellipse cx="12" cy="7" rx="5" ry="5" fill={fill} stroke="white" strokeWidth="1.5" />
        <path d="M4 28 Q4 18 12 18 Q20 18 20 28" fill={fill} stroke="white" strokeWidth="1.5" />
        <polygon points="12,28 8,24 16,24" fill={fill} />
      </svg>
    </div>
  );
}

function AssetPin({ color, stale }: { color: string; stale?: boolean }) {
  const fill = stale ? '#94a3b8' : color;
  return (
    <div style={{ transform: 'translate(-50%, -100%)' }}>
      <svg width="24" height="30" viewBox="0 0 24 30" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
        <rect x="2" y="2" width="20" height="18" rx="3" fill={fill} stroke="white" strokeWidth="2" />
        <line x1="2" y1="11" x2="22" y2="11" stroke="white" strokeWidth="1.2" />
        <line x1="12" y1="2" x2="12" y2="20" stroke="white" strokeWidth="1.2" />
        <polygon points="12,28 8,20 16,20" fill={fill} />
      </svg>
    </div>
  );
}

// ─── Device shape resolution ──────────────────────────────────────────────────

type DeviceShape = 'bike' | 'car' | 'person' | 'asset';

/**
 * Vendor `type` values that mean four wheels. Anything else on a vehicle
 * tracker renders as a bike — the field fleet is two-wheeler-first.
 * Empty this list to force every tracker to the bike pin.
 */
const FOUR_WHEELER_TYPES = ['car', 'truck', 'van', 'bus', 'lorry', 'taxi', 'jeep', 'tempo'];

function resolveDeviceShape(pos: UnifiedPosition): DeviceShape {
  switch (pos.deviceCategoryKey) {
    case 'PERSONAL_TRACKER': return 'person';
    case 'ASSET_TAG': return 'asset';
  }
  const type = (pos.vendorType ?? '').toLowerCase();
  if (FOUR_WHEELER_TYPES.some(t => type.includes(t))) return 'car';
  return 'bike';
}

// ─── Main marker dispatcher ───────────────────────────────────────────────────
function MarkerPin({ pos }: { pos: UnifiedPosition }) {
  // Selection is rendered as a ring around the marker, so retain the status
  // color instead of hiding it when an agent is selected.
  const color = getCategoryColor(pos);
  const ageMs = Date.now() - new Date(pos.recordedAt).getTime();
  const stale = ageMs > 10 * 60 * 1000;

  if (pos.sourceType === 'MOBILE_APP') {
    return (
      <MobilePin
        color={color}
        initials={(pos.firstName?.[0] ?? '') + (pos.lastName?.[0] ?? '?')}
        emergency={pos.emergencyActive}
        stale={false}
      />
    );
  }

  switch (resolveDeviceShape(pos)) {
    case 'person':
      return <PersonPin color={color} stale={stale} />;
    case 'asset':
      return <AssetPin color={color} stale={stale} />;
    case 'car':
      return <VehiclePin color={color} courseDeg={pos.courseDeg} ignition={pos.ignition} alarm={pos.alarm} stale={stale} />;
    default:
      return <BikePin color={color} courseDeg={pos.courseDeg} ignition={pos.ignition} alarm={pos.alarm} stale={stale} />;
  }
}

// ─── Tooltip on hover ─────────────────────────────────────────────────────────
function MarkerWithTooltip({ pos, onClick, selected = false }: { pos: UnifiedPosition; onClick: (e: React.MouseEvent) => void; selected?: boolean }) {
  const [hover, setHover] = useState(false);
  const ageMs = Date.now() - new Date(pos.recordedAt).getTime();
  const fixAgo = ageMs < 60_000 ? `${Math.round(ageMs / 1000)}s ago`
    : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m ago`
    : `${Math.round(ageMs / 3_600_000)}h ago`;

  const label = pos.sourceType === 'MOBILE_APP'
    ? `${pos.firstName} ${pos.lastName} (${pos.employeeCode})`
    : (pos.deviceName ?? pos.imei ?? `Device #${pos.deviceId}`);

  const source = pos.sourceType === 'MOBILE_APP'
    ? 'Mobile App'
    : `GPS Device — ${pos.vendorKey}${pos.vendorType ? ` · ${pos.vendorType}` : ''}`;
  const agentStatus = pos.emergencyActive
    ? 'Emergency'
    : pos.liveStatus === 'ON_SHIFT_IDLE'
      ? 'Idle'
      : pos.liveStatus === 'BUSY'
        ? 'Busy'
        : pos.liveStatus === 'OFFLINE'
          ? 'Offline'
          : pos.liveStatus;

  return (
    <div
      className={cn('relative cursor-pointer group transition-transform duration-300', selected && 'z-50 scale-125')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {selected && (
        <>
          <span className="absolute left-1/2 top-1/2 w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/40 animate-ping pointer-events-none" />
          <span className="absolute left-1/2 top-1/2 w-11 h-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-fuchsia-300 shadow-[0_0_22px_rgba(192,132,252,0.95)] pointer-events-none" />
        </>
      )}
      <MarkerPin pos={pos} />
      {(hover || selected) && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-popover border rounded-md px-2.5 py-2 text-xs shadow-xl whitespace-nowrap pointer-events-none min-w-40">
          <div className="font-semibold">{label}</div>
          {pos.alarm && <div className="text-red-500 font-medium">⚠ {pos.alarm}</div>}
          {pos.sourceType === 'GPS_DEVICE' && pos.ignition != null && (
            <div>Ignition: <span className={pos.ignition ? 'text-green-600' : 'text-gray-500'}>{pos.ignition ? 'ON' : 'OFF'}</span></div>
          )}
          {pos.speedKph != null && <div>Speed: {Math.round(pos.speedKph)} km/h</div>}
          {pos.sourceType === 'MOBILE_APP' && agentStatus && <div>Status: {agentStatus}</div>}
          <div className="text-muted-foreground mt-0.5">Source: {source}</div>
          <div className="text-muted-foreground">Last fix: {fixAgo}</div>
        </div>
      )}
    </div>
  );
}

// ─── Map legend ───────────────────────────────────────────────────────────────
const LEGEND_GLYPHS: Record<string, string> = {
  VEHICLE_TRACKER: '🏍 bike',
  PERSONAL_TRACKER: '◎ person',
  ASSET_TAG: '■ square',
};

function Legend({ categories }: { categories: { key: string; label: string; color: string }[] }) {
  return (
    <div className="absolute bottom-6 left-3 bg-white/95 backdrop-blur-sm border rounded-lg shadow-md px-3 py-2.5 z-10">
      <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Legend</div>
      {categories.map(c => (
        <div key={c.key} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
          <span className="w-3 h-3 rounded-sm border border-white shadow-sm" style={{ backgroundColor: c.color }} />
          {c.label}
          <span className="text-muted-foreground">
            {c.key.startsWith('MOBILE_') ? '● circle' : LEGEND_GLYPHS[c.key] ?? '🏍 bike'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Category filter tabs ─────────────────────────────────────────────────────
export type CategoryFilter = 'ALL' | 'VEHICLES' | string;

export function CategoryTabs({
  categories,
  positions,
  active,
  onChange,
}: {
  categories: { key: string; label: string; colorHex: string }[];
  positions: UnifiedPosition[];
  active: CategoryFilter;
  onChange: (key: CategoryFilter) => void;
}) {
  const count = (key: string) =>
    key === 'ALL'
      ? positions.length
      : key === 'VEHICLES'
        ? positions.filter(p => p.sourceType === 'GPS_DEVICE').length
      : positions.filter(p => (p.deviceCategoryKey ?? (p.sourceType === 'MOBILE_APP' ? 'MOBILE_APP' : 'VEHICLE_TRACKER')) === key).length;

  const tabs: { key: CategoryFilter; label: string; color: string }[] = [
    { key: 'ALL', label: 'All Sources', color: '#6b7280' },
    { key: 'VEHICLES', label: 'Vehicles', color: '#f97316' },
    ...categories.map(c => ({ key: c.key, label: c.label, color: c.colorHex })),
  ];

  return (
    <div className="flex items-center gap-1 px-1">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
            active === t.key
              ? 'text-white border-transparent shadow-sm'
              : 'bg-transparent border-border text-muted-foreground hover:border-border/80',
          )}
          style={active === t.key ? { backgroundColor: t.color, borderColor: t.color } : {}}
        >
          {t.key !== 'ALL' && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active === t.key ? 'white' : t.color }} />}
          {t.label}
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-mono',
            active === t.key ? 'bg-white/25' : 'bg-muted text-muted-foreground')}>
            {count(t.key)}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main LiveMap component ───────────────────────────────────────────────────
interface LiveMapProps {
  positions: UnifiedPosition[];
  onPositionClick?: (pos: UnifiedPosition) => void;
  /** Fired when the map itself is clicked — used to clear the selection. */
  onMapClick?: () => void;
  selectedPositionId?: string | null;
  activeCategory?: CategoryFilter;
  categories?: { key: string; label: string; colorHex: string }[];
}

export function LiveMap({ positions, onPositionClick, onMapClick, selectedPositionId = null, activeCategory = 'ALL', categories = [] }: LiveMapProps) {
  const apiKey = GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);
  const [mapView, setMapView] = useState<MapView>('roadmap');

  // Memoised so the position poll does not re-apply the options every refresh.
  // The POI/transit styling only takes effect on the roadmap view.
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    mapTypeId: mapView,
    mapTypeControl: false, // replaced by the in-app Map/Satellite toggle
    streetViewControl: false, fullscreenControl: true, zoomControl: true,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }],
  }), [mapView]);

  const filtered = positions.filter(p => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'VEHICLES') return p.sourceType === 'GPS_DEVICE';
    const key = p.deviceCategoryKey ?? (p.sourceType === 'MOBILE_APP' ? 'MOBILE_APP' : 'VEHICLE_TRACKER');
    return key === activeCategory;
  });

  // Fit the currently selected source, including the default Vehicles view.
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const valid = filtered.filter(p => p.latitude != null && p.longitude != null);
    if (valid.length === 0) return;
    if (valid.length === 1) { mapRef.current.panTo({ lat: valid[0].latitude, lng: valid[0].longitude }); mapRef.current.setZoom(14); return; }
    const bounds = new window.google.maps.LatLngBounds();
    valid.forEach(p => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    mapRef.current.fitBounds(bounds, 80);
  }, [isLoaded]); // only on load

  // A list/marker selection always takes visual focus on the map.
  useEffect(() => {
    if (!mapRef.current || !isLoaded || !selectedPositionId) return;
    const selected = positions.find(pos =>
      pos.sourceType === 'MOBILE_APP'
        ? selectedPositionId === `u-${pos.userId}`
        : selectedPositionId === `d-${pos.deviceId}`,
    );
    if (!selected || selected.latitude == null || selected.longitude == null) return;
    mapRef.current.panTo({ lat: selected.latitude, lng: selected.longitude });
    mapRef.current.setZoom(17);
  }, [isLoaded, positions, selectedPositionId]);

  const legendCategories = [
    { key: 'MOBILE_IDLE', label: 'Agent — Idle', color: MOBILE_STATUS_COLORS.IDLE },
    { key: 'MOBILE_BUSY', label: 'Agent — Busy', color: MOBILE_STATUS_COLORS.BUSY },
    { key: 'MOBILE_OFFLINE', label: 'Agent — Offline', color: MOBILE_STATUS_COLORS.OFFLINE },
    { key: 'MOBILE_EMERGENCY', label: 'Agent — Emergency', color: MOBILE_STATUS_COLORS.EMERGENCY },
    ...categories.filter(c => c.key !== 'MOBILE_APP').map(c => ({ key: c.key, label: c.label, color: c.colorHex })),
  ];

  if (!apiKey) return (
    <div className="w-full h-full bg-muted/30 border border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center">
      <div className="font-semibold mb-2">Live Map View</div>
      <p className="text-sm text-muted-foreground">Set VITE_GOOGLE_MAPS_API_KEY to enable the map.</p>
    </div>
  );

  if (loadError) return (
    <div className="w-full h-full flex items-center justify-center text-sm text-destructive">
      Failed to load Google Maps — check your API key.
    </div>
  );

  if (!isLoaded) return (
    <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">Loading map…</div>
  );

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={DEFAULT_CENTER}
        zoom={11}
        onLoad={onMapLoad}
        onClick={() => onMapClick?.()}
        options={mapOptions}
      >
        {filtered
          .filter(p => p.latitude != null && p.longitude != null)
          .map((pos, i) => {
            const markerId = pos.sourceType === 'MOBILE_APP' ? `u-${pos.userId}` : `d-${pos.deviceId}`;
            return (
            <OverlayView
              key={pos.sourceType === 'MOBILE_APP' ? `m-${pos.userId}` : `d-${pos.deviceId}-${i}`}
              position={{ lat: pos.latitude, lng: pos.longitude }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <MarkerWithTooltip
                pos={pos}
                selected={selectedPositionId === markerId}
                // Keep the click on the marker — otherwise it also reaches the
                // map and immediately clears the selection it just made.
                onClick={e => { e.stopPropagation(); onPositionClick?.(pos); }}
              />
            </OverlayView>
            );
          })}
      </GoogleMap>
      <MapTypeToggle value={mapView} onChange={setMapView} className="absolute top-3 left-3 z-10" />
      <Legend categories={legendCategories} />
    </div>
  );
}
