import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  getUserAttendanceReport,
  useListUsers,
  getGetUserAttendanceReportQueryKey,
  type AttendanceRecord,
} from '@workspace/api-client-react';
import { format, subDays } from 'date-fns';
import { CalendarDays, Download, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { normalizeList } from '@/lib/normalize-list';

function formatSessionDuration(loginAt: string | Date, logoutAt?: string | Date | null) {
  if (!logoutAt) return '—';
  const totalSeconds = Math.max(
    0,
    Math.floor((new Date(logoutAt).getTime() - new Date(loginAt).getTime()) / 1000),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

export default function Attendance() {
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const { data: users, isLoading: usersLoading } = useListUsers({ role: 'USER' });
  const userList = normalizeList<NonNullable<typeof users>[number]>(users, ['users']);

  const selectedUsers = selectedUserId === 'all'
    ? userList
    : userList.filter(user => user.id === Number(selectedUserId));
  const attendanceQueries = useQueries({
    queries: selectedUsers.map(user => {
      const params = { userId: user.id, from: fromDate, to: toDate };
      return {
        queryKey: getGetUserAttendanceReportQueryKey(params),
        queryFn: () => getUserAttendanceReport(params),
        enabled: Boolean(user.id),
      };
    }),
  });
  const recordList = attendanceQueries
    .flatMap((query, index) =>
      normalizeList<AttendanceRecord>(query.data, ['records', 'attendance']).map(record => ({
        ...record,
        rider: selectedUsers[index],
      })),
    )
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
  const isLoading = usersLoading || attendanceQueries.some(query => query.isLoading);
  const error = attendanceQueries.find(query => query.error)?.error as Error | undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track attendance shifts and locations. Mobile app connection is tracked separately.
          </p>
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
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bikers</SelectItem>
                {userList.map(u => (
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
          ) : error ? (
            <div className="p-12 text-center text-destructive">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Could not load attendance records</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : recordList.length === 0 ? (
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
                    <th className="px-6 py-3 font-medium text-muted-foreground">Biker</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Login Time</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground">Last Logout Time</th>
                    <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recordList.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/5">
                      <td className="px-6 py-3 font-medium">
                        {format(new Date(r.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-medium">{r.rider?.firstName} {r.rider?.lastName}</span>
                        <span className="block text-xs text-muted-foreground">{r.rider?.employeeCode}</span>
                      </td>
                      <td className="px-6 py-3">{format(new Date(r.loginAt), 'hh:mm:ss a')}</td>
                      <td className="px-6 py-3">{r.logoutAt ? format(new Date(r.logoutAt), 'hh:mm:ss a') : <Badge variant="secondary" className="text-[10px]">Still clocked in</Badge>}</td>
                      <td className="px-6 py-3 text-right font-mono font-medium">
                        {formatSessionDuration(r.loginAt, r.logoutAt)}
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
