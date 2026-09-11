import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile, UserRole, Branch, Permission } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { Plus, Edit2, Building, Shield, Check, X, Trash2 } from 'lucide-react';

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-amber-100 text-amber-700',
  sales: 'bg-green-100 text-green-700',
  accountant: 'bg-blue-100 text-blue-700',
  inventory: 'bg-cyan-100 text-cyan-700',
  hr: 'bg-pink-100 text-amber-700',
  cashier: 'bg-orange-100 text-orange-700',
};

const ALL_MODULES = ['dashboard','reports','crm','cashflow','customers','suppliers','inventory','transfers','quotations','invoices','pos','projects','hr','attendance','payroll','accounting','branches','companies','settings'];

const getInvokeError = (error: unknown) => {
  if (!error) return 'Unknown edge-function error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const detail = error as { message?: string; details?: string; hint?: string; context?: { message?: string } };
  if (detail?.message) return detail.message;
  if (detail?.details) return detail.details;
  if (detail?.hint) return detail.hint;
  if (detail?.context?.message) return detail.context.message;
  return 'Edge Function returned a non-2xx status code';
};
const ALL_ACTIONS = ['view','create','edit','delete','print','export','approve','reject'] as const;
type PermAction = typeof ALL_ACTIONS[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<'users' | 'permissions' | 'matrix'>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [permUser, setPermUser] = useState<Profile | null>(null);
  const [userPerms, setUserPerms] = useState<Permission[]>([]);
  const [editForm, setEditForm] = useState({ role: 'sales' as UserRole, full_name: '', username: '', is_active: true, branch_id: '', new_password: '' });
  const [createForm, setCreateForm] = useState({ password: '', full_name: '', role: 'sales' as UserRole, branch_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: branchData }] = await Promise.all([
      supabase.from('profiles').select('*, branch:branches(*)').order('full_name'),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ]);
    setUsers(profiles ?? []);
    setBranches(branchData ?? []);
    setLoading(false);
  };

  const openEdit = (u: Profile) => {
    setEditing(u);
    setEditForm({ role: u.role, full_name: u.full_name, username: u.username ?? '', is_active: u.is_active, branch_id: u.branch_id ?? '', new_password: '' });
    setError('');
    setShowModal(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.username.trim()) { setError('Username is required'); return; }
    if (editForm.new_password && editForm.new_password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    setError('');
    const cleanUsername = editForm.username.trim().toLowerCase();
    // Check for duplicate username (excluding current user)
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', cleanUsername).neq('id', editing.id).maybeSingle();
    if (existing) { setError('Username already exists. Please choose a different username.'); setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({
      role: editForm.role,
      full_name: editForm.full_name,
      username: cleanUsername,
      is_active: editForm.is_active,
      branch_id: editForm.branch_id || null,
      updated_at: new Date().toISOString()
    }).eq('id', editing.id);
    if (error) { setError(error.message); setSaving(false); return; }

    // Update password if a new one was entered, but do not block profile save
    if (editForm.new_password) {
      try {
        const { error: pwError } = await supabase.functions.invoke('user-management', {
          body: { action: 'reset_password', user_id: editing.id, new_password: editForm.new_password },
        });
        if (pwError) {
          setError('Profile saved but password update failed: ' + getInvokeError(pwError));
        }
      } catch (e) {
        setError('Profile saved but password update failed: ' + getInvokeError(e));
      }
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const generateUsername = (name: string): string => {
    const base = name.trim().toLowerCase().replace(/\s+/g, '.');
    return base || 'user';
  };

  const findUniqueUsername = async (baseUsername: string): Promise<string> => {
    let username = baseUsername;
    let suffix = 1;
    while (true) {
      const { data } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
      if (!data) return username;
      suffix++;
      username = `${baseUsername}${suffix}`;
    }
  };

  const createUser = async () => {
    if (!createForm.full_name.trim()) { setError('Name is required'); return; }
    if (!createForm.password) { setError('Password is required'); return; }
    if (createForm.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    setError('');

    // Auto-generate unique username from name
    const baseUsername = generateUsername(createForm.full_name);
    const cleanUsername = await findUniqueUsername(baseUsername);

    // Auto-generate internal email (never shown to user)
    const email = `${cleanUsername}@al-luluah.local`;

    const { error: funcError } = await supabase.functions.invoke('user-management', {
      body: {
        action: 'create_user',
        email,
        password: createForm.password,
        full_name: createForm.full_name.trim(),
        username: cleanUsername,
        role: createForm.role,
        branch_id: createForm.branch_id || null,
      },
    });
    if (funcError) { setError(getInvokeError(funcError)); setSaving(false); return; }
    setSaving(false);
    setShowCreateModal(false);
    setCreateForm({ password: '', full_name: '', role: 'sales', branch_id: '' });
    setTimeout(loadData, 1000);
  };

  const openPermissions = async (u: Profile) => {
    setPermUser(u);
    const { data } = await supabase.from('permissions').select('*').eq('user_id', u.id);
    setUserPerms(data ?? []);
    setShowPermModal(true);
  };

  const togglePerm = async (module: string, action: PermAction, current: boolean) => {
    if (!permUser) return;
    const existing = userPerms.find(p => p.module === module && p.action === action && p.branch_id === null);
    if (existing) {
      await supabase.from('permissions').update({ granted: !current }).eq('id', existing.id);
      setUserPerms(prev => prev.map(p => p.id === existing.id ? { ...p, granted: !current } : p));
    } else {
      const { data } = await supabase.from('permissions').insert({
        user_id: permUser.id,
        module,
        action,
        granted: !current,
        branch_id: null,
        company_id: null,
      }).select().maybeSingle();
      if (data) setUserPerms(prev => [...prev, data as Permission]);
    }
  };

  const applyRoleTemplate = async () => {
    if (!permUser) return;
    setSaving(true);
    // Remove existing user-specific permissions
    const { error: delErr } = await supabase.from('permissions').delete().eq('user_id', permUser.id);
    if (delErr) { setError(delErr.message); setSaving(false); return; }
    // Load role template
    const { data: template } = await supabase.from('permission_templates').select('*').eq('role', permUser.role);
    if (template && template.length > 0) {
      const { error: insErr } = await supabase.from('permissions').insert(
        template.map(t => ({ user_id: permUser.id, module: t.module, action: t.action, granted: t.granted, branch_id: null, company_id: null }))
      );
      if (insErr) { setError(insErr.message); setSaving(false); return; }
    }
    const { data } = await supabase.from('permissions').select('*').eq('user_id', permUser.id);
    setUserPerms(data ?? []);
    setSaving(false);
  };

  const deleteUser = async (u: Profile) => {
    if (u.role === 'admin') { setError('Admin users cannot be deleted'); return; }
    if (!confirm(`Delete user "${u.full_name}"? This will permanently remove their account and all permissions. This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    const { error: funcError } = await supabase.functions.invoke('user-management', {
      body: { action: 'delete_user', user_id: u.id },
    });
    if (funcError) { setError(getInvokeError(funcError)); setSaving(false); return; }
    setSaving(false);
    loadData();
  };

  const hasPerm = (module: string, action: PermAction) => {
    const p = userPerms.find(p => p.module === module && p.action === action);
    return p?.granted ?? false;
  };

  const roles: UserRole[] = ['admin', 'manager', 'sales', 'accountant', 'inventory', 'hr', 'cashier'];

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { key: 'users', label: 'Users' },
          { key: 'permissions', label: 'User Permissions' },
          { key: 'matrix', label: 'Role Matrix' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">User Management</h2>
              <p className="text-sm text-slate-500 mt-0.5">Manage system users, roles, and branch assignments</p>
            </div>
            <button onClick={() => { setError(''); setShowCreateModal(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={15} /> Add User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Username</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Branch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${roleColors[u.role] ?? 'bg-slate-100'} rounded-full flex items-center justify-center text-xs font-bold`}>
                          {u.full_name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{u.full_name || 'Unnamed'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{u.username ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-slate-400 italic">All Branches</span>
                      ) : u.branch ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                          <Building size={10} /> {(u.branch as unknown as Branch).name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit User">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openPermissions(u)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Manage Permissions">
                          <Shield size={14} />
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => deleteUser(u)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete User">
                            <Trash2 size={14} />
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
      )}

      {tab === 'permissions' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">User-Level Permissions</h2>
          <p className="text-sm text-slate-500 mb-5">Select a user from the Users tab and click the shield icon to customize their permissions per module and action. User-specific permissions override role defaults.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {users.map(u => (
              <button key={u.id} onClick={() => openPermissions(u)}
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                <div className={`w-9 h-9 ${roleColors[u.role] ?? 'bg-slate-100'} rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                  {u.full_name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{u.full_name}</div>
                  <div className="text-xs text-slate-500 capitalize">{u.role}</div>
                </div>
                <Shield size={14} className="text-slate-400 ml-auto flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Role Permissions Matrix</h2>
          <p className="text-sm text-slate-500 mb-5">Default permissions by role. Individual user permissions can be customized in the User Permissions tab.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase sticky left-0 bg-slate-50">Module</th>
                  {roles.map(r => (
                    <th key={r} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_MODULES.map(module => {
                  const rolePerm: Record<string, string[]> = {
                    admin: ALL_MODULES,
                    manager: ['dashboard','reports','crm','cashflow','customers','suppliers','inventory','transfers','quotations','invoices','pos','projects','hr','attendance','payroll'],
                    sales: ['dashboard','crm','customers','quotations','invoices','pos'],
                    accountant: ['dashboard','reports','invoices','accounting','cashflow','payroll'],
                    inventory: ['dashboard','inventory','transfers','suppliers'],
                    hr: ['dashboard','hr','attendance','payroll','projects'],
                    cashier: ['dashboard','pos','invoices','cashflow'],
                  };
                  return (
                    <tr key={module} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-700 capitalize sticky left-0 bg-white">{module}</td>
                      {roles.map(role => {
                        const has = (rolePerm[role] ?? []).includes(module);
                        return (
                          <td key={role} className="text-center px-3 py-2.5">
                            {has ? <Check size={14} className="text-green-600 mx-auto" /> : <span className="text-slate-200 text-base">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Edit User" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Login username (lowercase, no spaces)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          {editForm.role !== 'admin' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Branch</label>
              <select value={editForm.branch_id} onChange={e => setEditForm(f => ({ ...f, branch_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select Branch --</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password (leave blank to keep current)</label>
            <input type="password" value={editForm.new_password} onChange={e => setEditForm(f => ({ ...f, new_password: e.target.value }))}
              placeholder="Enter new password to reset"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="active" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
            <label htmlFor="active" className="text-sm text-slate-700">Active User</label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={saveEdit} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setShowModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Create User Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New User" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Enter full name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Username is auto-generated from name (e.g. tahir.muhammad, tahir.muhammad2)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
            <input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Minimum 6 characters"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as UserRole }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            {createForm.role !== 'admin' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                <select value={createForm.branch_id} onChange={e => setCreateForm(f => ({ ...f, branch_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Default (Main Branch)</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={createUser} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Creating...' : 'Create User'}
            </button>
            <button onClick={() => setShowCreateModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Permissions Modal */}
      {showPermModal && permUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowPermModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">Permissions — {permUser.full_name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toggle individual module actions. Click "Reset to Role Default" to restore role-based defaults.</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={applyRoleTemplate} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                  {saving ? 'Applying...' : 'Reset to Role Default'}
                </button>
                <button onClick={() => setShowPermModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-500 uppercase sticky left-0 bg-slate-50 min-w-[120px]">Module</th>
                      {ALL_ACTIONS.map(a => (
                        <th key={a} className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase min-w-[70px]">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ALL_MODULES.map(module => (
                      <tr key={module} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium text-slate-700 capitalize sticky left-0 bg-white">{module}</td>
                        {ALL_ACTIONS.map(action => {
                          const granted = hasPerm(module, action);
                          return (
                            <td key={action} className="text-center px-3 py-2.5">
                              <button onClick={() => togglePerm(module, action, granted)}
                                className={`w-7 h-7 rounded-lg border transition-colors flex items-center justify-center mx-auto ${granted ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' : 'bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}>
                                {granted ? <Check size={12} /> : <span className="text-xs">—</span>}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowPermModal(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
