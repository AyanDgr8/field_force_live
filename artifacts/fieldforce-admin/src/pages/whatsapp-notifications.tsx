import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { normalizeList } from '@/lib/normalize-list';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    credentials: 'include',
  });
  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) throw new Error(parsed?.error ?? raw ?? `HTTP ${response.status}`);
  return parsed;
}

type ProviderKey = 'META_CLOUD' | 'TWILIO' | 'CUSTOM';
type ChannelMode = 'BOTH' | 'WHATSAPP_ONLY' | 'EMAIL_ONLY';
type MessageMode = 'TEMPLATE' | 'TEXT';

interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'url';
  required: boolean;
  placeholder: string;
  help: string;
  where?: string;
}

interface ProviderSpec {
  key: ProviderKey;
  label: string;
  summary: string;
  docsUrl: string;
  defaultMessageMode: MessageMode;
  fields: CredentialField[];
  setupSteps: string[];
}

interface NotificationSpec {
  kind: string;
  name: string;
  language: string;
  category: 'AUTHENTICATION' | 'UTILITY';
  description: string;
  sampleBody: string;
  parameterLabels: string[];
}

interface TemplateConfig {
  name: string;
  language: string;
  category: 'AUTHENTICATION' | 'UTILITY';
}

interface Settings {
  source: 'DATABASE' | 'ENVIRONMENT' | 'NONE';
  configured: boolean;
  enabled: boolean;
  provider: ProviderKey;
  channelMode: ChannelMode;
  messageMode: MessageMode;
  defaultCountryCode: string;
  otpRecipients: string[];
  templates: Record<string, TemplateConfig>;
  credentials: Record<string, string>;
  secretHints: Record<string, string>;
  missingFields: string[];
  health: {
    status: 'ACTIVE' | 'DEGRADED' | 'DISABLED';
    lastError: string | null;
    lastSuccessAt: string | null;
    lastTestedAt: string | null;
    consecutiveFailures: number;
  };
}

interface LogRow {
  id: number;
  kind: string;
  channel: 'WHATSAPP' | 'EMAIL';
  provider: string | null;
  recipient: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
  createdAt: string;
}

