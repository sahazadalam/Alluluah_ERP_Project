import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Invoice, Company } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { Printer, X, AlertCircle } from 'lucide-react';

interface Props {
  invoice: Invoice;
  onClose: () => void;
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
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #inv-print-area, #inv-print-area * { visibility: visible !important; }
          #inv-print-area {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            padding: 15mm 15mm !important;
            background: white !important;
          }
        }
      `}</style>

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

      <div id="inv-print-area" style={{ display: 'none' }} className="print:block bg-white">
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
