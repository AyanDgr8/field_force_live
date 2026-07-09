import { useState } from 'react';
import { useGetOnboardingByToken, useSubmitOnboardingConsent } from '@workspace/api-client-react';
import { Loader2, CheckCircle2, Shield, Smartphone, Apple, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

export default function PublicOnboarding({ params }: { params: { token: string } }) {
  const { data, isLoading, isError, refetch } = useGetOnboardingByToken(params.token);
  const consentMutation = useSubmitOnboardingConsent();
  const [agreed, setAgreed] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (isError || !data) {
    return <div className="min-h-screen flex items-center justify-center p-4 text-center text-muted-foreground">Invalid or expired onboarding link.</div>;
  }

  const isActivated = data.consentGivenAt !== null;

  const handleConsent = () => {
    if (!agreed) return;
    consentMutation.mutate({ token: params.token }, {
      onSuccess: () => refetch()
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Smartphone className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to FieldForce</h1>
          <p className="text-slate-600">Hi {data.userFirstName}, let's get your device setup.</p>
        </div>

        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          {!isActivated ? (
            <div className="space-y-6">
              <div className="bg-blue-50 text-blue-900 p-4 rounded-xl border border-blue-100 flex gap-4">
                <Shield className="w-6 h-6 shrink-0 mt-0.5 text-blue-600" />
                <div className="text-sm leading-relaxed">
                  <strong>Location Tracking Required</strong>
                  <p className="mt-1 opacity-90">
                    The FieldForce app requires background location access during your working hours to provide ETA updates to customers and optimize routing.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 pt-2">
                <Checkbox 
                  id="consent" 
                  checked={agreed} 
                  onCheckedChange={(c) => setAgreed(c as boolean)} 
                  className="mt-1"
                />
                <label 
                  htmlFor="consent" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700 cursor-pointer"
                >
                  I consent to sharing my device location data while on duty.
                </label>
              </div>

              <Button 
                className="w-full h-12 text-base font-semibold" 
                disabled={!agreed || consentMutation.isPending}
                onClick={handleConsent}
              >
                {consentMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Activate My Account
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Account Activated</h3>
                <p className="text-slate-500 mt-2 text-sm">Download the app to begin.</p>
              </div>

              <div className="space-y-3 pt-4">
                <a href={data.iosStoreUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3.5 transition-colors">
                  <Apple className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider opacity-70 leading-none mb-1">Download on the</div>
                    <div className="font-semibold leading-none">App Store</div>
                  </div>
                </a>
                <a href={data.androidStoreUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-3 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3.5 transition-colors">
                  <Play className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider opacity-80 leading-none mb-1">GET IT ON</div>
                    <div className="font-semibold leading-none">Google Play</div>
                  </div>
                </a>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
