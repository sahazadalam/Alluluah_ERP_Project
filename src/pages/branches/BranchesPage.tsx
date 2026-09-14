import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Branch } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, Building, MapPin, Phone, Mail, Star } from 'lucide-react';

const emptyBranch = {
  name: '', code: '', address: '', phone: '', email: '', is_head_office: false, is_active: true, company_id: null as string | null
};

const defaultCompanyId = async () => {
  const { data } = await supabase.from('companies').select('id').limit(1).maybeSingle();
  return data?.id;
};

export default function BranchesPage() {
  const { profile, refreshProfile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyBranch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadBranches(); }, []);

  const loadBranches = async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches(data ?? []);
    setLoading(false);
  };

  const deleteBranch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this branch?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    await loadBranches();
    await refreshProfile();
  };

  const openAdd = () => { setEditing(null); setForm(emptyBranch); setError(''); setShowModal(true); };
  const openEdit = (b: Branch) => { setEditing(b); setForm({ name: b.name, code: b.code, address: b.address, phone: b.phone, email: b.email, is_head_office: b.is_head_office, is_active: b.is_active, company_id: b.company_id }); setError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) { setError('Name and Code are required'); return; }
    setSaving(true);
    setError('');

    const resolvedCompanyId = editing?.company_id ?? form.company_id ?? profile?.company_id ?? await defaultCompanyId();

    if (editing) {
      const { error } = await supabase.from('branches').update({ ...form, company_id: resolvedCompanyId }).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('branches').insert({ ...form, company_id: resolvedCompanyId });
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    await loadBranches();
    await refreshProfile();
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> Add Branch
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-10 text-slate-400">Loading...</div>
        ) : branches.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-400">No branches found</div>
        ) : (
          branches.map(b => (
            <div key={b.id} className={`bg-white rounded-xl border ${b.is_head_office ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'} p-5 hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${b.is_head_office ? 'bg-blue-100' : 'bg-slate-100'} rounded-xl flex items-center justify-center`}>
                    <Building size={18} className={b.is_head_office ? 'text-blue-600' : 'text-slate-500'} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      {b.name}
                      {b.is_head_office && <Star size={12} className="text-blue-500 fill-blue-500" />}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{b.code}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(b)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteBranch(b.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                {b.address && <div className="flex items-center gap-2"><MapPin size={12} className="text-slate-400" />{b.address}</div>}
                {b.phone && <div className="flex items-center gap-2"><Phone size={12} className="text-slate-400" />{b.phone}</div>}
                {b.email && <div className="flex items-center gap-2"><Mail size={12} className="text-slate-400" />{b.email}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Branch' : 'Add Branch'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Branch Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Branch Code *</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g., DXB-01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_head_office} onChange={e => setForm(f => ({ ...f, is_head_office: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
              <span className="text-sm text-slate-700">Head Office</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : editing ? 'Update Branch' : 'Add Branch'}
            </button>
            <button onClick={() => setShowModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
