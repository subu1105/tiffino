import type { ReactNode } from 'react';

/** Label + control + inline error, in the house style. */
export function FormField({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-charcoal/45">{hint}</p>
      ) : null}
    </div>
  );
}
