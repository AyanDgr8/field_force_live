import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Pencil, Upload, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
}
async function base64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }
type Verification = {
  id: number; employeeId: string; profileId?: string | null; hubName?: string | null; stateName?: string | null;
  nidStatus?: string | null; crcStatus?: string | null; nidRemarks?: string | null; crcRemarks?: string | null;
  status: string; source: string; updatedAt: string;
};
const statuses = ['NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'REVIEW_REQUIRED'];

export default function BackgroundVerification() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [editing, setEditing] = useState<Verification | null>(null);
  const { data: rows = [] } = useQuery<Verification[]>({ queryKey: ['verifications'], queryFn: () => api('/api/verifications') });
  const upload = useMutation({
    mutationFn: async (file: File) => api('/api/verifications/import', { method: 'POST', body: JSON.stringify({ fileName: file.name, base64: await base64(file) }) }),
    onSuccess: data => { qc.invalidateQueries({ queryKey: ['verifications'] }); toast({ title: `Imported ${data.successfulRows} verification records`, description: data.warnings?.join(' ') }); },
    onError: (e: Error) => toast({ title: 'Import failed', description: e.message, variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/api/verifications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['verifications'] }); setEditing(null); toast({ title: 'Verification updated' }); },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return; const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim() || null;
    update.mutate({ id: editing.id, body: {
      employeeId: value('employeeId'), profileId: value('profileId'), hubName: value('hubName'), stateName: value('stateName'),
      nidStatus: value('nidStatus'), crcStatus: value('crcStatus'), nidRemarks: value('nidRemarks'),
      crcRemarks: value('crcRemarks'), status: form.get('status'),
    } });
  };
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-bold">Background Verification</h1><p className="text-sm text-muted-foreground mt-1">Import BGV workbooks or update verification records manually.</p></div>
    <Card><CardHeader><CardTitle className="flex gap-2"><Upload className="w-5 h-5"/>Upload BGV sheet</CardTitle><CardDescription>Supports the supplied Employee ID, Profile_id, NID, CRC, Status, Hub, State, and Vehicle Status columns.</CardDescription></CardHeader><CardContent><input type="file" accept=".xlsx,.xls" onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); }}/><p className="text-xs text-muted-foreground mt-3">API endpoint: POST /api/verifications/api</p></CardContent></Card>
    {editing && <Card><CardHeader><CardTitle className="flex gap-2"><Pencil className="w-5 h-5"/>Edit {editing.employeeId}</CardTitle><CardDescription>Manual changes are recorded with a MANUAL source.</CardDescription></CardHeader><CardContent>
      <form key={editing.id} onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['employeeId','Employee/FHR ID'],['profileId','Profile ID'],['hubName','Hub'],['stateName','State'],['nidStatus','NID status'],['crcStatus','CRC status']].map(([name,label]) => <div key={name}><Label>{label}</Label><Input name={name} defaultValue={String(editing[name as keyof Verification] ?? '')} required={name === 'employeeId'}/></div>)}
        <div><Label>Overall status</Label><select name="status" defaultValue={editing.status} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{statuses.map(status => <option key={status}>{status}</option>)}</select></div>
        <div className="col-span-2"><Label>NID remarks</Label><Textarea name="nidRemarks" defaultValue={editing.nidRemarks ?? ''}/></div>
        <div className="col-span-2"><Label>CRC remarks</Label><Textarea name="crcRemarks" defaultValue={editing.crcRemarks ?? ''}/></div>
        <div className="col-span-2 flex gap-2"><Button disabled={update.isPending}>Save changes</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-2"/>Cancel</Button></div>
      </form>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex gap-2"><FileCheck2 className="w-5 h-5"/>Verification register</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Employee/FHR ID</th><th>Hub / State</th><th>NID</th><th>CRC</th><th>Overall</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id} className="border-b"><td className="p-2 font-mono">{row.employeeId}<div className="text-xs text-muted-foreground">{row.profileId}</div></td><td>{row.hubName}<div className="text-xs text-muted-foreground">{row.stateName}</div></td><td>{row.nidStatus}<div className="text-xs max-w-52 truncate">{row.nidRemarks}</div></td><td>{row.crcStatus}<div className="text-xs max-w-52 truncate">{row.crcRemarks}</div></td><td><Badge variant="outline">{row.status}</Badge></td><td>{row.source}</td><td><Button type="button" variant="outline" size="sm" onClick={() => { setEditing(row); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-3.5 h-3.5 mr-2"/>Edit</Button></td></tr>)}
    </tbody></table></div></CardContent></Card>
  </div>;
}
