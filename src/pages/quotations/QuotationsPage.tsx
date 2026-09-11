import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Quotation } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { statusBadge } from '../../components/common/Badge';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Eye, Edit2, FileText, ArrowRight, Trash2 } from 'lucide-react';
import QuotationFormModal from './QuotationFormModal';
import QuotationView from './QuotationView';

interface Props {
  branchFilter: string | null;
}

export default function QuotationsPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showView, setShowView] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [viewing, setViewing] = useState<Quotation | null>(null);

  useEffect(() => { loadQuotations(); }, [branchFilter]);

  const loadQuotations = async () => {
    setLoading(true);
    let query = supabase.from('quotations').select('*').order('created_at', { ascending: false });
    if (branchFilter) query = query.eq('branch_id', branchFilter);
    const { data } = await query;
    setQuotations(data ?? []);
    setLoading(false);
  };

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (q: Quotation) => { setEditing(q); setShowForm(true); };
  const openView = async (q: Quotation) => {
    const { data } = await supabase.from('quotation_items').select('*').eq('quotation_id', q.id).order('sort_order');
    setViewing({ ...q, items: data ?? [] });
    setShowView(true);
  };

  const deleteQuotation = async (q: Quotation) => {
    if (!confirm(`Delete quotation ${q.quotation_number}? This cannot be undone.`)) return;
    const { error: itemsErr } = await supabase.from('quotation_items').delete().eq('quotation_id', q.id);
    if (itemsErr) { alert('Failed to delete quotation items: ' + itemsErr.message); return; }
    const { error: qErr } = await supabase.from('quotations').delete().eq('id', q.id);
    if (qErr) { alert('Failed to delete quotation: ' + qErr.message); return; }
    loadQuotations();
  };

  const updateStatus = async (q: Quotation, status: Quotation['status']) => {
    const { error } = await supabase.from('quotations').update({ status }).eq('id', q.id);
    if (error) { alert('Failed to update status: ' + error.message); return; }
    loadQuotations();
  };

  const convertToInvoice = async (q: Quotation) => {
    if (q.status === 'accepted') {
      alert('This quotation has already been converted or accepted.');
      return;
    }
    const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', q.id);
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const branchId = branchFilter || profile?.branch_id;

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      quotation_id: q.id,
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      customer_trn: q.customer_trn,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      subtotal: q.subtotal,
      discount_amount: q.discount_amount,
      vat_amount: q.vat_amount,
      total: q.total,
      balance_due: q.total,
      notes: q.notes,
      terms: q.terms,
      branch_id: branchId,
      created_by: profile?.id,
    }).select().maybeSingle();

    if (error || !inv) {
      alert('Failed to create invoice: ' + (error?.message ?? 'unknown error'));
      return;
    }
    if (items) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(
        items.map((item) => {
          const { id, quotation_id, ...fields } = item;  // eslint-disable-line @typescript-eslint/no-unused-vars
          return { ...fields, invoice_id: inv.id };
        })
      );
      if (itemErr) {
        alert('Invoice created but line items failed: ' + itemErr.message);
        loadQuotations();
        return;
      }
    }
    const { error: qErr } = await supabase.from('quotations').update({ status: 'accepted' }).eq('id', q.id);
    if (qErr) { alert('Invoice created but quotation status update failed: ' + qErr.message); }
    alert(`Invoice ${invoiceNumber} created successfully!`);
    loadQuotations();
  };

  const filtered = quotations.filter(q =>
    q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
    q.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search quotations..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> New Quotation
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Quote #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valid Until</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">No quotations found</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{q.quotation_number}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{q.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDate(q.issue_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{q.valid_until ? formatDate(q.valid_until) : '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right">{formatCurrency(q.total)}</td>
                  <td className="px-4 py-3">
                    <select value={q.status} onChange={e => updateStatus(q, e.target.value as Quotation['status'])}
                      className="text-xs border-0 bg-transparent focus:outline-none cursor-pointer">
                      {['draft','sent','accepted','rejected','expired'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    {statusBadge(q.status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(q)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="View/Print">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(q)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteQuotation(q)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                      {(q.status === 'draft' || q.status === 'sent' || q.status === 'accepted') && (
                        <button onClick={() => convertToInvoice(q)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Convert to Invoice">
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <QuotationFormModal
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadQuotations(); }}
        />
      )}
      {showView && viewing && (
        <QuotationView quotation={viewing} onClose={() => setShowView(false)} />
      )}
    </div>
  );
}
