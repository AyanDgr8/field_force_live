import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import RoleManagement from './role-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
async function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
type ImportResult = {
  fileName: string;
  detectedHeaders: string[];
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  warnings: string[];
};

export default function Bikers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const upload = useMutation({
    mutationFn: async (selected: File) => {
      const response = await fetch(`${BASE}/api/hierarchy/users/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: selected.name, base64: await base64(selected) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      return data as ImportResult;
    },
    onSuccess: data => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['hierarchy-users', 'USER'] });
      toast({ title: 'Biker workbook processed', description: `${data.createdRows} created, ${data.updatedRows} updated, ${data.skippedRows} skipped.` });
    },
    onError: (error: Error) => toast({ title: 'Biker import failed', description: error.message, variant: 'destructive' }),
  });

  return <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary"/>Import biker configuration</CardTitle>
        <CardDescription>
          Upload an Excel roster. The importer reads Employee ID, Name, State, and Hub headers, then creates new biker profiles or updates matching Employee/FHR IDs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
            <Upload className="h-4 w-4 text-muted-foreground"/>
            <span className="min-w-0 truncate">{file?.name ?? 'Choose .xlsx or .xls workbook'}</span>
            <input className="sr-only" type="file" accept=".xlsx,.xls" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); }}/>
          </label>
          <Button type="button" disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
            {upload.isPending ? 'Importing…' : 'Import bikers'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">New rows are saved as invited profiles. Because this workbook has no email, phone, or gender columns, those fields are marked for completion during profile review.</p>
        {result && <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
            <span className="font-medium">{result.totalRows} rows processed</span>
            <Badge variant="outline">{result.createdRows} created</Badge>
            <Badge variant="outline">{result.updatedRows} updated</Badge>
            <Badge variant={result.skippedRows ? 'destructive' : 'outline'}>{result.skippedRows} skipped</Badge>
          </div>
          <div><p className="text-xs font-medium text-muted-foreground mb-2">Detected headers</p><div className="flex flex-wrap gap-1.5">{result.detectedHeaders.map(header => <Badge key={header} variant="secondary">{header}</Badge>)}</div></div>
          {result.warnings.length > 0 && <details className="text-sm">
            <summary className="cursor-pointer flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4"/>{result.warnings.length} import warnings</summary>
            <ul className="mt-2 max-h-44 list-disc overflow-auto pl-6 text-xs text-muted-foreground">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
          </details>}
        </div>}
      </CardContent>
    </Card>
    <RoleManagement role="USER" />
  </div>;
}
