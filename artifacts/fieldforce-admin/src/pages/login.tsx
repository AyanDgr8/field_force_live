import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLogin, useVerifyOtp } from '@workspace/api-client-react';
import { Activity, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const loginMutation = useLogin();
  const verifyOtpMutation = useVerifyOtp();

  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { username, password } }, {
      onSuccess: (data) => {
        setLoginToken(data.loginToken);
        setOtpSentTo(data.otpSentTo);
        setStep(2);
      },
      onError: (err: any) => {
        toast({
          title: "Login failed",
          description: err.message || "Invalid credentials",
          variant: "destructive"
        });
      }
    });
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;

    verifyOtpMutation.mutate({ data: { loginToken, code: otp } }, {
      onSuccess: () => {
        setLocation('/');
      },
      onError: (err: any) => {
        toast({
          title: "Verification failed",
          description: err.message || "Invalid OTP code",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-md">
            <Activity className="w-7 h-7 text-primary-foreground" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
          FieldForce Live
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Command Center Access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-card py-8 px-4 shadow-sm border sm:rounded-lg sm:px-10">
          {step === 1 ? (
            <form className="space-y-6" onSubmit={handleLoginSubmit}>
              <div>
                <Label htmlFor="username">Username</Label>
                <div className="mt-1">
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full"
                    placeholder="admin"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="mt-1">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <Button 
                  type="submit" 
                  className="w-full font-medium"
                  disabled={loginMutation.isPending || !username || !password}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Sign in <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleOtpSubmit}>
              <div>
                <h3 className="text-lg font-medium text-foreground mb-1">Verify it's you</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  We sent a 6-digit code to {otpSentTo}.
                </p>
                
                <div className="flex justify-center mb-6">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              <div>
                <Button 
                  type="submit" 
                  className="w-full font-medium"
                  disabled={verifyOtpMutation.isPending || otp.length !== 6}
                >
                  {verifyOtpMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Verify & Proceed"
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full mt-2"
                  onClick={() => setStep(1)}
                >
                  Back to login
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
