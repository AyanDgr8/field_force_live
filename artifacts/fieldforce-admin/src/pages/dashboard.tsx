import { useState } from 'react';
import { normalizeList } from '@/lib/normalize-list';
import { useQuery } from '@tanstack/react-query';
import { useGetLiveSummary, getGetLiveSummaryQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Navigation, Radio, MapPinOff, ListFilter, Activity, Wifi, Cpu, Bike, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LiveStatusBadge } from '@/components/ui/live-status-badge';
import { LiveMap, CategoryTabs, type UnifiedPosition, type CategoryFilter } from '@/components/ui/live-map';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchAllPositions(): Promise<UnifiedPosition[]> {
  const r = await fetch(`${BASE}/api/live/all-positions`, { credentials: 'include' });
  if (!r.ok) return [];
  return r.json();
}

interface DeviceCategory { id: number; key: string; label: string; colorHex: string; iconKey: string; }

/** Which source the side list shows — the map always shows both. */
type ListSource = 'MOBILE' | 'VEHICLE';

/**
 * A tracker counts as reporting while its last fix is under ten minutes old —
 * the same rule the poller uses to set `tracked_devices.status`. Mobile agents
 * use a tighter two-minute window server-side because they ping every few
 * seconds; trackers report far less predictably.
 */
const STALE_FIX_MS = 10 * 60 * 1000;
/** Matches the server's `deriveStatus` threshold for mobile agents. */
const MOVING_KPH = 3;

async function fetchCategories(): Promise<DeviceCategory[]> {
  const r = await fetch(`${BASE}/api/device-categories`, { credentials: 'include' });
  if (!r.ok) return [];
  return r.json();
}

