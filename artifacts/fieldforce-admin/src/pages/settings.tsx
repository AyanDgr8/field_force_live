import { useGetMe, useGetSimulatorStatus, useToggleSimulator, getGetSimulatorStatusQueryKey, useListDispositions, useCreateDisposition, useUpdateDisposition, useDeleteDisposition, getListDispositionsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Activity, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { data: user } = useGetMe();
  const { data: simStatus } = useGetSimulatorStatus();
  const toggleSim = useToggleSimulator();
  const queryClient = useQueryClient();

  const { data: dispositions } = useListDispositions();
  const createDisp = useCreateDisposition();
  const updateDisp = useUpdateDisposition();
  const deleteDisp = useDeleteDisposition();

  const handleToggleSim = (checked: boolean) => {
    toggleSim.mutate({ data: { running: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSimulatorStatusQueryKey() });
      }
    });
  };

  const handleAddDisposition = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const label = fd.get('label') as string;
    const sortOrder = Number(fd.get('sortOrder'));
    if (!label) return;
    createDisp.mutate({ data: { label, sortOrder: sortOrder || 0, active: true } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDispositionsQueryKey() });
        e.currentTarget.reset();
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your admin profile and system features.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Admin Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-y-4 text-sm">
            <div>
              <div className="text-muted-foreground mb-1">Name</div>
              <div className="font-medium text-foreground">{user?.firstName} {user?.lastName}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Email</div>
              <div className="font-medium text-foreground">{user?.email}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Organization ID</div>
              <div className="font-mono text-foreground">{user?.customerId}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Organization Name</div>
              <div className="font-medium text-foreground">{user?.customerName}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tag className="w-5 h-5 text-primary" /> Dispositions</CardTitle>
          <CardDescription>Configure visit closure outcomes for agents to select.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddDisposition} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Label</Label>
              <Input name="label" placeholder="e.g. Sale Closed, Follow Up" required />
            </div>
            <div className="w-24 space-y-1">
              <Label>Sort Order</Label>
              <Input name="sortOrder" type="number" defaultValue="0" />
            </div>
            <Button type="submit" disabled={createDisp.isPending}>Add</Button>
          </form>
          
          <div className="space-y-2 mt-4">
            {dispositions?.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/20">
                <div className="flex items-center gap-3">
                  <Switch 
                    checked={d.active} 
                    onCheckedChange={(checked) => updateDisp.mutate({ id: d.id, data: { active: checked } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDispositionsQueryKey() }) })}
                  />
                  <span className={cn("text-sm font-medium", !d.active && "text-muted-foreground line-through")}>{d.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded border">Order: {d.sortOrder}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => {
                    if (confirm(`Delete disposition "${d.label}"?`)) {
                      deleteDisp.mutate({ id: d.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDispositionsQueryKey() }) });
                    }
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {dispositions?.length === 0 && (
              <div className="text-center text-sm text-muted-foreground p-4 border border-dashed rounded">
                No dispositions configured.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200">
        <CardHeader className="bg-amber-50/50 pb-4 border-b border-amber-100">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Activity className="w-5 h-5" /> Developer Tools
          </CardTitle>
          <CardDescription className="text-amber-800/70">
            Features for testing and demonstration purposes.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sim-mode" className="text-base">Live Data Simulator</Label>
              <p className="text-sm text-muted-foreground max-w-md">
                Generates synthetic movement data for all offline agents to demonstrate map features. Disables actual live ingestion while active.
              </p>
            </div>
            <Switch 
              id="sim-mode" 
              checked={simStatus?.running || false} 
              onCheckedChange={handleToggleSim}
              disabled={toggleSim.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}