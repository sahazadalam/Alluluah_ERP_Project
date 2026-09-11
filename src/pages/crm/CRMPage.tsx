import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lead, LeadActivity, LeadReminder } from '../../lib/types';
import { formatDate, formatCurrency } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, Search, Phone, MessageSquare, Mail,
  User, X, ChevronRight, CheckCircle, Clock, Star,
  TrendingUp, AlertCircle, Edit2, Trash2, Eye
} from 'lucide-react';

interface Props { branchFilter: string | null; }

const STATUS_CONFIG: Record<Lead['status'], { label: string; color: string; bg: string }> = {
  new_lead: { label: 'New Lead', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  contacted: { label: 'Contacted', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
  follow_up: { label: 'Follow Up', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  quoted: { label: 'Quoted', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  won: { label: 'Won', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  lost: { label: 'Lost', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  inactive: { label: 'Inactive', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' },
};

const PRIORITY_CONFIG: Record<Lead['priority'], { color: string; label: string }> = {
  low: { color: 'text-slate-400', label: 'Low' },
  medium: { color: 'text-blue-500', label: 'Medium' },
  high: { color: 'text-amber-500', label: 'High' },
  urgent: { color: 'text-red-500', label: 'Urgent' },
};

const ACTIVITY_ICONS: Record<LeadActivity['activity_type'], React.ReactNode> = {
  call: <Phone size={13} className="text-green-600" />,
  whatsapp: <MessageSquare size={13} className="text-green-500" />,
  email: <Mail size={13} className="text-blue-500" />,
  meeting: <User size={13} className="text-purple-500" />,
  note: <Edit2 size={13} className="text-slate-500" />,
  follow_up: <Clock size={13} className="text-amber-500" />,
  quotation: <Star size={13} className="text-orange-500" />,
  invoice: <TrendingUp size={13} className="text-teal-500" />,
  site_visit: <Eye size={13} className="text-cyan-600" />,
};

const emptyLead = (): Partial<Lead> => ({
  full_name: '', email: '', phone: '', whatsapp: '', company_name: '',
  position: '', address: '', source: 'walk_in', status: 'new_lead',
  priority: 'medium', estimated_value: 0, notes: '', lost_reason: '',
  next_follow_up: null,
});

export default function CRMPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [reminders, setReminders] = useState<LeadReminder[]>([]);
  const [form, setForm] = useState(emptyLead());
  const [activityForm, setActivityForm] = useState({ activity_type: 'call' as LeadActivity['activity_type'], subject: '', description: '', outcome: '', next_action: '', next_action_date: '' });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadLeads(); }, [branchFilter]);

  const loadLeads = async () => {
    setLoading(true);
    let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setLeads(data ?? []);
    setLoading(false);
  };

  const openDetail = async (lead: Lead) => {
    setDetailLead(lead);
    const [{ data: acts }, { data: rems }] = await Promise.all([
      supabase.from('lead_activities').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }),
      supabase.from('lead_reminders').select('*').eq('lead_id', lead.id).order('reminder_date'),
    ]);
    setActivities(acts ?? []);
    setReminders(rems ?? []);
    setShowDetail(true);
  };

  const openAdd = () => { setEditing(null); setForm(emptyLead()); setShowForm(true); };
  const openEdit = (l: Lead) => {
    setEditing(l);
    const { id, created_at, updated_at, created_by, ...rest } = l;  // eslint-disable-line @typescript-eslint/no-unused-vars
    setForm(rest); setShowForm(true);
  };

  const saveLead = async () => {
    if (!form.full_name?.trim()) return;
    setSaving(true);
    const payload = { ...form, branch_id: branchFilter ?? profile?.branch_id ?? null, created_by: editing?.created_by ?? profile?.id };
    if (editing) {
      const { error } = await supabase.from('leads').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { alert('Failed to save: ' + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('leads').insert(payload);
      if (error) { alert('Failed to save: ' + error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    loadLeads();
  };

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) { alert('Failed to delete: ' + error.message); return; }
    loadLeads();
  };

  const updateStatus = async (lead: Lead, status: Lead['status']) => {
    const { error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', lead.id);
    if (error) { alert('Failed to update status: ' + error.message); return; }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l));
    if (detailLead?.id === lead.id) setDetailLead(d => d ? { ...d, status } : d);
  };

  const addActivity = async () => {
    if (!detailLead || !activityForm.description.trim()) return;
    setSaving(true);
    await supabase.from('lead_activities').insert({
      ...activityForm,
      lead_id: detailLead.id,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      created_by: profile?.id,
      next_action_date: activityForm.next_action_date || null,
    });
    await supabase.from('leads').update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', detailLead.id);
    const { data } = await supabase.from('lead_activities').select('*').eq('lead_id', detailLead.id).order('created_at', { ascending: false });
    setActivities(data ?? []);
    setActivityForm({ activity_type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_date: '' });
    setShowActivityForm(false);
    setSaving(false);
  };

  const markReminderDone = async (id: string) => {
    await supabase.from('lead_reminders').update({ is_done: true, done_at: new Date().toISOString(), done_by: profile?.id }).eq('id', id);
    setReminders(prev => prev.map(r => r.id === id ? { ...r, is_done: true } : r));
  };

  const filtered = leads.filter(l => {
    const matchSearch = l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search) || l.company_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new_lead').length,
    followUp: leads.filter(l => l.status === 'follow_up').length,
    won: leads.filter(l => l.status === 'won').length,
    pipeline: leads.filter(l => !['won','lost','inactive'].includes(l.status)).reduce((s, l) => s + (l.estimated_value ?? 0), 0),
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total Leads', value: stats.total, color: 'text-slate-700', icon: <User size={16} className="text-slate-400" /> },
          { label: 'New', value: stats.new, color: 'text-blue-700', icon: <Star size={16} className="text-blue-400" /> },
          { label: 'Follow Up', value: stats.followUp, color: 'text-amber-700', icon: <Clock size={16} className="text-amber-400" /> },
          { label: 'Won', value: stats.won, color: 'text-green-700', icon: <CheckCircle size={16} className="text-green-400" /> },
          { label: 'Pipeline Value', value: formatCurrency(stats.pipeline), color: 'text-teal-700', icon: <TrendingUp size={16} className="text-teal-400" /> },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-slate-500">{s.label}</span></div>
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {(['all', ...Object.keys(STATUS_CONFIG)] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s as Lead['status']]?.label ?? s}
              </button>
            ))}
          </div>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> New Lead
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Est. Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Follow Up</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">No leads found</td></tr>
              ) : filtered.map(lead => {
                const sc = STATUS_CONFIG[lead.status];
                const pc = PRIORITY_CONFIG[lead.priority];
                const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date();
                return (
                  <tr key={lead.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(lead)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm text-slate-800">{lead.full_name}</div>
                      <div className="text-xs text-slate-500">{lead.phone}{lead.company_name ? ` • ${lead.company_name}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 capitalize">{lead.source.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${pc.color}`}>{pc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{formatCurrency(lead.estimated_value)}</td>
                    <td className="px-4 py-3">
                      {lead.next_follow_up ? (
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {isOverdue && <AlertCircle size={11} className="inline mr-1" />}{formatDate(lead.next_follow_up)}
                        </span>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(lead)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><Edit2 size={13} /></button>
                        <button onClick={() => deleteLead(lead.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Lead' : 'New Lead'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Full Name *', field: 'full_name', colSpan: 2 },
                  { label: 'Phone', field: 'phone' },
                  { label: 'WhatsApp', field: 'whatsapp' },
                  { label: 'Email', field: 'email' },
                  { label: 'Company', field: 'company_name' },
                  { label: 'Position', field: 'position' },
                  { label: 'Address', field: 'address', colSpan: 2 },
                ].map(({ label, field, colSpan }) => (
                  <div key={field} className={colSpan === 2 ? 'col-span-2' : ''}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <input value={(form as Record<string, unknown>)[field] as string ?? ''}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as Lead['source'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(['walk_in','referral','website','social_media','cold_call','exhibition','other'] as const).map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Lead['status'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.entries(STATUS_CONFIG) as [Lead['status'], typeof STATUS_CONFIG[Lead['status']]][]).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Lead['priority'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(['low','medium','high','urgent'] as const).map(p => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Value (AED)</label>
                  <input type="number" value={form.estimated_value ?? 0}
                    onChange={e => setForm(f => ({ ...f, estimated_value: Number(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Next Follow-Up Date</label>
                  <input type="date" value={form.next_follow_up ?? ''}
                    onChange={e => setForm(f => ({ ...f, next_follow_up: e.target.value || null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea rows={3} value={form.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveLead} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail Panel */}
      {showDetail && detailLead && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
          <div className="relative ml-auto bg-white w-full max-w-xl h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-slate-800">{detailLead.full_name}</h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_CONFIG[detailLead.status].bg} ${STATUS_CONFIG[detailLead.status].color}`}>
                    {STATUS_CONFIG[detailLead.status].label}
                  </span>
                </div>
                <div className="text-sm text-slate-500">{detailLead.phone}{detailLead.company_name ? ` • ${detailLead.company_name}` : ''}</div>
              </div>
              <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Quick contact */}
              <div className="flex gap-2">
                {detailLead.phone && (
                  <a href={`tel:${detailLead.phone}`} className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100">
                    <Phone size={13} /> Call
                  </a>
                )}
                {detailLead.whatsapp && (
                  <a href={`https://wa.me/${detailLead.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100">
                    <MessageSquare size={13} /> WhatsApp
                  </a>
                )}
                {detailLead.email && (
                  <a href={`mailto:${detailLead.email}`} className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100">
                    <Mail size={13} /> Email
                  </a>
                )}
              </div>

              {/* Status update */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Update Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(STATUS_CONFIG) as [Lead['status'], typeof STATUS_CONFIG[Lead['status']]][]).map(([k, v]) => (
                    <button key={k} onClick={() => updateStatus(detailLead, k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${detailLead.status === k ? `${v.bg} ${v.color} ring-2 ring-offset-1 ring-current` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Source', value: detailLead.source.replace(/_/g,' ') },
                  { label: 'Priority', value: PRIORITY_CONFIG[detailLead.priority].label },
                  { label: 'Est. Value', value: formatCurrency(detailLead.estimated_value) },
                  { label: 'Next Follow-Up', value: detailLead.next_follow_up ? formatDate(detailLead.next_follow_up) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                    <div className="font-medium text-slate-800 capitalize">{value}</div>
                  </div>
                ))}
              </div>

              {detailLead.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">{detailLead.notes}</div>
              )}

              {/* Pending reminders */}
              {reminders.filter(r => !r.is_done).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reminders</div>
                  <div className="space-y-2">
                    {reminders.filter(r => !r.is_done).map(r => (
                      <div key={r.id} className="flex items-start justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-amber-800">{r.title}</div>
                          <div className="text-xs text-amber-600">{formatDate(r.reminder_date)}</div>
                        </div>
                        <button onClick={() => markReminderDone(r.id)} className="text-green-600 hover:text-green-700 ml-2">
                          <CheckCircle size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Activity Log</div>
                  <button onClick={() => setShowActivityForm(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700">
                    <Plus size={13} /> Log Activity
                  </button>
                </div>

                {showActivityForm && (
                  <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                        <select value={activityForm.activity_type} onChange={e => setActivityForm(f => ({ ...f, activity_type: e.target.value as LeadActivity['activity_type'] }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {(['call','whatsapp','email','meeting','note','follow_up','quotation','invoice','site_visit'] as const).map(t => (
                            <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                        <input value={activityForm.subject} onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
                      <textarea rows={2} value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
                        <input value={activityForm.outcome} onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Next Action Date</label>
                        <input type="date" value={activityForm.next_action_date} onChange={e => setActivityForm(f => ({ ...f, next_action_date: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowActivityForm(false)} className="text-sm text-slate-500 px-3 py-1.5 hover:text-slate-700">Cancel</button>
                      <button onClick={addActivity} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium">
                        {saving ? 'Saving...' : 'Log'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {activities.length === 0 && <div className="text-sm text-slate-400 italic text-center py-4">No activities yet.</div>}
                  {activities.map(a => (
                    <div key={a.id} className="flex gap-3">
                      <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        {ACTIVITY_ICONS[a.activity_type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 capitalize">{a.activity_type.replace(/_/g,' ')}</span>
                          {a.subject && <span className="text-xs text-slate-500">— {a.subject}</span>}
                          <span className="text-xs text-slate-400 ml-auto">{new Date(a.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">{a.description}</div>
                        {a.outcome && <div className="text-xs text-green-700 mt-1 bg-green-50 px-2 py-0.5 rounded inline-block">{a.outcome}</div>}
                        {a.next_action && <div className="text-xs text-amber-700 mt-1">Next: {a.next_action}{a.next_action_date ? ` by ${formatDate(a.next_action_date)}` : ''}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
