import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock3, Download, FileCheck2, Loader2, MailSearch, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? data?.hint ?? `HTTP ${response.status}`);
  return data;
}
const localDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
const senderDisplayName = (report: Pick<Report, 'fromName' | 'fromAddress'>) => {
  if (report.fromName) return report.fromName;
  const localPart = report.fromAddress?.split('@')[0];
  return localPart
    ? localPart.split(/[._-]+/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ')
    : 'Sender unavailable';
};

type Report = {
  id: number; subject: string | null; fromName: string | null; fromAddress: string | null; receivedAt: string | null;
  reportType: 'DELIVERY' | 'BGV' | 'DROPOUT'; status: string; fileName: string | null;
  lastError: string | null; importJobId: number | null;
  files: Array<{
    id: number; fileName: string | null; fileSizeBytes: number | null; status: string; lastError: string | null;
    summary: { totalRows?: number; successfulRows?: number; matchedRiders?: number; excludedDuplicates?: number; warnings?: string[] } | null;
  }>;
};
type RunResult = {
  ran: boolean; reason: string | null; matched: number; imported: number; skipped: number; failed: number;
  reports: Array<{ messageId: string; subject: string; status: string; fileName?: string; error?: string; summary?: {
    totalRows: number; successfulRows: number; matchedRiders: number; excludedDuplicates: number; warnings: string[];
  } }>;
};

export default function EmailReportIngestion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [from, setFrom] = useState(localDateTime(subHours(new Date(), 12)));
  const [to, setTo] = useState(localDateTime(new Date()));
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const { data: status } = useQuery<{ configured: boolean; problem: string | null; user: string | null }>({
    queryKey: ['email-reports-status'], queryFn: () => api('/api/email-reports/status'),
  });
  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ['email-reports'], queryFn: () => api('/api/email-reports?limit=100'),
  });
  const run = useMutation({
    mutationFn: () => api('/api/email-reports/run', {
      method: 'POST', body: JSON.stringify({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }),
    }) as Promise<RunResult>,
    onSuccess: result => {
      setLastRun(result);
      qc.invalidateQueries({ queryKey: ['email-reports'] });
      toast({
        title: result.reason ? 'Mailbox fetch finished with an issue' : 'Mailbox fetch complete',
        description: result.reason ?? `${result.imported} of ${result.matched} matching emails imported.`,
        variant: result.reason ? 'destructive' : 'default',
      });
    },
    onError: (error: Error) => toast({ title: 'Mailbox fetch failed', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><MailSearch className="h-6 w-6 text-primary" /> Email Report Sync</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fetch delivery, BGV and dropout reports only for the date and time window you choose.</p>
      </div>

      <Card className="overflow-hidden border-indigo-200/70 bg-gradient-to-br from-white to-indigo-50/50 shadow-sm">
        <CardHeader>
          <CardTitle>Fetch reports from Gmail</CardTitle>
          <CardDescription>Emails outside this exact window are not inspected or imported. Previously imported messages are safely skipped.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && !status.configured && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{status.problem}</div>
          )}
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div><Label>From date and time</Label><Input type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} /></div>
            <div><Label>To date and time</Label><Input type="datetime-local" value={to} onChange={event => setTo(event.target.value)} /></div>
            <Button disabled={run.isPending || !from || !to} onClick={() => run.mutate()} className="min-w-40">
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailSearch className="mr-2 h-4 w-4" />}
              {run.isPending ? 'Fetching…' : 'Apply & fetch'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Mailbox: {status?.user ?? 'Not configured'} · Maximum window: 31 days · Messages are left unread/read state unchanged.</p>
        </CardContent>
      </Card>

      {lastRun && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Matched emails', lastRun.matched], ['Imported', lastRun.imported], ['Skipped', lastRun.skipped], ['Failed', lastRun.failed]].map(([label, count]) => (
            <Card key={String(label)}><CardContent className="p-4"><div className="text-2xl font-bold">{count}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Import history</CardTitle><CardDescription>Downloaded files, classification and processing result.</CardDescription></div>
          <Button type="button" variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['email-reports'] })}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : reports.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-2 h-6 w-6 opacity-30" />No reports fetched yet.</div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead><tr className="border-y bg-muted/30 text-xs text-muted-foreground"><th className="px-5 py-3">Received</th><th className="px-5 py-3">Sender</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Subject / files</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Downloads</th></tr></thead>
              <tbody className="divide-y">{reports.map(report => <tr key={report.id} className="hover:bg-muted/20">
                <td className="whitespace-nowrap px-5 py-3 text-xs">{report.receivedAt ? new Date(report.receivedAt).toLocaleString() : '—'}</td>
                <td className="min-w-48 px-5 py-3 align-top text-xs">
                  <div className="font-semibold text-foreground">{senderDisplayName(report)}</div>
                  <div className="break-all text-muted-foreground">{report.fromAddress ?? 'Sender unavailable'}</div>
                </td>
                <td className="px-5 py-3"><Badge variant="outline">{report.reportType}</Badge></td>
                <td className="min-w-80 max-w-2xl px-5 py-3 align-top">
                  <div className="whitespace-normal break-words font-medium leading-5">{report.subject}</div>
                  {report.files.length === 0 ? <div className="mt-1 whitespace-normal break-words text-xs text-muted-foreground">{report.lastError ?? 'No downloadable files found'}</div> : (
                    <div className="mt-2 space-y-1.5">{report.files.map(file => (
                      <div key={file.id} className="rounded-md border bg-slate-50 px-2.5 py-2 text-xs">
                        <div className="flex items-start gap-2">
                          <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                          <span className="min-w-0 flex-1 whitespace-normal break-all font-semibold leading-4">{file.fileName ?? 'Download failed'}</span>
                          <Badge variant={file.status === 'IMPORTED' ? 'default' : 'destructive'} className="h-5 text-[9px]">{file.status}</Badge>
                        </div>
                        {file.summary && <div className="mt-1 text-[10px] text-muted-foreground">
                          {file.summary.successfulRows ?? 0} imported · {file.summary.matchedRiders ?? 0} rider matches
                          {file.summary.excludedDuplicates ? ` · ${file.summary.excludedDuplicates} duplicates excluded` : ''}
                        </div>}
                        {file.lastError && <div className="mt-1 whitespace-normal break-words text-[10px] text-destructive">{file.lastError}</div>}
                      </div>
                    ))}</div>
                  )}
                </td>
                <td className="px-5 py-3"><Badge variant={report.status === 'IMPORTED' ? 'default' : report.status === 'FAILED' ? 'destructive' : 'secondary'}>{report.status}</Badge></td>
                <td className="px-5 py-3"><div className="flex flex-col gap-1">{report.files.filter(file => file.fileName).map(file => (
                  <Button key={file.id} asChild variant="outline" size="sm" className="h-auto max-w-72 justify-start whitespace-normal py-2 text-left"><a href={`${BASE}/api/email-report-files/${file.id}/file`}><Download className="mr-1 h-3.5 w-3.5 shrink-0" /><span className="break-all">{file.fileName ?? 'Download file'}</span></a></Button>
                ))}</div></td>
              </tr>)}</tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <Card className="border-emerald-200/60 bg-emerald-50/30"><CardContent className="flex gap-3 p-4 text-sm text-emerald-900"><FileCheck2 className="h-5 w-5 shrink-0" /><div><div className="font-semibold">EOD duplicate rule enabled</div><div className="text-xs text-emerald-800/80">Only delivery rows whose RunSheetStatus is ACTIVE or INACTIVE are imported. Blank statuses and repeated shipment rows are excluded.</div></div></CardContent></Card>
    </div>
  );
}