const CHANNEL_MODE_LABELS: Record<ChannelMode, { label: string; description: string }> = {
  BOTH: {
    label: 'WhatsApp and email',
    description: 'Every notification goes out on both channels. Safest while WhatsApp is still being verified.',
  },
  WHATSAPP_ONLY: {
    label: 'WhatsApp only',
    description: 'Email is switched off completely. Only choose this once test messages arrive reliably.',
  },
  EMAIL_ONLY: {
    label: 'Email only',
    description: 'WhatsApp is paused; the original email behaviour is used.',
  },
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function WhatsAppNotifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: catalogue } = useQuery<{ providers: ProviderSpec[]; notifications: NotificationSpec[] }>({
    queryKey: ['whatsapp-providers'],
    queryFn: () => apiFetch('/api/notifications/whatsapp/providers'),
    staleTime: Infinity,
  });

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery<Settings>({
    queryKey: ['whatsapp-settings'],
    queryFn: () => apiFetch('/api/notifications/whatsapp/settings'),
  });

  const [provider, setProvider] = useState<ProviderKey>('META_CLOUD');
  const [enabled, setEnabled] = useState(false);
  const [channelMode, setChannelMode] = useState<ChannelMode>('BOTH');
  const [messageMode, setMessageMode] = useState<MessageMode>('TEMPLATE');
  const [countryCode, setCountryCode] = useState('91');
  const [otpRecipients, setOtpRecipients] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Record<string, TemplateConfig>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testNumber, setTestNumber] = useState('');

  // Server state is the source of truth until the operator starts editing; the
  // form is re-seeded whenever a fresh copy arrives.
  useEffect(() => {
    if (!settings) return;
    setProvider(settings.provider);
    setEnabled(settings.enabled);
    setChannelMode(settings.channelMode);
    setMessageMode(settings.messageMode);
    setCountryCode(settings.defaultCountryCode);
    setOtpRecipients(settings.otpRecipients.join(', '));
    setCredentials(settings.credentials);
    setTemplates(settings.templates);
  }, [settings]);

  const providers = catalogue?.providers ?? [];
  const spec = useMemo(
    () => providers.find(candidate => candidate.key === provider),
    [providers, provider],
  );
  const notificationSpecs = catalogue?.notifications ?? [];

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/notifications/whatsapp/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider,
          enabled,
          channelMode,
          messageMode,
          defaultCountryCode: countryCode.replace(/\D/g, '') || '91',
          otpRecipients: otpRecipients.split(',').map(entry => entry.trim()).filter(Boolean),
          credentials,
          templates,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      toast({ title: 'WhatsApp settings saved' });
    },
    onError: (e: Error) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' }),
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => apiFetch('/api/notifications/whatsapp/test-connection', { method: 'POST' }),
    onSuccess: (result: { detail?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      toast({ title: 'Credentials accepted', description: result?.detail });
    },
    onError: (e: Error) =>
      toast({ title: 'Connection failed', description: e.message, variant: 'destructive' }),
  });

  const testMessageMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/notifications/whatsapp/test-message', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: testNumber }),
      }),
    onSuccess: (result: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] });
      toast({ title: 'Test message sent', description: result?.message });
    },
    onError: (e: Error) =>
      toast({ title: 'Test message failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Cannot load WhatsApp settings</AlertTitle>
        <AlertDescription>
          {(error as Error)?.message ?? 'Unknown error'}
          <span className="mt-1 block text-xs">
            Only super admins may view or change notification credentials.
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  const health = settings?.health;
  const statusTone =
    health?.status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : health?.status === 'DEGRADED'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            WhatsApp Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deliver login codes, password resets, and account handovers over WhatsApp instead of email alone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('border px-3 py-1', statusTone)}>
            {health?.status ?? 'DISABLED'}
          </Badge>
          {settings?.source === 'ENVIRONMENT' && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
              Loaded from .env
            </Badge>
          )}
        </div>
      </div>

      {!settings?.configured && (
        <Alert className="border-amber-200 bg-amber-50/60">
          <KeyRound className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900">Credentials still needed</AlertTitle>
          <AlertDescription className="text-amber-800/90">
            WhatsApp is not sending yet. Open the <b>Credentials needed</b> tab for the full list of what to
            collect and where each value comes from, then fill in the connection form.
          </AlertDescription>
        </Alert>
      )}

      {health?.lastError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Last WhatsApp attempt failed</AlertTitle>
          <AlertDescription className="break-words">{health.lastError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="credentials">Credentials needed</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
        </TabsList>

        {/* ── Connection ─────────────────────────────────────────────────── */}
        <TabsContent value="connection" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Provider and delivery
              </CardTitle>
              <CardDescription>{spec?.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>WhatsApp provider</Label>
                  <Select
                    value={provider}
                    onValueChange={value => {
                      const next = value as ProviderKey;
                      setProvider(next);
                      // Credentials are provider-specific; carrying them across
                      // would show one provider's values under another's labels.
                      setCredentials(next === settings?.provider ? (settings?.credentials ?? {}) : {});
                      const nextSpec = providers.find(candidate => candidate.key === next);
                      if (nextSpec) setMessageMode(nextSpec.defaultMessageMode);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providers.map(entry => (
                        <SelectItem key={entry.key} value={entry.key}>{entry.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Which channels are used</Label>
                  <Select value={channelMode} onValueChange={value => setChannelMode(value as ChannelMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CHANNEL_MODE_LABELS) as ChannelMode[]).map(mode => (
                        <SelectItem key={mode} value={mode}>{CHANNEL_MODE_LABELS[mode].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{CHANNEL_MODE_LABELS[channelMode].description}</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Message mode</Label>
                  <Select value={messageMode} onValueChange={value => setMessageMode(value as MessageMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEMPLATE">Approved templates</SelectItem>
                      <SelectItem value="TEXT">Plain text</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {messageMode === 'TEMPLATE'
                      ? 'Required by Meta for any message you send first. Configure names in the Templates tab.'
                      : 'Only reaches people who messaged your number in the last 24 hours. Fine for sandbox testing.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Default country code</Label>
                  <Input
                    value={countryCode}
                    onChange={event => setCountryCode(event.target.value)}
                    placeholder="91"
                  />
                  <p className="text-xs text-muted-foreground">
                    Added to stored numbers that have no country code. 91 for India.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Login OTP override numbers</Label>
                <Input
                  value={otpRecipients}
                  onChange={event => setOtpRecipients(event.target.value)}
                  placeholder="+919876543210, +919812345678"
                />
                <p className="text-xs text-muted-foreground">
                  Optional, comma separated. When set, every dashboard login code goes to these numbers instead
                  of the admin's own — the WhatsApp equivalent of OTP_RECIPIENTS.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Send notifications over WhatsApp</Label>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    Cannot be switched on until every required credential below is filled in.
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> {spec?.label} credentials
              </CardTitle>
              <CardDescription>
                Secrets are encrypted before they are stored and are never sent back to this page. Leave a secret
                blank to keep the saved value.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {spec?.fields.map(field => {
                const isSecret = field.type === 'secret';
                const hint = settings?.secretHints?.[field.key];
                const isMissing = settings?.missingFields?.includes(field.key);
                const isLong = field.key === 'bodyTemplate';

                return (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`cred-${field.key}`}>{field.label}</Label>
                      {field.required
                        ? <Badge variant="outline" className="h-5 border-slate-300 px-1.5 text-[10px]">Required</Badge>
                        : <Badge variant="outline" className="h-5 border-slate-200 px-1.5 text-[10px] text-muted-foreground">Optional</Badge>}
                      {isMissing && (
                        <span className="text-[11px] font-medium text-amber-700">Not set yet</span>
                      )}
                    </div>

                    {isLong ? (
                      <Textarea
                        id={`cred-${field.key}`}
                        rows={4}
                        className="font-mono text-xs"
                        value={credentials[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={event =>
                          setCredentials(prev => ({ ...prev, [field.key]: event.target.value }))
                        }
                      />
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id={`cred-${field.key}`}
                          type={isSecret && !revealed[field.key] ? 'password' : 'text'}
                          autoComplete="off"
                          value={credentials[field.key] ?? ''}
                          placeholder={isSecret && hint ? `Saved (${hint}) — retype to replace` : field.placeholder}
                          onChange={event =>
                            setCredentials(prev => ({ ...prev, [field.key]: event.target.value }))
                          }
                        />
                        {isSecret && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setRevealed(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                            aria-label={revealed[field.key] ? 'Hide value' : 'Show value'}
                          >
                            {revealed[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">{field.help}</p>
                    {field.where && (
                      <p className="text-xs text-muted-foreground/80">
                        <span className="font-medium">Where to find it: </span>{field.where}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
            <Button
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending || !settings?.configured}
            >
              {testConnectionMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <ShieldCheck className="mr-2 h-4 w-4" />}
              Test connection
            </Button>
            {spec?.docsUrl && (
              <a
                href={spec.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Provider documentation <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" /> Send a test message
              </CardTitle>
              <CardDescription>
                Sends a real WhatsApp message using the saved credentials. Save first, then test.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1 space-y-1.5">
                  <Label htmlFor="test-number">Phone number</Label>
                  <Input
                    id="test-number"
                    value={testNumber}
                    onChange={event => setTestNumber(event.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <Button
                  onClick={() => testMessageMutation.mutate()}
                  disabled={testMessageMutation.isPending || !testNumber.trim()}
                >
                  {testMessageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send test
                </Button>
              </div>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  <span className="block font-medium text-foreground">Last success</span>
                  {formatDateTime(health?.lastSuccessAt)}
                </div>
                <div>
                  <span className="block font-medium text-foreground">Last tested</span>
                  {formatDateTime(health?.lastTestedAt)}
                </div>
                <div>
                  <span className="block font-medium text-foreground">Consecutive failures</span>
                  {health?.consecutiveFailures ?? 0}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Credentials needed ─────────────────────────────────────────── */}
        <TabsContent value="credentials" className="space-y-6">
          <Alert>
            <BookOpen className="h-4 w-4" />
            <AlertTitle>What you need to collect</AlertTitle>
            <AlertDescription>
              Every supported provider is listed below with the exact values to gather and where each one lives.
              Collect the ones for your chosen provider, then paste them into the Connection tab.
            </AlertDescription>
          </Alert>

          {providers.map(entry => (
            <Card key={entry.key} className={cn(entry.key === provider && 'border-primary/40 shadow-sm')}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{entry.label}</CardTitle>
                  {entry.key === provider && <Badge className="bg-primary/10 text-primary">Selected</Badge>}
                </div>
                <CardDescription>{entry.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Credential</th>
                        <th className="pb-2 pr-4 font-medium">Required</th>
                        <th className="pb-2 font-medium">Where to get it</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.fields.map(field => (
                        <tr key={field.key} className="border-b border-border/60 align-top">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-foreground">{field.label}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{field.key}</div>
                            {field.type === 'secret' && (
                              <Badge variant="outline" className="mt-1 h-5 border-red-200 bg-red-50 px-1.5 text-[10px] text-red-700">
                                Secret
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {field.required
                              ? <span className="font-medium text-foreground">Yes</span>
                              : <span className="text-muted-foreground">Optional</span>}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            <div>{field.help}</div>
                            {field.where && <div className="mt-1 text-xs text-muted-foreground/80">{field.where}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ClipboardCheck className="h-4 w-4 text-primary" /> Account setup steps
                  </h4>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {entry.setupSteps.map(step => <li key={step}>{step}</li>)}
                  </ol>
                </div>

                {entry.docsUrl && (
                  <a
                    href={entry.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Official documentation <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Server environment variables</CardTitle>
              <CardDescription>
                Optional. Set these in <span className="font-mono text-xs">.env</span> to configure WhatsApp
                before anyone signs in. A saved configuration on this page always takes priority.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-xs leading-relaxed">
{`WHATSAPP_PROVIDER=META_CLOUD          # META_CLOUD | TWILIO | CUSTOM
WHATSAPP_ENABLED=true
WHATSAPP_CHANNEL_MODE=BOTH            # BOTH | WHATSAPP_ONLY | EMAIL_ONLY
WHATSAPP_MESSAGE_MODE=TEMPLATE        # TEMPLATE | TEXT
WHATSAPP_DEFAULT_COUNTRY_CODE=91

# Meta Cloud API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_VERSION=v23.0

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Encrypts credentials saved from this page (64 hex characters)
CREDENTIALS_ENCRYPTION_KEY=`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Templates ──────────────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-6">
          <TemplatesPanel
            provider={provider}
            messageMode={messageMode}
            notificationSpecs={notificationSpecs}
            templates={templates}
            onChange={setTemplates}
            onSave={() => saveMutation.mutate()}
            saving={saveMutation.isPending}
          />
        </TabsContent>

        {/* ── Delivery log ───────────────────────────────────────────────── */}
        <TabsContent value="log">
          <DeliveryLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplatesPanel({
  provider,
  messageMode,
  notificationSpecs,
  templates,
  onChange,
  onSave,
  saving,
}: {
  provider: ProviderKey;
  messageMode: MessageMode;
  notificationSpecs: NotificationSpec[];
  templates: Record<string, TemplateConfig>;
  onChange: (next: Record<string, TemplateConfig>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { data: approved, refetch, isFetching } = useQuery<{
    ok: boolean;
    templates: Array<{ name: string; status: string; language: string; category: string }>;
    error?: string;
  }>({
    queryKey: ['whatsapp-approved-templates'],
    queryFn: () => apiFetch('/api/notifications/whatsapp/templates'),
    enabled: provider === 'META_CLOUD',
    retry: false,
  });

  const approvalByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of approved?.templates ?? []) map.set(entry.name, entry.status);
    return map;
  }, [approved]);

  return (
    <div className="space-y-6">
      <Alert>
        <ClipboardCheck className="h-4 w-4" />
        <AlertTitle>
          {messageMode === 'TEMPLATE' ? 'These templates must exist at your provider' : 'Templates are not in use'}
        </AlertTitle>
        <AlertDescription>
          {messageMode === 'TEMPLATE'
            ? provider === 'TWILIO'
              ? 'On Twilio, put the Content SID (HX…) of each approved content template in the name field.'
              : 'Create each template in the WhatsApp Manager using the exact body shown, then wait for approval. Parameters are filled in the order listed.'
            : 'Message mode is set to plain text, so the bodies below are sent as-is. Switch to approved templates before going live on the Meta Cloud API.'}
        </AlertDescription>
      </Alert>

      {provider === 'META_CLOUD' && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Check approval status
          </Button>
          {approved?.error && <span className="text-xs text-muted-foreground">{approved.error}</span>}
        </div>
      )}

      {notificationSpecs.map(notification => {
        const current = templates[notification.kind] ?? {
          name: notification.name,
          language: notification.language,
          category: notification.category,
        };
        const status = approvalByName.get(current.name);

        return (
          <Card key={notification.kind}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{notification.kind.replaceAll('_', ' ')}</CardTitle>
                <Badge variant="outline" className="text-[10px]">{current.category}</Badge>
                {status && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      status === 'APPROVED'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                  >
                    {status}
                  </Badge>
                )}
              </div>
              <CardDescription>{notification.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{provider === 'TWILIO' ? 'Content SID' : 'Template name'}</Label>
                  <Input
                    value={current.name}
                    onChange={event =>
                      onChange({ ...templates, [notification.kind]: { ...current, name: event.target.value } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Language code</Label>
                  <Input
                    value={current.language}
                    onChange={event =>
                      onChange({ ...templates, [notification.kind]: { ...current, language: event.target.value } })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Body to submit for approval
                </Label>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
                  {notification.sampleBody}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Parameters in order: {notification.parameterLabels.map((label, index) => `{{${index + 1}}} ${label}`).join(' · ')}
                  {notification.category === 'AUTHENTICATION' && ' · plus a copy-code button carrying the same code'}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save template names
      </Button>
    </div>
  );
}

function DeliveryLog() {
  const { data, isLoading, refetch, isFetching } = useQuery<LogRow[]>({
    queryKey: ['notification-logs'],
    queryFn: () => apiFetch('/api/notifications/logs?limit=100'),
    refetchInterval: 20_000,
  });
  const rows = normalizeList<LogRow>(data, ['logs']);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" /> Recent deliveries
          </CardTitle>
          <CardDescription>
            Both channels, newest first. Recipients are masked; message contents are never stored.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing sent yet. Use <b>Send a test message</b> on the Connection tab to produce the first entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Notification</th>
                  <th className="pb-2 pr-4 font-medium">Channel</th>
                  <th className="pb-2 pr-4 font-medium">Recipient</th>
                  <th className="pb-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">{row.kind.replaceAll('_', ' ')}</td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          row.channel === 'WHATSAPP'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600',
                        )}
                      >
                        {row.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{row.recipient}</td>
                    <td className="py-2.5">
                      {row.status === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                        </span>
                      ) : (
                        <div>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              row.status === 'FAILED' ? 'text-red-600' : 'text-muted-foreground',
                            )}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {row.status === 'FAILED' ? 'Failed' : 'Skipped'}
                          </span>
                          {row.errorMessage && (
                            <div className="mt-0.5 max-w-md break-words text-[11px] text-muted-foreground">
                              {row.errorMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
