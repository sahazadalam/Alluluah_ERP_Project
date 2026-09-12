import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Invoice, Company } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { Printer, X, AlertCircle } from 'lucide-react';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

function buildInvoicePrintableHtml(inv: Invoice, items: Array<NonNullable<Invoice['items']>[number]>, company: Company | null) {
  const safeItems = items ?? [];
  const companyName = company?.name || 'Al Luluah Tents & Sheds';
  const companyAddress = company?.address || 'Dubai, UAE';
  const companyTrn = company?.trn || '';
  const logoUrl = company?.logo_url || '';

  const itemRows = safeItems.length === 0
    ? `<tr><td colspan="8" class="empty">No items</td></tr>`
    : safeItems.map((item, i) => `<tr>
        <td class="idx">${i + 1}</td>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="qty">${number(item.quantity)}</td>
        <td class="price">${formatCurrency(item.unit_price)}</td>
        <td class="disc">${number(item.discount_percent)}%</td>
        <td class="amount">${formatCurrency(item.line_total)}</td>
        <td class="vat">${formatCurrency(item.vat_amount)}</td>
        <td class="total">${formatCurrency(item.total)}</td>
      </tr>`).join('');

  const paymentRows = (inv.payments ?? []).map((p) => `
    <div class="payment-history-row">
      <span>${formatDate(p.payment_date)} — ${escapeHtml(p.payment_method.replace('_', ' '))}${p.reference ? ` (${escapeHtml(p.reference)})` : ''}</span>
      <span class="history-paid">${formatCurrency(p.amount)}</span>
    </div>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tax Invoice</title>
  <style>
    @page { size: A4; margin: 12mm; }
    *, *:before, *:after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1e293b;
      font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 13px;
    }
    .invoice-sheet {
      width: min(960px, calc(100vw - 40px));
      margin: 0 auto;
      background: #ffffff;
      padding: 26px 40px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 12px 30px rgba(0,0,0,0.08);
    }
    .invoice-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #334155;
    }
    .company {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 420px;
    }
    .company-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; }
    .company-logo-fallback { width: 56px; height: 56px; border-radius: 10px; background: #1b7651; color: white; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
    .company-title { margin: 0 0 4px; font-size: 26px; font-weight: 800; color: #334155; }
    .company-meta { margin: 0; color: #64748b; font-size: 12px; }
    .company-trn { margin-top: 4px; color: #64748b; font-size: 12px; }
    .invoice-id {
      min-width: 240px;
      text-align: right;
    }
    .tax-title { margin: 0; font-size: 30px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; }
    .invoice-number { color: #475569; margin-top: 12px; font-size: 13px; }
    .invoice-number strong { color: #334155; }
    .bill-grid { display: grid; grid-template-columns: repeat(2, minmax(250px, 1fr)); gap: 16px; margin-top: 16px; }
    .bill-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }
    .bill-card.payment { background: #eef2ff; border-color: #a5b4fc; }
    .label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.9px; margin-bottom: 10px; }
    .bill-card.payment .label { color: #475569; }
    .customer-name { font-size: 19px; font-weight: 800; color: #334155; margin-bottom: 8px; }
    .customer-address { color: #64748b; margin: 2px 0; }
    .summary { display: grid; gap: 8px; color: #475569; font-size: 12px; }
    .summary-row { display: flex; align-items: center; justify-content: space-between; }
    .summary-row .name { flex: 1; }
    .summary-row .amount { font-weight: 800; color: #334155; }
    .summary-row.amount-paid .amount { color: #0b8a4b; }
    .summary-row.balance-due .amount { color: #dc2626; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 12px;
    }
    thead tr { background: #1e293b; color: white; }
    th {
      padding: 11px 10px;
      text-align: left;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th:nth-child(2) { width: 26%; }
    th:nth-child(3), th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7), th:nth-child(8) { text-align: right; white-space: nowrap; }
    td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      text-align: left;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:nth-child(odd) { background: #ffffff; }
    .idx { color: #64748b; font-weight: 700; width: 34px; }
    .desc { font-weight: 700; color: #334155; }
    .qty, .price, .disc, .amount, .vat, .total { text-align: right; white-space: nowrap; }
    .total { font-weight: 800; color: #111827; }
    .empty { text-align: center; color: #64748b; padding: 14px; font-style: italic; }
    .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
    .totals-panel { width: min(300px, 100%); }
    .totals-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; }
    .totals-row.total-main { font-size: 18px; font-weight: 800; color: #111827; border-bottom: 2px solid #334155; padding: 11px 0; }
    .totals-row.total-main span:last-child { color: #111827; }
    .totals-row.total-main span:first-child { color: #111827; }
    .payment-history { margin-top: 16px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; overflow: hidden; }
    .history-title { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin: 0 0 10px; }
    .payment-history-row { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 11px 14px; font-size: 12px; color: #475569; }
    .payment-history-row:last-child { border-bottom: none; }
    .history-paid { color: #0b8a4b; font-weight: 800; }
    .terms { border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 14px; font-size: 12px; color: #475569; }
    .terms-title { font-weight: 800; color: #64748b; text-transform: uppercase; font-size: 11px; margin-bottom: 8px; }
    .terms-text { margin: 0; }
    .signatures { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 18px; border-top: 1px solid #e2e8f0; margin-top: 18px; padding-top: 16px; font-size: 12px; color: #64748b; }
    .signature-line { border-top: 1px solid #94a3b8; padding-top: 12px; margin-top: 32px; color: #334155; font-weight: 700; }
    .footer-note { border-top: 1px solid #e2e8f0; margin-top: 22px; padding-top: 12px; color: #94a3b8; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="invoice-sheet">
    <section class="invoice-head">
      <div class="company">
        ${logoUrl ? `<img class="company-logo" src="${logoUrl}" alt="${companyName}" />` : `<div class="company-logo-fallback">${companyName.charAt(0)}</div>`}
        <div>
          <div class="company-title">${companyName}</div>
          <p class="company-meta">${companyAddress}</p>
          <div class="company-trn">TRN: ${companyTrn}</div>
        </div>
      </div>
      <div class="invoice-id">
        <div class="tax-title">TAX INVOICE</div>
        <div class="invoice-number"><strong>Invoice #:</strong> ${escapeHtml(inv.invoice_number)}</div>
        <div class="invoice-number"><strong>Date:</strong> ${formatDate(inv.issue_date)}</div>
        ${inv.due_date ? `<div class="invoice-number"><strong>Due:</strong> ${formatDate(inv.due_date)}</div>` : ''}
      </div>
    </section>

    <section class="bill-grid">
      <div class="bill-card">
        <div class="label">Bill To</div>
        <div class="customer-name">${escapeHtml(inv.customer_name)}</div>
        ${inv.customer_address ? `<div class="customer-address">${escapeHtml(inv.customer_address)}</div>` : ''}
        ${inv.customer_trn ? `<div class="customer-address">TRN: ${escapeHtml(inv.customer_trn)}</div>` : ''}
      </div>
      <div class="bill-card payment">
        <div class="label">Payment Summary</div>
        <div class="summary">
          <div class="summary-row"><span class="name">Invoice Total:</span><span class="amount">${formatCurrency(inv.total)}</span></div>
          <div class="summary-row amount-paid"><span class="name">Amount Paid:</span><span class="amount">${formatCurrency(inv.paid_amount)}</span></div>
          <div class="summary-row balance-due"><span class="name">Balance Due:</span><span class="amount">${formatCurrency(inv.balance_due)}</span></div>
        </div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Disc%</th>
          <th>Amount</th>
          <th>VAT 5%</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="totals">
      <div class="totals-panel">
        <div class="totals-row"><span>Subtotal (excl. VAT)</span><span>${formatCurrency(inv.subtotal)}</span></div>
        <div class="totals-row"><span>VAT @ 5%</span><span>${formatCurrency(inv.vat_amount)}</span></div>
        <div class="totals-row total-main"><span>Total (AED)</span><span>${formatCurrency(inv.total)}</span></div>
        <div class="totals-row"><span>Amount Paid</span><span>${formatCurrency(inv.paid_amount)}</span></div>
        <div class="totals-row"><span>Balance Due (AED)</span><span>${formatCurrency(inv.balance_due)}</span></div>
      </div>
    </section>

    ${(inv.payments && inv.payments.length > 0) ? `<section class="payment-history">
      <div class="history-title">Payment History</div>
      ${paymentRows}
    </section>` : ''}

    ${(inv.notes || inv.terms) ? `<section class="terms">
      <div class="terms-title">Terms & Conditions</div>
      <p class="terms-text">${escapeHtml(inv.terms || '')}</p>
    </section>` : ''}

    <section class="signatures">
      <div>
        <div class="signature-title">Authorized Signature</div>
        <div class="signature-line">${companyName}</div>
      </div>
      <div>
        <div class="signature-title">Customer Acceptance</div>
        <div class="signature-line">Date & Signature</div>
      </div>
    </section>

    <div class="footer-note">Computer-generated invoice · ${companyName} — ${companyAddress}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function number(value: number) {
  return Number.isInteger(value) ? value : Number(value).toFixed(2);
}

export default function InvoiceView({ invoice: inv, onClose }: Props) {
  const [company, setCompany] = useState<Company | null>(null);
  const items = inv.items ?? [];
  const hasItems = items.length > 0;

  useEffect(() => {
    supabase.from('companies').select('*').eq('is_active', true).order('name').limit(1).maybeSingle()
      .then(({ data }) => setCompany(data));
  }, []);

  const handlePrint = () => {
    if (!hasItems) return;

    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildInvoicePrintableHtml(inv, items, company));
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        // Ignore browser blocked print handling
      }
    }, 250);
  };

  return (
    <>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 print:hidden" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto print:hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-800">Tax Invoice</h2>
            <div className="flex items-center gap-2">
              {hasItems ? (
                <button onClick={handlePrint}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Printer size={14} /> Print / PDF
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2 rounded-lg text-sm">
                  <AlertCircle size={14} /> No items to print
                </div>
              )}
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="p-8">
            <InvoiceDocument inv={inv} items={items} company={company} />
          </div>
        </div>
      </div>

      <div id="inv-print-area" className="hidden print:block bg-white">
        <InvoiceDocument inv={inv} items={items} company={company} />
      </div>
    </>
  );
}

function InvoiceDocument({
  inv, items, company,
}: {
  inv: Invoice;
  items: NonNullable<Invoice['items']>;
  company: Company | null;
}) {
  const safeItems = items ?? [];
  const companyName = company?.name || 'Al Luluah Tents & Sheds';
  const companyAddress = company?.address || 'Dubai, UAE';
  const companyTrn = company?.trn || '';
  const companyPhone = company?.phone || '';
  const companyEmail = company?.email || '';
  const logoUrl = company?.logo_url || '';

  return (
    <div className="font-sans text-slate-900 text-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-7 pb-6 border-b-2 border-slate-800">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-16 w-auto object-contain" />
          ) : (
            <div className="w-14 h-14 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              {companyName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
            {companyAddress && <p className="text-slate-500 mt-0.5">{companyAddress}</p>}
            {companyTrn && <p className="text-slate-500">TRN: {companyTrn}</p>}
            {companyPhone && <p className="text-slate-500">Tel: {companyPhone}{companyEmail ? ` | ${companyEmail}` : ''}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-800 mb-2">TAX INVOICE</div>
          <div className="text-slate-600 space-y-0.5">
            <div><span className="font-semibold">Invoice #:</span> {inv.invoice_number}</div>
            <div><span className="font-semibold">Date:</span> {formatDate(inv.issue_date)}</div>
            {inv.due_date && <div><span className="font-semibold">Due:</span> {formatDate(inv.due_date)}</div>}
          </div>
        </div>
      </div>

      {/* Bill To + Payment Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Bill To</div>
          <div className="font-semibold text-slate-800">{inv.customer_name}</div>
          {inv.customer_address && <div className="text-slate-600 mt-0.5">{inv.customer_address}</div>}
          {inv.customer_trn && <div className="text-slate-600 mt-0.5">TRN: {inv.customer_trn}</div>}
        </div>
        <div className="bg-primary-50 rounded-lg p-4 border border-primary-100">
          <div className="text-xs font-semibold text-primary-500 uppercase tracking-wide mb-2">Payment Summary</div>
          <div className="text-slate-700 space-y-1">
            <div className="flex justify-between">
              <span>Invoice Total:</span>
              <span className="font-semibold">{formatCurrency(inv.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span className="font-semibold text-green-700">{formatCurrency(inv.paid_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-primary-200 pt-1 mt-1">
              <span className="font-semibold">Balance Due:</span>
              <span className="font-bold text-red-700">{formatCurrency(inv.balance_due)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <table className="w-full mb-6 border-collapse text-xs">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-3 py-2 font-semibold uppercase rounded-tl">#</th>
            <th className="text-left px-3 py-2 font-semibold uppercase">Description</th>
            <th className="text-right px-3 py-2 font-semibold uppercase">Qty</th>
            <th className="text-right px-3 py-2 font-semibold uppercase">Unit Price</th>
            <th className="text-right px-3 py-2 font-semibold uppercase">Disc%</th>
            <th className="text-right px-3 py-2 font-semibold uppercase">Amount</th>
            <th className="text-right px-3 py-2 font-semibold uppercase">VAT 5%</th>
            <th className="text-right px-3 py-2 font-semibold uppercase rounded-tr">Total</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.length === 0 ? (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 italic">No items</td></tr>
          ) : safeItems.map((item, i) => (
            <tr key={item.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 text-slate-800 font-medium">{item.description}</td>
              <td className="px-3 py-2 text-right text-slate-700">{item.quantity}</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
              <td className="px-3 py-2 text-right text-slate-700">{item.discount_percent}%</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(item.line_total)}</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(item.vat_amount)}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64">
          <div className="flex justify-between py-2 border-b border-slate-200 text-sm">
            <span className="text-slate-500">Subtotal (excl. VAT)</span>
            <span className="font-medium">{formatCurrency(inv.subtotal)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 text-sm">
            <span className="text-slate-500">VAT @ 5%</span>
            <span className="font-medium">{formatCurrency(inv.vat_amount)}</span>
          </div>
          <div className="flex justify-between py-2.5 text-base font-bold border-b-2 border-slate-800">
            <span>Total (AED)</span>
            <span>{formatCurrency(inv.total)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-slate-500">Amount Paid</span>
            <span className="text-green-700 font-semibold">{formatCurrency(inv.paid_amount)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm font-bold">
            <span>Balance Due (AED)</span>
            <span className="text-red-700">{formatCurrency(inv.balance_due)}</span>
          </div>
        </div>
      </div>

      {/* Payment History */}
      {inv.payments && inv.payments.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Payment History</div>
          <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
            {inv.payments.map((p, i) => (
              <div key={p.id} className={`flex justify-between px-4 py-2 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                <span className="text-slate-500">{formatDate(p.payment_date)} — {p.payment_method.replace('_', ' ')}{p.reference ? ` (${p.reference})` : ''}</span>
                <span className="font-semibold text-green-700">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes & Terms */}
      {(inv.notes || inv.terms) && (
        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 mb-6 text-xs">
          {inv.notes && (
            <div><div className="font-semibold text-slate-400 uppercase mb-1">Notes</div><p className="text-slate-600">{inv.notes}</p></div>
          )}
          {inv.terms && (
            <div><div className="font-semibold text-slate-400 uppercase mb-1">Terms &amp; Conditions</div><p className="text-slate-600">{inv.terms}</p></div>
          )}
        </div>
      )}

      {/* Signatures */}
      <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-500">
        <div>
          <div className="font-medium text-slate-600 mb-8">Authorized Signature</div>
          <div className="border-t border-slate-300 pt-2">{companyName}</div>
        </div>
        <div>
          <div className="font-medium text-slate-600 mb-8">Customer Acceptance</div>
          <div className="border-t border-slate-300 pt-2">Date &amp; Signature</div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-300">
        Computer-generated invoice · {companyName} — {companyAddress}
      </div>
    </div>
  );
}
