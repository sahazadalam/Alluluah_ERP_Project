import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Quotation, QuotationDocument, Company } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { Printer, X, AlertCircle, FileText, Image, Download } from 'lucide-react';

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildQuotationPrintableHtml(q: Quotation, items: Array<NonNullable<Quotation['items']>[number]>, company: Company | null) {
  const safeItems = items ?? [];
  const companyName = company?.name || 'Al Luluah Tents & Sheds';
  const companyAddress = company?.address || 'Dubai, UAE';
  const companyTrn = company?.trn || '';
  const companyPhone = company?.phone || '';
  const logoUrl = company?.logo_url || '';

  const itemRows = safeItems.length === 0
    ? `<tr><td colspan="7" class="empty">No items</td></tr>`
    : safeItems.map((item, i) => `<tr>
        <td class="idx">${i + 1}</td>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="qty">${number(item.quantity)}</td>
        <td class="price">${formatCurrency(item.unit_price)}</td>
        <td class="disc">${number(item.discount_percent)}%</td>
        <td class="vat">${formatCurrency(item.vat_amount)}</td>
        <td class="total">${formatCurrency(item.total)}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quotation</title>
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
    .quotation-sheet {
      width: min(960px, calc(100vw - 40px));
      margin: 0 auto;
      background: #ffffff;
      padding: 26px 40px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 12px 30px rgba(0,0,0,0.08);
    }
    .quotation-head {
      display: flex;
      align-items: flex-start;
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
    .quote-id { min-width: 260px; text-align: right; }
    .quote-title { margin: 0; font-size: 30px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; }
    .quote-number { color: #475569; margin-top: 12px; font-size: 13px; }
    .quote-number strong { color: #334155; }
    .prepared-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-top: 16px; }
    .label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.9px; margin-bottom: 10px; }
    .prepared-customer { font-size: 18px; font-weight: 800; color: #334155; margin-bottom: 8px; }
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
    th:nth-child(3), th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { text-align: right; white-space: nowrap; }
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
    .qty, .price, .disc, .vat, .total { text-align: right; white-space: nowrap; }
    .total { font-weight: 800; color: #111827; }
    .empty { text-align: center; color: #64748b; padding: 14px; font-style: italic; }
    .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
    .totals-panel { width: min(320px, 100%); }
    .totals-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px; }
    .totals-row.total-main { font-size: 18px; font-weight: 800; color: #111827; border-bottom: 2px solid #334155; padding: 11px 0; }
    .totals-row.total-main span:last-child { color: #111827; }
    .terms { border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 14px; font-size: 12px; color: #475569; }
    .terms-title { font-weight: 800; color: #64748b; text-transform: uppercase; font-size: 11px; margin-bottom: 8px; }
    .terms-text { margin: 0; }
    .signatures { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 18px; border-top: 1px solid #e2e8f0; margin-top: 18px; padding-top: 16px; font-size: 12px; color: #64748b; }
    .signature-line { border-top: 1px solid #94a3b8; padding-top: 12px; margin-top: 32px; color: #334155; font-weight: 700; }
    .footer-note { border-top: 1px solid #e2e8f0; margin-top: 22px; padding-top: 12px; color: #94a3b8; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="quotation-sheet">
    <section class="quotation-head">
      <div class="company">
        ${logoUrl ? `<img class="company-logo" src="${logoUrl}" alt="${companyName}" />` : `<div class="company-logo-fallback">${companyName.charAt(0)}</div>`}
        <div>
          <div class="company-title">${companyName}</div>
          <p class="company-meta">${companyAddress}</p>
          ${companyTrn ? `<div class="company-trn">TRN: ${companyTrn}</div>` : ''}
          ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}
        </div>
      </div>
      <div class="quote-id">
        <div class="quote-title">QUOTATION</div>
        <div class="quote-number"><strong>Quote #:</strong> ${escapeHtml(q.quotation_number)}</div>
        <div class="quote-number"><strong>Date:</strong> ${formatDate(q.issue_date)}</div>
        ${q.valid_until ? `<div class="quote-number"><strong>Valid Until:</strong> ${formatDate(q.valid_until)}</div>` : ''}
      </div>
    </section>

    <section class="prepared-card">
      <div class="label">Prepared For</div>
      <div class="prepared-customer">${escapeHtml(q.customer_name)}</div>
      ${q.customer_trn ? `<div class="company-meta">TRN: ${escapeHtml(q.customer_trn)}</div>` : ''}
    </section>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Disc%</th>
          <th>VAT 5%</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="totals">
      <div class="totals-panel">
        <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(q.subtotal)}</span></div>
        ${q.discount_amount > 0 ? `<div class="totals-row"><span>Discount</span><span>-${formatCurrency(q.discount_amount)}</span></div>` : ''}
        <div class="totals-row"><span>VAT (5%)</span><span>${formatCurrency(q.vat_amount)}</span></div>
        <div class="totals-row total-main"><span>Total (AED)</span><span>${formatCurrency(q.total)}</span></div>
      </div>
    </section>

    ${(q.notes || q.terms) ? `<section class="terms">
      <div class="terms-title">Terms &amp; Conditions</div>
      <p class="terms-text">${escapeHtml(q.terms || q.notes || 'This quotation is valid for 30 days.')}</p>
    </section>` : `<section class="terms">
      <div class="terms-title">Terms &amp; Conditions</div>
      <p class="terms-text">This quotation is valid for 30 days.</p>
    </section>`}

    <section class="signatures">
      <div>
        <div class="signature-title">Authorized Signature</div>
        <div class="signature-line">${companyName}</div>
      </div>
      <div>
        <div class="signature-title">Customer Acceptance</div>
        <div class="signature-line">Date &amp; Signature</div>
      </div>
    </section>

    <div class="footer-note">This quotation is valid for 30 days · ${companyName} — ${companyAddress}</div>
  </div>
</body>
</html>`;
}

function number(value: number) {
  return Number.isInteger(value) ? value : Number(value).toFixed(2);
}

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

    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildQuotationPrintableHtml(q, items, company));
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
