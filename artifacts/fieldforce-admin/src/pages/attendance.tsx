import { useState } from 'react';
import { useGetUserAttendanceReport, useListUsers, getGetUserAttendanceReportQueryKey } from '@workspace/api-client-react';
import { format, subDays } from 'date-fns';
import { CalendarDays, Download, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function Attendance() {
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const { data: users } = useListUsers({ role: 'USER' });
  
  const activeUserId = selectedUserId !== 'all' ? Number(selectedUserId) : (users?.[0]?.id || 0);

  const attendanceParams = { userId: activeUserId, from: fromDate, to: toDate };
  const { data: records, isLoading } = useGetUserAttendanceReport(
    attendanceParams,
    { query: { enabled: !!activeUserId, queryKey: getGetUserAttendanceReportQueryKey(attendanceParams) } }
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Report</h1>
          <p className="text-sm text-muted-foreground mt-1">Track agent session hours and login locations.</p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <a href={`/api/attendance/export?from=${fromDate}&to=${toDate}`} download>
            <Download className="w-4 h-4" /> Export CSV
          </a>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="w-64">
            <Select value={activeUserId ? String(activeUserId) : ''} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Agent" />
              </SelectTrigger>
              <SelectContent>
                {users?.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.firstName} {u.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-auto" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-auto" />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : !records || records.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
              No attendance records found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b bg-muted/10">
                    <th className="px-6 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Login Time</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Logout Time</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/5">
                      <td className="px-6 py-3 font-medium">{r.date}</td>
                      <td className="px-6 py-3">{format(new Date(r.loginAt), 'HH:mm:ss')}</td>
                      <td className="px-6 py-3">{r.logoutAt ? format(new Date(r.logoutAt), 'HH:mm:ss') : <Badge variant="secondary" className="text-[10px]">Active</Badge>}</td>
                      <td className="px-6 py-3 text-right font-mono font-medium">
                        {r.totalHours ? r.totalHours.toFixed(2) + 'h' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}