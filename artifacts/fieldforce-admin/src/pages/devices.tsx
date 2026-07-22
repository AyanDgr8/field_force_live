import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Cpu, Wifi, WifiOff, AlertTriangle, User, Car, Search, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { normalizeList } from '@/lib/normalize-list';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    credentials: 'include',
  });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

interface TrackedDevice {
  id: number; vendorKey: string; vendorDeviceId: string; imei?: string; name?: string;
  vendorType?: string; status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastFixAt?: string; lastLat?: number; lastLng?: number;
  lastSpeedKph?: number; lastIgnition?: boolean | null; lastAlarm?: string | null;
  totalDistanceRaw?: number;
  assignedUserId?: number | null;
  category?: { id: number; key: string; label: string; colorHex: string; iconKey: string } | null;
  assignedUser?: { id: number; firstName: string; lastName: string; employeeCode: string } | null;
}
interface User { id: number; firstName: string; lastName: string; employeeCode: string; }
interface DeviceCategory { id: number; key: string; label: string; colorHex: string; iconKey: string; }

function StatusBadge({ status }: { status: TrackedDevice['status'] }) {
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', {
      'border-green-500 text-green-600': status === 'ONLINE',
      'border-red-400 text-red-500': status === 'OFFLINE',
      'border-gray-400 text-gray-500': status === 'UNKNOWN',
    })}>
      {status === 'ONLINE' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {status}
    </Badge>
  );
}

function IgnitionDot({ val }: { val: boolean | null | undefined }) {
  if (val == null) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className={cn('inline-block w-2 h-2 rounded-full', val ? 'bg-green-500' : 'bg-gray-300')} title={val ? 'Ignition ON' : 'Ignition OFF'} />;
}

export default function Devices() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [assignDialog, setAssignDialog] = useState<TrackedDevice | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const { data: devices = [], isLoading } = useQuery<TrackedDevice[]>({
    queryKey: ['devices'],
    queryFn: () => apiFetch('/api/devices'),
    refetchInterval: 10_000,
  });

  const { data: categories = [] } = useQuery<DeviceCategory[]>({
    queryKey: ['device-categories'],
    queryFn: () => apiFetch('/api/device-categories'),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => apiFetch('/api/users?role=USER&status=ACTIVE'),
  });
  const deviceList = normalizeList<TrackedDevice>(devices, ['devices']);
  const categoryList = normalizeList<DeviceCategory>(categories, ['categories']);
  const userList = normalizeList<User>(users, ['users']);

  const assignMutation = useMutation({
    mutationFn: ({ deviceId, userId }: { deviceId: number; userId: number }) =>
      apiFetch(`/api/devices/${deviceId}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setAssignDialog(null);
      toast({ title: 'Device assigned' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const unassignMutation = useMutation({
    mutationFn: (deviceId: number) =>
      apiFetch(`/api/devices/${deviceId}/unassign`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      toast({ title: 'Device unassigned' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = deviceList.filter(d => {
    const q = search.toLowerCase();
    const nameMatch = (d.name ?? '').toLowerCase().includes(q) || (d.imei ?? '').toLowerCase().includes(q) || d.vendorDeviceId.toLowerCase().includes(q);
    const statusMatch = filterStatus === 'all' || d.status === filterStatus;
    const catMatch = filterCategoryId === 'all' || String(d.category?.id) === filterCategoryId;
    return nameMatch && statusMatch && catMatch;
  });

  const onlineCount = deviceList.filter(d => d.status === 'ONLINE').length;
  const alarmCount = deviceList.filter(d => d.lastAlarm).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Devices', value: deviceList.length, icon: <Cpu className="w-4 h-4 text-blue-500" /> },
          { label: 'Online', value: onlineCount, icon: <Wifi className="w-4 h-4 text-green-500" /> },
          { label: 'Offline', value: deviceList.length - onlineCount, icon: <WifiOff className="w-4 h-4 text-gray-400" /> },
          { label: 'Active Alarms', value: alarmCount, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
        ].map(s => (
          <Card key={s.label} className={cn('shadow-sm', alarmCount > 0 && s.label === 'Active Alarms' ? 'border-red-300 bg-red-50' : '')}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className="text-2xl font-bold font-mono">{s.value}</p>
              </div>
              <div className="w-8 h-8 bg-muted/50 rounded-md flex items-center justify-center">{s.icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2"><Car className="w-5 h-5" /> Tracked Devices</CardTitle>
            <div className="flex items-center gap-2 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search name, IMEI, device ID…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="OFFLINE">Offline</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryList.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['devices'] })}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-340px)]">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Device</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">IGN</th>
                  <th className="px-4 py-2 font-medium">Speed</th>
                  <th className="px-4 py-2 font-medium">Last Fix</th>
                  <th className="px-4 py-2 font-medium">Alarm</th>
                  <th className="px-4 py-2 font-medium">Assigned To</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No devices found</td></tr>
                )}
                {filtered.map(d => (
                  <tr key={d.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{d.name ?? d.vendorDeviceId}</div>
                      {d.imei && <div className="text-xs text-muted-foreground font-mono">{d.imei}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {d.category ? (
                        <Badge variant="outline" style={{ borderColor: d.category.colorHex, color: d.category.colorHex }} className="text-xs gap-1">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.category.colorHex }} />
                          {d.category.label}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs font-mono">{d.vendorKey}</Badge>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3"><IgnitionDot val={d.lastIgnition} /></td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {d.lastSpeedKph != null ? `${Math.round(d.lastSpeedKph)} km/h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {d.lastFixAt ? new Date(d.lastFixAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {d.lastAlarm ? (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="w-3 h-3" />{d.lastAlarm}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {d.assignedUser ? (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span>{d.assignedUser.firstName} {d.assignedUser.lastName}</span>
                          <span className="text-muted-foreground font-mono">({d.assignedUser.employeeCode})</span>
                        </div>
                      ) : <span className="text-muted-foreground italic">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setAssignDialog(d); setSelectedUserId(''); }}>
                          <UserCheck className="w-3 h-3" /> Assign
                        </Button>
                        {d.assignedUserId && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                            onClick={() => unassignMutation.mutate(d.id)}>
                            <UserX className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Assign dialog */}
      <Dialog open={!!assignDialog} onOpenChange={open => !open && setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Device — {assignDialog?.name ?? assignDialog?.vendorDeviceId}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Select User</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Choose a field agent…" /></SelectTrigger>
              <SelectContent>
                {userList.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.firstName} {u.lastName} ({u.employeeCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button disabled={!selectedUserId || assignMutation.isPending}
              onClick={() => assignMutation.mutate({ deviceId: assignDialog!.id, userId: parseInt(selectedUserId) })}>
              {assignMutation.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
