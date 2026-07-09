import { useEffect, useState } from 'react';
import { useGetLiveSummary, useGetLivePositions, getGetLiveSummaryQueryKey, getGetLivePositionsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Navigation, Radio, MapPinOff, ListFilter, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

function MapPlaceholder() {
  return (
    <div className="w-full h-full bg-muted/30 border border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Navigation className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Live Map View</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-4">
        Provide a Google Maps API key in environment variables to enable the real-time map visualization.
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
          <MapPlaceholder />
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
                  <div key={pos.userId} className="flex flex-col p-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm truncate">{pos.firstName} {pos.lastName}</span>
                      <StatusBadge status={pos.status} />
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'MOVING') {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">Moving</Badge>;
  }
  if (status === 'STATIONARY') {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Stopped</Badge>;
  }
  return <Badge variant="outline" className="text-slate-500 text-[10px] px-1.5 py-0">Offline</Badge>;
}

