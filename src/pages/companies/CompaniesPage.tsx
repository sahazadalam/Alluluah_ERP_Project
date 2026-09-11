import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Company } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { Plus, Edit2, Trash2, Globe, MapPin, Phone, Mail, Globe2, Upload, Image, ToggleLeft, ToggleRight } from 'lucide-react';

const emptyForm = {
  name: '', legal_name: '', trn: '', address: '', phone: '',
  email: '', website: '', is_active: true,
  watermark_enabled: false, watermark_text: 'Tahir Muhammad',
};

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCompanies(); }, []);

  const loadCompanies = async () => {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('name');
    setCompanies(data ?? []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview('');
    setError('');
    setShowModal(true);
  };

  const deleteCompany = async (id: string, name: string) => {
    if (!window.confirm(`Delete company "${name}"? This action cannot be undone.`)) return;
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    loadCompanies();
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name, legal_name: c.legal_name, trn: c.trn, address: c.address,
      phone: c.phone, email: c.email, website: c.website, is_active: c.is_active,
      watermark_enabled: c.watermark_enabled ?? false,
      watermark_text: c.watermark_text ?? 'Tahir Muhammad',
    });
    setLogoFile(null);
    setLogoPreview(c.logo_url ?? '');
    setError('');
    setShowModal(true);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (companyId: string): Promise<{ url: string; path: string }> => {
    if (!logoFile) return { url: editing?.logo_url ?? '', path: editing?.logo_storage_path ?? '' };
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(logoFile.type)) {
      throw new Error('Invalid file type. Please upload PNG, JPG, SVG, or WEBP.');
    }
    if (logoFile.size > 5 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 5MB.');
    }
    setUploading(true);
    const timestamp = Date.now();
    const safeName = logoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `company-logos/${companyId}-${timestamp}-${safeName}`;
    const { error: upErr } = await supabase.storage.from('company-assets').upload(path, logoFile, {
      contentType: logoFile.type,
      upsert: true,
    });
    setUploading(false);
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from('company-assets').getPublicUrl(path);
    return { url: data.publicUrl, path };
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Company name is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const { url, path } = await uploadLogo(editing.id);
        const { error: e } = await supabase.from('companies').update({
          ...form,
          logo_url: url || editing.logo_url,
          logo_storage_path: path || editing.logo_storage_path,
        }).eq('id', editing.id);
        if (e) { setError(e.message); setSaving(false); return; }
      } else {
        const { data: created, error: e } = await supabase.from('companies').insert({
          ...form, logo_url: '', logo_storage_path: '',
        }).select().maybeSingle();
        if (e || !created) { setError(e?.message ?? 'Failed to create'); setSaving(false); return; }
        if (logoFile) {
          const { url, path } = await uploadLogo(created.id);
          await supabase.from('companies').update({ logo_url: url, logo_storage_path: path }).eq('id', created.id);
        }
      }
      setSaving(false);
      setShowModal(false);
      loadCompanies();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> Add Company
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-10 text-slate-400">Loading...</div>
        ) : companies.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-400">No companies found</div>
        ) : companies.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="w-12 h-12 rounded-xl object-contain border border-slate-100 bg-white p-1" />
                ) : (
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                    <Globe size={20} className="text-primary-600" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  {c.legal_name && c.legal_name !== c.name && <div className="text-xs text-slate-500">{c.legal_name}</div>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(c)}
                  className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => deleteCompany(c.id, c.name)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {c.trn && <div><span className="text-slate-400">TRN:</span> <span className="text-slate-700">{c.trn}</span></div>}
              {c.phone && <div className="flex items-center gap-1 text-slate-600"><Phone size={12} className="text-slate-400" />{c.phone}</div>}
              {c.email && <div className="flex items-center gap-1 text-slate-600"><Mail size={12} className="text-slate-400" />{c.email}</div>}
              {c.website && <div className="flex items-center gap-1"><Globe2 size={12} className="text-slate-400" /><a href={c.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-sm">{c.website}</a></div>}
              {c.address && <div className="col-span-2 flex items-start gap-1 text-slate-600"><MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />{c.address}</div>}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {c.is_active ? 'Active' : 'Inactive'}
              </span>
              {c.watermark_enabled && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Image size={11} /> Watermark: {c.watermark_text}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Company' : 'Add Company'} size="lg">
        {/* Logo upload */}
        <div className="flex items-center gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="w-16 h-16 rounded-xl object-contain border border-slate-200 bg-white p-1" />
          ) : (
            <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center">
              <Image size={24} className="text-slate-400" />
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Company Logo</div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onFileChange} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 transition-colors">
              <Upload size={13} /> {logoPreview ? 'Change Logo' : 'Upload Logo'}
            </button>
            <p className="text-xs text-slate-400 mt-1">PNG, JPG or SVG. Appears on invoices, quotations, and reports.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Company Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Legal Name</label>
            <input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>TRN (Tax Registration)</label>
            <input value={form.trn} onChange={e => setForm(f => ({ ...f, trn: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
          </div>

          {/* Watermark settings */}
          <div className="col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Dashboard Watermark</div>
                <div className="text-xs text-slate-400">Shows watermark text on dashboard and reports</div>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, watermark_enabled: !f.watermark_enabled }))}
                className="text-primary-600 hover:text-primary-700 transition-colors">
                {form.watermark_enabled ? <ToggleRight size={28} className="text-primary-600" /> : <ToggleLeft size={28} className="text-slate-400" />}
              </button>
            </div>
            {form.watermark_enabled && (
              <div>
                <label className={labelCls}>Watermark Text</label>
                <input value={form.watermark_text} onChange={e => setForm(f => ({ ...f, watermark_text: e.target.value }))} className={inputCls} />
              </div>
            )}
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-primary-600" />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving || uploading}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {saving || uploading ? 'Saving...' : editing ? 'Update Company' : 'Add Company'}
          </button>
          <button onClick={() => setShowModal(false)}
            className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
