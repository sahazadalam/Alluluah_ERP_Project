import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Quotation, QuotationDocument, Customer, Product } from '../../lib/types';
import { formatCurrency } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, X } from 'lucide-react';
import QuotationDocuments from './QuotationDocuments';

interface Props {
  editing: Quotation | null;
  onClose: () => void;
  onSaved: () => void;
}

interface LineItem {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  line_total: number;
  vat_amount: number;
  total: number;
  sort_order: number;
}

const emptyLine = (): LineItem => ({
  product_id: null, description: '', quantity: 1, unit_price: 0,
  discount_percent: 0, vat_rate: 5, line_total: 0, vat_amount: 0, total: 0, sort_order: 0,
});

const calcLine = (l: LineItem): LineItem => {
  const line_total = l.quantity * l.unit_price * (1 - l.discount_percent / 100);
  const vat_amount = line_total * (l.vat_rate / 100);
  return { ...l, line_total, vat_amount, total: line_total + vat_amount };
};

export default function QuotationFormModal({ editing, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    customer_id: '' as string | null, customer_name: '', customer_trn: '',
    issue_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: '', terms: 'This quotation is valid for 30 days.',
    status: 'draft' as Quotation['status'],
  });
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<QuotationDocument[]>([]);
  const savedQuotationId = editing?.id ?? null;

  useEffect(() => {
    loadData();
    if (editing) loadEditing();
  }, []);

  const loadData = async () => {
    const [{ data: custs }, { data: prods }] = await Promise.all([
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]);
    setCustomers(custs ?? []);
    setProducts(prods ?? []);
  };

  const loadEditing = async () => {
    if (!editing) return;
    setForm({
      customer_id: editing.customer_id, customer_name: editing.customer_name,
      customer_trn: editing.customer_trn, issue_date: editing.issue_date,
      valid_until: editing.valid_until ?? '', notes: editing.notes,
      terms: editing.terms, status: editing.status,
    });
    const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', editing.id).order('sort_order');
    setLines(items?.length ? items.map(i => ({
      id: i.id, product_id: i.product_id, description: i.description,
      quantity: i.quantity, unit_price: i.unit_price, discount_percent: i.discount_percent,
      vat_rate: i.vat_rate, line_total: i.line_total, vat_amount: i.vat_amount, total: i.total, sort_order: i.sort_order,
    })) : [emptyLine()]);
    loadDocuments(editing.id);
  };

  const loadDocuments = async (qId: string) => {
    const { data: docs } = await supabase.from('quotation_documents').select('*').eq('quotation_id', qId).order('uploaded_at', { ascending: false });
    setDocuments(docs ?? []);
  };

  const selectCustomer = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({ ...f, customer_id: id, customer_name: c?.name ?? '', customer_trn: c?.trn ?? '' }));
  };

  const selectProduct = (idx: number, productId: string) => {
    const p = products.find(p => p.id === productId);
    if (!p) return;
    const updated = lines.map((l, i) => i === idx ? calcLine({ ...l, product_id: productId, description: p.name, unit_price: p.selling_price }) : l);
    setLines(updated);
  };

  const updateLine = (idx: number, field: keyof LineItem, value: unknown) => {
    const updated = lines.map((l, i) => i === idx ? calcLine({ ...l, [field]: value }) : l);
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { ...emptyLine(), sort_order: lines.length }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const vatAmount = lines.reduce((s, l) => s + l.vat_amount, 0);
  const total = subtotal + vatAmount;

  const handleSave = async () => {
    if (!form.customer_name.trim()) { setError('Customer name is required'); return; }
    if (lines.every(l => !l.description.trim())) { setError('At least one line item is required'); return; }
    setSaving(true);
    setError('');

    let quotationNumber = editing?.quotation_number ?? '';
    if (!editing) {
      const ts = Date.now().toString().slice(-6);
      quotationNumber = `QT-${ts}`;
    }

    const payload = {
      ...form, quotation_number: quotationNumber,
      branch_id: editing?.branch_id ?? profile?.branch_id,
      subtotal, discount_amount: 0, vat_amount: vatAmount, total,
      created_by: editing?.created_by ?? profile?.id,
    };

    let qId = editing?.id;
    if (editing) {
      const { error: updErr } = await supabase.from('quotations').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (updErr) { setError(updErr.message); setSaving(false); return; }
      const { error: delErr } = await supabase.from('quotation_items').delete().eq('quotation_id', editing.id);
      if (delErr) { setError(delErr.message); setSaving(false); return; }
    } else {
      const { data, error: err } = await supabase.from('quotations').insert(payload).select().maybeSingle();
      if (err) { setError(err.message); setSaving(false); return; }
      qId = data?.id;
    }

    if (qId) {
      const validLines = lines.filter(l => l.description.trim());
      const { error: itemErr } = await supabase.from('quotation_items').insert(
        validLines.map((l, i) => {
          const { id, ...fields } = l;  // eslint-disable-line @typescript-eslint/no-unused-vars
          return { ...fields, quotation_id: qId, sort_order: i };
        })
      );
      if (itemErr) { setError(itemErr.message); setSaving(false); return; }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Quotation' : 'New Quotation'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer *</label>
              <select value={form.customer_id ?? ''} onChange={e => selectCustomer(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select Customer --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!form.customer_id && (
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="Or type customer name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer TRN</label>
              <input value={form.customer_trn} onChange={e => setForm(f => ({ ...f, customer_trn: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
              <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Quotation['status'] }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['draft','sent','accepted','rejected','expired'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
              <button onClick={addLine} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus size={13} /> Add Line
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium w-64">Description</th>
                    <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-16">Qty</th>
                    <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-24">Unit Price</th>
                    <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-16">Disc%</th>
                    <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-16">VAT%</th>
                    <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium w-24">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <select className="w-full text-xs border border-slate-200 rounded px-2 py-1 mb-1"
                          value={line.product_id ?? ''} onChange={e => selectProduct(idx, e.target.value)}>
                          <option value="">-- Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)}
                          placeholder="Description" className="w-full text-xs border border-slate-200 rounded px-2 py-1" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.quantity}
                          onChange={e => updateLine(idx, 'quantity', Number(e.target.value))}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.unit_price}
                          onChange={e => updateLine(idx, 'unit_price', Number(e.target.value))}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max="100" step="0.01" value={line.discount_percent}
                          onChange={e => updateLine(idx, 'discount_percent', Number(e.target.value))}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max="100" step="0.01" value={line.vat_rate}
                          onChange={e => updateLine(idx, 'vat_rate', Number(e.target.value))}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-slate-800">
                        {formatCurrency(line.total)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeLine(idx)} className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-3">
              <div className="w-56 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>VAT (5%)</span>
                  <span className="font-medium">{formatCurrency(vatAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-800 font-bold text-base border-t border-slate-200 pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Terms & Conditions</label>
              <textarea value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          <QuotationDocuments
            quotationId={savedQuotationId}
            documents={documents}
            onDocumentsChanged={() => savedQuotationId && loadDocuments(savedQuotationId)}
          />
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
          {error && <span className="text-red-600 text-sm flex-1">{error}</span>}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : editing ? 'Update Quotation' : 'Create Quotation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