export default function Dashboard() {
  const { data: summary } = useGetLiveSummary({ query: { refetchInterval: 5000, queryKey: getGetLiveSummaryQueryKey() } });

  const { data: positions = [] } = useQuery<UnifiedPosition[]>({
    queryKey: ['all-positions'],
    queryFn: fetchAllPositions,
    refetchInterval: 5000,
  });

  const { data: categories = [] } = useQuery<DeviceCategory[]>({
    queryKey: ['device-categories'],
    queryFn: fetchCategories,
  });
  const positionList = normalizeList<UnifiedPosition>(positions, ['positions']);
  const categoryList = normalizeList<DeviceCategory>(categories, ['categories']);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('VEHICLES');
  const [listSource, setListSource] = useState<ListSource>('VEHICLE');
  const showingMobile = listSource === 'MOBILE';

  const mobilePositions = positionList.filter(p => p.sourceType === 'MOBILE_APP');
  const devicePositions = positionList.filter(p => p.sourceType === 'GPS_DEVICE');
  const deviceCount = devicePositions.length;
  // Treat mobile SOS/emergencies and tracker alarms as the same priority
  // signal in the dashboard totals.
  const alarmCount = positionList.filter(p => p.emergencyActive || p.alarm).length;

  // `/live/summary` only knows about mobile agents. Fold the GPS fleet in here
  // rather than widening that endpoint, which is contract-typed by api-zod.
  const now = Date.now();
  const vehiclesReporting = devicePositions.filter(p => now - new Date(p.recordedAt).getTime() < STALE_FIX_MS);
  const vehicleMoving = vehiclesReporting.filter(p => (p.speedKph ?? 0) > MOVING_KPH).length;
  const vehicleStationary = vehiclesReporting.length - vehicleMoving;
  const vehicleOffline = deviceCount - vehiclesReporting.length;

  const agentMoving = summary?.movingCount ?? 0;
  const agentStationary = summary?.stationaryCount ?? 0;
  const agentOffline = summary?.offlineCount ?? 0;
  const agentActive = summary?.activeCount ?? 0;

  /** Only worth showing the split once both sources actually contribute. */
  const split = (agents: number, vehicles: number) =>
    deviceCount > 0 ? `${agents} agent${agents === 1 ? '' : 's'} · ${vehicles} vehicle${vehicles === 1 ? '' : 's'}` : undefined;

  const q = search.toLowerCase();

  const filteredMobile = mobilePositions
    .filter(p =>
      (p.firstName ?? '').toLowerCase().includes(q) ||
      (p.lastName ?? '').toLowerCase().includes(q) ||
      (p.employeeCode ?? '').toLowerCase().includes(q)
    )
    // Emergency agents stay pinned above every normal agent.
    .sort((a, b) => Number(Boolean(b.emergencyActive)) - Number(Boolean(a.emergencyActive)));

  const filteredDevices = devicePositions
    .filter(p =>
      (p.deviceName ?? '').toLowerCase().includes(q) ||
      (p.imei ?? '').toLowerCase().includes(q) ||
      (p.vendorType ?? '').toLowerCase().includes(q) ||
      (p.assignedUserName ?? '').toLowerCase().includes(q)
    )
    // Alarmed vehicles stay pinned above every normal vehicle.
    .sort((a, b) => Number(Boolean(b.alarm)) - Number(Boolean(a.alarm)));

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-6 gap-4 shrink-0">
        <StatCard
          title="Active Units"
          value={agentActive + vehiclesReporting.length}
          detail={split(agentActive, vehiclesReporting.length)}
          icon={<Navigation className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Moving"
          value={agentMoving + vehicleMoving}
          detail={split(agentMoving, vehicleMoving)}
          icon={<Activity className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Stationary"
          value={agentStationary + vehicleStationary}
          detail={split(agentStationary, vehicleStationary)}
          icon={<Radio className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Offline"
          value={agentOffline + vehicleOffline}
          detail={split(agentOffline, vehicleOffline)}
          icon={<MapPinOff className="w-4 h-4 text-slate-400" />}
        />
        <StatCard title="GPS Devices" value={deviceCount} icon={<Cpu className="w-4 h-4 text-orange-500" />} />
        <StatCard
          title="Active Alarms"
          value={alarmCount}
          icon={<AlertCircle className="w-4 h-4 text-destructive" />}
          className={alarmCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}
        />
      </div>

      {/* Category filter tabs */}
      <div className="shrink-0 -mt-2">
        <CategoryTabs
          categories={categoryList}
          positions={positionList}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      </div>

      <div className="flex h-[65vh] shrink-0 gap-6 overflow-hidden">
        {/* Left: Map */}
        <div className="flex-1 h-full relative rounded-lg overflow-hidden border bg-card">
          <LiveMap
            positions={positionList}
            selectedPositionId={selectedId}
            activeCategory={activeCategory}
            categories={categoryList}
            onMapClick={() => setSelectedId(null)}
            onPositionClick={(pos) => {
              if (pos.sourceType === 'MOBILE_APP') setSelectedId(`u-${pos.userId}`);
              else setSelectedId(`d-${pos.deviceId}`);
            }}
          />
        </div>

        {/* Right: agent / vehicle list */}
        <div className="w-80 h-full min-h-0 flex flex-col shrink-0">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="sticky top-0 z-10 flex-shrink-0 space-y-3 border-b bg-card/95 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <Select
                  value={listSource}
                  onValueChange={v => { setListSource(v as ListSource); setSearch(''); }}
                >
                  <SelectTrigger className="h-8 w-[190px] text-sm font-semibold">
                    {showingMobile
                      ? <ListFilter className="w-4 h-4 mr-1.5 shrink-0 text-muted-foreground" />
                      : <Bike className="w-4 h-4 mr-1.5 shrink-0 text-orange-500" />}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MOBILE">Mobile Agents</SelectItem>
                    <SelectItem value="VEHICLE">Vehicles</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="secondary">{showingMobile ? mobilePositions.length : deviceCount}</Badge>
              </div>
              {/* Cross-reference: what the *other* source has on the map right now. */}
              {(showingMobile ? deviceCount : mobilePositions.length) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                  {showingMobile
                    ? <><Wifi className="w-3 h-3 text-orange-500" /><span>{deviceCount} vehicle{deviceCount > 1 ? 's' : ''} on map</span></>
                    : <><Navigation className="w-3 h-3 text-violet-500" /><span>{mobilePositions.length} mobile agent{mobilePositions.length > 1 ? 's' : ''} on map</span></>}
                  {alarmCount > 0 && <span className="ml-auto text-red-500 font-medium">{alarmCount} alarm{alarmCount > 1 ? 's' : ''}</span>}
                </div>
              )}
              <Input
                placeholder={showingMobile ? 'Search agent or code...' : 'Search vehicle, IMEI, rider...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="p-2 space-y-1">
                {showingMobile && filteredMobile.map(pos => {
                  const key = `u-${pos.userId}`;
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setActiveCategory('MOBILE_APP');
                        setSelectedId(selectedId === key ? null : key);
                      }}
                      className={cn(
                        "flex flex-col p-3 rounded-md cursor-pointer transition-colors border",
                        pos.emergencyActive
                          ? "border-destructive/50 bg-destructive/5 animate-pulse"
                          : selectedId === key
                            ? "border-violet-700 bg-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                            : "border-transparent hover:border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm truncate">{pos.firstName} {pos.lastName}</span>
                        <LiveStatusBadge pos={pos as any} />
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="font-mono">{pos.employeeCode}</span>
                        {pos.speedKph != null && pos.speedKph > 0 && (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" /> {Math.round(pos.speedKph)} km/h
                          </span>
                        )}
                      </div>
                      {pos.emergencyActive && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-bold text-red-600">
                          <AlertTriangle className="w-3 h-3" /> EMERGENCY
                        </span>
                      )}
                    </div>
                  );
                })}
                {showingMobile && filteredMobile.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {search ? 'No agents match search.' : 'No active agents.'}
                  </div>
                )}

                {!showingMobile && filteredDevices.map(pos => {
                  const key = `d-${pos.deviceId}`;
                  const stale = Date.now() - new Date(pos.recordedAt).getTime() > STALE_FIX_MS;
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setActiveCategory('VEHICLES');
                        setSelectedId(selectedId === key ? null : key);
                      }}
                      className={cn(
                        "flex flex-col p-3 rounded-md cursor-pointer transition-colors border",
                        pos.alarm
                          ? "border-destructive/50 bg-destructive/5"
                          : selectedId === key
                            ? "border-violet-700 bg-violet-50 shadow-[0_0_18px_rgba(124,58,237,0.35)]"
                            : "border-transparent hover:border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="font-medium text-sm truncate">
                          {pos.deviceName ?? pos.imei ?? `Device #${pos.deviceId}`}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] shrink-0',
                            stale ? 'border-slate-300 text-slate-500'
                              : pos.ignition ? 'border-green-500 text-green-600'
                              : 'border-slate-300 text-slate-500',
                          )}
                        >
                          {stale ? 'Stale' : pos.ignition == null ? 'Unknown' : pos.ignition ? 'IGN ON' : 'IGN OFF'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono truncate">{pos.assignedUserName ?? pos.imei ?? '—'}</span>
                        {pos.speedKph != null && pos.speedKph > 0 && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Activity className="w-3 h-3" /> {Math.round(pos.speedKph)} km/h
                          </span>
                        )}
                      </div>
                      {pos.alarm && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertTriangle className="w-3 h-3" /> {pos.alarm}
                        </span>
                      )}
                    </div>
                  );
                })}

                {!showingMobile && filteredDevices.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {search ? 'No vehicles match search.' : 'No vehicles reporting.'}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, detail, className }: { title: string; value: number; icon: React.ReactNode; detail?: string; className?: string }) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
          {detail && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{detail}</p>}
        </div>
        <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
