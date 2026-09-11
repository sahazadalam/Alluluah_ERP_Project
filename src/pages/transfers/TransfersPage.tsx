import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { StockTransfer, Product, StockTransferItem } from '../../lib/types';
import { formatDate } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { statusBadge } from '../../components/common/Badge';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Eye, Check, X, Truck, ArrowLeftRight, Trash2 } from 'lucide-react';

interface Props {
  branchFilter: string | null;
}

const emptyItem = (): StockTransferItem => ({
  id: '', transfer_id: '', product_id: '', quantity_requested: 1, quantity_shipped: 0, quantity_received: 0, notes: ''
});

export default function TransfersPage({ branchFilter }: Props) {
  const { profile, isGlobalAdmin, branches } = useAuth();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewing, setViewing] = useState<StockTransfer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [form, setForm] = useState({
    from_branch_id: '',
    to_branch_id: '',
    notes: ''
  });
  const [items, setItems] = useState<StockTransferItem[]>([emptyItem()]);

  useEffect(() => { loadData(); }, [branchFilter]);
  useEffect(() => { loadProducts(); }, []);

  const loadData = async () => {
    setLoading(true);
    let query = supabase.from('stock_transfers').select('*, from_branch:branches!from_branch_id(*), to_branch:branches!to_branch_id(*)').order('created_at', { ascending: false });
    if (branchFilter) {
      query = query.or(`from_branch_id.eq.${branchFilter},to_branch_id.eq.${branchFilter}`);
    }
    const { data } = await query;
    setTransfers(data ?? []);
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    setProducts(data ?? []);
  };

  const openCreate = () => {
    setForm({ from_branch_id: branchFilter || '', to_branch_id: '', notes: '' });
    setItems([emptyItem()]);
    setError('');
    setShowModal(true);
  };

  const openView = async (t: StockTransfer) => {
    const { data: items } = await supabase.from('stock_transfer_items').select('*, product:products(*)').eq('transfer_id', t.id);
    setViewing({ ...t, items: items ?? [] });
    setShowViewModal(true);
  };

  const updateStatus = async (t: StockTransfer, status: StockTransfer['status']) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'approved') { updates.approved_by = profile?.id; updates.approved_at = new Date().toISOString(); }
    if (status === 'shipped') { updates.shipped_by = profile?.id; updates.shipped_at = new Date().toISOString(); }
    if (status === 'received') { updates.received_by = profile?.id; updates.received_at = new Date().toISOString(); }
    if (status === 'rejected') { updates.approved_by = profile?.id; updates.approved_at = new Date().toISOString(); }

    const { error: statusErr } = await supabase.from('stock_transfers').update(updates).eq('id', t.id);
    if (statusErr) { setError('Failed to update status: ' + statusErr.message); return; }

    // If received, update branch inventory — need to fetch items first
    if (status === 'received') {
      const { data: transferItems, error: itemsErr } = await supabase
        .from('stock_transfer_items').select('*').eq('transfer_id', t.id);
      if (itemsErr || !transferItems) { setError('Failed to load transfer items for inventory update: ' + (itemsErr?.message ?? 'no data')); return; }

      for (const item of transferItems) {
        // Add to receiving branch
        const { data: existing } = await supabase.from('branch_inventory').select('*')
          .eq('branch_id', t.to_branch_id).eq('product_id', item.product_id).maybeSingle();
        if (existing) {
          const { error: updErr } = await supabase.from('branch_inventory')
            .update({ quantity: existing.quantity + item.quantity_received }).eq('id', existing.id);
          if (updErr) { setError('Failed to update receiving branch inventory: ' + updErr.message); return; }
        } else {
          const { error: insErr } = await supabase.from('branch_inventory')
            .insert({ branch_id: t.to_branch_id, product_id: item.product_id, quantity: item.quantity_received });
          if (insErr) { setError('Failed to create receiving branch inventory: ' + insErr.message); return; }
        }
        // Remove from sending branch
        const { data: fromExisting } = await supabase.from('branch_inventory').select('*')
          .eq('branch_id', t.from_branch_id).eq('product_id', item.product_id).maybeSingle();
        if (fromExisting) {
          const { error: fromUpdErr } = await supabase.from('branch_inventory')
            .update({ quantity: fromExisting.quantity - item.quantity_shipped }).eq('id', fromExisting.id);
          if (fromUpdErr) { setError('Failed to update sending branch inventory: ' + fromUpdErr.message); return; }
        }
      }
    }

    loadData();
  };

  const saveTransfer = async () => {
    if (!form.from_branch_id || !form.to_branch_id) { setError('Both branches are required'); return; }
    if (form.from_branch_id === form.to_branch_id) { setError('Cannot transfer to same branch'); return; }
    const validItems = items.filter(i => i.product_id && i.quantity_requested > 0);
    if (validItems.length === 0) { setError('At least one item is required'); return; }

    setSaving(true);
    setError('');
    const ts = Date.now().toString().slice(-6);
    const { data: transfer, error: err } = await supabase.from('stock_transfers').insert({
      transfer_number: `ST-${ts}`,
      from_branch_id: form.from_branch_id,
      to_branch_id: form.to_branch_id,
      notes: form.notes,
      status: 'requested',
      requested_by: profile?.id,
    }).select().maybeSingle();

    if (err) { setError(err.message); setSaving(false); return; }
    if (transfer) {
      await supabase.from('stock_transfer_items').insert(
        validItems.map(i => ({ ...i, id: undefined, transfer_id: transfer.id }))
      );
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const deleteTransfer = async (t: StockTransfer) => {
    if (!confirm(`Delete transfer ${t.transfer_number}? This cannot be undone.`)) return;
    await supabase.from('stock_transfer_items').delete().eq('transfer_id', t.id);
    await supabase.from('stock_transfers').delete().eq('id', t.id);
    loadData();
  };

  const updateItem = (idx: number, field: keyof StockTransferItem, value: unknown) => {
    setItems(items.map((i, index) => index === idx ? { ...i, [field]: value } : i));
  };

  const filtered = transfers.filter(t => {
    const matchesSearch = t.transfer_number.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ['all', 'requested', 'approved', 'rejected', 'shipped', 'received', 'cancelled'];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search transfers..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
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
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> New Transfer
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Transfer #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No transfers found</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight size={14} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{t.transfer_number}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.from_branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.to_branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3">{statusBadge(t.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(t)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Eye size={14} />
                      </button>
                      {t.status === 'requested' && isGlobalAdmin && (
                        <>
                          <button onClick={() => updateStatus(t, 'approved')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Approve">
                            <Check size={14} />
                          </button>
                          <button onClick={() => updateStatus(t, 'rejected')} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Reject">
                            <X size={14} />
                          </button>
                        </>
                      )}
                      {t.status === 'approved' && (isGlobalAdmin || profile?.branch_id === t.from_branch_id) && (
                        <button onClick={() => updateStatus(t, 'shipped')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Mark Shipped">
                          <Truck size={14} />
                        </button>
                      )}
                      {t.status === 'shipped' && (isGlobalAdmin || profile?.branch_id === t.to_branch_id) && (
                        <button onClick={() => updateStatus(t, 'received')} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Mark Received">
                          <Check size={14} />
                        </button>
                      )}
                      <button onClick={() => deleteTransfer(t)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Stock Transfer" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From Branch *</label>
              <select value={form.from_branch_id} onChange={e => setForm(f => ({ ...f, from_branch_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select --</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To Branch *</label>
              <select value={form.to_branch_id} onChange={e => setForm(f => ({ ...f, to_branch_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select --</option>
                {branches.filter(b => b.id !== form.from_branch_id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Items</label>
              <button onClick={() => setItems([...items, emptyItem()])} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus size={12} /> Add Item
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <select value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Product --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity_requested} onChange={e => updateItem(idx, 'quantity_requested', Number(e.target.value))}
                  placeholder="Qty" className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={saveTransfer} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Creating...' : 'Create Transfer Request'}
            </button>
            <button onClick={() => setShowModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Transfer Details" size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4">
              <div><span className="text-slate-500 text-xs">Transfer #</span><div className="font-semibold">{viewing.transfer_number}</div></div>
              <div><span className="text-slate-500 text-xs">Status</span><div className="mt-0.5">{statusBadge(viewing.status)}</div></div>
              <div><span className="text-slate-500 text-xs">From</span><div className="font-medium">{viewing.from_branch?.name}</div></div>
              <div><span className="text-slate-500 text-xs">To</span><div className="font-medium">{viewing.to_branch?.name}</div></div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Product</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Requested</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Shipped</th>
                  <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(viewing.items ?? []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{item.product?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{item.quantity_requested}</td>
                    <td className="px-3 py-2 text-right">{item.quantity_shipped || '—'}</td>
                    <td className="px-3 py-2 text-right">{item.quantity_received || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewing.notes && <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{viewing.notes}</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
