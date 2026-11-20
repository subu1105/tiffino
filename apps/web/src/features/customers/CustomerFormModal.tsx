import type { CustomerDTO, CustomerType } from '@tiffino/shared';
import {
  createCustomerSchema,
  formatINR,
  todayBusinessDate,
  updateCustomerPricesSchema,
  updateCustomerSchema,
} from '@tiffino/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { fieldErrorsFromDetails, isApiError } from '../../api/client';
import { createCustomer, updateCustomer, updateCustomerPrices } from '../../api/endpoints';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { cls } from '../../lib/cls';

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

/** Zod issues → { field: firstMessage }. */
function zodFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

export function CustomerFormModal({
  customer,
  onClose,
  onSaved,
}: {
  /** Absent → Add mode; present → Edit mode. */
  customer?: CustomerDTO;
  onClose: () => void;
  onSaved?: (customer: CustomerDTO) => void;
}) {
  const isEdit = !!customer;
  const toast = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(customer?.fullName ?? '');
  const [mobile, setMobile] = useState(customer?.mobile ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [type, setType] = useState<CustomerType>(customer?.type ?? 'regular');
  const [breakfastPrice, setBreakfastPrice] = useState(
    customer && customer.breakfastPrice > 0 ? String(customer.breakfastPrice) : '',
  );
  const [lunchPrice, setLunchPrice] = useState(customer ? String(customer.lunchPrice) : '');
  const [dinnerPrice, setDinnerPrice] = useState(customer ? String(customer.dinnerPrice) : '');
  const [joiningDate, setJoiningDate] = useState(customer?.joiningDate ?? todayBusinessDate());
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit-mode price update section
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [newBreakfastPrice, setNewBreakfastPrice] = useState(
    customer && customer.breakfastPrice > 0 ? String(customer.breakfastPrice) : '',
  );
  const [newLunchPrice, setNewLunchPrice] = useState(customer ? String(customer.lunchPrice) : '');
  const [newDinnerPrice, setNewDinnerPrice] = useState(customer ? String(customer.dinnerPrice) : '');
  const [effectiveDate, setEffectiveDate] = useState(todayBusinessDate());
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['customer'] });
    void queryClient.invalidateQueries({ queryKey: ['sheet'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (customer) {
        const parsed = updateCustomerSchema.safeParse({
          fullName: fullName.trim(),
          mobile,
          address: address.trim(),
          type,
          joiningDate,
          notes: notes.trim(),
        });
        if (!parsed.success) {
          setErrors(zodFieldErrors(parsed.error.issues));
          throw new Error('validation');
        }
        return updateCustomer(customer.id, parsed.data);
      }
      const parsed = createCustomerSchema.safeParse({
        fullName: fullName.trim(),
        mobile,
        address: address.trim(),
        type,
        // Blank breakfast = customer doesn't take breakfast (price 0).
        breakfastPrice: breakfastPrice.trim() === '' ? 0 : numberOrUndefined(breakfastPrice),
        lunchPrice: numberOrUndefined(lunchPrice),
        dinnerPrice: numberOrUndefined(dinnerPrice),
        joiningDate,
        status: 'active',
        notes: notes.trim(),
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error.issues));
        throw new Error('validation');
      }
      return createCustomer(parsed.data);
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Customer updated' : `${saved.fullName} added`);
      invalidate();
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) {
        setErrors(fieldErrorsFromDetails(err.details));
        toast.error('Check the highlighted fields', err.message);
      } else if (isApiError(err, 'DUPLICATE_RESOURCE')) {
        setErrors({ mobile: 'A customer with this mobile already exists' });
        toast.error('Duplicate customer', err.message);
      } else {
        toast.apiError(err, isEdit ? 'Could not update customer' : 'Could not add customer');
      }
    },
  });

  const priceMutation = useMutation({
    mutationFn: async () => {
      const parsed = updateCustomerPricesSchema.safeParse({
        breakfastPrice: newBreakfastPrice.trim() === '' ? 0 : numberOrUndefined(newBreakfastPrice),
        lunchPrice: numberOrUndefined(newLunchPrice),
        dinnerPrice: numberOrUndefined(newDinnerPrice),
        effectiveDate,
      });
      if (!parsed.success) {
        setPriceErrors(zodFieldErrors(parsed.error.issues));
        throw new Error('validation');
      }
      return updateCustomerPrices(customer!.id, parsed.data);
    },
    onSuccess: () => {
      toast.success('Prices updated', 'Future bookings use the new prices; past orders keep theirs.');
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['customer-prices'] });
      setShowPriceForm(false);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return;
      if (isApiError(err, 'VALIDATION_ERROR')) {
        setPriceErrors(fieldErrorsFromDetails(err.details));
      }
      if (!(err instanceof Error && err.message === 'validation')) {
        toast.apiError(err, 'Could not update prices');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    saveMutation.mutate();
  };

  return (
    <Modal
      title={customer ? `Edit ${customer.fullName}` : 'Add Customer'}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="customer-form"
            className="btn btn-primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
            {isEdit ? 'Save changes' : 'Save customer'}
          </button>
        </>
      }
    >
      <form id="customer-form" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Full name *" error={errors.fullName}>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Asha Patel"
            />
          </FormField>
          <FormField label="Mobile *" error={errors.mobile}>
            <input
              className="input tnum"
              inputMode="numeric"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="98XXXXXXXX"
            />
          </FormField>
        </div>

        <FormField label="Address" error={errors.address}>
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Flat, street, area"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Type *" error={errors.type}>
            <div className="flex gap-2">
              {(['regular', 'occasional'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cls(
                    'flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
                    type === t
                      ? 'border-forest-600 bg-forest-50 text-forest-800'
                      : 'border-[#e7decf] bg-white text-charcoal/55 hover:border-forest-300',
                  )}
                  onClick={() => setType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Joining date *" error={errors.joiningDate}>
            <input
              type="date"
              className="input"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
            />
          </FormField>
        </div>

        {!isEdit && (
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Breakfast (₹)" error={errors.breakfastPrice}>
              <input
                type="number"
                min={0}
                max={10000}
                className="input tnum"
                value={breakfastPrice}
                onChange={(e) => setBreakfastPrice(e.target.value)}
                placeholder="skip if none"
              />
            </FormField>
            <FormField label="Lunch price (₹) *" error={errors.lunchPrice}>
              <input
                type="number"
                min={0}
                max={10000}
                className="input tnum"
                value={lunchPrice}
                onChange={(e) => setLunchPrice(e.target.value)}
                placeholder="90"
              />
            </FormField>
            <FormField label="Dinner price (₹) *" error={errors.dinnerPrice}>
              <input
                type="number"
                min={0}
                max={10000}
                className="input tnum"
                value={dinnerPrice}
                onChange={(e) => setDinnerPrice(e.target.value)}
                placeholder="100"
              />
            </FormField>
          </div>
        )}

        <FormField label="Notes" error={errors.notes}>
          <textarea
            className="input min-h-[72px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. No onion on Tuesdays"
            maxLength={500}
          />
        </FormField>
      </form>

      {customer && (
        <div className="mt-6 rounded-xl border border-[#f1e9dc] bg-cream/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal/50">
                Current prices
              </p>
              <p className="tnum mt-1 text-sm font-semibold text-charcoal">
                {customer.breakfastPrice > 0
                  ? `Breakfast ${formatINR(customer.breakfastPrice)} · `
                  : ''}
                Lunch {formatINR(customer.lunchPrice)} · Dinner {formatINR(customer.dinnerPrice)}
              </p>
            </div>
            {!showPriceForm && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowPriceForm(true)}
              >
                Update prices
              </button>
            )}
          </div>

          {showPriceForm && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField label="New breakfast (₹)" error={priceErrors.breakfastPrice}>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    className="input tnum"
                    value={newBreakfastPrice}
                    onChange={(e) => setNewBreakfastPrice(e.target.value)}
                    placeholder="0 = none"
                  />
                </FormField>
                <FormField label="New lunch (₹)" error={priceErrors.lunchPrice}>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    className="input tnum"
                    value={newLunchPrice}
                    onChange={(e) => setNewLunchPrice(e.target.value)}
                  />
                </FormField>
                <FormField label="New dinner (₹)" error={priceErrors.dinnerPrice}>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    className="input tnum"
                    value={newDinnerPrice}
                    onChange={(e) => setNewDinnerPrice(e.target.value)}
                  />
                </FormField>
              </div>
              <FormField
                label="Effective from"
                error={priceErrors.effectiveDate}
                hint="Past orders keep the price they were booked at."
              >
                <input
                  type="date"
                  className="input"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowPriceForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={priceMutation.isPending}
                  onClick={() => {
                    setPriceErrors({});
                    priceMutation.mutate();
                  }}
                >
                  {priceMutation.isPending && (
                    <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />
                  )}
                  Save prices
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
