import { useGetMe, useGetSimulatorStatus, useToggleSimulator, getGetSimulatorStatusQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Smartphone, Activity } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function Settings() {
  const { data: user } = useGetMe();
  const { data: simStatus } = useGetSimulatorStatus();
  const toggleSim = useToggleSimulator();
  const queryClient = useQueryClient();

  const handleToggle = (checked: boolean) => {
    toggleSim.mutate({ data: { running: checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSimulatorStatusQueryKey() });
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
              onCheckedChange={handleToggle}
              disabled={toggleSim.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
