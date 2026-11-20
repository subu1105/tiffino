import {
  buildStatementHtml,
  formatINR,
  type OrderDTO,
  type PaymentDTO,
  type StatementDTO,
} from '@tiffino/shared';
import type { File } from 'expo-file-system';
import * as Print from 'expo-print';

import { base64ToBytes, writeCacheFile } from '@/lib/share-file';

export interface ReadyFile {
  file: File;
  mimeType: string;
  summaryText: string;
}

export interface ReadyStatement extends ReadyFile {
  record: StatementDTO;
}

/** Build the statement PDF (HTML fallback) into our cache from an existing
 *  record — used right after generation AND for re-viewing old records. */
export async function prepareStatementFile(args: {
  record: StatementDTO;
  customer: { fullName: string; mobile: string; type: string };
  orders: OrderDTO[];
  payments: PaymentDTO[];
}): Promise<ReadyStatement> {
  const { record, customer, orders, payments } = args;

  const html = buildStatementHtml({
    customer,
    periodLabel: record.periodLabel,
    orders,
    payments,
    balance: {
      totalBilled: record.totalBilled,
      totalPaid: record.totalPaid,
      pending: record.pending,
    },
  });

  // Always-works fallback: the statement as plain text (WhatsApp-ready).
  const summaryText = [
    `🍱 TIFFINO — ${customer.fullName}`,
    `Period: ${record.periodLabel}`,
    `Total tiffins: ${record.totalTiffins} (Lunch ${record.lunchCount} · Dinner ${record.dinnerCount})`,
    `Period amount: ${formatINR(record.periodAmount)}`,
    `Total billed: ${formatINR(record.totalBilled)} · Paid: ${formatINR(record.totalPaid)}`,
    `Pending: ${formatINR(record.pending)}`,
  ].join('\n');

  // base64 route: Expo Go denies cross-module reads on expo-print's own
  // output directory, so we write the PDF bytes ourselves.
  const safeName = customer.fullName.replace(/[^A-Za-z0-9]+/g, '-');
  try {
    const { base64 } = await Print.printToFileAsync({ html, base64: true });
    if (!base64) throw new Error('printToFileAsync returned no data');
    const file = await writeCacheFile(base64ToBytes(base64), `TIFFINO-statement-${safeName}.pdf`);
    return { file, mimeType: 'application/pdf', summaryText, record };
  } catch (printErr) {
    console.warn('[tiffino] printToFileAsync failed:', printErr);
    const file = await writeCacheFile(html, `TIFFINO-statement-${safeName}.html`);
    return { file, mimeType: 'text/html', summaryText, record };
  }
}

/** Build any branded HTML into a PDF in our cache — preview and share happen
 *  from the returned file. Falls back to an HTML file when printing fails;
 *  `fallbackText` is the plain-text share used when even file sharing fails. */
export async function prepareHtmlFile(
  html: string,
  filename: string,
  fallbackText: string,
): Promise<ReadyFile> {
  try {
    const { base64 } = await Print.printToFileAsync({ html, base64: true });
    if (!base64) throw new Error('printToFileAsync returned no data');
    const file = await writeCacheFile(base64ToBytes(base64), filename);
    return { file, mimeType: 'application/pdf', summaryText: fallbackText };
  } catch (err) {
    console.warn('[tiffino] pdf build failed, falling back to HTML:', err);
    const file = await writeCacheFile(html, filename.replace(/\.pdf$/, '.html'));
    return { file, mimeType: 'text/html', summaryText: fallbackText };
  }
}
