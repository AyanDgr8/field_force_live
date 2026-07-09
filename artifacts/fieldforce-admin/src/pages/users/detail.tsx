import { useState } from 'react';
import { useLocation } from 'wouter';
import { 
  useGetUser, 
  useUpdateUser,
  useGetUserBreadcrumb,
  useGetUserPlacesCalendar,
  useListUserAlerts,
  useTriggerEmergencyAlert,
  useGetOnboardingInvite
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { 
  ArrowLeft, Map as MapIcon, Calendar, Activity, 
  AlertTriangle, Phone, Mail, MapPin, Building,
  ShieldAlert, Settings, Loader2, Copy, CheckCircle2, ChevronRight, Share
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function UserDetail({ params }: { params: { id: string } }) {
  const userId = parseInt(params.id);
  const { data: user, isLoading } = useGetUser(userId);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!user) return <div className="p-8 text-center">User not found</div>;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/users">
            <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{user.firstName} {user.lastName}</h1>
              {user.role === 'ADMIN' ? (
                <Badge variant="secondary" className="bg-amber-50 text-amber-700">Admin</Badge>
              ) : (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700">Agent</Badge>
              )}
              {user.status === 'ACTIVE' ? (
                <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">Active</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">{user.status}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{user.employeeCode}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {user.role === 'USER' && (
            <Link href={`/users/${user.id}/day-plan`}>
              <Button><Calendar className="w-4 h-4 mr-2" /> Day Plan Builder</Button>
            </Link>
          )}
          <EmergencyAlertButton userId={userId} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile & Addresses */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{user.phoneNumber}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{user.email}</span>
              </div>
              {user.status === 'INVITED' && user.role === 'USER' && (
                <div className="pt-2">
                  <InviteLinkCard userId={userId} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">Saved Locations</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {user.addresses.map((addr, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {addr.type === 'HOME' ? <MapPin className="w-4 h-4 text-muted-foreground" /> : <Building className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-0.5">{addr.type.replace('_', ' ')}</div>
                    <div className="text-sm">{addr.rawAddress}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Middle/Right: Interactive History (Breadcrumb/Calendar) */}
        <div className="md:col-span-2 space-y-6">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <MapIcon className="w-4 h-4" /> Movement History Replay
              </CardTitle>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm border rounded px-2 py-1 bg-transparent"
              />
            </CardHeader>
            <CardContent className="flex-1 p-0 relative">
              <BreadcrumbMap userId={userId} date={selectedDate} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InviteLinkCard({ userId }: { userId: number }) {
  const { data, isLoading } = useGetOnboardingInvite(userId);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <div className="text-xs text-muted-foreground animate-pulse">Loading invite link...</div>;
  if (!data) return null;

  const copy = () => {
    navigator.clipboard.writeText(data.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-amber-50 border border-amber-100 p-3 rounded-md">
      <div className="text-xs font-medium text-amber-800 mb-2">Pending Onboarding</div>
      <div className="flex gap-2">
        <input readOnly value={data.deepLink} className="flex-1 text-xs bg-white/50 border-amber-200 rounded px-2" />
        <Button size="icon" variant="outline" className="w-8 h-8 bg-white" onClick={copy}>
          {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-amber-700" />}
        </Button>
      </div>
    </div>
  );
}

function EmergencyAlertButton({ userId }: { userId: number }) {
  const { toast } = useToast();
  const alertMutation = useTriggerEmergencyAlert();

  const trigger = () => {
    if (confirm('Trigger a priority emergency callback alert for this agent?')) {
      alertMutation.mutate({ id: userId, data: { message: "ADMIN_CALLBACK_REQUEST" } }, {
        onSuccess: () => toast({ title: "Alert triggered", description: "Agent has been notified." }),
        onError: () => toast({ title: "Failed to trigger alert", variant: "destructive" })
      });
    }
  };

  return (
    <Button variant="destructive" onClick={trigger} disabled={alertMutation.isPending}>
      {alertMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
      Trigger Alert
    </Button>
  );
}

function BreadcrumbMap({ userId, date }: { userId: number, date: string }) {
  const { data: breadcrumb, isLoading } = useGetUserBreadcrumb({ userId, date });

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-muted/10 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
        <MapIcon className="w-8 h-8 text-primary/40" />
      </div>
      <h3 className="font-medium text-lg mb-2">Breadcrumb Replay</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">
        Requires Google Maps API Key to render path polyline and playback animation.
      </p>
      
      {breadcrumb && breadcrumb.length > 0 ? (
        <div className="w-full max-w-md bg-card border rounded-md p-4 text-left shadow-sm">
          <div className="text-sm font-semibold mb-3 border-b pb-2">Data payload received:</div>
          <div className="text-xs font-mono text-muted-foreground max-h-40 overflow-y-auto">
            {breadcrumb.length} pings recorded on this date.
            <br />
            First ping: {format(new Date(breadcrumb[0].recordedAt), 'HH:mm:ss')}
            <br />
            Last ping: {format(new Date(breadcrumb[breadcrumb.length-1].recordedAt), 'HH:mm:ss')}
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 bg-card border rounded-md text-sm text-muted-foreground">
          No location history found for this date.
        </div>
      )}
    </div>
  );
}
