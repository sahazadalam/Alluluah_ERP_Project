import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Customer } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX } from 'lucide-react';

const emptyCustomer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'branch_id'> = {
  name: '', email: '', phone: '', address: '', trn: '', city: '', country: 'UAE',
  credit_limit: 0, balance: 0, is_active: true, notes: '',
};

interface Props {
  branchFilter: string | null;
}

export default function CustomersPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyCustomer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadCustomers(); }, [branchFilter]);

  const loadCustomers = async () => {
    setLoading(true);
    let query = supabase.from('customers').select('*').order('name');
    if (branchFilter) query = query.eq('branch_id', branchFilter);
    const { data } = await query;
    setCustomers(data ?? []);
    setLoading(false);
  };

  const openAdd = () => { setEditing(null); setForm(emptyCustomer); setError(''); setShowModal(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    const { id, created_at, updated_at, branch_id, ...rest } = c;  // eslint-disable-line @typescript-eslint/no-unused-vars
    setForm(rest); setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    const branchId = branchFilter || profile?.branch_id;
    if (editing) {
      const { error } = await supabase.from('customers').update({ ...form, branch_id: branchId, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('customers').insert({ ...form, branch_id: branchId });
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    loadCustomers();
  };

  const toggleActive = async (c: Customer) => {
    await supabase.from('customers').update({ is_active: !c.is_active }).eq('id', c.id);
    loadCustomers();
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    loadCustomers();
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
          </div>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> Add Customer
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">TRN</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">City</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Credit Limit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">No customers found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 text-sm">{c.name}</div>
                    <div className="text-xs text-slate-400">Added {formatDate(c.created_at)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <div>{c.phone}</div>
                    <div className="text-xs text-slate-400">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.trn || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.city || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-800 text-right font-medium">{formatCurrency(c.credit_limit)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteCustomer(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                      <button onClick={() => toggleActive(c)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        {c.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Customer' : 'Add Customer'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Company/Customer Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TRN (Tax Reg. No.)</label>
            <input value={form.trn} onChange={e => setForm({ ...form, trn: e.target.value })}
              placeholder="100XXXXXXXXX..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (AED)</label>
            <input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: Number(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
            <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving...' : editing ? 'Update Customer' : 'Add Customer'}
          </button>
          <button onClick={() => setShowModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
