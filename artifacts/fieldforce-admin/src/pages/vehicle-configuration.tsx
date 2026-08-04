import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Pencil, Plus, X, Wifi, WifiOff, Search, Radio, Power, PowerOff, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
}
type Hub = { id: number; name: string };
type Vehicle = {
  id: number; registrationNumber: string; vehicleType: string; make?: string | null; model?: string | null;
  color?: string | null; chassisNumber?: string | null; engineNumber?: string | null; imei?: string | null;
  iotVendor?: string | null; status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'INACTIVE';
  hubId?: number | null; active: boolean;
};
type Data = { hubs: Hub[]; vehicles: Vehicle[] };
/** Live tracker state from /api/devices, matched to a vehicle by IMEI or registration. */
type TrackedDevice = {
  id: number; vendorKey: string; vendorDeviceId: string; imei?: string | null; name?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; lastFixAt?: string | null; lastSpeedKph?: number | null;
  lastIgnition?: boolean | null; lastAlarm?: string | null; assignedVehicleReg?: string | null;
};

function fixAgo(iso?: string | null) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
const fields = [
  ['registrationNumber', 'Registration number'], ['make', 'Make'], ['model', 'Model'], ['color', 'Color'],
  ['chassisNumber', 'Chassis number'], ['engineNumber', 'Engine number'], ['imei', 'IoT IMEI'], ['iotVendor', 'IoT vendor'],
] as const;

