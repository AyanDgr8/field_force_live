import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, MapPin, Pencil, Plus, QrCode, Search, Upload, UserPlus, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  city: string | null;
  zone: string | null;
  cluster: string | null;
  metroType: string | null;
  category: string | null;
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
type HubImportResult = {
  fileName: string;
  detectedHeaders: string[];
  totalRows: number;
  createdStates: number;
  createdHubs: number;
  updatedHubs: number;
  existingRows: number;
  skippedRows: number;
  warnings: string[];
};

const EMPTY_LOCATION: PickedLocation = { latitude: null, longitude: null, address: '', city: null, state: null };
async function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HubConfiguration() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [zone, setZone] = useState('');
  const [cluster, setCluster] = useState('');
  const [metroType, setMetroType] = useState('');
  const [category, setCategory] = useState('');
  const [stateId, setStateId] = useState('');
  const [location, setLocation] = useState<PickedLocation>(EMPTY_LOCATION);
  const [radiusM, setRadiusM] = useState(200);
  const [maxGpsAccuracyM, setMaxGpsAccuracyM] = useState(75);
  const [active, setActive] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<HubImportResult | null>(null);
  const [hubSearch, setHubSearch] = useState('');
  const [hubDialogOpen, setHubDialogOpen] = useState(false);
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
  const filteredHubs = useMemo(() => {
    const query = hubSearch.trim().toLocaleLowerCase();
    if (!query) return hubs;
    return hubs.filter(hub => [
      hub.name, hub.code, hub.city, hub.address, hub.zone, hub.cluster, hub.metroType, hub.category,
    ].some(value => value?.toLocaleLowerCase().includes(query)));
  }, [hubs, hubSearch]);

  // The taxonomy is defined by the imported hub master sheet rather than by a
  // fixed list, so the suggestions are collected from the hubs already loaded.
  const distinctValues = (pick: (hub: Hub) => string | null) =>
    [...new Set(hubs.map(pick).filter((value): value is string => Boolean(value)))].sort();
  const zoneOptions = distinctValues(hub => hub.zone);
  const clusterOptions = distinctValues(hub => hub.cluster);
  const metroTypeOptions = distinctValues(hub => hub.metroType);
  const categoryOptions = distinctValues(hub => hub.category);

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
  const importHubs = useMutation({
    mutationFn: async (file: File) => api('/api/iot/hubs/import', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, base64: await base64(file) }),
    }) as Promise<HubImportResult>,
    onSuccess: result => {
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ['iot-hubs'] });
      qc.invalidateQueries({ queryKey: ['organization-bootstrap'] });
      toast({ title: 'Hub workbook processed', description: `${result.createdHubs} hubs created and ${result.updatedHubs} updated.` });
    },
    onError: (error: Error) =>
      toast({ title: 'Hub import failed', description: error.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setHubDialogOpen(false);
    setEditingHub(null);
    setName('');
    setCode('');
    setCity('');
    setZone('');
    setCluster('');
    setMetroType('');
    setCategory('');
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
    setCity(hub.city ?? '');
    setZone(hub.zone ?? '');
    setCluster(hub.cluster ?? '');
    setMetroType(hub.metroType ?? '');
    setCategory(hub.category ?? '');
    setStateId(hub.stateId == null ? '' : String(hub.stateId));
    setLocation({
      latitude: hub.latitude,
      longitude: hub.longitude,
      address: hub.address ?? '',
      city: hub.city,
      state: organization?.states.find(state => state.id === hub.stateId)?.name ?? null,
    });
    setRadiusM(hub.radiusM);
    setMaxGpsAccuracyM(hub.maxGpsAccuracyM);
    setActive(hub.active);
    setHubDialogOpen(true);
  };

  const beginCreating = () => {
    resetForm();
    setHubDialogOpen(true);
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
      city: city.trim(),
      zone: zone.trim() || null,
      cluster: cluster.trim() || null,
      metroType: metroType.trim() || null,
      category: category.trim() || null,
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
  const updateLocation = (next: PickedLocation) => {
    setLocation(next);
    if (next.city) setCity(next.city);
    if (next.state) {
      const state = organization?.states.find(value =>
        value.name.trim().toLowerCase() === next.state!.trim().toLowerCase(),
      );
      setStateId(state ? String(state.id) : '');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hub Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure delivery-hub geofences, attendance QR codes, and rider assignments.
          </p>
        </div>
        <Button type="button" onClick={beginCreating} className="shrink-0 shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Add new hub
        </Button>
      </div>

      <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50/40 to-indigo-50/30 shadow-sm">
        <CardHeader className="border-b border-slate-200/70 bg-white/70 pb-4">
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary"/>Import state, city, and hub hierarchy</CardTitle>
          <CardDescription>Upload an Excel sheet containing HubName, City, State, Zone, Cluster, Metro/Non-Metro, and Category. Existing hubs are updated with the sheet values.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
              <Upload className="w-4 h-4 text-muted-foreground"/>
              <span className="min-w-0 truncate">{importFile?.name ?? 'Choose .xlsx or .xls workbook'}</span>
              <input className="sr-only" type="file" accept=".xlsx,.xls" onChange={event => { setImportFile(event.target.files?.[0] ?? null); setImportResult(null); }}/>
            </label>
            <Button type="button" disabled={!importFile || importHubs.isPending} onClick={() => importFile && importHubs.mutate(importFile)}>
              {importHubs.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Upload className="w-4 h-4 mr-2"/>}
              {importHubs.isPending ? 'Importing…' : 'Import hubs'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Imported hubs are inactive until their precise map location is configured. City and state are saved as the initial address.</p>
          {importResult && <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600"/>
              <span className="font-medium">{importResult.totalRows} rows processed</span>
              <Badge variant="outline">{importResult.createdHubs} hubs created</Badge>
              <Badge variant="outline">{importResult.updatedHubs} hubs updated</Badge>
              <Badge variant="secondary">{importResult.existingRows} existing</Badge>
              <Badge variant={importResult.skippedRows ? 'destructive' : 'outline'}>{importResult.skippedRows} skipped</Badge>
            </div>
            <div><p className="text-xs font-medium text-muted-foreground mb-2">Detected headers</p><div className="flex flex-wrap gap-1.5">{importResult.detectedHeaders.map(header => <Badge key={header} variant="secondary">{header}</Badge>)}</div></div>
            {importResult.warnings.length > 0 && <details className="text-sm">
              <summary className="cursor-pointer flex items-center gap-2 text-amber-700"><AlertTriangle className="w-4 h-4"/>{importResult.warnings.length} import warnings</summary>
              <ul className="mt-2 max-h-44 list-disc overflow-auto pl-6 text-xs text-muted-foreground">{importResult.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
            </details>}
          </div>}
        </CardContent>
      </Card>

      <Dialog open={hubDialogOpen} onOpenChange={open => open ? setHubDialogOpen(true) : resetForm()}>
        <DialogContent className="max-h-[92vh] max-w-6xl border-slate-200 p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <MapPin className="w-5 h-5 text-primary" /> {editingHub ? `Edit ${editingHub.name}` : 'Add new hub'}
            </DialogTitle>
            <DialogDescription>
            Search for the hub or click the map to place it — the address and coordinates are filled in from
            your selection. Radius and permitted GPS error are independently configurable for every hub.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
          <form ref={formRef} onSubmit={submitHub} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input name="name" value={name} onChange={event => setName(event.target.value)} required /></div>
                <div><Label>Code</Label><Input name="code" value={code} onChange={event => setCode(event.target.value)} required /></div>
              </div>
              <div>
                <Label>City</Label>
                <Input name="city" value={city} onChange={event => setCity(event.target.value)} placeholder="Enter city" required />
              </div>
              <div>
                <Label>State</Label>
                <select name="stateId" value={stateId} onChange={event => setStateId(event.target.value)} required className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Select</option>
                  {organization?.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Zone</Label><Input name="zone" list="hub-zones" value={zone} onChange={event => setZone(event.target.value)} placeholder="North / South / East / West" /></div>
                <div><Label>Cluster</Label><Input name="cluster" list="hub-clusters" value={cluster} onChange={event => setCluster(event.target.value)} placeholder="e.g. Karnataka" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Metro/Non-Metro</Label><Input name="metroType" list="hub-metro-types" value={metroType} onChange={event => setMetroType(event.target.value)} placeholder="Metro / Non-Metro" /></div>
                <div><Label>Category</Label><Input name="category" list="hub-categories" value={category} onChange={event => setCategory(event.target.value)} placeholder="e.g. Super Critical" /></div>
              </div>
              <datalist id="hub-zones">{zoneOptions.map(value => <option key={value} value={value} />)}</datalist>
              <datalist id="hub-clusters">{clusterOptions.map(value => <option key={value} value={value} />)}</datalist>
              <datalist id="hub-metro-types">{metroTypeOptions.map(value => <option key={value} value={value} />)}</datalist>
              <datalist id="hub-categories">{categoryOptions.map(value => <option key={value} value={value} />)}</datalist>
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
              onChange={updateLocation}
              radiusM={Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 200}
            />
          </form>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Configured hubs</CardTitle>
          <CardDescription>Select a hub to display its QR code or assign a rider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4">
          {hubs.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={hubSearch}
                  onChange={event => setHubSearch(event.target.value)}
                  placeholder="Search hub, city, zone, cluster or category…"
                  aria-label="Search configured hubs"
                  className="h-10 border-slate-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-indigo-300 focus-visible:ring-indigo-200"
                />
                {hubSearch && (
                  <button
                    type="button"
                    onClick={() => setHubSearch('')}
                    aria-label="Clear hub search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs font-medium text-slate-500">
                {hubSearch.trim() ? `${filteredHubs.length} of ${hubs.length} hubs` : `${hubs.length} hubs`}
              </span>
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading hubs…</p>
          ) : hubs.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
              No hubs configured yet.
            </p>
          ) : filteredHubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-8 text-center">
              <Search className="mx-auto mb-2 h-5 w-5 text-indigo-400" />
              <p className="text-sm font-medium text-slate-700">No hubs match “{hubSearch.trim()}”</p>
              <button type="button" onClick={() => setHubSearch('')} className="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {filteredHubs.map(hub => (
                <div
                  key={hub.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-indigo-50/55 shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_8px_22px_rgba(79,70,229,0.12)]"
                >
                  <button onClick={() => setSelectedHub(hub)} className="min-w-0 flex-1 p-3 pb-2 text-left">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-800" title={hub.name}>{hub.name}</span>
                      <Badge
                        variant="outline"
                        className={hub.active
                          ? 'h-5 shrink-0 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700'
                          : 'h-5 shrink-0 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700'}
                      >
                        {hub.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide text-slate-500" title={hub.code}>
                      {hub.code}{hub.city ? ` · ${hub.city}` : ''}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {hub.radiusM}m radius <span className="text-slate-300">•</span> GPS ≤ {hub.maxGpsAccuracyM}m
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[hub.zone, hub.cluster, hub.metroType, hub.category].filter(Boolean).map(value => (
                        <span key={value!} className="rounded-md border border-indigo-100 bg-indigo-50/80 px-1.5 py-0.5 text-[9px] font-semibold leading-4 text-indigo-700">
                          {value}
                        </span>
                      ))}
                    </div>
                  </button>
                  <div className="flex items-end gap-2 border-t border-slate-100 bg-slate-50/65 px-3 py-2">
                    <button type="button" onClick={() => setSelectedHub(hub)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[10px] font-medium text-slate-600" title={hub.address ?? hub.city ?? undefined}>
                        {hub.address ?? hub.city ?? 'Location not set'}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
                        {hub.latitude.toFixed(6)}, {hub.longitude.toFixed(6)}
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-indigo-200 bg-white px-2 text-[10px] font-semibold text-indigo-700 shadow-sm hover:border-indigo-300 hover:bg-indigo-50"
                      onClick={() => beginEditing(hub)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    </div>
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
