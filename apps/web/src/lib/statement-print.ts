import { buildStatementHtml, type StatementDTO } from '@tiffino/shared';
import {
  getCustomer,
  getCustomerOrdersReport,
  getCustomerPayments,
  listOrders,
} from '../api/endpoints';

/** Rebuild a statement from its stored record and open it in a print window —
 *  "Save as PDF" in the dialog produces the file. Throws on pop-up block. */
export async function printStatementForRecord(
  record: StatementDTO,
  canReports: boolean,
): Promise<void> {
  const [detail, pays, orders] = await Promise.all([
    getCustomer(record.customerId),
    getCustomerPayments(record.customerId),
    canReports
      ? getCustomerOrdersReport({
          customerId: record.customerId,
          from: record.from ?? undefined,
          to: record.to ?? undefined,
        }).then((r) => r.orders)
      : listOrders({
          customerId: record.customerId,
          from: record.from ?? undefined,
          to: record.to ?? undefined,
          limit: 100,
        }).then((r) => r.data),
  ]);

  const html = buildStatementHtml({
    customer: {
      fullName: detail.customer.fullName,
      mobile: detail.customer.mobile,
      type: detail.customer.type,
    },
    periodLabel: record.periodLabel,
    orders,
    payments: pays.payments,
    balance: {
      totalBilled: record.totalBilled,
      totalPaid: record.totalPaid,
      pending: record.pending,
    },
  });

  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) throw new Error('Pop-up blocked — allow pop-ups for this site to open the statement.');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
