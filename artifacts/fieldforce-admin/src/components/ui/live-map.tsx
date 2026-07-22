import { useEffect, useRef, useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView } from '@react-google-maps/api';
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

function getCategoryColor(pos: UnifiedPosition): string {
  if (pos.sourceType === 'MOBILE_APP') return pos.emergencyActive ? '#dc2626' : '#7c3aed';
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

// ─── Main marker dispatcher ───────────────────────────────────────────────────
function MarkerPin({ pos, selected = false }: { pos: UnifiedPosition; selected?: boolean }) {
  const color = selected ? '#581c87' : getCategoryColor(pos);
  const ageMs = Date.now() - new Date(pos.recordedAt).getTime();
  const stale = ageMs > 10 * 60 * 1000;
  const categoryKey = pos.deviceCategoryKey ?? (pos.sourceType === 'MOBILE_APP' ? 'MOBILE_APP' : 'VEHICLE_TRACKER');

  switch (categoryKey) {
    case 'MOBILE_APP':
      return (
        <MobilePin
          color={color}
          initials={(pos.firstName?.[0] ?? '') + (pos.lastName?.[0] ?? '?')}
          emergency={pos.emergencyActive}
          stale={false}
        />
      );
    case 'VEHICLE_TRACKER':
      return <VehiclePin color={color} courseDeg={pos.courseDeg} ignition={pos.ignition} alarm={pos.alarm} stale={stale} />;
    case 'PERSONAL_TRACKER':
      return <PersonPin color={color} stale={stale} />;
    case 'ASSET_TAG':
      return <AssetPin color={color} stale={stale} />;
    default:
      return <VehiclePin color={color} courseDeg={pos.courseDeg} ignition={pos.ignition} alarm={pos.alarm} stale={stale} />;
  }
}

// ─── Tooltip on hover ─────────────────────────────────────────────────────────
function MarkerWithTooltip({ pos, onClick, selected = false }: { pos: UnifiedPosition; onClick: () => void; selected?: boolean }) {
  const [hover, setHover] = useState(false);
  const ageMs = Date.now() - new Date(pos.recordedAt).getTime();
  const fixAgo = ageMs < 60_000 ? `${Math.round(ageMs / 1000)}s ago`
    : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m ago`
    : `${Math.round(ageMs / 3_600_000)}h ago`;

  const label = pos.sourceType === 'MOBILE_APP'
    ? `${pos.firstName} ${pos.lastName} (${pos.employeeCode})`
    : (pos.deviceName ?? pos.imei ?? `Device #${pos.deviceId}`);

  const source = pos.sourceType === 'MOBILE_APP' ? 'Mobile App' : `GPS Device — ${pos.vendorKey}`;

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
      <MarkerPin pos={pos} selected={selected} />
      {(hover || selected) && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-popover border rounded-md px-2.5 py-2 text-xs shadow-xl whitespace-nowrap pointer-events-none min-w-40">
          <div className="font-semibold">{label}</div>
          {pos.alarm && <div className="text-red-500 font-medium">⚠ {pos.alarm}</div>}
          {pos.sourceType === 'GPS_DEVICE' && pos.ignition != null && (
            <div>Ignition: <span className={pos.ignition ? 'text-green-600' : 'text-gray-500'}>{pos.ignition ? 'ON' : 'OFF'}</span></div>
          )}
          {pos.speedKph != null && <div>Speed: {Math.round(pos.speedKph)} km/h</div>}
          <div className="text-muted-foreground mt-0.5">Source: {source}</div>
          <div className="text-muted-foreground">Last fix: {fixAgo}</div>
        </div>
      )}
    </div>
  );
}

// ─── Map legend ───────────────────────────────────────────────────────────────
function Legend({ categories }: { categories: { key: string; label: string; color: string }[] }) {
  return (
    <div className="absolute bottom-6 left-3 bg-white/95 backdrop-blur-sm border rounded-lg shadow-md px-3 py-2.5 z-10">
      <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Legend</div>
      {categories.map(c => (
        <div key={c.key} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
          <span className="w-3 h-3 rounded-sm border border-white shadow-sm" style={{ backgroundColor: c.color }} />
          {c.label}
          <span className="text-muted-foreground">
            {c.key === 'MOBILE_APP' ? '● circle' : c.key === 'VEHICLE_TRACKER' ? '▲ arrow' : c.key === 'PERSONAL_TRACKER' ? '◎ person' : '■ square'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Category filter tabs ─────────────────────────────────────────────────────
export type CategoryFilter = 'ALL' | string;

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
      : positions.filter(p => (p.deviceCategoryKey ?? (p.sourceType === 'MOBILE_APP' ? 'MOBILE_APP' : 'VEHICLE_TRACKER')) === key).length;

  const tabs: { key: CategoryFilter; label: string; color: string }[] = [
    { key: 'ALL', label: 'All Sources', color: '#6b7280' },
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
  selectedPositionId?: string | null;
  activeCategory?: CategoryFilter;
  categories?: { key: string; label: string; colorHex: string }[];
}

export function LiveMap({ positions, onPositionClick, selectedPositionId = null, activeCategory = 'ALL', categories = [] }: LiveMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey ?? '', id: 'fieldforce-google-map' });
  const mapRef = useRef<google.maps.Map | null>(null);
  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  const filtered = positions.filter(p => {
    if (activeCategory === 'ALL') return true;
    const key = p.deviceCategoryKey ?? (p.sourceType === 'MOBILE_APP' ? 'MOBILE_APP' : 'VEHICLE_TRACKER');
    return key === activeCategory;
  });

  // Auto-fit on first load, preserve zoom/center on tab switch
  useEffect(() => {
    if (!mapRef.current || !isLoaded || activeCategory !== 'ALL') return;
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
    { key: 'MOBILE_APP', label: 'Mobile App', color: '#7c3aed' },
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
        options={{
          mapTypeControl: false, streetViewControl: false, fullscreenControl: true, zoomControl: true,
          styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }],
        }}
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
              <MarkerWithTooltip pos={pos} selected={selectedPositionId === markerId} onClick={() => onPositionClick?.(pos)} />
            </OverlayView>
            );
          })}
      </GoogleMap>
      <Legend categories={legendCategories} />
    </div>
  );
}
