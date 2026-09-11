import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Invoice } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { statusBadge } from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Eye, Edit2, Trash2, DollarSign, Receipt } from 'lucide-react';
import InvoiceFormModal from './InvoiceFormModal';
import InvoiceView from './InvoiceView';

interface Props {
  branchFilter: string | null;
}

export default function InvoicesPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadInvoices(); }, [branchFilter]);

  const loadInvoices = async () => {
    setLoading(true);
    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (branchFilter) query = query.eq('branch_id', branchFilter);
    const { data } = await query;
    setInvoices(data ?? []);
    setLoading(false);
  };

  const openView = async (inv: Invoice) => {
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('sort_order'),
      supabase.from('payments').select('*').eq('invoice_id', inv.id).order('payment_date'),
    ]);
    setViewing({ ...inv, items: items ?? [], payments: payments ?? [] });
    setShowView(true);
  };

  const openPayment = (inv: Invoice) => {
    setPaymentInvoice(inv);
    setPaymentForm({ amount: inv.balance_due, payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', reference: '', notes: '' });
    setShowPayment(true);
  };

  const recordPayment = async () => {
    if (!paymentInvoice) return;
    if (paymentForm.amount <= 0) { alert('Payment amount must be greater than zero'); return; }
    if (paymentForm.amount > paymentInvoice.balance_due) { alert('Payment cannot exceed the remaining balance'); return; }
    setSaving(true);
    const newPaid = (paymentInvoice.paid_amount ?? 0) + paymentForm.amount;
    const newBalance = Math.max(0, paymentInvoice.total - newPaid);
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';
    const branchId = branchFilter || profile?.branch_id;

    const { error: payErr } = await supabase.from('payments').insert({ ...paymentForm, invoice_id: paymentInvoice.id, branch_id: branchId, created_by: profile?.id });
    if (payErr) { alert('Failed to record payment: ' + payErr.message); setSaving(false); return; }
    const { error: invErr } = await supabase.from('invoices').update({ paid_amount: newPaid, balance_due: newBalance, status: newStatus }).eq('id', paymentInvoice.id);
    if (invErr) { alert('Payment recorded but invoice update failed: ' + invErr.message); setSaving(false); return; }
    setSaving(false);
    setShowPayment(false);
    loadInvoices();
  };

  const deleteInvoice = async (id: string, invoiceNumber: string) => {
    if (!confirm(`Delete invoice ${invoiceNumber}? This will also remove its items and payments.`)) return;
    const { error: itemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
    if (itemsErr) { alert('Failed to delete invoice items: ' + itemsErr.message); return; }
    const { error: payErr } = await supabase.from('payments').delete().eq('invoice_id', id);
    if (payErr) { alert('Failed to delete payments: ' + payErr.message); return; }
    const { error: invErr } = await supabase.from('invoices').delete().eq('id', id);
    if (invErr) { alert('Failed to delete invoice: ' + invErr.message); return; }
    loadInvoices();
  };

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.invoice_number.toLowerCase().includes(search.toLowerCase()) || inv.customer_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ['all', 'draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {statuses.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> New Invoice
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Issue Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">No invoices found</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Receipt size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{inv.invoice_number}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{inv.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-right">
                    <span className={inv.balance_due > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(inv.balance_due)}</span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(inv)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="View">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => { setEditing(inv); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteInvoice(inv.id, inv.invoice_number)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                      {inv.balance_due > 0 && (
                        <button onClick={() => openPayment(inv)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Record Payment">
                          <DollarSign size={14} />
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
        <InvoiceFormModal editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadInvoices(); }} />
      )}
      {showView && viewing && (
        <InvoiceView invoice={viewing} onClose={() => setShowView(false)} />
      )}

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Record Payment" size="md">
        {paymentInvoice && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="font-medium text-slate-800">{paymentInvoice.invoice_number} — {paymentInvoice.customer_name}</div>
              <div className="text-slate-500 mt-0.5">Balance Due: <span className="font-semibold text-red-600">{formatCurrency(paymentInvoice.balance_due)}</span></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (AED)</label>
              <input type="number" step="0.01" value={paymentForm.amount}
                onChange={e => setPaymentForm(f => ({ ...f, amount: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
              <input type="date" value={paymentForm.payment_date}
                onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
              <select value={paymentForm.payment_method}
                onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['cash', 'bank_transfer', 'cheque', 'card', 'other'].map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
              <input value={paymentForm.reference}
                onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="Cheque #, Transfer ID..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={recordPayment} disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
              <button onClick={() => setShowPayment(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
