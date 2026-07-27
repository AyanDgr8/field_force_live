import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ExternalLink, QrCode, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const fallbackMobileAppUrl =
  import.meta.env.VITE_MOBILE_APP_URL ||
  (import.meta.env.DEV
    ? `exp://${window.location.hostname}:8081`
    : 'https://mwmcrm.voicemeetme.net');

export default function MobileAppQrCode() {
  const [copied, setCopied] = useState(false);
  const [mobileAppUrl, setMobileAppUrl] = useState(fallbackMobileAppUrl);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let active = true;
    const refreshUrl = async () => {
      try {
        const response = await fetch('/__mobile-app-url', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json()) as { url?: string };
        if (active && body.url) setMobileAppUrl(body.url);
      } catch {
        // Metro may still be starting; the next poll will retry.
      }
    };

    void refreshUrl();
    const timer = window.setInterval(refreshUrl, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const isTunnel = mobileAppUrl.includes('.exp.direct');

  const copyUrl = async () => {
    await navigator.clipboard.writeText(mobileAppUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center py-8">
      <Card className="w-full overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/20 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <QrCode className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">FieldForce Mobile App</CardTitle>
          <CardDescription>
            Scan this QR code with your phone to open the agent app.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-6 p-8">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <QRCodeSVG
              value={mobileAppUrl}
              size={280}
              level="M"
              marginSize={1}
              title="FieldForce mobile app QR code"
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Local development</p>
              <p className="mt-1 text-muted-foreground">
                {isTunnel
                  ? 'Expo tunnel detected. This is the same QR target shown in the terminal.'
                  : 'LAN mode detected. Keep the phone and computer on the same network.'}
              </p>
            </div>
          </div>

          <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border bg-background p-2">
            <code className="min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground">
              {mobileAppUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copyUrl}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
            <Button size="sm" asChild>
              <a href={mobileAppUrl}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
