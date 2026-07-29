import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function api(path: string, body: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as { message: string };
}

// ─── Shared chrome, kept visually in step with the login screen ───────────────

function AuthShell({
  eyebrow,
  title,
  intro,
  icon,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
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

      <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[470px]">
          <Link
            href="/login"
            className="mb-8 flex items-center gap-2.5 transition hover:opacity-80"
            aria-label="Back to sign in"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500">
              <Activity className="h-5 w-5 text-[#07111f]" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-extrabold tracking-[-0.03em]">FieldForce Live</span>
          </Link>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-1.5 shadow-[0_32px_100px_rgba(0,0,0,.4)] backdrop-blur-2xl">
            <div className="rounded-[23px] border border-white/[0.06] bg-[#0b1727]/85 px-6 py-7 sm:px-9 sm:py-9">
              <div className="mb-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10">
                  {icon}
                </div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">
                  {eyebrow}
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{intro}</p>
              </div>
              {children}
            </div>
          </div>

          {footer}

          <div className="mt-6 flex items-center justify-center text-[10px] font-medium text-white/30">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/60" /> Encrypted · Private · Audited
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

const FIELD_CLASS =
  'h-12 rounded-xl border-white/10 bg-white/[0.055] px-4 text-white shadow-none placeholder:text-white/25 ' +
  'focus-visible:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-amber-300/15';

const SUBMIT_CLASS =
  'group h-12 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 font-bold text-[#091321] ' +
  'shadow-[0_14px_40px_rgba(249,146,7,.2)] transition hover:brightness-110';

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === 'ok'
          ? 'flex items-start gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200'
          : 'flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200'
      }
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {tone === 'ok' && <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function BackToLogin() {
  return (
    <Link
      href="/login"
      className="mx-auto mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-white/40 transition hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
    </Link>
  );
}

// ─── Step 1: ask for the email, send the link ────────────────────────────────

export function ResetPasswordRequest() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSent('');
    try {
      const data = await api('/api/auth/password-reset/request', { email: email.trim() });
      setSent(data.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send the reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot your password?"
      intro="Enter the email address on your account and we’ll send you a link to choose a new password."
      icon={<KeyRound className="h-5 w-5 text-amber-300" />}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div>
          <Label htmlFor="reset-email" className="mb-2 block text-xs font-semibold text-slate-300">
            Work email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              disabled={loading || Boolean(sent)}
              value={email}
              onChange={event => {
                setEmail(event.target.value);
                setError('');
              }}
              placeholder="name@company.com"
              className={`${FIELD_CLASS} pl-11`}
            />
          </div>
        </div>

        {sent && <Notice tone="ok">{sent}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {!sent && (
          <Button type="submit" className={SUBMIT_CLASS} disabled={loading || !email}>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Send reset link
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        )}

        <BackToLogin />
      </form>
    </AuthShell>
  );
}

// ─── Step 2: the emailed link lands here ─────────────────────────────────────

export function ResetPasswordConfirm() {
  const params = useParams<{ id: string; token: string }>();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api('/api/auth/password-reset/confirm', {
        userId: Number(params.id),
        token: params.token,
        newPassword: password,
      });
      setDone(true);
      setTimeout(() => setLocation('/login'), 2000);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Secure your account"
      title="Create new password"
      intro="Choose something memorable for you and hard for anyone else to guess. Minimum 8 characters."
      icon={<KeyRound className="h-5 w-5 text-amber-300" />}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div>
          <Label htmlFor="new-password" className="mb-2 block text-xs font-semibold text-slate-300">
            New password
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading || done}
              value={password}
              onChange={event => {
                setPassword(event.target.value);
                setError('');
              }}
              placeholder="At least 8 characters"
              className={`${FIELD_CLASS} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white/60 transition hover:text-white"
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5" aria-label={`Password strength ${strength} of 4`}>
            {[0, 1, 2, 3].map(index => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index < strength ? 'bg-amber-400' : 'bg-white/10'
                }`}
              />
            ))}
            <span className="ml-1 w-16 text-right text-[10px] text-white/40">
              {!password ? '8+ chars' : ['Too weak', 'Fair', 'Good', 'Strong'][Math.max(0, strength - 1)]}
            </span>
          </div>
        </div>

        <div>
          <Label htmlFor="confirm-password" className="mb-2 block text-xs font-semibold text-slate-300">
            Confirm password
          </Label>
          <Input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={loading || done}
            value={confirmPassword}
            onChange={event => {
              setConfirmPassword(event.target.value);
              setError('');
            }}
            placeholder="Repeat your new password"
            className={FIELD_CLASS}
          />
        </div>

        {done && (
          <Notice tone="ok">Password reset successful. Taking you to sign in…</Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {!done && (
          <Button type="submit" className={SUBMIT_CLASS} disabled={loading || !password || !confirmPassword}>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Set new password <CheckCircle2 className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        )}

        <BackToLogin />
      </form>
    </AuthShell>
  );
}
