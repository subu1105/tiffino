import type { PaymentMethod } from '@tiffino/shared';
import { createPaymentSchema, formatINR, todayBusinessDate } from '@tiffino/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { fieldErrorsFromDetails, isApiError } from '../../api/client';
import { createPayment, listStatements } from '../../api/endpoints';
import { CustomerSelect, type CustomerOption } from '../../components/CustomerSelect';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

export function RecordPaymentModal({
  customer: presetCustomer,
  onClose,
}: {
  /** Pre-selected customer (e.g. from a profile page); locked when provided. */
  customer?: CustomerOption;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [customer, setCustomer] = useState<CustomerOption | null>(presetCustomer ?? null);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayBusinessDate());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [statementId, setStatementId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Open (not fully paid) statements of this customer — settle against one.
  const statementsQuery = useQuery({
    queryKey: ['statements', customer?.id ?? 'none'],
    queryFn: () => listStatements(customer!.id),
    enabled: !!customer,
  });
  const openStatements = (statementsQuery.data ?? []).filter(
    (s) => s.settlementStatus !== 'settled',
  );

  const pickStatement = (id: string) => {
    setStatementId(id);
    if (!id) return;
    const s = openStatements.find((x) => x.id === id);
    // Prefill with what's still due on that statement; stays editable.
    if (s) setAmount(String(Math.max(1, s.pending - s.receivedSince)));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNumber = amount.trim() === '' ? undefined : Number(amount);
      const parsed = createPaymentSchema.safeParse({
        customerId: customer?.id ?? '',
        amount: amountNumber,
        paymentDate,
        method,
        notes: notes.trim(),
        ...(statementId ? { statementId } : {}),
      });
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          if (key && !(key in next)) next[key] = issue.message;
        }
        if (!customer) next.customerId = 'Pick a customer';
        setErrors(next);
        throw new Error('validation');
      }
      return createPayment(parsed.data);
    },
    onSuccess: (payment) => {
      toast.success(
        `Payment recorded — ${formatINR(payment.amount)}`,
        `${payment.customerName} · ${METHOD_LABELS[payment.method]}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      void queryClient.invalidateQueries({ queryKey: ['customer'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['statements'] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) {
        setErrors(fieldErrorsFromDetails(err.details));
        toast.error('Check the highlighted fields', err.message);
      } else {
        toast.apiError(err, 'Could not record payment');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    mutation.mutate();
  };

  return (
    <Modal
      title="Record Payment"
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="record-payment-form"
            className="btn btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
            Record payment
          </button>
        </>
      }
    >
      <form id="record-payment-form" className="space-y-4" onSubmit={submit} noValidate>
        <FormField label="Customer *" error={errors.customerId}>
          <CustomerSelect
            value={customer}
            onChange={setCustomer}
            disabled={!!presetCustomer}
            autoFocus={!presetCustomer}
          />
        </FormField>

        {customer && openStatements.length > 0 && (
          <FormField label="Settle against statement (optional)" error={errors.statementId}>
            <select
              className="input"
              value={statementId}
              onChange={(e) => pickStatement(e.target.value)}
            >
              <option value="">No — just record the payment</option>
              {openStatements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.periodLabel} · due {formatINR(Math.max(0, s.pending - s.receivedSince))}
                  {s.settlementStatus === 'partial'
                    ? ` (${formatINR(s.receivedSince)} already received)`
                    : ''}
                </option>
              ))}
            </select>
            {statementId && (
              <p className="mt-1 text-xs text-charcoal/50">
                This payment will mark that statement Paid/Partial automatically.
              </p>
            )}
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Amount (₹) *" error={errors.amount}>
            <input
              type="number"
              min={1}
              max={1000000}
              className="input tnum"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              autoFocus={!!presetCustomer}
            />
          </FormField>
          <FormField label="Date *" error={errors.paymentDate}>
            <input
              type="date"
              className="input"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Method *" error={errors.method}>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                className={cls(
                  'rounded-xl border px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
                  method === m
                    ? 'border-forest-600 bg-forest-50 text-forest-800'
                    : 'border-[#e7decf] bg-white text-charcoal/55 hover:border-forest-300',
                )}
                onClick={() => setMethod(m)}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Notes" error={errors.notes}>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. October dues"
            maxLength={300}
          />
        </FormField>
      </form>
    </Modal>
  );
}
