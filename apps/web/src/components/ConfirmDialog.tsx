import { AlertTriangle, HelpCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  tone?: 'danger' | 'primary' | 'flame';
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional free-text input (e.g. a cancellation reason). */
  input?: { label: string; placeholder?: string };
}

export interface ConfirmResult {
  ok: boolean;
  value: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // A second confirm() while one is open supersedes it — settle the first as
    // cancelled so its caller cleanly no-ops instead of waiting forever.
    resolver.current?.({ ok: false, value: '' });
    resolver.current = null;
    setOptions(opts);
    setValue('');
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback(
    (ok: boolean) => {
      resolver.current?.({ ok, value: value.trim() });
      resolver.current = null;
      setOptions(null);
    },
    [value],
  );

  const tone = options?.tone ?? 'primary';
  const confirmClass =
    tone === 'danger' ? 'btn btn-danger' : tone === 'flame' ? 'btn btn-flame' : 'btn btn-primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          title={
            <span className="flex items-center gap-2.5">
              {tone === 'danger' ? (
                <AlertTriangle className="h-5 w-5 text-danger" />
              ) : (
                <HelpCircle className="h-5 w-5 text-forest-600" />
              )}
              {options.title}
            </span>
          }
          onClose={() => settle(false)}
          width="max-w-md"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button type="button" className={confirmClass} onClick={() => settle(true)} autoFocus>
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          {options.body && <div className="text-sm leading-relaxed text-charcoal/70">{options.body}</div>}
          {options.input && (
            <div className="mt-4">
              <label className="label">{options.input.label}</label>
              <input
                className="input"
                value={value}
                placeholder={options.input.placeholder}
                onChange={(e) => setValue(e.target.value)}
                maxLength={200}
              />
            </div>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
