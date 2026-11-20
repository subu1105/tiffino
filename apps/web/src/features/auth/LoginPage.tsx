import { loginSchema } from '@tiffino/shared';
import {
  AlertCircle,
  ChefHat,
  CookingPot,
  Eye,
  EyeOff,
  IndianRupee,
  Moon,
  Salad,
  Soup,
  Sun,
  Truck,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/client';
import { forgotPassword } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

const FLOATING_CARDS = [
  { icon: Soup, label: 'Lunch dabbas', sub: 'packed by 11:30', style: 'left-[8%] top-[16%]' },
  { icon: Moon, label: 'Dinner round', sub: 'out by 7:45 pm', style: 'right-[10%] top-[30%]' },
  { icon: IndianRupee, label: 'Payments', sub: 'settled weekly', style: 'left-[14%] bottom-[24%]' },
  { icon: Truck, label: 'On the road', sub: '3 delivery runs', style: 'right-[16%] bottom-[12%]' },
] as const;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? '/'} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your email and password');
      return;
    }
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      if (isApiError(err, 'RATE_LIMITED')) {
        setError('Too many attempts — wait a minute, then try again.');
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async () => {
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setError('Enter your email above first, then tap “Forgot password?”');
      return;
    }
    setSendingReset(true);
    try {
      const res = await forgotPassword(parsed.data);
      toast.info('Password reset', res.message);
    } catch (err) {
      toast.apiError(err, 'Could not request a reset');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-cream lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-forest-950 via-forest-900 to-forest-700 lg:block">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-forest-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-flame-500/15 blur-3xl" />

        {FLOATING_CARDS.map(({ icon: Icon, label, sub, style }) => (
          <div
            key={label}
            className={`absolute ${style} flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-md`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-flame-500/90 text-white">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-cream">{label}</span>
              <span className="block text-xs text-forest-100/60">{sub}</span>
            </span>
          </div>
        ))}

        <div className="relative flex h-full flex-col justify-center px-16">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-flame-500 text-white shadow-lift">
              <ChefHat className="h-7 w-7" strokeWidth={2} />
            </span>
            <span className="font-display text-4xl font-bold tracking-tight text-cream">TIFFINO</span>
          </div>
          <h1 className="max-w-md font-display text-3xl font-semibold leading-snug text-cream">
            Every dabba, every rupee —<br />
            one calm kitchen console.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-forest-100/70">
            Book lunch and dinner rounds, track deliveries, and settle customer balances without a
            single paper register.
          </p>
          <div className="mt-10 flex items-center gap-5 text-forest-100/50">
            <Sun className="h-5 w-5" />
            <Soup className="h-5 w-5" />
            <Salad className="h-5 w-5" />
            <CookingPot className="h-5 w-5" />
            <Moon className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-flame-500 text-white">
              <ChefHat className="h-5 w-5" />
            </span>
            <span className="font-display text-2xl font-bold tracking-tight text-forest-900">
              TIFFINO
            </span>
          </div>

          <h2 className="font-display text-2xl font-bold text-charcoal">Welcome back</h2>
          <p className="mt-1.5 text-sm text-charcoal/55">Sign in to run today's kitchen.</p>

          {error && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-red-50 px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                placeholder="you@kitchen.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-charcoal/40 transition-all hover:bg-forest-50 hover:text-charcoal"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full py-3" disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <button
            type="button"
            className="mt-5 text-sm font-semibold text-forest-700 underline-offset-4 transition-all hover:underline disabled:opacity-50"
            onClick={handleForgot}
            disabled={sendingReset}
          >
            {sendingReset ? 'Sending…' : 'Forgot password?'}
          </button>
        </div>
      </div>
    </div>
  );
}
