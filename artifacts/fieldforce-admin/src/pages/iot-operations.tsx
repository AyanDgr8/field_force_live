import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Pencil, X } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
type Hub = { id: number; name: string; code: string; qrToken: string; latitude: number; longitude: number; radiusM: number; maxGpsAccuracyM: number; active: boolean };
type Policy = { workStartMinute: number; workEndMinute: number; restrictedEndMinute: number; freeRideCount: number; freeRideMinutes: number; timezone: string; packages: Array<{ minutes: number; pricePaise: number }> };
type Rider = { id: number; firstName: string; lastName: string; employeeCode: string };
const time = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };

export default function IotOperations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const hubFormRef = useRef<HTMLFormElement>(null);
  const { data: hubs = [] } = useQuery<Hub[]>({ queryKey: ['iot-hubs'], queryFn: () => api('/api/iot/hubs') });
  const { data: policy } = useQuery<Policy>({ queryKey: ['iot-policy'], queryFn: () => api('/api/iot/policy') });
  const { data: riders = [] } = useQuery<Rider[]>({ queryKey: ['iot-riders'], queryFn: () => api('/api/users?role=USER&status=ACTIVE') });
  const createHub = useMutation({
    mutationFn: (data: unknown) => api('/api/iot/hubs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iot-hubs'] }); toast({ title: 'Hub created' }); },
    onError: (e: Error) => toast({ title: 'Could not create hub', description: e.message, variant: 'destructive' }),
  });
  const updateHub = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => api(`/api/iot/hubs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iot-hubs'] }); setEditingHub(null); hubFormRef.current?.reset(); toast({ title: 'Hub updated' }); },
    onError: (e: Error) => toast({ title: 'Could not update hub', description: e.message, variant: 'destructive' }),
  });
  const savePolicy = useMutation({
    mutationFn: (data: unknown) => api('/api/iot/policy', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['iot-policy'] }); toast({ title: 'Vehicle access policy saved' }); },
    onError: (e: Error) => toast({ title: 'Could not save policy', description: e.message, variant: 'destructive' }),
  });
  const assignRider = useMutation({
    mutationFn: ({ hubId, userId }: { hubId: number; userId: number }) => api(`/api/iot/hubs/${hubId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => toast({ title: 'Rider assigned to hub' }),
    onError: (e: Error) => toast({ title: 'Could not assign rider', description: e.message, variant: 'destructive' }),
  });
  const submitHub = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    const data = { name: f.get('name'), code: f.get('code'), latitude: Number(f.get('latitude')), longitude: Number(f.get('longitude')), radiusM: Number(f.get('radiusM')), maxGpsAccuracyM: Number(f.get('maxGpsAccuracyM')), active: f.get('active') === 'on' };
    if (editingHub) updateHub.mutate({ id: editingHub.id, data }); else createHub.mutate({ ...data, active: true });
  };
  const submitPolicy = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    savePolicy.mutate({
      workStartMinute: minutes(String(f.get('workStart'))), workEndMinute: minutes(String(f.get('workEnd'))),
      restrictedEndMinute: 1440, freeRideCount: Number(f.get('freeRideCount')), freeRideMinutes: Number(f.get('freeRideMinutes')),
      timezone: String(f.get('timezone')),
      packages: [
        { minutes: 30, pricePaise: Number(f.get('p30')) * 100 }, { minutes: 60, pricePaise: Number(f.get('p60')) * 100 },
        { minutes: 120, pricePaise: Number(f.get('p120')) * 100 }, { minutes: 240, pricePaise: Number(f.get('p240')) * 100 },
      ],
    });
  };
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-bold">IoT Operations</h1><p className="text-sm text-muted-foreground mt-1">Configure hub attendance and vehicle-access rules.</p></div>
    <Card><CardHeader><CardTitle>Delivery hubs</CardTitle><CardDescription>Each hub has its own geofence and attendance QR.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <form key={editingHub?.id ?? 'new'} ref={hubFormRef} onSubmit={submitHub} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div><Label>Name</Label><Input name="name" defaultValue={editingHub?.name} required /></div><div><Label>Code</Label><Input name="code" defaultValue={editingHub?.code} required /></div>
          <div><Label>Latitude</Label><Input name="latitude" type="number" step="any" defaultValue={editingHub?.latitude} required /></div><div><Label>Longitude</Label><Input name="longitude" type="number" step="any" defaultValue={editingHub?.longitude} required /></div>
          <div><Label>Radius (m)</Label><Input name="radiusM" type="number" min="25" defaultValue={editingHub?.radiusM ?? 200} required /></div>
          <div><Label>Max GPS error (m)</Label><Input name="maxGpsAccuracyM" type="number" min="5" defaultValue={editingHub?.maxGpsAccuracyM ?? 75} required /></div>
          {editingHub && <label className="flex h-10 items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editingHub.active} />Active</label>}
          <Button type="submit" disabled={createHub.isPending || updateHub.isPending}>{editingHub ? 'Save changes' : 'Add hub'}</Button>
          {editingHub && <Button type="button" variant="outline" onClick={() => setEditingHub(null)}><X className="w-4 h-4 mr-2"/>Cancel</Button>}
        </form>
        <div className="grid md:grid-cols-3 gap-3">{hubs.map(h => <div key={h.id} className="border rounded-lg p-4 hover:bg-muted/50">
          <button onClick={() => setSelectedHub(h)} className="w-full text-left"><div className="font-semibold">{h.name}</div><div className="text-xs text-muted-foreground">{h.code} · {h.radiusM}m radius · GPS ≤ {h.maxGpsAccuracyM}m</div></button>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setEditingHub(h); setSelectedHub(h); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-3.5 h-3.5 mr-2"/>Edit hub</Button>
        </div>)}</div>
        {selectedHub && <div className="flex flex-wrap items-center gap-5 border rounded-lg p-4"><QRCodeSVG value={selectedHub.qrToken} size={128} /><div className="flex-1 min-w-64"><div className="font-semibold">{selectedHub.name} attendance QR</div><p className="text-sm text-muted-foreground">Print and display this QR inside the hub geofence.</p><code className="text-xs break-all">{selectedHub.qrToken}</code></div>
          <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); assignRider.mutate({ hubId: selectedHub.id, userId: Number(f.get('userId')) }); }}>
            <div><Label>Assign rider</Label><select name="userId" required className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Choose rider</option>{riders.map(r => <option key={r.id} value={r.id}>{r.firstName} {r.lastName} ({r.employeeCode})</option>)}</select></div>
            <Button type="submit" disabled={assignRider.isPending}>Assign</Button>
          </form>
        </div>}
      </CardContent>
    </Card>
    {policy && <Card><CardHeader><CardTitle>Vehicle access policy</CardTitle><CardDescription>These defaults remain editable; ignition commands activate after a vendor adapter is connected.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submitPolicy} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><Label>Work starts</Label><Input name="workStart" type="time" defaultValue={time(policy.workStartMinute)} /></div>
        <div><Label>Work ends</Label><Input name="workEnd" type="time" defaultValue={time(policy.workEndMinute)} /></div>
        <div><Label>Free rides</Label><Input name="freeRideCount" type="number" min="0" defaultValue={policy.freeRideCount} /></div>
        <div><Label>Free minutes / ride</Label><Input name="freeRideMinutes" type="number" min="1" defaultValue={policy.freeRideMinutes} /></div>
        {[30,60,120,240].map((n, i) => <div key={n}><Label>{n} min price (₹)</Label><Input name={`p${n}`} type="number" min="0" defaultValue={(policy.packages[i]?.pricePaise ?? 0) / 100} /></div>)}
        <div><Label>Timezone</Label><Input name="timezone" defaultValue={policy.timezone} /></div>
        <div className="flex items-end"><Button type="submit" disabled={savePolicy.isPending}>Save policy</Button></div>
      </form></CardContent>
    </Card>}
  </div>;
}
