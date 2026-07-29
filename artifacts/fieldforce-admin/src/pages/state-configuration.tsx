import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinned, Pencil, Plus, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
}

type State = { id: number; name: string; code: string; active: boolean };
type Bootstrap = { states: State[]; me: { role: string } };

export default function StateConfiguration() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingState, setEditingState] = useState<State | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);
  const { data } = useQuery<Bootstrap>({
    queryKey: ['organization-bootstrap'],
    queryFn: () => api('/api/organization/bootstrap'),
  });

  const resetForm = () => {
    setEditingState(null);
    setName('');
    setCode('');
    setActive(true);
  };

  const create = useMutation({
    mutationFn: (body: unknown) =>
      api('/api/organization/states', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization-bootstrap'] });
      resetForm();
      toast({ title: 'State created' });
    },
    onError: (error: Error) =>
      toast({ title: 'Could not create state', description: error.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) =>
      api(`/api/organization/states/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization-bootstrap'] });
      resetForm();
      toast({ title: 'State updated' });
    },
    onError: (error: Error) =>
      toast({ title: 'Could not update state', description: error.message, variant: 'destructive' }),
  });

  const beginEditing = (state: State) => {
    setEditingState(state);
    setName(state.name);
    setCode(state.code);
    setActive(state.active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { name: name.trim(), code: code.trim(), ...(editingState ? { active } : {}) };
    if (editingState) update.mutate({ id: editingState.id, body });
    else create.mutate(body);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">State Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define operational states used for state-admin and hub scoping.
        </p>
      </div>

      {data?.me.role === 'SUPER_ADMIN' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              {editingState ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingState ? `Edit ${editingState.name}` : 'Add state'}
            </CardTitle>
            <CardDescription>
              State codes should remain stable after users are assigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap gap-3 items-end" onSubmit={submit}>
              <div>
                <Label>Name</Label>
                <Input name="name" value={name} onChange={event => setName(event.target.value)} required />
              </div>
              <div>
                <Label>Code</Label>
                <Input
                  name="code"
                  value={code}
                  onChange={event => setCode(event.target.value)}
                  required
                  placeholder="TG"
                />
              </div>
              {editingState && (
                <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                  <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
                  State is active
                </label>
              )}
              <Button disabled={isPending}>{editingState ? 'Save changes' : 'Create state'}</Button>
              {editingState && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {data?.states.map(state => (
          <Card key={state.id}>
            <CardContent className="p-5">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <MapPinned className="w-5 h-5 text-primary mb-2" />
                  <div className="font-semibold">{state.name}</div>
                  <div className="text-xs text-muted-foreground">{state.code}</div>
                </div>
                <Badge variant={state.active ? 'default' : 'secondary'}>
                  {state.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {data.me.role === 'SUPER_ADMIN' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => beginEditing(state)}
                >
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Edit state
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
