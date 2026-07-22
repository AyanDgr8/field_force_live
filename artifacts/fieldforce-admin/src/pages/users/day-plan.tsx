import { useState } from 'react';
import { format } from 'date-fns';
import {
  useGetUser,
  useGetUserDayPlan,
  useCreateVisitStop,
  useUpdateVisitStop,
  useDeleteVisitStop,
  usePlanRoute,
  usePublishDayPlan,
  useCreateTrackLink,
  getGetUserDayPlanQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar as CalendarIcon, MapPin,
  Plus, GripVertical, CheckCircle2, Clock,
  Trash2, Link as LinkIcon, Loader2, Send,
  Copy, Phone, User2, Navigation
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { formatDistance, formatDuration } from '@/lib/utils';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';

const stopSchema = z.object({
  customerCode: z.string().min(1, "Required"),
  priority: z.enum(['P1', 'P2', 'P3']),
  rawInput: z.string().min(5, "Full address required"),
  label: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional()
});

type StopStatus = 'PENDING' | 'EN_ROUTE' | 'REACHED' | 'COMPLETED' | 'SKIPPED';

function stopVisited(status: StopStatus) {
  return status === 'COMPLETED' || status === 'REACHED';
}

function StatusBadge({ status }: { status: StopStatus }) {
  const map: Record<StopStatus, { label: string; className: string }> = {
    COMPLETED: { label: 'Visited',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    REACHED:   { label: 'Reached',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    EN_ROUTE:  { label: 'En Route', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    PENDING:   { label: 'Pending',  className: 'bg-red-50 text-red-600 border-red-200' },
    SKIPPED:   { label: 'Skipped',  className: 'bg-slate-50 text-slate-500 border-slate-200' },
  };
  const { label, className } = map[status] ?? map.PENDING;
  return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 font-semibold', className)}>{label}</Badge>;
}

export default function UserDayPlan({ params }: { params: { id: string } }) {
  const userId = parseInt(params.id);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const { data: user } = useGetUser(userId);
  const { data: dayPlan, isLoading: planLoading } = useGetUserDayPlan({ userId, date: selectedDate });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const planRouteMutation = usePlanRoute();
  const publishMutation = usePublishDayPlan();
  const deleteStopMutation = useDeleteVisitStop();
  const createLinkMutation = useCreateTrackLink();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  const visitedCount = dayPlan?.stops.filter(s => stopVisited(s.status as StopStatus)).length ?? 0;
  const totalCount = dayPlan?.stops.length ?? 0;

  const handlePlanRoute = () => {
    if (!dayPlan) return;
    planRouteMutation.mutate({ dayPlanId: dayPlan.id }, {
      onSuccess: () => {
        toast({ title: "Route optimized successfully" });
        queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
      }
    });
  };

  const handlePublish = () => {
    if (!dayPlan) return;
    publishMutation.mutate({ dayPlanId: dayPlan.id }, {
      onSuccess: () => {
        toast({ title: "Day plan published to agent" });
        queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
      }
    });
  };

  const handleDeleteStop = (stopId: number) => {
    if (confirm("Remove this stop from the plan?")) {
      deleteStopMutation.mutate({ stopId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
        }
      });
    }
  };

  const handleCopyLink = (stopId: number) => {
    setCopyingId(stopId);
    createLinkMutation.mutate({ stopId }, {
      onSuccess: (link) => {
        const fullUrl = `${window.location.origin}${link.url}`;
        navigator.clipboard.writeText(fullUrl).then(() => {
          toast({ title: "Tracking link copied!", description: "Share this link with the customer so they can track the agent's ETA." });
        });
        setCopyingId(null);
        queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
      },
      onError: () => setCopyingId(null)
    });
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/users/${userId}`}>
            <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Day Plan Builder</h1>
            <p className="text-sm text-muted-foreground">{user?.firstName} {user?.lastName} • {user?.employeeCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border px-3 py-1.5 rounded-md">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm bg-transparent outline-none font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stop List */}
        <div className="lg:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="flex items-center justify-between bg-muted/40 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {totalCount === 0
                    ? 'No stops planned'
                    : `${visitedCount} of ${totalCount} visited`}
                </h3>
                {dayPlan && totalCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatDistance(dayPlan.totalDistanceMeters)} • Est. {formatDuration(dayPlan.totalEtaSeconds)}
                  </p>
                )}
              </div>
            </div>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" /> Add Stop
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Visit Stop</DialogTitle>
                  {dayPlan?.status === 'PUBLISHED' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                      This plan is already published. After adding stops, re-optimise and re-publish so the agent sees the changes.
                    </p>
                  )}
                </DialogHeader>
                <AddStopForm
                  userId={userId}
                  date={selectedDate}
                  onSuccess={() => {
                    setIsAddOpen(false);
                    queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
                    if (dayPlan?.status === 'PUBLISHED') {
                      toast({ title: "Stop added — re-publish required", description: "Re-optimise and publish so the agent sees the new stop." });
                    }
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Stops */}
          {planLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : totalCount === 0 ? (
            <div className="py-12 text-center border rounded-lg bg-card text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-3 text-muted" />
              <p>No stops scheduled for this date.</p>
              <p className="text-xs mt-1">Click <strong>Add Stop</strong> to plan the day.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayPlan!.stops.map((stop, i) => {
                const visited = stopVisited(stop.status as StopStatus);
                const isCopying = copyingId === stop.id;
                return (
                  <div
                    key={stop.id}
                    className={cn(
                      'group flex items-stretch bg-card border rounded-lg overflow-hidden shadow-sm hover:shadow transition-shadow',
                      visited ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-400'
                    )}
                  >
                    {/* Sequence + drag handle */}
                    <div className="w-8 bg-muted/30 flex flex-col items-center justify-center text-muted-foreground">
                      <span className="text-xs font-bold">{i + 1}</span>
                      <GripVertical className="w-3 h-3 mt-1 opacity-30 group-hover:opacity-80 transition-opacity" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 p-4">
                      {/* Top row: status badge + customer code + priority */}
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={stop.status as StopStatus} />
                        <Badge
                          variant={stop.priority === 'P1' ? 'destructive' : stop.priority === 'P2' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0 h-5"
                        >
                          {stop.priority}
                        </Badge>
                        <span className="font-semibold text-sm">{stop.customerCode}</span>
                        {stop.label && (
                          <span className="text-xs text-muted-foreground italic">— {stop.label}</span>
                        )}
                      </div>

                      {/* Address */}
                      <div className="flex items-start gap-2 mb-2">
                        <Navigation className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm font-medium leading-snug">{stop.rawInput}</p>
                      </div>

                      {/* Contact */}
                      {(stop.contactName || stop.contactPhone) && (
                        <div className="flex items-center gap-4 mt-1">
                          {stop.contactName && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <User2 className="w-3.5 h-3.5" />
                              <span>{stop.contactName}</span>
                            </div>
                          )}
                          {stop.contactPhone && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Phone className="w-3.5 h-3.5" />
                              <span>{stop.contactPhone}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-center justify-center gap-2 pr-3 pl-1">
                      {/* Copy tracking link — always visible */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => handleCopyLink(stop.id)}
                        disabled={isCopying}
                        title="Copy customer tracking link"
                      >
                        {isCopying
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <><Copy className="w-3.5 h-3.5 mr-1" /><span className="text-xs">Share</span></>
                        }
                      </Button>

                      {/* Delete (draft only) */}
                      {dayPlan!.status === 'DRAFT' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteStop(stop.id)}
                          title="Remove stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Plan Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                <span className="text-sm font-medium text-muted-foreground">Current State</span>
                {dayPlan?.status === 'PUBLISHED'
                  ? <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Published</Badge>
                  : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Draft</Badge>
                }
              </div>

              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{visitedCount}/{totalCount} stops</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${totalCount ? (visitedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {dayPlan?.status === 'DRAFT' && totalCount > 1 && (
                <div className="pt-1 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handlePlanRoute}
                    disabled={planRouteMutation.isPending}
                  >
                    {planRouteMutation.isPending
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Clock className="w-4 h-4 mr-2" />}
                    Optimize Routing
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground leading-tight">
                    Orders stops by priority and minimum travel distance.
                  </p>
                </div>
              )}

              {dayPlan?.status === 'DRAFT' && totalCount > 0 && (
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                >
                  {publishMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Send className="w-4 h-4 mr-2" />}
                  Publish to Agent
                </Button>
              )}

              {dayPlan?.status === 'PUBLISHED' && (
                <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-md flex items-start gap-2 border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Plan is active. The agent can see these stops in their mobile app.</p>
                </div>
              )}

              {/* Legend */}
              <div className="pt-2 border-t space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Legend</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span>Visited / Reached</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm bg-red-400" />
                  <span>Not yet visited</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm bg-blue-400" />
                  <span>Agent en route</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-100 bg-blue-50/30">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-2">
                <LinkIcon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Customer Tracking Links</p>
                  <p className="text-xs text-blue-700/80 mt-0.5 leading-relaxed">
                    Click <strong>Share</strong> on any stop to copy a link. Your customer opens it to see the agent's live distance and ETA to their location.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddStopForm({ userId, date, onSuccess }: { userId: number; date: string; onSuccess: () => void }) {
  const createStop = useCreateVisitStop();

  const form = useForm<z.infer<typeof stopSchema>>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      customerCode: '',
      priority: 'P2',
      rawInput: '',
      label: '',
      contactName: '',
      contactPhone: ''
    }
  });

  const onSubmit = (data: z.infer<typeof stopSchema>) => {
    createStop.mutate({
      id: userId,
      data: {
        visitDate: date,
        priority: data.priority as any,
        customerCode: data.customerCode,
        label: data.label,
        contactName: data.contactName || undefined,
        contactPhone: data.contactPhone || undefined,
        inputType: 'ADDRESS',
        rawInput: data.rawInput
      }
    }, { onSuccess });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="customerCode" render={({ field }) => (
            <FormItem>
              <FormLabel>Customer Code</FormLabel>
              <FormControl><Input {...field} placeholder="CUST-123" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="priority" render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="P1">P1 — High (SLA)</SelectItem>
                  <SelectItem value="P2">P2 — Normal</SelectItem>
                  <SelectItem value="P3">P3 — Low</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="rawInput" render={({ field }) => (
          <FormItem>
            <FormLabel>Full Address</FormLabel>
            <FormControl><Input {...field} placeholder="123 Main St, City, State…" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="label" render={({ field }) => (
          <FormItem>
            <FormLabel>Location Note <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
            <FormControl><Input placeholder="e.g. Back entrance, Warehouse 2" {...field} /></FormControl>
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="contactName" render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl><Input placeholder="e.g. John Doe" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="contactPhone" render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl><Input placeholder="e.g. +91 99999 00000" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
        <Button type="submit" disabled={createStop.isPending} className="w-full">
          {createStop.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Add to Plan
        </Button>
      </form>
    </Form>
  );
}
