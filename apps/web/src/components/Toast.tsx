import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage } from '../api/client';
import { cls } from '../lib/cls';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  message?: ReactNode;
}

interface ToastApi {
  toast: (tone: Tone, title: string, message?: ReactNode, durationMs?: number) => void;
  success: (title: string, message?: ReactNode) => void;
  error: (title: string, message?: ReactNode) => void;
  info: (title: string, message?: ReactNode) => void;
  /** Convenience: toast any caught error with its server message. */
  apiError: (err: unknown, fallbackTitle?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<Tone, { bar: string; icon: ReactNode }> = {
  success: {
    bar: 'bg-success',
    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
  },
  error: {
    bar: 'bg-danger',
    icon: <AlertCircle className="h-5 w-5 text-danger" />,
  },
  info: {
    bar: 'bg-forest-500',
    icon: <Info className="h-5 w-5 text-forest-600" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: Tone, title: string, message?: ReactNode, durationMs?: number) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, tone, title, message }]);
      const duration = durationMs ?? (message ? 7000 : 4000);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (t, m) => toast('success', t, m),
      error: (t, m) => toast('error', t, m),
      info: (t, m) => toast('info', t, m),
      apiError: (err, fallbackTitle = 'Something went wrong') =>
        toast('error', fallbackTitle, errorMessage(err)),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2.5"
      >
        {items.map((t) => {
          const style = TONE_STYLES[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex overflow-hidden rounded-xl border border-[#efe7db] bg-white shadow-lift"
            >
              <div className={cls('w-1.5 shrink-0', style.bar)} />
              <div className="flex flex-1 items-start gap-3 px-4 py-3">
                <div className="mt-0.5 shrink-0">{style.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-charcoal">{t.title}</p>
                  {t.message && (
                    <div className="mt-0.5 break-words text-[13px] leading-snug text-charcoal/60">
                      {t.message}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(t.id)}
                  className="rounded-md p-1 text-charcoal/35 transition-all hover:bg-forest-50 hover:text-charcoal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
