import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Bike, Wifi, WifiOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function adminFetch(path: string) {
  const r = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type Hub = { id: number; name: string };
type Vehicle = {
  id: number; registrationNumber: string; chassisNumber?: string | null; imei?: string | null;
  vehicleType: string; make?: string | null; model?: string | null; iotVendor?: string | null;
  status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'INACTIVE'; hubId?: number | null; active: boolean;
};
type Bootstrap = { hubs: Hub[]; vehicles: Vehicle[] };
type TrackedDevice = {
  id: number; vendorKey: string; imei?: string | null; assignedVehicleReg?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; lastFixAt?: string | null; lastSpeedKph?: number | null;
};

function fixAgo(iso?: string | null) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function Vehicles() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');

  // Vehicles land here on their own — the GPS poller registers each tracker on
  // its first fix — so keep the list refreshing rather than requiring a reload.
  const { data: bootstrap, isLoading } = useQuery<Bootstrap>({
    queryKey: ['organization-bootstrap'],
    queryFn: () => adminFetch('/api/organization/bootstrap'),
    refetchInterval: 15_000,
  });
  const { data: devices } = useQuery<TrackedDevice[]>({
    queryKey: ['devices'],
    queryFn: () => adminFetch('/api/devices'),
    refetchInterval: 15_000,
  });

  const hubName = (id?: number | null) => bootstrap?.hubs.find(h => h.id === id)?.name ?? null;
  const deviceList = Array.isArray(devices) ? devices : [];
  const deviceFor = (v: Vehicle) =>
    deviceList.find(d => (v.imei && d.imei === v.imei) || d.assignedVehicleReg === v.registrationNumber);

  const vehicles = bootstrap?.vehicles ?? [];
  const q = search.trim().toLowerCase();
  const filtered = vehicles.filter(v =>
    !q || [v.registrationNumber, v.chassisNumber, v.imei, v.make, v.model, v.iotVendor]
      .some(f => (f ?? '').toLowerCase().includes(q)),
  );
  const liveCount = vehicles.filter(v => deviceFor(v)?.status === 'ONLINE').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} · {liveCount} reporting live.
            Trackers register themselves here on their first GPS fix.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setLocation('/vehicle-configuration')}>
          <Plus className="w-4 h-4" /> Add vehicle
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by registration, chassis, or IMEI..."
              className="pl-9 w-full"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Vehicle</th>
                <th className="px-6 py-4 font-medium">IMEI</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Hub</th>
                <th className="px-6 py-4 font-medium">Tracker</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading vehicles...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  {vehicles.length === 0
                    ? 'No vehicles yet. They register automatically once a GPS vendor account starts polling.'
                    : 'No vehicles match your search.'}
                </td></tr>
              ) : (
                filtered.map(vehicle => {
                  const device = deviceFor(vehicle);
                  return (
                    <tr
                      key={vehicle.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Configure ${vehicle.registrationNumber}`}
                      className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 transition-colors"
                      onClick={() => setLocation('/vehicle-configuration')}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocation('/vehicle-configuration'); }
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600">
                            <Bike className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{vehicle.registrationNumber}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {vehicle.chassisNumber ? `Chassis ${vehicle.chassisNumber}` : '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{vehicle.imei ?? '—'}</td>
                      <td className="px-6 py-4 text-xs">{vehicle.vehicleType.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4 text-xs">
                        {hubName(vehicle.hubId) ?? <span className="text-amber-700">Unassigned</span>}
                      </td>
                      <td className="px-6 py-4">
                        {device ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            {device.status === 'ONLINE'
                              ? <><Wifi className="w-3.5 h-3.5 text-green-600" /><span className="text-green-700 font-medium">Live</span></>
                              : <><WifiOff className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-500">Offline</span></>}
                            <span className="text-muted-foreground">· {fixAgo(device.lastFixAt)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not linked</span>
                        )}
                      </td>
                      <td className="px-6 py-4"><VehicleStatusBadge status={vehicle.status} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function VehicleStatusBadge({ status }: { status: Vehicle['status'] }) {
  if (status === 'AVAILABLE') return <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">Available</Badge>;
  if (status === 'ASSIGNED') return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Assigned</Badge>;
  if (status === 'MAINTENANCE') return <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Maintenance</Badge>;
  return <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">Inactive</Badge>;
}
