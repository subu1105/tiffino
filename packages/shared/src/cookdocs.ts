/**
 * Cook documents — branded HTML shared by web (print → Save as PDF) and
 * mobile (expo-print → PDF → WhatsApp share): the invoice (money ledger)
 * and the attendance report.
 */
import { formatBusinessDate, formatINR, todayBusinessDate } from './dates';
import type { CookAttendanceDTO, CookEntryDTO } from './types';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SHELL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #2B2D2F;
         background: #fff; padding: 28px; font-size: 13px; line-height: 1.5; }
  .wrap { max-width: 680px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #1B4332; padding-bottom: 14px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: 3px; color: #1B4332; }
  .brand small { display: block; letter-spacing: 0.4px; font-weight: 600; font-size: 11px; color: #F77F00; }
  .meta { text-align: right; font-size: 11px; color: #6E6A63; }
  .cards { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .card { flex: 1; min-width: 110px; border: 1px solid #EFE7DB; border-radius: 10px; padding: 10px 12px; }
  .card .label { font-size: 9.5px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: 0.8px; color: #6E6A63; }
  .card .value { font-size: 17px; font-weight: 800; color: #1B4332; margin-top: 2px;
                 font-variant-numeric: tabular-nums; }
  h2 { font-size: 13px; margin: 22px 0 8px; color: #1B4332; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
       color: #6E6A63; border-bottom: 1.5px solid #EFE7DB; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #F6F0E6; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totalrow td { font-weight: 800; border-top: 2px solid #1B4332; border-bottom: none; }
  .pill { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 10px; font-weight: 700; }
  .pill.paid { background: #fff1e0; color: #b35505; }
  .pill.ret { background: #e7f0eb; color: #1f5240; }
  .pill.worked { background: #e7f0eb; color: #1f5240; }
  .pill.half { background: #fff1e0; color: #b35505; }
  .pill.leave { background: #fdecec; color: #d64545; }
  .footer { margin-top: 26px; text-align: center; font-size: 10.5px; color: #6E6A63; }
  @media print { body { padding: 10mm; } }
`;

function shell(title: string, periodLabel: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="brand">TIFFINO<small>Tiffin &amp; Cloud Kitchen</small></div>
    <div class="meta">${esc(title)}<br/>Period: ${esc(periodLabel)}<br/>Generated ${formatBusinessDate(todayBusinessDate())}</div>
  </div>
  ${body}
</div>
</body>
</html>`;
}

/** The cook money ledger: date, paid/return, amount — net total at the end. */
export function buildCookInvoiceHtml(input: {
  periodLabel: string;
  entries: CookEntryDTO[];
  totalPaid: number;
  totalReturned: number;
  net: number;
}): string {
  const rows = input.entries
    .slice()
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : 1))
    .map(
      (e) => `<tr>
        <td>${formatBusinessDate(e.entryDate)}</td>
        <td><span class="pill ${e.kind === 'paid' ? 'paid' : 'ret'}">${e.kind === 'paid' ? 'Paid' : 'Return'}</span></td>
        <td class="num">${e.kind === 'return' ? '−' : ''}${formatINR(e.amount)}</td>
        <td>${esc(e.notes || '')}</td>
      </tr>`,
    )
    .join('');

  const body = `
  <div class="cards">
    <div class="card"><div class="label">Paid to cook</div><div class="value">${formatINR(input.totalPaid)}</div></div>
    <div class="card"><div class="label">Returned by cook</div><div class="value">${formatINR(input.totalReturned)}</div></div>
    <div class="card"><div class="label">Net total</div><div class="value">${formatINR(input.net)}</div></div>
  </div>
  <h2>Entries</h2>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Notes</th></tr></thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="color:#6E6A63;">No entries in this period</td></tr>'}
      <tr class="totalrow"><td colspan="2">Net total (Paid − Return)</td><td class="num">${formatINR(input.net)}</td><td></td></tr>
    </tbody>
  </table>
  <div class="footer">TIFFINO cook invoice · net amount handed to the cook: <b>${formatINR(input.net)}</b></div>`;

  return shell('Cook Invoice', input.periodLabel, body);
}

/** The attendance report: every marked day with its status and wage. */
export function buildCookAttendanceHtml(input: {
  periodLabel: string;
  days: CookAttendanceDTO[];
  workedDays: number;
  halfDays: number;
  leaveDays: number;
  wageTotal: number;
}): string {
  const label = (s: CookAttendanceDTO['status']): string =>
    s === 'worked' ? 'Worked' : s === 'half-day' ? 'Half day' : 'Leave';
  const cls = (s: CookAttendanceDTO['status']): string =>
    s === 'worked' ? 'worked' : s === 'half-day' ? 'half' : 'leave';

  const rows = input.days
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(
      (d) => `<tr>
        <td>${formatBusinessDate(d.date)}</td>
        <td><span class="pill ${cls(d.status)}">${label(d.status)}</span></td>
        <td class="num">${d.status === 'leave' ? '—' : formatINR(d.dailyRate)}</td>
      </tr>`,
    )
    .join('');

  const body = `
  <div class="cards">
    <div class="card"><div class="label">Worked</div><div class="value">${input.workedDays} days</div></div>
    <div class="card"><div class="label">Half days</div><div class="value">${input.halfDays}</div></div>
    <div class="card"><div class="label">Leave</div><div class="value">${input.leaveDays} days</div></div>
    <div class="card"><div class="label">Total wages</div><div class="value">${formatINR(input.wageTotal)}</div></div>
  </div>
  <h2>Day by day</h2>
  <table>
    <thead><tr><th>Date</th><th>Status</th><th class="num">Wage</th></tr></thead>
    <tbody>
      ${rows || '<tr><td colspan="3" style="color:#6E6A63;">No days marked in this period</td></tr>'}
      <tr class="totalrow"><td colspan="2">Total wages (${input.workedDays} full + ${input.halfDays} half)</td><td class="num">${formatINR(input.wageTotal)}</td></tr>
    </tbody>
  </table>
  <div class="footer">TIFFINO cook attendance · wages flow into profit &amp; loss on the day worked</div>`;

  return shell('Cook Attendance', input.periodLabel, body);
}
