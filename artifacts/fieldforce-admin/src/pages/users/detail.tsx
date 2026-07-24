import { useState } from 'react';
import { useLocation } from 'wouter';
import { 
  useGetUser, 
  useUpdateUser,
  useGetUserBreadcrumb,
  useGetUserPlacesCalendar,
  useListUserAlerts,
  useTriggerEmergencyAlert,
  useGetOnboardingInvite,
  useGetUserDayPlan,
  useListDispositions,
  useGetLivePositions
} from '@workspace/api-client-react';
import { LiveStatusBadge } from '@/components/ui/live-status-badge';
import { format } from 'date-fns';
import { 
  ArrowLeft, Map as MapIcon, Calendar, Activity, 
  AlertTriangle, Phone, Mail, MapPin, Building,
  ShieldAlert, Settings, Loader2, Copy, CheckCircle2, ChevronRight, Share,
  KeyRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function UserDetail({ params }: { params: { id: string } }) {
  const userId = parseInt(params.id);
  const { data: user, isLoading } = useGetUser(userId);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const { data: dayPlan } = useGetUserDayPlan({ userId, date: selectedDate });
  const { data: dispositions } = useListDispositions();
  const { data: livePositions } = useGetLivePositions();
  const livePos = livePositions?.find(p => p.userId === userId);

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
              {livePos && <LiveStatusBadge pos={livePos} />}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{user.employeeCode}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <ResetPasswordButton
            userId={userId}
            userName={`${user.firstName} ${user.lastName}`}
          />
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
              <CardTitle className="text-base flex items-center justify-between">
                <span>Day Plan & Visits</span>
                {dayPlan && (
                  <Badge variant="secondary">
                    {dayPlan.stops.filter(s => s.status === 'COMPLETED').length} / {dayPlan.stops.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {!dayPlan || dayPlan.stops.length === 0 ? (
                <div className="text-sm text-muted-foreground">No visits scheduled for this date.</div>
              ) : (
                <div className="space-y-3">
                  {dayPlan.stops.filter(s => s.status === 'COMPLETED').map(stop => {
                    const disp = dispositions?.find(d => d.id === stop.dispositionId);
                    return (
                      <div key={stop.id} className="border rounded-md p-3 text-sm space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold">{stop.customerCode}</span>
                          {disp && <Badge variant="outline" className="text-[10px]">{disp.label}</Badge>}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                          <div><span className="block font-medium text-foreground">Reached</span> {stop.reachedAt ? format(new Date(stop.reachedAt), 'HH:mm') : '-'}</div>
                          <div><span className="block font-medium text-foreground">Started</span> {stop.startedAt ? format(new Date(stop.startedAt), 'HH:mm') : '-'}</div>
                          <div><span className="block font-medium text-foreground">Closed</span> {stop.closedAt ? format(new Date(stop.closedAt), 'HH:mm') : '-'}</div>
                        </div>
                        {stop.notes && (
                          <div className="text-xs mt-2 bg-muted p-2 rounded truncate" title={stop.notes}>
                            📝 {stop.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {dayPlan.stops.filter(s => s.status === 'COMPLETED').length === 0 && (
                    <div className="text-sm text-muted-foreground">No completed visits yet.</div>
                  )}
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

function ResetPasswordButton({
  userId,
  userName,
}: {
  userId: number;
  userName: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = async () => {
    if (password.length < 8) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Use at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      toast({ variant: 'destructive', title: 'Passwords do not match' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/users/${userId}/password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Unable to reset password');

      toast({
        title: 'Password updated',
        description: `${userName} has been notified by email.`,
      });
      setPassword('');
      setConfirm('');
      setOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: error instanceof Error ? error.message : 'Unable to reset password',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound className="w-4 h-4 mr-2" /> Reset Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {userName}. The password itself will not be sent by email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Show password
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={reset} disabled={saving || !password || !confirm}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
