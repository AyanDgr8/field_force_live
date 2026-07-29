import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Pencil, Plus, X } from 'lucide-react';
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
const fields = [
  ['registrationNumber', 'Registration number'], ['make', 'Make'], ['model', 'Model'], ['color', 'Color'],
  ['chassisNumber', 'Chassis number'], ['engineNumber', 'Engine number'], ['imei', 'IoT IMEI'], ['iotVendor', 'IoT vendor'],
] as const;

export default function VehicleConfiguration() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const { data } = useQuery<Data>({ queryKey: ['organization-bootstrap'], queryFn: () => api('/api/organization/bootstrap') });
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
    <Card><CardHeader><CardTitle className="flex gap-2">{editing ? <Pencil className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}{editing ? `Edit ${editing.registrationNumber}` : 'Add vehicle'}</CardTitle><CardDescription>IoT vendor fields can be completed now or when the device integration is supplied.</CardDescription></CardHeader>
      <CardContent><form key={editing?.id ?? 'new'} onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(([name, label]) => <div key={name}><Label>{label}</Label><Input name={name} defaultValue={editing?.[name] ?? ''} required={name === 'registrationNumber'}/></div>)}
        <div><Label>Type</Label><select name="vehicleType" defaultValue={editing?.vehicleType ?? 'TWO_WHEELER'} className="h-10 w-full border rounded-md px-3 bg-background"><option>TWO_WHEELER</option><option>THREE_WHEELER</option><option>FOUR_WHEELER</option></select></div>
        <div><Label>Hub</Label><select name="hubId" defaultValue={editing?.hubId ?? ''} required className="h-10 w-full border rounded-md px-3 bg-background"><option value="">Select</option>{data?.hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
        {editing && <><div><Label>Status</Label><select name="status" defaultValue={editing.status} className="h-10 w-full border rounded-md px-3 bg-background"><option>AVAILABLE</option><option>ASSIGNED</option><option>MAINTENANCE</option><option>INACTIVE</option></select></div><label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing.active}/>Vehicle is active</label></>}
        <div className="flex items-end gap-2"><Button disabled={pending}>{editing ? 'Save changes' : 'Create vehicle'}</Button>{editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-2"/>Cancel</Button>}</div>
      </form></CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="flex gap-2"><Bike className="w-5 h-5"/>Fleet</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-3">
      {data?.vehicles.map(vehicle => <div key={vehicle.id} className="border rounded-lg p-4"><div className="flex justify-between"><span className="font-semibold">{vehicle.registrationNumber}</span><Badge variant="outline">{vehicle.status}</Badge></div><div className="text-xs text-muted-foreground mt-1">{vehicle.make} {vehicle.model} · {vehicle.vehicleType}</div><div className="text-xs text-muted-foreground">IMEI: {vehicle.imei || 'Not configured'}</div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setEditing(vehicle); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-3.5 h-3.5 mr-2"/>Edit vehicle</Button></div>)}
    </CardContent></Card>
  </div>;
}
