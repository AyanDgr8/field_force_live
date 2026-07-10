import { useEffect, useRef, useState } from 'react';
import { useGetLiveSummary, useGetLivePositions, getGetLiveSummaryQueryKey, getGetLivePositionsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Navigation, Radio, MapPinOff, ListFilter, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LiveStatusBadge } from '@/components/ui/live-status-badge';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type MapPosition = {
  userId: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
  latitude: number;
  longitude: number;
  status: string;
};

declare global {
  interface Window {
    google?: any;
    fieldForceGoogleMapsLoader?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.fieldForceGoogleMapsLoader) return window.fieldForceGoogleMapsLoader;

  window.fieldForceGoogleMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Google Maps'));
    document.head.appendChild(script);
  });

  return window.fieldForceGoogleMapsLoader;
}

function GoogleLiveMap({ positions }: { positions: MapPosition[] }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapElement = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapElement.current) return;

    let cancelled = false;
    let markers: any[] = [];

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapElement.current || !window.google) return;

        const center = positions[0]
          ? { lat: positions[0].latitude, lng: positions[0].longitude }
          : { lat: 28.6139, lng: 77.209 };
        const map = new window.google.maps.Map(mapElement.current, {
          center,
          zoom: positions.length ? 13 : 10,
          mapTypeControl: false,
          streetViewControl: false,
        });

        if (!positions.length) return;

        const bounds = new window.google.maps.LatLngBounds();
        markers = positions.map((position) => {
          const point = { lat: position.latitude, lng: position.longitude };
          bounds.extend(point);
          const marker = new window.google.maps.Marker({
            map,
            position: point,
            title: `${position.firstName} ${position.lastName} (${position.employeeCode})`,
          });
          const info = new window.google.maps.InfoWindow({
            content: `<strong>${position.firstName} ${position.lastName}</strong><br>${position.employeeCode}<br>${position.status}`,
          });
          marker.addListener('click', () => info.open({ map, anchor: marker }));
          return marker;
        });

        if (positions.length === 1) map.setCenter(center);
        else map.fitBounds(bounds, 60);
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [apiKey, positions]);

  if (!apiKey || loadError) {
    return <MapSetupMessage loadError={loadError} />;
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapElement} className="h-full w-full" />
      {!positions.length && (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-md bg-background/90 p-3 text-center text-sm shadow">
          Waiting for location data from field users.
        </div>
      )}
    </div>
  );
}

function OpenStreetMap({ positions }: { positions: MapPosition[] }) {
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const center: L.LatLngExpression = positions[0]
      ? [positions[0].latitude, positions[0].longitude]
      : [28.6139, 77.209];
    const map = L.map(mapElement.current).setView(center, positions.length ? 13 : 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const markers = positions.map((position) =>
      L.marker([position.latitude, position.longitude])
        .addTo(map)
        .bindPopup(
          `<strong>${position.firstName} ${position.lastName}</strong><br>${position.employeeCode}<br>${position.status}`,
        ),
    );

    if (markers.length > 1) {
      map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [60, 60] });
    }

    return () => {
      map.remove();
    };
  }, [positions]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapElement} className="h-full w-full" />
      {!positions.length && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-md bg-background/90 p-3 text-center text-sm shadow">
          Waiting for location data from field users.
        </div>
      )}
    </div>
  );
}

function LiveMap({ positions }: { positions: MapPosition[] }) {
  const provider = (import.meta.env.VITE_MAP_PROVIDER ?? 'leaflet').toLowerCase();

  if (provider === 'google') {
    return <GoogleLiveMap positions={positions} />;
  }

  return <OpenStreetMap positions={positions} />;
}

function MapSetupMessage({ loadError = false }: { loadError?: boolean }) {
  return (
    <div className="w-full h-full bg-muted/30 border border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Navigation className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Live Map View</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-4">
        {loadError
          ? 'Google Maps could not be loaded. Check the API key, billing, and allowed website origins.'
          : 'Provide a Google Maps API key in environment variables to enable the real-time map visualization.'}
      </p>
      <div className="px-4 py-2 bg-card border rounded-md text-xs font-mono text-muted-foreground">
        VITE_GOOGLE_MAPS_API_KEY=your_key_here
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary } = useGetLiveSummary({ query: { refetchInterval: 5000, queryKey: getGetLiveSummaryQueryKey() } });
  const { data: positions } = useGetLivePositions({ query: { refetchInterval: 5000, queryKey: getGetLivePositionsQueryKey() } });
  
  const [search, setSearch] = useState('');
  
  const filteredPositions = positions?.filter(p => 
    p.firstName.toLowerCase().includes(search.toLowerCase()) || 
    p.lastName.toLowerCase().includes(search.toLowerCase()) ||
    p.employeeCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-5 gap-4 shrink-0">
        <StatCard title="Active Agents" value={summary?.activeCount ?? 0} icon={<Navigation className="w-4 h-4 text-blue-500" />} />
        <StatCard title="Moving" value={summary?.movingCount ?? 0} icon={<Activity className="w-4 h-4 text-emerald-500" />} />
        <StatCard title="Stationary" value={summary?.stationaryCount ?? 0} icon={<Radio className="w-4 h-4 text-amber-500" />} />
        <StatCard title="Offline" value={summary?.offlineCount ?? 0} icon={<MapPinOff className="w-4 h-4 text-slate-400" />} />
        <StatCard 
          title="Active Alerts" 
          value={summary?.alertCount ?? 0} 
          icon={<AlertCircle className="w-4 h-4 text-destructive" />} 
          className={summary?.alertCount && summary.alertCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}
        />
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Map Area */}
        <div className="flex-1 relative rounded-lg overflow-hidden border bg-card">
          <LiveMap positions={positions ?? []} />
        </div>

        {/* Right: Agent List */}
        <div className="w-80 flex flex-col gap-4 shrink-0">
          <Card className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b flex-shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <ListFilter className="w-4 h-4" /> Live Fleet
                </h3>
                <Badge variant="secondary">{positions?.length || 0}</Badge>
              </div>
              <Input 
                placeholder="Search agent or code..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {filteredPositions?.map(pos => (
                  <div key={pos.userId} className={cn("flex flex-col p-3 rounded-md cursor-pointer transition-colors border", pos.emergencyActive ? "border-destructive/50 bg-destructive/5 animate-pulse" : "border-transparent hover:border-border hover:bg-muted/50")}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm truncate">{pos.firstName} {pos.lastName}</span>
                      <LiveStatusBadge pos={pos} />
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span className="font-mono">{pos.employeeCode}</span>
                      {pos.speedKph !== null && pos.speedKph > 0 && (
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" /> {Math.round(pos.speedKph)} km/h
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                
                {filteredPositions?.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No agents found matching search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, className }: { title: string; value: number; icon: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
        </div>
        <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
