import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { CalendarDays, Download, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type SheetAttendance = {
  date: string;
  userId: number;
  employeeId: string;
  bikerName: string;
  status: 'PRESENT' | 'ABSENT';
  sheetAgentName: string | null;
};

async function fetchAttendance(from: string, to: string): Promise<SheetAttendance[]> {
  const response = await fetch(`${BASE}/api/attendance/sheet?from=${from}&to=${to}`, { credentials: 'include' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return Array.isArray(data) ? data : [];
}

export default function Attendance() {
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { data: records = [], isLoading, error } = useQuery<SheetAttendance[]>({
    queryKey: ['sheet-attendance', fromDate, toDate],
    queryFn: () => fetchAttendance(fromDate, toDate),
  });
  const riders = [...new Map(records.map(record => [record.userId, record])).values()]
    .sort((a, b) => a.bikerName.localeCompare(b.bikerName));
  const visible = records
    .filter(record => selectedUserId === 'all' || record.userId === Number(selectedUserId))
    .sort((a, b) => b.date.localeCompare(a.date) || a.bikerName.localeCompare(b.bikerName));

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Attendance is based on FHRID and AgentName in uploaded BigQuery delivery sheets.
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
              <SelectTrigger><SelectValue placeholder="Select Biker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bikers</SelectItem>
                {riders.map(rider => <SelectItem key={rider.userId} value={String(rider.userId)}>{rider.bikerName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="w-auto" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="w-auto" />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : error ? (
            <div className="p-12 text-center text-destructive">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Could not load attendance records</p>
              <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
              No uploaded sheets were found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead><tr className="border-b bg-muted/10">
                  <th className="px-6 py-3 font-medium text-muted-foreground">Sheet Date</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Biker</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Employee ID / FHRID</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Sheet Agent Name</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Attendance</th>
                </tr></thead>
                <tbody className="divide-y">
                  {visible.map(record => <tr key={`${record.date}-${record.userId}`} className="hover:bg-muted/5">
                    <td className="px-6 py-3 font-medium">{format(new Date(`${record.date}T00:00:00`), 'dd MMM yyyy')}</td>
                    <td className="px-6 py-3 font-medium">{record.bikerName}</td>
                    <td className="px-6 py-3 font-mono text-xs">{record.employeeId}</td>
                    <td className="px-6 py-3">{record.sheetAgentName ?? '—'}</td>
                    <td className="px-6 py-3"><Badge variant={record.status === 'PRESENT' ? 'default' : 'destructive'}>{record.status === 'PRESENT' ? 'Present' : 'Absent'}</Badge></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