export default function VehicleConfiguration() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [search, setSearch] = useState('');
  const [onlyTracked, setOnlyTracked] = useState(false);
  const { data, isLoading: fleetLoading, error: fleetError } = useQuery<Data>({
    queryKey: ['organization-bootstrap'],
    queryFn: () => api('/api/organization/bootstrap'),
    // Keep the registry in step with the device poller, which may create a
    // vehicle automatically after this page has already loaded.
    refetchInterval: 15_000,
  });
  // Trackers auto-register themselves as vehicles during polling; this overlays
  // their live state onto the registry rows without a new endpoint.
  const { data: devices } = useQuery<TrackedDevice[]>({
    queryKey: ['devices'], queryFn: () => api('/api/devices'), refetchInterval: 15_000,
  });

  const deviceList = Array.isArray(devices) ? devices : [];
  const deviceFor = (vehicle: Vehicle): TrackedDevice | undefined =>
    deviceList.find(d => (vehicle.imei && d.imei === vehicle.imei) || d.assignedVehicleReg === vehicle.registrationNumber);

  const vehicles = data?.vehicles ?? [];
  const trackedCount = vehicles.filter(v => deviceFor(v)).length;
  const q = search.trim().toLowerCase();
  const visibleVehicles = vehicles
    .filter(vehicle => {
      if (onlyTracked && !deviceFor(vehicle)) return false;
      if (!q) return true;
      return [vehicle.registrationNumber, vehicle.chassisNumber, vehicle.imei, vehicle.make, vehicle.model, vehicle.iotVendor]
        .some(field => (field ?? '').toLowerCase().includes(q));
    })
    .sort((a, b) =>
      Number(deviceFor(b)?.status === 'ONLINE') - Number(deviceFor(a)?.status === 'ONLINE'),
    );
  const finish = (title: string) => { qc.invalidateQueries({ queryKey: ['organization-bootstrap'] }); setEditing(null); toast({ title }); };
  const create = useMutation({
    mutationFn: (body: unknown) => api('/api/organization/vehicles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => finish('Vehicle created'),
    onError: (e: Error) => toast({ title: 'Vehicle creation failed', description: e.message, variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/api/organization/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => finish('Vehicle updated'),
    onError: (e: Error) => toast({ title: 'Vehicle update failed', description: e.message, variant: 'destructive' }),
  });
  const engineCommand = useMutation({
    mutationFn: ({ deviceId, command }: { deviceId: number; command: 'engineStop' | 'engineResume' }) =>
      api(`/api/devices/${deviceId}/engine-command`, { method: 'POST', body: JSON.stringify({ command }) }),
    onSuccess: (result, variables) => {
      toast({
        title: variables.command === 'engineStop' ? 'Engine stop confirmed' : 'Engine resume confirmed',
        description: result.message,
      });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error: Error) => toast({ title: 'Vehicle command failed', description: error.message, variant: 'destructive' }),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim() || null;
    const body = {
      hubId: Number(form.get('hubId')), registrationNumber: value('registrationNumber'),
      vehicleType: form.get('vehicleType'), make: value('make'), model: value('model'), color: value('color'),
      chassisNumber: value('chassisNumber'), engineNumber: value('engineNumber'), imei: value('imei'),
      iotVendor: value('iotVendor'), ...(editing ? { status: form.get('status'), active: form.get('active') === 'on' } : {}),
    };
    if (editing) update.mutate({ id: editing.id, body }); else create.mutate(body);
  };
  const pending = create.isPending || update.isPending;
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-bold">Vehicle Configuration</h1><p className="text-sm text-muted-foreground mt-1">Manage vehicles, hub allocation, IoT identity, and assignment availability.</p></div>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex gap-2"><Bike className="w-5 h-5"/>Fleet</CardTitle>
            <CardDescription className="mt-1">
              {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} · {trackedCount} with a live GPS tracker.
              Polled trackers are registered here automatically on first fix.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reg, chassis, IMEI…" className="pl-8 h-9 w-56"/>
            </div>
            <Button type="button" size="sm" variant={onlyTracked ? 'default' : 'outline'} className="h-9 gap-1.5" onClick={() => setOnlyTracked(v => !v)}>
              <Radio className="w-3.5 h-3.5"/> GPS tracked
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-3">
        {fleetLoading && (
          <div className="md:col-span-3 p-6 text-center text-sm text-muted-foreground">Loading fleet…</div>
        )}
        {fleetError && (
          <div className="md:col-span-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Fleet could not be loaded: {(fleetError as Error).message}
          </div>
        )}
        {visibleVehicles.map(vehicle => {
          const device = deviceFor(vehicle);
          const isLive = device?.status === 'ONLINE';
          return <div
            key={vehicle.id}
            className={isLive
              ? "flex flex-col rounded-lg border-2 border-emerald-400 bg-emerald-50/80 p-4 shadow-sm shadow-emerald-500/10"
              : "flex flex-col rounded-lg border p-4"}
          >
            <div className="flex justify-between gap-2">
              <span className="font-semibold truncate">{vehicle.registrationNumber}</span>
              <Badge variant="outline" className="shrink-0">{vehicle.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'} · {vehicle.vehicleType}</div>
            <dl className="mt-1.5 space-y-0.5 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground shrink-0">Chassis</dt>
                <dd className="font-mono truncate">{vehicle.chassisNumber || '—'}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground shrink-0">IMEI</dt>
                <dd className="font-mono truncate">{vehicle.imei || '—'}</dd>
              </div>
            </dl>
            {vehicle.chassisNumber && vehicle.registrationNumber === vehicle.chassisNumber && (
              <div className="mt-2 text-[11px] text-amber-700">
                Showing the chassis number — the tracker does not report a number plate. Edit to add the real registration.
              </div>
            )}
            {device ? (
              <div className={isLive
                ? "mt-2 space-y-0.5 rounded-md border border-emerald-200 bg-emerald-100/70 px-2 py-1.5 text-xs"
                : "mt-2 space-y-0.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs"}>
                <div className="flex items-center gap-1.5 font-medium">
                  {device.status === 'ONLINE'
                    ? <><Wifi className="w-3 h-3 text-green-600"/><span className="text-green-700">Live</span></>
                    : <><WifiOff className="w-3 h-3 text-slate-400"/><span className="text-slate-500">Offline</span></>}
                  <span className="ml-auto font-mono text-muted-foreground">{device.vendorKey}</span>
                </div>
                <div className="text-muted-foreground">
                  Last fix {fixAgo(device.lastFixAt)}
                  {device.lastSpeedKph != null && ` · ${Math.round(device.lastSpeedKph)} km/h`}
                  {device.lastIgnition != null && ` · IGN ${device.lastIgnition ? 'ON' : 'OFF'}`}
                </div>
                {device.lastAlarm && <div className="text-red-600 font-medium">⚠ {device.lastAlarm}</div>}
              </div>
            ) : (
              <div className="mt-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">No GPS tracker linked</div>
            )}
            {vehicle.hubId == null && (
              <div className="mt-2 text-[11px] text-amber-700">Assign a hub so hub and state admins can see this vehicle.</div>
            )}
            {device && (
              <details className="mt-3 rounded-lg border bg-background">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold">Vehicle Controls</summary>
                <div className="space-y-2 border-t p-3">
                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Commands are sent through Track360 and wait for device acknowledgement.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs text-emerald-700"
                      disabled={engineCommand.isPending && engineCommand.variables?.deviceId === device.id}
                      onClick={() => engineCommand.mutate({ deviceId: device.id, command: 'engineResume' })}
                    >
                      <Power className="h-3.5 w-3.5" /> Engine On
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 gap-1.5 text-xs"
                      disabled={
                        (engineCommand.isPending && engineCommand.variables?.deviceId === device.id) ||
                        device.status !== 'ONLINE' ||
                        (device.lastSpeedKph ?? 0) > 3 ||
                        !device.lastFixAt ||
                        Date.now() - new Date(device.lastFixAt).getTime() > 10 * 60 * 1000
                      }
                      onClick={() => {
                        if (confirm(`Stop the engine for ${vehicle.registrationNumber}? Only continue after confirming the vehicle is safely parked.`)) {
                          engineCommand.mutate({ deviceId: device.id, command: 'engineStop' });
                        }
                      }}
                    >
                      <PowerOff className="h-3.5 w-3.5" /> Engine Off
                    </Button>
                  </div>
                  {(device.status !== 'ONLINE' || (device.lastSpeedKph ?? 0) > 3 || !device.lastFixAt || Date.now() - new Date(device.lastFixAt).getTime() > 10 * 60 * 1000) && (
                    <p className="text-[11px] text-amber-700">Engine Off is available only when the tracker is online, recently updated, and stationary.</p>
                  )}
                </div>
              </details>
            )}
            <Button type="button" variant="outline" size="sm" className="mt-3 self-start" onClick={() => { setEditing(vehicle); requestAnimationFrame(() => document.getElementById('vehicle-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>
              <Pencil className="w-3.5 h-3.5 mr-2"/>Edit vehicle
            </Button>
          </div>;
        })}
        {!fleetLoading && !fleetError && visibleVehicles.length === 0 && (
          <div className="md:col-span-3 p-6 text-center text-sm text-muted-foreground">
            {vehicles.length === 0 ? 'No vehicles yet. Add one below, or they will appear automatically once a GPS vendor account starts polling.' : 'No vehicles match the current filter.'}
          </div>
        )}
      </CardContent>
    </Card>
    <Card id="vehicle-form"><CardHeader><CardTitle className="flex gap-2">{editing ? <Pencil className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}{editing ? `Edit ${editing.registrationNumber}` : 'Add vehicle'}</CardTitle><CardDescription>IoT vendor fields can be completed now or when the device integration is supplied.</CardDescription></CardHeader>
      <CardContent><form key={editing?.id ?? 'new'} onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(([name, label]) => <div key={name}><Label>{label}</Label><Input name={name} defaultValue={editing?.[name] ?? ''} required={name === 'registrationNumber'}/></div>)}
        <div><Label>Type</Label><select name="vehicleType" defaultValue={editing?.vehicleType ?? 'TWO_WHEELER'} className="h-10 w-full border rounded-md px-3 bg-background"><option>TWO_WHEELER</option><option>THREE_WHEELER</option><option>FOUR_WHEELER</option></select></div>
        <div><Label>Hub</Label><select name="hubId" defaultValue={editing?.hubId ?? ''} required className="h-10 w-full border rounded-md px-3 bg-background"><option value="">Select</option>{data?.hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
        {editing && <><div><Label>Status</Label><select name="status" defaultValue={editing.status} className="h-10 w-full border rounded-md px-3 bg-background"><option>AVAILABLE</option><option>ASSIGNED</option><option>MAINTENANCE</option><option>INACTIVE</option></select></div><label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing.active}/>Vehicle is active</label></>}
        <div className="flex items-end gap-2"><Button disabled={pending}>{editing ? 'Save changes' : 'Create vehicle'}</Button>{editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-2"/>Cancel</Button>}</div>
      </form></CardContent>
    </Card>
  </div>;
}
