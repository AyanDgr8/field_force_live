import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, Plus, Play, Trash2, Zap, Link2, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { normalizeList } from '@/lib/normalize-list';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts?.headers }, credentials: 'include' });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

interface VendorAccount {
  id: number; vendorKey: string; displayName: string;
  pollIntervalSeconds: number; enabled: boolean;
  status: 'ACTIVE' | 'DEGRADED' | 'DISABLED';
  lastPolledAt?: string; lastSuccessAt?: string;
  lastError?: string; lastDeviceCount?: number;
  consecutiveFailures: number; usernameHint: string;
}

function StatusIndicator({ status }: { status: VendorAccount['status'] }) {
  if (status === 'ACTIVE') return <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Active</span>;
  if (status === 'DEGRADED') return <span className="flex items-center gap-1 text-red-500 text-xs"><AlertTriangle className="w-3.5 h-3.5" />Degraded</span>;
  return <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock className="w-3.5 h-3.5" />Disabled</span>;
}

const EMPTY_FORM = { vendorKey: 'BOLT', displayName: '', username: '', password: '', pollIntervalSeconds: '30', enabled: true };

export default function VendorAccounts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<'create' | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [testResult, setTestResult] = useState<{ accountId: number; ok: boolean; message: string } | null>(null);

  const { data: accounts = [], isLoading } = useQuery<VendorAccount[]>({
    queryKey: ['vendor-accounts'],
    queryFn: () => apiFetch('/api/vendor-accounts'),
    refetchInterval: 15_000,
  });
  const accountList = normalizeList<VendorAccount>(accounts, ['accounts']);

  const createMutation = useMutation({
    mutationFn: () => apiFetch('/api/vendor-accounts', {
      method: 'POST',
      body: JSON.stringify({
        vendorKey: form.vendorKey,
        displayName: form.displayName,
        credentials: { username: form.username, password: form.password },
        pollIntervalSeconds: parseInt(form.pollIntervalSeconds),
        enabled: form.enabled,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-accounts'] });
      setDialog(null);
      setForm({ ...EMPTY_FORM });
      toast({ title: 'Vendor account created. Polling started.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/vendor-accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-accounts'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/vendor-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-accounts'] });
      toast({ title: 'Vendor account deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/vendor-accounts/${id}/test`, { method: 'POST' }),
    onSuccess: (data, id) => {
      setTestResult({ accountId: id, ok: data.ok, message: data.message });
      qc.invalidateQueries({ queryKey: ['vendor-accounts'] });
    },
    onError: (e: any) => toast({ title: 'Test failed', description: e.message, variant: 'destructive' }),
  });

  const pollNowMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/vendor-accounts/${id}/poll-now`, { method: 'POST' }),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['vendor-accounts'] }), 3000);
      toast({ title: 'Poll triggered' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  function fmtTime(s?: string) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">GPS Vendor Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage hardware GPS tracker integrations — BOLT (track360) and others.</p>
        </div>
        <Button onClick={() => setDialog('create')} className="gap-2">
          <Plus className="w-4 h-4" /> Add Vendor Account
        </Button>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Shield className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>Credentials are encrypted at rest</strong> (AES-256-GCM) and never returned by the API or written to logs.
          All vendor API calls are server-side only.
        </div>
      </div>

      {/* Health panel */}
      <div className="grid gap-4">
        {isLoading && <Card><CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent></Card>}
        {!isLoading && accountList.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
              <Link2 className="w-8 h-8" />
              <p className="font-medium">No vendor accounts yet</p>
              <p className="text-sm">Add your first GPS hardware integration above.</p>
            </CardContent>
          </Card>
        )}
        {accountList.map(acc => (
          <Card key={acc.id} className={cn('shadow-sm', acc.status === 'DEGRADED' ? 'border-red-300' : '')}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Left: identity */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{acc.displayName}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{acc.vendorKey}</Badge>
                    <StatusIndicator status={acc.status} />
                    {acc.consecutiveFailures > 0 && (
                      <span className="text-xs text-red-500">{acc.consecutiveFailures} consecutive failure{acc.consecutiveFailures > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-4 mt-2 text-xs text-muted-foreground">
                    <div><span className="font-medium text-foreground">Devices</span><br />{acc.lastDeviceCount ?? '—'}</div>
                    <div><span className="font-medium text-foreground">Last Poll</span><br />{fmtTime(acc.lastPolledAt)}</div>
                    <div><span className="font-medium text-foreground">Last Success</span><br />{fmtTime(acc.lastSuccessAt)}</div>
                    <div><span className="font-medium text-foreground">Poll Interval</span><br />{acc.pollIntervalSeconds}s</div>
                  </div>
                  {acc.lastError && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1 font-mono truncate">
                      {acc.lastError}
                    </div>
                  )}
                  {testResult?.accountId === acc.id && (
                    <div className={cn('mt-2 text-xs rounded px-2 py-1', testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
                      {testResult.message}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    Username: <span className="font-mono">{acc.usernameHint}</span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Enabled</span>
                    <Switch
                      checked={acc.enabled}
                      onCheckedChange={v => toggleMutation.mutate({ id: acc.id, enabled: v })}
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => testMutation.mutate(acc.id)} disabled={testMutation.isPending}>
                      <Zap className="w-3 h-3" /> Test
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => pollNowMutation.mutate(acc.id)} disabled={pollNowMutation.isPending}>
                      <Play className="w-3 h-3" /> Poll Now
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => { if (confirm('Delete this vendor account?')) deleteMutation.mutate(acc.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={dialog === 'create'} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Vendor Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Vendor</Label>
              <Select value={form.vendorKey} onValueChange={v => setForm(f => ({ ...f, vendorKey: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLT">BOLT (track360 pull API)</SelectItem>
                  <SelectItem value="MOCK_BOLT">MOCK_BOLT (demo / no credentials needed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Display Name</Label>
              <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Delivery Fleet — BOLT" />
            </div>
            {form.vendorKey !== 'MOCK_BOLT' && (
              <>
                <div>
                  <Label>Username</Label>
                  <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoComplete="off" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                </div>
              </>
            )}
            <div>
              <Label>Poll Interval (seconds, 10–300)</Label>
              <Input type="number" min={10} max={300} value={form.pollIntervalSeconds}
                onChange={e => setForm(f => ({ ...f, pollIntervalSeconds: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> Credentials are encrypted before storage and never returned by the API.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={createMutation.isPending || !form.displayName || (form.vendorKey !== 'MOCK_BOLT' && (!form.username || !form.password))}
              onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Creating…' : 'Create & Start Polling'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
