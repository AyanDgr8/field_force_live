import { useGetLivePositions, useListUserAlerts, LivePosition, getGetLivePositionsQueryKey, getListUserAlertsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Clock, ShieldAlert, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function UserAlertsPanel({ pos }: { pos: LivePosition }) {
  const queryClient = useQueryClient();
  const { data: alerts } = useListUserAlerts(pos.userId, { query: { enabled: !!pos.userId, refetchInterval: 5000, queryKey: getListUserAlertsQueryKey(pos.userId) } });

  const acknowledge = async (alertId: number) => {
    await fetch(`/api/users/${pos.userId}/alerts/${alertId}/acknowledge`, { method: 'POST', credentials: 'include' });
    queryClient.invalidateQueries({ queryKey: getListUserAlertsQueryKey(pos.userId) });
    queryClient.invalidateQueries({ queryKey: getGetLivePositionsQueryKey() });
  };
  const activeAlerts = alerts?.filter(a => !a.acknowledgedAt) || [];
  
  if (activeAlerts.length === 0) return null;
  
  return (
    <Card className="border-destructive shadow-sm overflow-hidden animate-in fade-in zoom-in">
      <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
            {pos.firstName[0]}{pos.lastName[0]}
          </div>
          <div>
            <h3 className="font-semibold text-lg">{pos.firstName} {pos.lastName}</h3>
            <span className="text-sm opacity-80">{pos.employeeCode}</span>
          </div>
        </div>
        <Badge variant="outline" className="bg-white/10 text-white border-transparent">
          {pos.liveStatus || pos.status}
        </Badge>
      </div>
      <div className="divide-y divide-destructive/10">
        {activeAlerts.map(alert => (
          <div key={alert.id} className="p-4 flex items-start justify-between bg-destructive/5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {alert.direction === 'ADMIN_TO_USER' ? (
                  <Phone className="w-5 h-5 text-destructive" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                )}
              </div>
              <div>
                <div className="font-medium text-destructive">
                  {alert.direction === 'ADMIN_TO_USER' ? 'Admin requested callback' : 'Emergency SOS triggered'}
                </div>
                <div className="text-sm text-destructive/80 mt-1">{alert.message}</div>
                <div className="text-xs text-destructive/60 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {format(new Date(alert.triggeredAt), 'MMM d, HH:mm:ss')}
                </div>
              </div>
            </div>
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white" onClick={() => acknowledge(alert.id)}>
              Acknowledge
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AlertsList() {
  const { data: positions } = useGetLivePositions({ query: { refetchInterval: 5000, queryKey: getGetLivePositionsQueryKey() } });
  const usersWithAlerts = positions?.filter(p => p.emergencyActive) || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-destructive flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" /> Emergency Alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Fleet-wide priority notifications and emergency callbacks.</p>
      </div>
      
      {usersWithAlerts.length === 0 ? (
        <Card className="border-destructive/20 shadow-sm overflow-hidden animate-in fade-in">
          <div className="p-12 text-center flex flex-col items-center justify-center bg-destructive/5 text-destructive">
            <ShieldAlert className="w-12 h-12 mb-4 opacity-50" />
            <h3 className="font-semibold text-lg">No Active Alerts</h3>
            <p className="text-sm opacity-70 mt-2 max-w-sm">
              The fleet is operating normally. When an agent triggers an SOS or an admin requests an emergency callback, it will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {usersWithAlerts.map(pos => (
            <UserAlertsPanel key={pos.userId} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}