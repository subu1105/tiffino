import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cls } from '../lib/cls';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cls(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[#f1e9dc] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-charcoal">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-charcoal/40 transition-all hover:bg-forest-50 hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-[#f1e9dc] bg-cream/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
