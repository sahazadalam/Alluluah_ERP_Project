import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Quotation, QuotationDocument, Company } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { Printer, X, AlertCircle, FileText, Image, Download } from 'lucide-react';

interface Props {
  quotation: Quotation;
  onClose: () => void;
}

export default function QuotationView({ quotation: q, onClose }: Props) {
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<QuotationDocument[]>([]);
  const items = q.items ?? [];
  const hasItems = items.length > 0;

  useEffect(() => {
    supabase.from('companies').select('*').eq('is_active', true).order('name').limit(1).maybeSingle()
      .then(({ data }) => setCompany(data));
    supabase.from('quotation_documents').select('*').eq('quotation_id', q.id).order('uploaded_at', { ascending: false })
      .then(({ data }) => setDocuments(data ?? []));
  }, [q.id]);

  const handleDownload = async (doc: QuotationDocument) => {
    const { data, error: dlErr } = await supabase.storage.from('quotation-documents').createSignedUrl(doc.storage_path, 3600);
    if (dlErr || !data) {
      if (doc.file_url) window.open(doc.file_url, '_blank');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handlePrint = () => {
    if (!hasItems) return;
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #qt-print-area, #qt-print-area * { visibility: visible !important; }
          #qt-print-area {
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
            <h2 className="text-base font-semibold text-slate-800">Quotation Preview</h2>
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
            <QuotationPrintDocument q={q} items={items} company={company} />

            {/* Supporting Documents */}
            {documents.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-6">
                <div className="font-semibold text-slate-400 uppercase mb-3 text-xs">Supporting Documents</div>
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                        {doc.file_type.startsWith('image/') ? <Image size={18} className="text-blue-500" /> : <FileText size={18} className="text-slate-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</div>
                        <div className="text-xs text-slate-400">{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Download size={13} /> Download / Open
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div id="qt-print-area" style={{ display: 'none' }} className="print:block bg-white">
        <QuotationPrintDocument q={q} items={items} company={company} />
      </div>
    </>
  );
}

function QuotationPrintDocument({
  q, items, company,
}: {
  q: Quotation;
  items: NonNullable<Quotation['items']>;
  company: Company | null;
}) {
  const safeItems = items ?? [];
  const companyName = company?.name || 'Al Luluah Tents & Sheds';
  const companyAddress = company?.address || 'Dubai, UAE';
  const companyTrn = company?.trn || '';
  const companyPhone = company?.phone || '';
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
            {companyPhone && <p className="text-slate-500">Tel: {companyPhone}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-800 mb-2">QUOTATION</div>
          <div className="text-slate-600 space-y-0.5">
            <div><span className="font-semibold">Quote #:</span> {q.quotation_number}</div>
            <div><span className="font-semibold">Date:</span> {formatDate(q.issue_date)}</div>
            {q.valid_until && <div><span className="font-semibold">Valid Until:</span> {formatDate(q.valid_until)}</div>}
          </div>
        </div>
      </div>

      {/* Prepared For */}
      <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Prepared For</div>
        <div className="font-semibold text-slate-800">{q.customer_name}</div>
        {q.customer_trn && <div className="text-slate-600 mt-0.5">TRN: {q.customer_trn}</div>}
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
            <th className="text-right px-3 py-2 font-semibold uppercase">VAT 5%</th>
            <th className="text-right px-3 py-2 font-semibold uppercase rounded-tr">Total</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">No items</td></tr>
          ) : safeItems.map((item, i) => (
            <tr key={item.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 text-slate-800 font-medium">{item.description}</td>
              <td className="px-3 py-2 text-right text-slate-700">{item.quantity}</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
              <td className="px-3 py-2 text-right text-slate-700">{item.discount_percent}%</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(item.vat_amount)}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-60">
          <div className="flex justify-between py-2 border-b border-slate-200 text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium">{formatCurrency(q.subtotal)}</span>
          </div>
          {q.discount_amount > 0 && (
            <div className="flex justify-between py-2 border-b border-slate-200 text-sm">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium text-red-600">-{formatCurrency(q.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-slate-200 text-sm">
            <span className="text-slate-500">VAT (5%)</span>
            <span className="font-medium">{formatCurrency(q.vat_amount)}</span>
          </div>
          <div className="flex justify-between py-2.5 text-base font-bold border-t-2 border-slate-800">
            <span>Total (AED)</span>
            <span>{formatCurrency(q.total)}</span>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(q.notes || q.terms) && (
        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 mb-6 text-xs">
          {q.notes && (
            <div><div className="font-semibold text-slate-400 uppercase mb-1">Notes</div><p className="text-slate-600">{q.notes}</p></div>
          )}
          {q.terms && (
            <div><div className="font-semibold text-slate-400 uppercase mb-1">Terms &amp; Conditions</div><p className="text-slate-600">{q.terms}</p></div>
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
        This quotation is valid for 30 days · {companyName} — {companyAddress}
      </div>
    </div>
  );
}
