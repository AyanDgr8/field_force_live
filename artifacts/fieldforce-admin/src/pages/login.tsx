import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useLogin, useVerifyOtp } from '@workspace/api-client-react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bike,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  LockKeyhole,
  MapPin,
  RadioTower,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-white selection:bg-amber-400/30">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -bottom-56 right-[-8rem] h-[620px] w-[620px] rounded-full bg-amber-400/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'linear-gradient(to bottom right, black, transparent 72%)',
          }}
        />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[1.15fr_.85fr]">
        <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden border-r border-white/10 px-10 py-9 lg:flex xl:px-16 xl:py-12">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_12px_42px_rgba(249,146,7,.28)]">
              <Activity className="h-6 w-6 text-[#07111f]" strokeWidth={2.5} />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#07111f] bg-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-[-0.03em]">FieldForce Live</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/40">Operations intelligence</p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl py-12">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3.5 py-2 text-xs font-semibold text-cyan-100/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Built for every mile of the operation
            </div>
            <h1 className="max-w-xl text-5xl font-extrabold leading-[1.04] tracking-[-0.055em] xl:text-7xl">
              Your entire field
              <span className="block bg-gradient-to-r from-amber-300 via-orange-400 to-amber-200 bg-clip-text text-transparent">
                operation, live.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-300/70 xl:text-lg">
              One secure command center for riders, hubs, vehicles, attendance,
              deliveries and the decisions that keep everything moving.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[
                { icon: Users, value: '4-level', label: 'Role hierarchy' },
                { icon: MapPin, value: 'Live', label: 'Hub intelligence' },
                { icon: Bike, value: '24/7', label: 'Fleet visibility' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="group rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-amber-300/25 hover:bg-white/[0.065]">
                  <Icon className="mb-5 h-5 w-5 text-amber-300" />
                  <p className="text-xl font-bold tracking-tight">{value}</p>
                  <p className="mt-1 text-[11px] text-white/40">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-white/30">
            <span>© {new Date().getFullYear()} FieldForce Live</span>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              All systems operational
            </div>
          </div>

          <div className="pointer-events-none absolute right-[7%] top-[14%] h-72 w-72 opacity-50">
            <div className="absolute left-4 top-16 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_20px_4px_rgba(103,232,249,.35)]" />
            <div className="absolute right-8 top-2 h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_20px_4px_rgba(252,211,77,.35)]" />
            <div className="absolute bottom-8 right-2 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_20px_4px_rgba(110,231,183,.35)]" />
            <svg className="h-full w-full" viewBox="0 0 300 300" fill="none">
              <path d="M22 80C83 40 170 39 259 18" stroke="url(#routeA)" strokeWidth="1.5" strokeDasharray="5 7" />
              <path d="M25 81C112 102 181 169 282 252" stroke="url(#routeB)" strokeWidth="1.5" strokeDasharray="5 7" />
              <defs>
                <linearGradient id="routeA"><stop stopColor="#67e8f9" /><stop offset="1" stopColor="#fcd34d" /></linearGradient>
                <linearGradient id="routeB"><stop stopColor="#67e8f9" /><stop offset="1" stopColor="#6ee7b7" /></linearGradient>
              </defs>
            </svg>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
          <div className="absolute left-6 top-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500">
              <Activity className="h-5 w-5 text-[#07111f]" />
            </div>
            <span className="font-bold">FieldForce Live</span>
          </div>

          <div className="w-full max-w-[470px]">
            <div className="mb-8 flex items-center gap-2">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-amber-400' : 'bg-white/10'}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step === 2 ? 'bg-amber-400' : 'bg-white/10'}`} />
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-1.5 shadow-[0_32px_100px_rgba(0,0,0,.4)] backdrop-blur-2xl">
              <div className="rounded-[23px] border border-white/[0.06] bg-[#0b1727]/85 px-6 py-7 sm:px-9 sm:py-9">
                {step === 1 ? (
                  <>
                    <div className="mb-8">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10">
                        <LockKeyhole className="h-5 w-5 text-amber-300" />
                      </div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">Secure command access</p>
                      <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Welcome back.</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">Sign in to continue to your operations workspace.</p>
                    </div>

                    <form className="space-y-5" onSubmit={handleLoginSubmit}>
                      <div>
                        <Label htmlFor="username" className="mb-2 block text-xs font-semibold text-slate-300">Username or email</Label>
                        <Input
                          id="username"
                          name="username"
                          type="text"
                          autoComplete="username"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="login-field h-12 rounded-xl border-white/10 bg-white/[0.055] px-4 text-white shadow-none placeholder:text-white/25 focus-visible:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-amber-300/15"
                          placeholder="Enter username or email"
                        />
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <Label htmlFor="password" className="text-xs font-semibold text-slate-300">Password</Label>
                          <Link
                            href="/reset-password"
                            className="text-[11px] font-semibold text-amber-300/80 transition hover:text-amber-200"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <div className="relative">
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`login-field h-12 rounded-xl border-white/10 bg-white/[0.055] px-4 pr-12 shadow-none placeholder:text-white/25 focus-visible:border-cyan-300/50 focus-visible:ring-2 focus-visible:ring-cyan-300/15 ${
                              password ? 'text-cyan-300 caret-cyan-300' : 'text-white'
                            }`}
                            placeholder="Enter your password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(value => !value)}
                            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-red-400/35 bg-red-500/15 text-red-300 shadow-[0_0_18px_rgba(248,113,113,.12)] transition hover:border-red-400/65 hover:bg-red-500/25 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={2.2} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={2.2} />}
                          </button>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="group h-12 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 font-bold text-[#091321] shadow-[0_14px_40px_rgba(249,146,7,.2)] transition hover:brightness-110"
                        disabled={loginMutation.isPending || !username || !password}
                      >
                        {loginMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>Enter command center <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></>
                        )}
                      </Button>
                    </form>
                  </>
                ) : (
                  <>
                    <div className="mb-8">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
                        <Fingerprint className="h-6 w-6 text-emerald-300" />
                      </div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Identity verification</p>
                      <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">One last check.</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Enter the six-digit security code sent to <span className="font-semibold text-slate-200">{otpSentTo}</span>.
                      </p>
                    </div>

                    <form className="space-y-6" onSubmit={handleOtpSubmit}>
                      <div className="flex justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] px-2 py-5">
                        <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                          <InputOTPGroup className="gap-1.5 sm:gap-2">
                            {[0, 1, 2, 3, 4, 5].map(index => (
                              <InputOTPSlot
                                key={index}
                                index={index}
                                className="h-12 w-10 rounded-lg border border-white/10 bg-white/[0.055] text-lg text-white first:rounded-lg last:rounded-lg sm:w-12"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <Button
                        type="submit"
                        className="group h-12 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 font-bold text-[#091321] shadow-[0_14px_40px_rgba(249,146,7,.2)] transition hover:brightness-110"
                        disabled={verifyOtpMutation.isPending || otp.length !== 6}
                      >
                        {verifyOtpMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                          <>Verify & enter <CheckCircle2 className="ml-2 h-4 w-4" /></>
                        )}
                      </Button>
                      <button
                        type="button"
                        className="mx-auto flex items-center gap-2 text-xs font-semibold text-white/40 transition hover:text-white"
                        onClick={() => { setStep(1); setOtp(''); }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Use different credentials
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-white/30">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300/60" /> Enterprise security</span>
              <span className="flex items-center gap-1.5"><RadioTower className="h-3.5 w-3.5 text-cyan-300/60" /> Live operations</span>
              <span className="flex items-center gap-1.5"><Route className="h-3.5 w-3.5 text-amber-300/60" /> Audited access</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
