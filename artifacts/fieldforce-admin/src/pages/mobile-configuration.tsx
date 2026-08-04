import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Smartphone, BatteryLow, Info, RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    credentials: 'include',
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface MobileConfig {
  id: number;
  name: string;
  pingIntervalSeconds: number;
  minPingIntervalSeconds: number;
  maxPingIntervalSeconds: number;
}

/** Common cadences, so the usual choices are one click rather than typing. */
const PRESETS = [
  { seconds: 5, label: '5s', hint: 'Live tracking' },
  { seconds: 15, label: '15s', hint: 'Balanced' },
  { seconds: 30, label: '30s', hint: 'Battery saver' },
  { seconds: 60, label: '60s', hint: 'Low power' },
];

export default function MobileConfiguration() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [interval, setInterval] = useState('');

  const { data: config, isLoading } = useQuery<MobileConfig>({
    queryKey: ['mobile-config'],
    queryFn: () => apiFetch('/api/mobile-config'),
  });

  // Seed the field once the saved value arrives, without clobbering edits.
  useEffect(() => {
    if (config && interval === '') setInterval(String(config.pingIntervalSeconds));
  }, [config, interval]);

  const min = config?.minPingIntervalSeconds ?? 5;
  const max = config?.maxPingIntervalSeconds ?? 300;

  const parsed = parseInt(interval, 10);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const dirty = config != null && valid && parsed !== config.pingIntervalSeconds;

  const saveMutation = useMutation({
    mutationFn: () => apiFetch('/api/mobile-config', {
      method: 'PATCH',
      body: JSON.stringify({ pingIntervalSeconds: parsed }),
    }),
    onSuccess: (data: MobileConfig) => {
      qc.setQueryData(['mobile-config'], data);
      toast({ title: `Mobile ping interval set to ${data.pingIntervalSeconds}s` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pingsPerHour = valid ? Math.round(3600 / parsed) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mobile App Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Settings the rider app reads at sign-in. Applies to every field agent in this account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="w-4 h-4" /> Location Ping Interval
          </CardTitle>
          <CardDescription>
            How often the rider app records a GPS position and uploads it. This is the mobile
            counterpart to the poll interval on each GPS vendor account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!isLoading && (
            <>
              <div className="flex flex-wrap gap-2">
                {PRESETS.filter(p => p.seconds >= min && p.seconds <= max).map(p => (
                  <Button
                    key={p.seconds}
                    type="button"
                    size="sm"
                    variant={parsed === p.seconds ? 'default' : 'outline'}
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2"
                    onClick={() => setInterval(String(p.seconds))}
                  >
                    <span className="text-sm font-semibold">{p.label}</span>
                    <span className="text-[10px] opacity-70">{p.hint}</span>
                  </Button>
                ))}
              </div>

              <div className="max-w-xs">
                <Label>Interval (seconds, {min}–{max})</Label>
                <Input
                  type="number"
                  min={min}
                  max={max}
                  value={interval}
                  onChange={e => setInterval(e.target.value)}
                  className="mt-1"
                />
                {interval !== '' && !valid ? (
                  <p className="text-xs text-destructive mt-1">
                    Enter a whole number between {min} and {max}.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {pingsPerHour} ping{pingsPerHour === 1 ? '' : 's'} per rider per hour while the app is open.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <BatteryLow className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Every ping is a GPS read plus an upload. Shorter intervals track riders more
                  precisely but drain batteries and grow the ping history faster. The live map
                  refreshes every 5 seconds, so anything below that will not look smoother.
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  The app reads this when a rider signs in and re-checks it periodically, so
                  already-running phones pick up a change without reinstalling. Pings only fire
                  while the app is in the foreground.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
                {config && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    disabled={!dirty}
                    onClick={() => setInterval(String(config.pingIntervalSeconds))}
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
                {config && (
                  <Badge variant="secondary" className="ml-auto font-mono text-xs">
                    Currently live: {config.pingIntervalSeconds}s
                  </Badge>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
