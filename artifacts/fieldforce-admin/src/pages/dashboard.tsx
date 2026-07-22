import { useState } from 'react';
import { normalizeList } from '@/lib/normalize-list';
import { useQuery } from '@tanstack/react-query';
import { useGetLiveSummary, getGetLiveSummaryQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Navigation, Radio, MapPinOff, ListFilter, Activity, Wifi, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LiveStatusBadge } from '@/components/ui/live-status-badge';
import { LiveMap, CategoryTabs, type UnifiedPosition, type CategoryFilter } from '@/components/ui/live-map';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchAllPositions(): Promise<UnifiedPosition[]> {
  const r = await fetch(`${BASE}/api/live/all-positions`, { credentials: 'include' });
  if (!r.ok) return [];
  return r.json();
}

interface DeviceCategory { id: number; key: string; label: string; colorHex: string; iconKey: string; }

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
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');

  const mobilePositions = positionList.filter(p => p.sourceType === 'MOBILE_APP');
  const deviceCount = positionList.filter(p => p.sourceType === 'GPS_DEVICE').length;
  const alarmCount = positionList.filter(p => p.alarm).length;

  const filteredMobile = mobilePositions.filter(p => {
    const q = search.toLowerCase();
    return (
      (p.firstName ?? '').toLowerCase().includes(q) ||
      (p.lastName ?? '').toLowerCase().includes(q) ||
      (p.employeeCode ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-6 gap-4 shrink-0">
        <StatCard title="Active Agents" value={summary?.activeCount ?? 0} icon={<Navigation className="w-4 h-4 text-blue-500" />} />
        <StatCard title="Moving" value={summary?.movingCount ?? 0} icon={<Activity className="w-4 h-4 text-emerald-500" />} />
        <StatCard title="Stationary" value={summary?.stationaryCount ?? 0} icon={<Radio className="w-4 h-4 text-amber-500" />} />
        <StatCard title="Offline" value={summary?.offlineCount ?? 0} icon={<MapPinOff className="w-4 h-4 text-slate-400" />} />
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

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Map */}
        <div className="flex-1 relative rounded-lg overflow-hidden border bg-card">
          <LiveMap
            positions={positionList}
            selectedPositionId={selectedId}
            activeCategory={activeCategory}
            categories={categoryList}
            onPositionClick={(pos) => {
              if (pos.sourceType === 'MOBILE_APP') setSelectedId(`u-${pos.userId}`);
              else setSelectedId(`d-${pos.deviceId}`);
            }}
          />
        </div>

        {/* Right: Mobile agent list */}
        <div className="w-80 flex flex-col gap-4 shrink-0">
          <Card className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b flex-shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <ListFilter className="w-4 h-4" /> Mobile Agents
                </h3>
                <Badge variant="secondary">{mobilePositions.length}</Badge>
              </div>
              {deviceCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                  <Wifi className="w-3 h-3 text-orange-500" />
                  <span>{deviceCount} GPS device{deviceCount > 1 ? 's' : ''} on map</span>
                  {alarmCount > 0 && <span className="ml-auto text-red-500 font-medium">{alarmCount} alarm{alarmCount > 1 ? 's' : ''}</span>}
                </div>
              )}
              <Input
                placeholder="Search agent or code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {filteredMobile.map(pos => {
                  const key = `u-${pos.userId}`;
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setActiveCategory('ALL');
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
                    </div>
                  );
                })}
                {filteredMobile.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {search ? 'No agents match search.' : 'No active agents.'}
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
