import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Pencil, QrCode, UserPlus, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LocationPicker, type PickedLocation } from '@/components/ui/location-picker';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => null))?.error ?? `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

type Hub = {
  id: number;
  name: string;
  code: string;
  qrToken: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  maxGpsAccuracyM: number;
  active: boolean;
  stateId: number | null;
};
type Rider = { id: number; firstName: string; lastName: string; employeeCode: string };
type State = { id: number; name: string };

const EMPTY_LOCATION: PickedLocation = { latitude: null, longitude: null, address: '' };

export default function HubConfiguration() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [stateId, setStateId] = useState('');
  const [location, setLocation] = useState<PickedLocation>(EMPTY_LOCATION);
  const [radiusM, setRadiusM] = useState(200);
  const [maxGpsAccuracyM, setMaxGpsAccuracyM] = useState(75);
  const [active, setActive] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const { data: hubs = [], isLoading } = useQuery<Hub[]>({
    queryKey: ['iot-hubs'],
    queryFn: () => api('/api/iot/hubs'),
  });
  const { data: riders = [] } = useQuery<Rider[]>({
    queryKey: ['iot-riders'],
    queryFn: () => api('/api/users?role=USER&status=ACTIVE'),
  });
  const { data: organization } = useQuery<{ states: State[] }>({
    queryKey: ['organization-bootstrap'],
    queryFn: () => api('/api/organization/bootstrap'),
  });

  const createHub = useMutation({
    mutationFn: (data: unknown) => api('/api/iot/hubs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (hub: Hub) => {
      qc.invalidateQueries({ queryKey: ['iot-hubs'] });
      setSelectedHub(hub);
      resetForm();
      toast({ title: 'Hub created' });
    },
    onError: (error: Error) =>
      toast({ title: 'Could not create hub', description: error.message, variant: 'destructive' }),
  });
  const updateHub = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) =>
      api(`/api/iot/hubs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      const updatedHub = { ...editingHub!, ...(variables.data as Partial<Hub>) };
      qc.invalidateQueries({ queryKey: ['iot-hubs'] });
      setSelectedHub(current => current?.id === updatedHub.id ? updatedHub : current);
      resetForm();
      toast({ title: 'Hub updated' });
    },
    onError: (error: Error) =>
      toast({ title: 'Could not update hub', description: error.message, variant: 'destructive' }),
  });
  const assignRider = useMutation({
    mutationFn: ({ hubId, userId }: { hubId: number; userId: number }) =>
      api(`/api/iot/hubs/${hubId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => toast({ title: 'Rider assigned to hub' }),
    onError: (error: Error) =>
      toast({ title: 'Could not assign rider', description: error.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setEditingHub(null);
    setName('');
    setCode('');
    setStateId('');
    setLocation(EMPTY_LOCATION);
    setRadiusM(200);
    setMaxGpsAccuracyM(75);
    setActive(true);
    formRef.current?.reset();
  };

  const beginEditing = (hub: Hub) => {
    setEditingHub(hub);
    setSelectedHub(hub);
    setName(hub.name);
    setCode(hub.code);
    setStateId(hub.stateId == null ? '' : String(hub.stateId));
    setLocation({ latitude: hub.latitude, longitude: hub.longitude, address: hub.address ?? '' });
    setRadiusM(hub.radiusM);
    setMaxGpsAccuracyM(hub.maxGpsAccuracyM);
    setActive(hub.active);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitHub = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (location.latitude == null || location.longitude == null) {
      toast({
        title: 'Pick the hub location',
        description: 'Search for the address or click the map to place the hub.',
        variant: 'destructive',
      });
      return;
    }
    const data = {
      name,
      code,
      address: location.address.trim() || null,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM,
      maxGpsAccuracyM,
      active,
      stateId: stateId ? Number(stateId) : null,
    };
    if (editingHub) updateHub.mutate({ id: editingHub.id, data });
    else createHub.mutate(data);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hub Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure delivery-hub geofences, attendance QR codes, and rider assignments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> {editingHub ? `Edit ${editingHub.name}` : 'Add delivery hub'}
          </CardTitle>
          <CardDescription>
            Search for the hub or click the map to place it — the address and coordinates are filled in from
            your selection. Radius and permitted GPS error are independently configurable for every hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={submitHub} className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input name="name" value={name} onChange={event => setName(event.target.value)} required /></div>
                <div><Label>Code</Label><Input name="code" value={code} onChange={event => setCode(event.target.value)} required /></div>
              </div>
              <div>
                <Label>State</Label>
                <select name="stateId" value={stateId} onChange={event => setStateId(event.target.value)} required className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Select</option>
                  {organization?.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Address</Label>
                <Textarea
                  name="address"
                  rows={2}
                  placeholder="Filled in from the map — edit if you need to"
                  value={location.address}
                  onChange={event => setLocation(prev => ({ ...prev, address: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Latitude</Label>
                  <Input
                    type="number" step="any" required placeholder="Pick on the map"
                    value={location.latitude ?? ''}
                    onChange={event => setLocation(prev => ({
                      ...prev,
                      latitude: event.target.value === '' ? null : Number(event.target.value),
                    }))}
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    type="number" step="any" required placeholder="Pick on the map"
                    value={location.longitude ?? ''}
                    onChange={event => setLocation(prev => ({
                      ...prev,
                      longitude: event.target.value === '' ? null : Number(event.target.value),
                    }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Radius (m)</Label>
                  <Input
                    type="number" min="25" required
                    value={radiusM}
                    onChange={event => setRadiusM(Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label>Max GPS error (m)</Label>
                  <Input
                    name="maxGpsAccuracyM" type="number" min="5" required
                    value={maxGpsAccuracyM}
                    onChange={event => setMaxGpsAccuracyM(Number(event.target.value))}
                  />
                </div>
              </div>
              {editingHub && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
                  Hub is active
                </label>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={createHub.isPending || updateHub.isPending}>
                  {editingHub ? 'Save changes' : 'Create hub'}
                </Button>
                {editingHub && (
                  <Button type="button" variant="outline" onClick={resetForm} disabled={updateHub.isPending}>
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                )}
              </div>
            </div>

            <LocationPicker
              value={location}
              onChange={setLocation}
              radiusM={Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 200}
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured hubs</CardTitle>
          <CardDescription>Select a hub to display its QR code or assign a rider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading hubs…</p>
          ) : hubs.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
              No hubs configured yet.
            </p>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              {hubs.map(hub => (
                <div key={hub.id} className="border rounded-lg p-4 hover:bg-muted/50">
                  <button onClick={() => setSelectedHub(hub)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{hub.name}</span>
                      <Badge variant={hub.active ? 'default' : 'secondary'}>{hub.active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {hub.code} · {hub.radiusM}m radius · GPS ≤ {hub.maxGpsAccuracyM}m
                    </div>
                    {hub.address && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{hub.address}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {hub.latitude.toFixed(6)}, {hub.longitude.toFixed(6)}
                    </div>
                  </button>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => beginEditing(hub)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit hub
                  </Button>
                </div>
              ))}
            </div>
          )}

          {selectedHub && (
            <div className="flex flex-wrap items-center gap-5 border rounded-lg p-4">
              <div className="p-3 bg-white rounded-md border">
                <QRCodeSVG value={selectedHub.qrToken} size={144} title={`${selectedHub.name} attendance QR`} />
              </div>
              <div className="flex-1 min-w-64">
                <div className="font-semibold flex items-center gap-2">
                  <QrCode className="w-4 h-4" /> {selectedHub.name} attendance QR
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Print and display this code at the hub. Attendance still requires a valid GPS position.
                </p>
                <code className="text-xs break-all">{selectedHub.qrToken}</code>
              </div>
              <form
                className="flex gap-2 items-end"
                onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  assignRider.mutate({ hubId: selectedHub.id, userId: Number(form.get('userId')) });
                }}
              >
                <div>
                  <Label>Assign rider</Label>
                  <select
                    name="userId"
                    required
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Choose rider</option>
                    {riders.map(rider => (
                      <option key={rider.id} value={rider.id}>
                        {rider.firstName} {rider.lastName} ({rider.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={assignRider.isPending}>
                  <UserPlus className="w-4 h-4 mr-2" /> Assign
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
