// US-43 (FR-TGI-06, D-114): the Zakat receipt as an HTML page, printed to a PDF by expo-print and shared. Every value
// is escaped; Arabic receipts are written right to left (NFR-06). The labels come from i18n (no hard-coded text).
import type { ZakatReceipt } from '@/api/client';

export interface ReceiptLabels {
  title: string;
  number: string;
  status: string;
  vendor: string;
  food: string;
  bags: string;
  amount: string;
  charity: string;
  date: string;
  delivered: string;
  refunded: string;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** `values` holds the formatted texts (status, food name, amount and dates) in the reader's language. */
export function receiptHtml(
  receipt: ZakatReceipt,
  labels: ReceiptLabels,
  values: {
    status: string;
    food: string;
    amount: string;
    date: string;
    delivered: string | null;
    refunded: string | null;
  },
  language: 'ar' | 'en',
): string {
  const rows: [string, string][] = [
    [labels.number, receipt.receiptNumber],
    [labels.status, values.status],
    [labels.vendor, receipt.shopName],
    [labels.food, values.food],
    [labels.bags, String(receipt.bags)],
    [labels.amount, values.amount],
    [labels.charity, receipt.charityName],
    [labels.date, values.date],
  ];
  if (values.delivered !== null) rows.push([labels.delivered, values.delivered]);
  if (values.refunded !== null) rows.push([labels.refunded, values.refunded]);
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const body = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return (
    `<!DOCTYPE html><html lang="${language}" dir="${dir}"><head><meta charset="utf-8" />` +
    '<style>body{font-family:sans-serif;padding:32px}h1{font-size:22px}table{border-collapse:collapse;width:100%}' +
    'th,td{border:1px solid #ccc;padding:8px;text-align:start}th{width:35%;background:#f4f4f4}</style></head>' +
    `<body><h1>${escapeHtml(labels.title)}</h1><table>${body}</table></body></html>`
  );
}
