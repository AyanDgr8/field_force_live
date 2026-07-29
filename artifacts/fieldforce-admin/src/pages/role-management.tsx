import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
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
type Role = 'SUPER_ADMIN' | 'STATE_ADMIN' | 'HUB_ADMIN' | 'USER';
type Bootstrap = {
  me: { id: number; role: Role }; creatableRoles: Role[];
  states: Array<{ id: number; name: string }>; hubs: Array<{ id: number; name: string; stateId?: number }>;
  vehicles: Array<{ id: number; registrationNumber: string; hubId?: number; status: string }>;
};
type Person = {
  id: number; firstName: string; lastName: string; employeeCode: string; email: string; phoneNumber: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER'; role: Role; status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  flipkartId?: string | null; stateId?: number | null; hubId?: number | null; vehicleId?: number | null;
  stateIds: number[]; hubIds: number[];
};
const names: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', STATE_ADMIN: 'State Admin', HUB_ADMIN: 'Hub Admin', USER: 'Biker / User' };

export default function RoleManagement({ role }: { role: Role }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [result, setResult] = useState<{ onboardingLink?: string; temporaryPassword?: string } | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const { data: bootstrap } = useQuery<Bootstrap>({ queryKey: ['organization-bootstrap'], queryFn: () => api('/api/organization/bootstrap') });
  const { data: people = [] } = useQuery<Person[]>({ queryKey: ['hierarchy-users', role], queryFn: () => api(`/api/hierarchy/users?role=${role}`) });
  const refresh = (title: string) => { qc.invalidateQueries({ queryKey: ['hierarchy-users', role] }); qc.invalidateQueries({ queryKey: ['organization-bootstrap'] }); setEditing(null); setResult(null); toast({ title }); };
  const create = useMutation({
    mutationFn: (body: unknown) => api('/api/hierarchy/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: data => { qc.invalidateQueries({ queryKey: ['hierarchy-users', role] }); setResult(data); toast({ title: `${names[role]} created` }); },
    onError: (error: Error) => toast({ title: 'Creation failed', description: error.message, variant: 'destructive' }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/api/hierarchy/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => refresh(`${names[role]} updated`),
    onError: (error: Error) => toast({ title: 'Update failed', description: error.message, variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/hierarchy/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hierarchy-users', role] }); toast({ title: 'Account deleted', description: 'The account and its records were permanently removed.' }); },
    onError: (error: Error) => toast({ title: 'Deletion failed', description: error.message, variant: 'destructive' }),
  });
  const allowed = bootstrap?.creatableRoles.includes(role);
  const canManage = (person: Person) => Boolean(allowed || bootstrap?.me.id === person.id || (bootstrap?.me.role === 'SUPER_ADMIN' && role === 'SUPER_ADMIN'));
  const canDelete = allowed || (bootstrap?.me.role === 'SUPER_ADMIN' && role === 'SUPER_ADMIN');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = {
      role, firstName: form.get('firstName'), lastName: form.get('lastName'), gender: form.get('gender'),
      employeeCode: form.get('employeeCode'), phoneNumber: form.get('phoneNumber'), email: form.get('email'),
      stateIds: form.getAll('stateIds').map(Number), hubIds: form.getAll('hubIds').map(Number),
      hubId: form.get('hubId') ? Number(form.get('hubId')) : null,
      vehicleId: form.get('vehicleId') ? Number(form.get('vehicleId')) : null,
      flipkartId: form.get('flipkartId') || null,
      ...(editing ? { status: form.get('status') } : {}),
    };
    if (editing) {
      const { role: _role, ...updateBody } = body;
      update.mutate({ id: editing.id, body: updateBody });
    } else create.mutate(body);
  };
  const pending = create.isPending || update.isPending;
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-bold">{names[role]} Management</h1><p className="text-sm text-muted-foreground mt-1">Create and manage {names[role].toLowerCase()} accounts within your assigned scope.</p></div>
    {!allowed && !editing && <Card className="border-amber-300 bg-amber-50/40"><CardContent className="p-5 text-sm">Your role cannot create {names[role]} accounts. Records you are permitted to edit remain manageable below.</CardContent></Card>}
    {(allowed || editing) && <Card><CardHeader><CardTitle className="flex items-center gap-2">{editing ? <Pencil className="w-5 h-5 text-primary"/> : <UserPlus className="w-5 h-5 text-primary"/>}{editing ? `Edit ${editing.firstName} ${editing.lastName}` : `Create ${names[role]}`}</CardTitle><CardDescription>Assignments are validated again by the server against your hierarchy.</CardDescription></CardHeader>
      <CardContent><form key={editing?.id ?? 'new'} onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><Label>First name</Label><Input name="firstName" defaultValue={editing?.firstName} required/></div><div><Label>Last name</Label><Input name="lastName" defaultValue={editing?.lastName} required/></div>
        <div><Label>Employee ID</Label><Input name="employeeCode" defaultValue={editing?.employeeCode} required/></div><div><Label>Flipkart / FHR ID</Label><Input name="flipkartId" defaultValue={editing?.flipkartId ?? ''} required={role === 'USER'}/></div>
        <div><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email} required/></div><div><Label>Phone</Label><Input name="phoneNumber" defaultValue={editing?.phoneNumber} required/></div>
        <div><Label>Gender</Label><select name="gender" defaultValue={editing?.gender ?? 'MALE'} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
        {editing && <div><Label>Status</Label><select name="status" defaultValue={editing.status} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option>INVITED</option><option>ACTIVE</option><option>SUSPENDED</option></select></div>}
        {role === 'STATE_ADMIN' && <div className="col-span-2"><Label>State scope (multiple allowed)</Label><div className="flex flex-wrap gap-3 mt-2">{bootstrap?.states.map(state => <label key={state.id} className="text-sm border rounded-md px-3 py-2"><input type="checkbox" name="stateIds" value={state.id} defaultChecked={editing?.stateIds?.includes(state.id)} className="mr-2"/>{state.name}</label>)}</div></div>}
        {role === 'HUB_ADMIN' && <div className="col-span-2"><Label>Hub scope (multiple allowed)</Label><div className="flex flex-wrap gap-3 mt-2">{bootstrap?.hubs.map(hub => <label key={hub.id} className="text-sm border rounded-md px-3 py-2"><input type="checkbox" name="hubIds" value={hub.id} defaultChecked={editing?.hubIds?.includes(hub.id)} className="mr-2"/>{hub.name}</label>)}</div></div>}
        {role === 'USER' && <><div><Label>Primary state</Label><select name="stateIds" defaultValue={editing?.stateId ?? ''} required className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select</option>{bootstrap?.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></div>
          <div><Label>Hub</Label><select name="hubId" defaultValue={editing?.hubId ?? ''} required className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select</option>{bootstrap?.hubs.map(hub => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></div>
          <div><Label>Vehicle</Label><select name="vehicleId" defaultValue={editing?.vehicleId ?? ''} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Unassigned</option>{bootstrap?.vehicles.filter(vehicle => vehicle.status === 'AVAILABLE' || vehicle.id === editing?.vehicleId).map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber}</option>)}</select></div></>}
        <div className="flex items-end gap-2"><Button type="submit" disabled={pending}>{editing ? 'Save changes' : 'Create account'}</Button>{editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="w-4 h-4 mr-2"/>Cancel</Button>}</div>
      </form>
      {result && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm"><ShieldCheck className="inline w-4 h-4 mr-2 text-emerald-600"/>Account created. {result.onboardingLink && <>Onboarding: <code>{result.onboardingLink}</code></>}{result.temporaryPassword && <>Temporary password: <code>{result.temporaryPassword}</code></>}</div>}
      </CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>{names[role]} accounts</CardTitle></CardHeader><CardContent>
      <div className="divide-y">{people.map(person => <div key={person.id} className="py-3 flex items-center justify-between gap-3"><div><div className="font-medium">{person.firstName} {person.lastName}</div><div className="text-xs text-muted-foreground">{person.employeeCode} · {person.email}{person.flipkartId ? ` · FHR ${person.flipkartId}` : ''}</div></div><div className="flex items-center gap-2"><Badge variant="outline">{person.status}</Badge>{canManage(person) && <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(person); setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-3.5 h-3.5 mr-2"/>Edit</Button>}{canDelete && person.id !== bootstrap?.me.id && <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${person.firstName} ${person.lastName}? The account and its records will be permanently removed. This cannot be undone.`)) remove.mutate(person.id); }}><Trash2 className="w-4 h-4"/></Button>}</div></div>)}{people.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No records in your scope.</p>}</div>
    </CardContent></Card>
  </div>;
}
