import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
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
  useRevokeTrackLink,
  getGetUserDayPlanQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Calendar as CalendarIcon, MapPin, 
  Plus, GripVertical, CheckCircle2, Clock, 
  Trash2, Link as LinkIcon, Loader2, Send,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

const stopSchema = z.object({
  customerCode: z.string().min(1, "Required"),
  priority: z.enum(['P1', 'P2', 'P3']),
  rawInput: z.string().min(5, "Full address required"),
  label: z.string().optional()
});

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

  const handleCreateLink = (stopId: number) => {
    createLinkMutation.mutate({ stopId }, {
      onSuccess: (link) => {
        navigator.clipboard.writeText(link.url);
        toast({ title: "Tracking link copied to clipboard" });
        queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
      }
    });
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
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
        
        <div className="flex items-center gap-3">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between bg-muted/40 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{dayPlan?.stops.length || 0} Stops Planned</h3>
                {dayPlan && dayPlan.stops.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatDistance(dayPlan.totalDistanceMeters)} • Est. {formatDuration(dayPlan.totalEtaSeconds)}
                  </p>
                )}
              </div>
            </div>
            
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button disabled={dayPlan?.status === 'PUBLISHED'}><Plus className="w-4 h-4 mr-2" /> Add Stop</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Visit Stop</DialogTitle>
                </DialogHeader>
                <AddStopForm 
                  userId={userId} 
                  date={selectedDate} 
                  onSuccess={() => {
                    setIsAddOpen(false);
                    queryClient.invalidateQueries({ queryKey: getGetUserDayPlanQueryKey({ userId, date: selectedDate }) });
                  }} 
                />
              </DialogContent>
            </Dialog>
          </div>

          {planLoading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : !dayPlan || dayPlan.stops.length === 0 ? (
            <div className="py-12 text-center border rounded-lg bg-card text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-3 text-muted" />
              <p>No stops scheduled for this date.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayPlan.stops.map((stop, i) => (
                <div key={stop.id} className="group flex items-stretch bg-card border rounded-lg overflow-hidden shadow-sm hover:shadow transition-shadow">
                  <div className="w-8 bg-muted/50 flex flex-col items-center justify-center border-r border-dashed text-muted-foreground cursor-grab">
                    <span className="text-xs font-bold mb-2">{i + 1}</span>
                    <GripVertical className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex-1 p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={stop.priority === 'P1' ? 'destructive' : stop.priority === 'P2' ? 'default' : 'secondary'} className="text-[10px] px-1 py-0 h-4">
                          {stop.priority}
                        </Badge>
                        <span className="font-semibold text-sm">{stop.customerCode}</span>
                        {stop.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <p className="text-sm text-muted-foreground">{stop.rawInput}</p>
                      {stop.label && <p className="text-xs text-muted-foreground mt-1">Note: {stop.label}</p>}
                    </div>
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleCreateLink(stop.id)} title="Generate Tracking Link">
                        <LinkIcon className="w-4 h-4" />
                      </Button>
                      {dayPlan.status === 'DRAFT' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteStop(stop.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Plan Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                <span className="text-sm font-medium text-muted-foreground">Current State</span>
                {dayPlan?.status === 'PUBLISHED' ? (
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Published</Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Draft</Badge>
                )}
              </div>

              {dayPlan?.status === 'DRAFT' && dayPlan.stops.length > 1 && (
                <div className="pt-2 space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handlePlanRoute}
                    disabled={planRouteMutation.isPending}
                  >
                    {planRouteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
                    Optimize Routing
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground leading-tight">
                    Automatically orders stops by priority and minimum travel distance.
                  </p>
                </div>
              )}

              {dayPlan?.status === 'DRAFT' && dayPlan.stops.length > 0 && (
                <div className="pt-2">
                  <Button 
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white" 
                    onClick={handlePublish}
                    disabled={publishMutation.isPending}
                  >
                    {publishMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Publish to Agent
                  </Button>
                </div>
              )}
              
              {dayPlan?.status === 'PUBLISHED' && (
                <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-md flex items-start gap-2 border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Plan is active. The agent can see these stops in their mobile app.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddStopForm({ userId, date, onSuccess }: { userId: number, date: string, onSuccess: () => void }) {
  const createStop = useCreateVisitStop();
  
  const form = useForm<z.infer<typeof stopSchema>>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      customerCode: '',
      priority: 'P2',
      rawInput: '',
      label: ''
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
        inputType: 'ADDRESS',
        rawInput: data.rawInput
      }
    }, {
      onSuccess
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="customerCode" render={({ field }) => (
            <FormItem>
              <FormLabel>Customer Code</FormLabel>
              <FormControl><Input {...field} placeholder="CUST-123" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="priority" render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="P1">P1 - High (SLA)</SelectItem>
                  <SelectItem value="P2">P2 - Normal</SelectItem>
                  <SelectItem value="P3">P3 - Low</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="rawInput" render={({ field }) => (
          <FormItem>
            <FormLabel>Full Address</FormLabel>
            <FormControl><Input {...field} placeholder="123 Main St, City..." /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="label" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Input {...field} placeholder="Ask for John at reception" /></FormControl>
          </FormItem>
        )} />
        <Button type="submit" className="w-full" disabled={createStop.isPending}>
          {createStop.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Add to Plan
        </Button>
      </form>
    </Form>
  );
}
