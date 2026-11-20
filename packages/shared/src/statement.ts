/**
 * Customer statement — one HTML builder shared by web (print → Save as PDF)
 * and mobile (expo-print → PDF → WhatsApp share), so the statement a customer
 * receives looks identical from either app.
 */
import { formatBusinessDate, formatINR, todayBusinessDate } from './dates';
import type { CustomerBalanceDTO, OrderDTO, PaymentDTO } from './types';

export interface StatementInput {
  customer: { fullName: string; mobile: string; type: string };
  /** e.g. "November 2026" or "All time" — describes the orders listed. */
  periodLabel: string;
  /** Orders for the period; cancelled ones are ignored automatically. */
  orders: OrderDTO[];
  /** Payments to list (all-time). */
  payments: PaymentDTO[];
  /** All-time money position: billed / paid / pending. */
  balance: CustomerBalanceDTO;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildStatementHtml(input: StatementInput): string {
  const active = input.orders.filter((o) => o.status !== 'cancelled');
  const qty = (o: OrderDTO) => o.quantity ?? 1;
  const breakfast = active.filter((o) => o.mealType === 'breakfast').reduce((s, o) => s + qty(o), 0);
  const lunch = active.filter((o) => o.mealType === 'lunch').reduce((s, o) => s + qty(o), 0);
  const dinner = active.filter((o) => o.mealType === 'dinner').reduce((s, o) => s + qty(o), 0);
  const periodAmount = active.reduce((s, o) => s + o.price, 0);

  // One row per DATE: breakfast, lunch and dinner side by side, day total last.
  const byDate = new Map<
    string,
    { breakfast: number | null; lunch: number | null; dinner: number | null }
  >();
  for (const o of active) {
    const entry = byDate.get(o.orderDate) ?? { breakfast: null, lunch: null, dinner: null };
    entry[o.mealType] = (entry[o.mealType] ?? 0) + o.price;
    byDate.set(o.orderDate, entry);
  }
  const orderRows = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([date, e]) => `<tr>
        <td>${formatBusinessDate(date)}</td>
        <td class="num">${e.breakfast !== null ? formatINR(e.breakfast) : '—'}</td>
        <td class="num">${e.lunch !== null ? formatINR(e.lunch) : '—'}</td>
        <td class="num">${e.dinner !== null ? formatINR(e.dinner) : '—'}</td>
        <td class="num">${formatINR((e.breakfast ?? 0) + (e.lunch ?? 0) + (e.dinner ?? 0))}</td>
      </tr>`,
    )
    .join('');

  const paymentRows = input.payments
    .slice()
    .sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1))
    .map(
      (p) => `<tr>
        <td>${formatBusinessDate(p.paymentDate)}</td>
        <td>${esc(p.method.replace('_', ' '))}</td>
        <td class="num">${formatINR(p.amount)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>TIFFINO statement — ${esc(input.customer.fullName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #2B2D2F;
         background: #fff; padding: 28px; font-size: 13px; line-height: 1.5; }
  .wrap { max-width: 680px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #1B4332; padding-bottom: 14px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: 3px; color: #1B4332; }
  .brand small { display: block; letter-spacing: 0.4px; font-weight: 600; font-size: 11px; color: #F77F00; }
  .meta { text-align: right; font-size: 11px; color: #6E6A63; }
  .customer { margin-top: 16px; background: #FFF8F0; border-radius: 10px; padding: 12px 16px; }
  .customer b { font-size: 16px; }
  .cards { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .card { flex: 1; min-width: 96px; border: 1px solid #EFE7DB; border-radius: 10px; padding: 10px 12px; }
  .card .label { font-size: 9.5px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: 0.8px; color: #6E6A63; }
  .card .value { font-size: 17px; font-weight: 800; color: #1B4332; margin-top: 2px;
                 font-variant-numeric: tabular-nums; }
  .card.pending .value { color: ${'#B45309'}; }
  h2 { font-size: 13px; margin: 22px 0 8px; color: #1B4332; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
       color: #6E6A63; border-bottom: 1.5px solid #EFE7DB; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #F6F0E6; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totalrow td { font-weight: 800; border-top: 2px solid #1B4332; border-bottom: none; }
  .footer { margin-top: 26px; text-align: center; font-size: 10.5px; color: #6E6A63; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="brand">TIFFINO<small>Tiffin &amp; Cloud Kitchen</small></div>
    <div class="meta">Statement<br/>Generated ${formatBusinessDate(todayBusinessDate())}</div>
  </div>

  <div class="customer">
    <b>${esc(input.customer.fullName)}</b> &nbsp;·&nbsp; ${esc(input.customer.mobile)}
    <div style="color:#6E6A63; margin-top:2px;">Period: ${esc(input.periodLabel)}</div>
  </div>

  <div class="cards">
    <div class="card"><div class="label">Total Tiffins</div><div class="value">${breakfast + lunch + dinner}</div></div>
    <div class="card"><div class="label">Breakfast</div><div class="value">${breakfast}</div></div>
    <div class="card"><div class="label">Lunch</div><div class="value">${lunch}</div></div>
    <div class="card"><div class="label">Dinner</div><div class="value">${dinner}</div></div>
    <div class="card"><div class="label">Period Amount</div><div class="value">${formatINR(periodAmount)}</div></div>
  </div>
  <div class="cards">
    <div class="card"><div class="label">Total Billed (all time)</div><div class="value">${formatINR(input.balance.totalBilled)}</div></div>
    <div class="card"><div class="label">Paid (all time)</div><div class="value">${formatINR(input.balance.totalPaid)}</div></div>
    <div class="card pending"><div class="label">Pending</div><div class="value">${formatINR(input.balance.pending)}</div></div>
  </div>

  <h2>Tiffins — ${esc(input.periodLabel)}</h2>
  <table>
    <thead><tr><th>Date</th><th class="num">Breakfast</th><th class="num">Lunch</th><th class="num">Dinner</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${orderRows || '<tr><td colspan="5" style="color:#6E6A63;">No tiffins in this period</td></tr>'}
      <tr class="totalrow"><td colspan="4">Total (${breakfast + lunch + dinner} tiffins)</td><td class="num">${formatINR(periodAmount)}</td></tr>
    </tbody>
  </table>

  <h2>Payments received</h2>
  <table>
    <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${paymentRows || '<tr><td colspan="3" style="color:#6E6A63;">No payments recorded yet</td></tr>'}
      <tr class="totalrow"><td colspan="2">Total paid</td><td class="num">${formatINR(input.balance.totalPaid)}</td></tr>
    </tbody>
  </table>

  <div class="footer">Thank you for eating with TIFFINO 🍱 &nbsp;·&nbsp; Pending amount: <b>${formatINR(input.balance.pending)}</b></div>
</div>
</body>
</html>`;
}
