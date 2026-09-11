import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Employee, Department, EmployeeContract, formatDate } from '../../lib/types';
import Modal from '../../components/common/Modal';
import { statusBadge } from '../../components/common/Badge';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Edit2, Trash2, Users, ChevronUp, FileText, Upload, Download, AlertTriangle, X, Clock } from 'lucide-react';

const emptyEmployee = {
  employee_id: '', full_name: '', email: '', phone: '', department_id: null as string | null,
  position: '', salary: 0, daily_wage: 0, overtime_rate: 0,
  housing_allowance: 0, transport_allowance: 0, other_allowances: 0,
  bank_name: '', bank_account: '', iban: '',
  join_date: new Date().toISOString().split('T')[0],
  status: 'active' as Employee['status'], nationality: '', passport_number: '',
  emirates_id: '', visa_expiry: null as string | null, labor_card: '', emergency_contact: '',
  biometric_user_id: '',
};

const emptyContract = {
  title: '',
  contract_type: 'employment' as EmployeeContract['contract_type'],
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  salary_terms: '',
  job_role: '',
  notes: '',
  renewal_reminder_date: '',
  status: 'active' as EmployeeContract['status'],
};

interface Props { branchFilter: string | null; }

export default function HRPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyEmployee);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'employees' | 'departments' | 'contracts'>('employees');
  const [formSection, setFormSection] = useState<'basic' | 'salary' | 'documents'>('basic');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Contracts state
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractSearch, setContractSearch] = useState('');
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState<EmployeeContract | null>(null);
  const [contractForm, setContractForm] = useState(emptyContract);
  const [contractEmpId, setContractEmpId] = useState('');
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractFilePreview, setContractFilePreview] = useState('');
  const [contractSaving, setContractSaving] = useState(false);
  const [contractError, setContractError] = useState('');
  const [contractUploading, setContractUploading] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, [branchFilter]);
  useEffect(() => { if (tab === 'contracts') loadContracts(); }, [tab, branchFilter]);

  const loadData = async () => {
    setLoading(true);
    let empQuery = supabase.from('employees').select('*, department:departments(*)').order('full_name');
    let deptQuery = supabase.from('departments').select('*').order('name');
    if (branchFilter) {
      empQuery = empQuery.eq('branch_id', branchFilter);
      deptQuery = deptQuery.eq('branch_id', branchFilter);
    }
    const [{ data: emps }, { data: depts }] = await Promise.all([empQuery, deptQuery]);
    setEmployees(emps ?? []);
    setDepartments(depts ?? []);
    setLoading(false);
  };

  const loadContracts = async () => {
    setContractsLoading(true);
    let q = supabase.from('employee_contracts')
      .select('*, employee:employees(id, full_name, employee_id, position)')
      .order('created_at', { ascending: false });
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setContracts(data ?? []);
    setContractsLoading(false);
  };

  const openAdd = () => { setEditing(null); setForm(emptyEmployee); setError(''); setFormSection('basic'); setShowModal(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      employee_id: e.employee_id, full_name: e.full_name, email: e.email, phone: e.phone,
      department_id: e.department_id, position: e.position, salary: e.salary,
      daily_wage: e.daily_wage ?? 0, overtime_rate: e.overtime_rate ?? 0,
      housing_allowance: e.housing_allowance ?? 0, transport_allowance: e.transport_allowance ?? 0,
      other_allowances: e.other_allowances ?? 0,
      bank_name: e.bank_name ?? '', bank_account: e.bank_account ?? '', iban: e.iban ?? '',
      join_date: e.join_date, status: e.status, nationality: e.nationality,
      passport_number: e.passport_number, emirates_id: e.emirates_id,
      visa_expiry: e.visa_expiry, labor_card: e.labor_card, emergency_contact: e.emergency_contact,
      biometric_user_id: e.biometric_user_id ?? '',
    });
    setError('');
    setFormSection('basic');
    setShowModal(true);
  };

  const deleteEmployee = async (id: string, name: string) => {
    if (!window.confirm(`Delete employee "${name}"? This action cannot be undone.`)) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    loadData();
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.employee_id.trim()) { setError('Employee ID and Name are required'); return; }
    setSaving(true);
    setError('');
    const branchId = branchFilter || profile?.branch_id;
    if (editing) {
      const { error } = await supabase.from('employees').update({ ...form, branch_id: branchId, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('employees').insert({ ...form, branch_id: branchId });
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const saveDepartment = async () => {
    if (!deptForm.name.trim()) return;
    const branchId = branchFilter || profile?.branch_id;
    const { error } = await supabase.from('departments').insert({ ...deptForm, branch_id: branchId });
    if (error) { setError(error.message); return; }
    setDeptForm({ name: '', description: '' });
    setShowDeptModal(false);
    loadData();
  };

  // Contract helpers
  const openAddContract = () => {
    setEditingContract(null);
    setContractForm(emptyContract);
    setContractEmpId('');
    setContractFile(null);
    setContractFilePreview('');
    setContractError('');
    setShowContractModal(true);
  };

  const openEditContract = (c: EmployeeContract) => {
    setEditingContract(c);
    setContractForm({
      title: c.title,
      contract_type: c.contract_type,
      start_date: c.start_date,
      end_date: c.end_date ?? '',
      salary_terms: c.salary_terms,
      job_role: c.job_role,
      notes: c.notes,
      renewal_reminder_date: c.renewal_reminder_date ?? '',
      status: c.status,
    });
    setContractEmpId(c.employee_id);
    setContractFile(null);
    setContractFilePreview(c.attachment_url ?? '');
    setContractError('');
    setShowContractModal(true);
  };

  const onContractFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractFile(file);
    setContractFilePreview(file.name);
  };

  const uploadContractFile = async (contractId: string): Promise<{ url: string; path: string; filename: string }> => {
    if (!contractFile) return {
      url: editingContract?.attachment_url ?? '',
      path: editingContract?.attachment_path ?? '',
      filename: editingContract?.attachment_filename ?? '',
    };
    setContractUploading(true);
    const ext = contractFile.name.split('.').pop();
    const path = `employee-contracts/${contractId}.${ext}`;
    const { error: upErr } = await supabase.storage.from('company-assets').upload(path, contractFile, { upsert: true });
    setContractUploading(false);
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from('company-assets').getPublicUrl(path);
    return { url: data.publicUrl, path, filename: contractFile.name };
  };

  const writeContractAudit = async (contractId: string, action: string, oldVals?: object, newVals?: object) => {
    await supabase.from('contract_audit_logs').insert({
      contract_id: contractId,
      action,
      actor_id: profile?.id,
      actor_name: profile?.full_name,
      actor_role: profile?.role,
      old_values: oldVals ?? null,
      new_values: newVals ?? null,
    });
  };

  const handleContractSave = async () => {
    if (!contractForm.title.trim()) { setContractError('Contract title is required'); return; }
    if (!contractEmpId) { setContractError('Please select an employee'); return; }
    setContractSaving(true);
    setContractError('');
    const branchId = branchFilter || profile?.branch_id;
    try {
      if (editingContract) {
        const { url, path, filename } = await uploadContractFile(editingContract.id);
        const payload = {
          ...contractForm,
          end_date: contractForm.end_date || null,
          renewal_reminder_date: contractForm.renewal_reminder_date || null,
          attachment_url: url || editingContract.attachment_url,
          attachment_path: path || editingContract.attachment_path,
          attachment_filename: filename || editingContract.attachment_filename,
          updated_by: profile?.id,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('employee_contracts').update(payload).eq('id', editingContract.id);
        if (error) { setContractError(error.message); setContractSaving(false); return; }
        await writeContractAudit(editingContract.id, 'edited', editingContract, payload);
      } else {
        const { data: created, error } = await supabase.from('employee_contracts').insert({
          ...contractForm,
          end_date: contractForm.end_date || null,
          renewal_reminder_date: contractForm.renewal_reminder_date || null,
          employee_id: contractEmpId,
          branch_id: branchId,
          attachment_url: '',
          attachment_path: '',
          attachment_filename: '',
          created_by: profile?.id,
          updated_by: profile?.id,
        }).select().maybeSingle();
        if (error || !created) { setContractError(error?.message ?? 'Failed to create'); setContractSaving(false); return; }
        if (contractFile) {
          const { url, path, filename } = await uploadContractFile(created.id);
          await supabase.from('employee_contracts').update({ attachment_url: url, attachment_path: path, attachment_filename: filename }).eq('id', created.id);
        }
        await writeContractAudit(created.id, 'created', undefined, contractForm);
      }
      setContractSaving(false);
      setShowContractModal(false);
      loadContracts();
    } catch (err: unknown) {
      setContractError(err instanceof Error ? err.message : 'Upload failed');
      setContractSaving(false);
    }
  };

  const handleDownload = async (c: EmployeeContract) => {
    if (!c.attachment_url) return;
    window.open(c.attachment_url, '_blank');
    await writeContractAudit(c.id, 'downloaded');
  };

  const today = new Date();
  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpiringSoon = (c: EmployeeContract) => {
    if (!c.renewal_reminder_date) return false;
    const d = new Date(c.renewal_reminder_date);
    return d >= today && d <= thirtyDays;
  };
  const isOverdue = (c: EmployeeContract) => {
    if (!c.renewal_reminder_date) return false;
    return new Date(c.renewal_reminder_date) < today && c.status === 'active';
  };

  const f = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    e.position.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContracts = contracts.filter(c => {
    const emp = c.employee as unknown as Employee;
    const name = emp?.full_name?.toLowerCase() ?? '';
    const s = contractSearch.toLowerCase();
    return name.includes(s) || c.title.toLowerCase().includes(s) || c.contract_type.includes(s);
  });

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-primary-600 text-white' : 'bg-white text-primary-700 border border-slate-200 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500';
  const labelCls = 'block text-xs font-semibold text-primary-700 mb-1 uppercase tracking-wide';
  const numInput = (field: keyof typeof form, label: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" min={0} step={0.01}
        value={(form as Record<string, unknown>)[field] as number}
        onChange={e => setForm(f => ({ ...f, [field]: Number(e.target.value) }))}
        className={inputCls} />
    </div>
  );

  const contractStatusColor = (status: EmployeeContract['status']) => {
    const m: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      draft: 'bg-slate-100 text-slate-600',
      expired: 'bg-red-100 text-red-700',
      terminated: 'bg-red-100 text-red-700',
      renewed: 'bg-blue-100 text-blue-700',
    };
    return m[status] ?? 'bg-slate-100 text-slate-600';
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {tabBtn('employees', 'Employees')}
        {tabBtn('departments', 'Departments')}
        {tabBtn('contracts', 'Contracts')}
      </div>

      {tab === 'employees' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 w-64 bg-white" />
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Add Employee
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Department</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Position</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Basic Salary</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Allowances</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Total Package</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Join Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-10 text-slate-400">No employees found</td></tr>
                  ) : filtered.map(e => {
                    const totalAllowances = (e.housing_allowance ?? 0) + (e.transport_allowance ?? 0) + (e.other_allowances ?? 0);
                    const totalPackage = e.salary + totalAllowances;
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedEmp(e === selectedEmp ? null : e)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                              {e.full_name.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-900">{e.full_name}</div>
                              <div className="text-xs text-slate-500">{e.employee_id} · {e.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-primary-700">{(e.department as unknown as Department)?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-primary-700">{e.position || '—'}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-slate-800">AED {f(e.salary)}</td>
                        <td className="px-4 py-3 text-sm text-right text-primary-600">AED {f(totalAllowances)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-primary-600">AED {f(totalPackage)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{formatDate(e.join_date)}</td>
                        <td className="px-4 py-3">{statusBadge(e.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={(ev) => { ev.stopPropagation(); deleteEmployee(e.id, e.full_name); }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inline salary detail panel */}
          {selectedEmp && (
            <div className="mt-4 bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white text-lg font-bold">
                    {selectedEmp.full_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{selectedEmp.full_name}</h3>
                    <p className="text-sm text-primary-600">{selectedEmp.position} · {selectedEmp.employee_id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedEmp(null)} className="text-slate-400 hover:text-primary-600">
                  <ChevronUp size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Basic Salary', value: selectedEmp.salary },
                  { label: 'Daily Wage', value: selectedEmp.daily_wage ?? 0 },
                  { label: 'OT Rate/hr', value: selectedEmp.overtime_rate ?? 0 },
                  { label: 'Housing Allowance', value: selectedEmp.housing_allowance ?? 0 },
                  { label: 'Transport Allowance', value: selectedEmp.transport_allowance ?? 0 },
                  { label: 'Other Allowances', value: selectedEmp.other_allowances ?? 0 },
                  { label: 'Total Package', value: selectedEmp.salary + (selectedEmp.housing_allowance ?? 0) + (selectedEmp.transport_allowance ?? 0) + (selectedEmp.other_allowances ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className="font-bold text-slate-800">AED {f(value)}</div>
                  </div>
                ))}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Bank</div>
                  <div className="font-medium text-slate-800 text-sm">{selectedEmp.bank_name || '—'}</div>
                  <div className="text-xs text-slate-500 truncate">{selectedEmp.iban || selectedEmp.bank_account || '—'}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'departments' && (
        <>
          <div className="flex justify-end mb-6">
            <button onClick={() => setShowDeptModal(true)}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Add Department
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(d => {
              const count = employees.filter(e => e.department_id === d.id).length;
              return (
                <div key={d.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Users size={18} className="text-primary-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-xs text-slate-500">{count} employee{count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  {d.description && <p className="text-sm text-primary-600">{d.description}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'contracts' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={contractSearch} onChange={e => setContractSearch(e.target.value)}
                  placeholder="Search contracts..."
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 w-64 bg-white" />
              </div>
              {contracts.filter(c => isExpiringSoon(c) || isOverdue(c)).length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-lg">
                  <AlertTriangle size={13} />
                  {contracts.filter(c => isExpiringSoon(c) || isOverdue(c)).length} contract{contracts.filter(c => isExpiringSoon(c) || isOverdue(c)).length !== 1 ? 's' : ''} need attention
                </div>
              )}
            </div>
            <button onClick={openAddContract}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Add Contract
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Contract</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Start</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">End / Renewal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">File</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contractsLoading ? (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-400">Loading...</td></tr>
                  ) : filteredContracts.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-400">No contracts found</td></tr>
                  ) : filteredContracts.map(c => {
                    const emp = c.employee as unknown as Employee;
                    const expiring = isExpiringSoon(c);
                    const overdue = isOverdue(c);
                    return (
                      <tr key={c.id} className={`hover:bg-slate-50/50 ${overdue ? 'bg-red-50/40' : expiring ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                              {emp?.full_name?.charAt(0) ?? '?'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-800">{emp?.full_name ?? '—'}</div>
                              <div className="text-xs text-slate-400">{emp?.position ?? ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-800">{c.title}</div>
                          {c.job_role && <div className="text-xs text-slate-400">{c.job_role}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full capitalize">
                            {c.contract_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(c.start_date)}</td>
                        <td className="px-4 py-3">
                          {c.renewal_reminder_date ? (
                            <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-semibold' : expiring ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                              {(overdue || expiring) && <Clock size={11} />}
                              {formatDate(c.renewal_reminder_date)}
                              {overdue && <span className="ml-1 text-red-600">(overdue)</span>}
                              {expiring && !overdue && <span className="ml-1 text-amber-600">(soon)</span>}
                            </div>
                          ) : c.end_date ? (
                            <span className="text-xs text-slate-500">{formatDate(c.end_date)}</span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${contractStatusColor(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {c.attachment_url ? (
                            <button onClick={() => handleDownload(c)}
                              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline">
                              <Download size={12} />
                              {c.attachment_filename ? c.attachment_filename.slice(0, 18) + (c.attachment_filename.length > 18 ? '…' : '') : 'Download'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">No file</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openEditContract(c)}
                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg">
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Employee Form Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Employee' : 'Add Employee'} size="xl">
        <div className="flex gap-2 mb-5 border-b border-slate-100 pb-3">
          {(['basic', 'salary', 'documents'] as const).map(s => (
            <button key={s} onClick={() => setFormSection(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${formSection === s ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-slate-50'}`}>
              {s === 'basic' ? 'Basic Info' : s === 'salary' ? 'Salary & Bank' : 'Documents'}
            </button>
          ))}
        </div>

        {formSection === 'basic' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Employee ID *</label>
              <input value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select value={form.department_id ?? ''} onChange={e => setForm(f => ({ ...f, department_id: e.target.value || null }))} className={inputCls}>
                <option value="">-- Select --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Position</label>
              <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Join Date</label>
              <input type="date" value={form.join_date} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Employee['status'] }))} className={inputCls}>
                {['active', 'inactive', 'terminated', 'on_leave'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nationality</label>
              <input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Emergency Contact</label>
              <input value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} className={inputCls} />
            </div>
          </div>
        )}

        {formSection === 'salary' && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 mb-2">
              <p className="text-xs text-primary-600 font-medium">Total monthly package: <span className="font-bold text-slate-800">AED {f(form.salary + form.housing_allowance + form.transport_allowance + form.other_allowances)}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {numInput('salary', 'Basic Monthly Salary (AED)')}
              {numInput('daily_wage', 'Daily Wage (AED)')}
              {numInput('overtime_rate', 'Overtime Rate / Hour (AED)')}
              {numInput('housing_allowance', 'Housing Allowance (AED)')}
              {numInput('transport_allowance', 'Transport Allowance (AED)')}
              {numInput('other_allowances', 'Other Allowances (AED)')}
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-3">Bank Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Bank Name</label>
                  <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Account Number</label>
                  <input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>IBAN</label>
                  <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="AE..." className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}

        {formSection === 'documents' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Emirates ID</label>
              <input value={form.emirates_id} onChange={e => setForm(f => ({ ...f, emirates_id: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Passport Number</label>
              <input value={form.passport_number} onChange={e => setForm(f => ({ ...f, passport_number: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Visa Expiry</label>
              <input type="date" value={form.visa_expiry ?? ''} onChange={e => setForm(f => ({ ...f, visa_expiry: e.target.value || null }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Labor Card</label>
              <input value={form.labor_card} onChange={e => setForm(f => ({ ...f, labor_card: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Biometric User ID</label>
              <input value={form.biometric_user_id} onChange={e => setForm(f => ({ ...f, biometric_user_id: e.target.value }))}
                placeholder="Machine user ID for attendance sync" className={inputCls} />
            </div>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving...' : editing ? 'Update Employee' : 'Add Employee'}
          </button>
          <button onClick={() => setShowModal(false)}
            className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </Modal>

      {/* Department Modal */}
      <Modal isOpen={showDeptModal} onClose={() => setShowDeptModal(false)} title="Add Department" size="sm">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Department Name</label>
            <input value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={deptForm.description} onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-3">
            <button onClick={saveDepartment}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              Add Department
            </button>
            <button onClick={() => setShowDeptModal(false)}
              className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Contract Modal */}
      <Modal isOpen={showContractModal} onClose={() => setShowContractModal(false)}
        title={editingContract ? 'Edit Contract' : 'Add Contract'} size="lg">
        <div className="space-y-4">
          {!editingContract && (
            <div>
              <label className={labelCls}>Employee *</label>
              <select value={contractEmpId} onChange={e => setContractEmpId(e.target.value)} className={inputCls}>
                <option value="">-- Select Employee --</option>
                {employees.filter(e => e.status === 'active').map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Contract Title *</label>
              <input value={contractForm.title} onChange={e => setContractForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="e.g. Employment Agreement 2026" />
            </div>
            <div>
              <label className={labelCls}>Contract Type</label>
              <select value={contractForm.contract_type} onChange={e => setContractForm(f => ({ ...f, contract_type: e.target.value as EmployeeContract['contract_type'] }))} className={inputCls}>
                {['employment', 'renewal', 'amendment', 'termination', 'probation', 'other'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={contractForm.status} onChange={e => setContractForm(f => ({ ...f, status: e.target.value as EmployeeContract['status'] }))} className={inputCls}>
                {['draft', 'active', 'expired', 'terminated', 'renewed'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={contractForm.start_date} onChange={e => setContractForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={contractForm.end_date} onChange={e => setContractForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Renewal Reminder Date</label>
              <input type="date" value={contractForm.renewal_reminder_date} onChange={e => setContractForm(f => ({ ...f, renewal_reminder_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Job Role</label>
              <input value={contractForm.job_role} onChange={e => setContractForm(f => ({ ...f, job_role: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Salary Terms</label>
              <input value={contractForm.salary_terms} onChange={e => setContractForm(f => ({ ...f, salary_terms: e.target.value }))} className={inputCls} placeholder="e.g. AED 8,000/month + housing + transport" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea value={contractForm.notes} onChange={e => setContractForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} className={`${inputCls} resize-none`} />
            </div>
          </div>

          {/* File Upload */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-slate-700">Contract Document</div>
                <div className="text-xs text-slate-400">PDF, Word, or image file. Visible to HR/Admin only.</div>
              </div>
              <input ref={contractFileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={onContractFileChange} className="hidden" />
              <button type="button" onClick={() => contractFileRef.current?.click()}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 transition-colors">
                <Upload size={13} /> {contractFilePreview ? 'Change File' : 'Upload File'}
              </button>
            </div>
            {contractFilePreview && (
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200 mt-2">
                <FileText size={14} className="text-primary-500 flex-shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">
                  {contractFile ? contractFile.name : (editingContract?.attachment_filename ?? contractFilePreview)}
                </span>
                <button type="button" onClick={() => { setContractFile(null); setContractFilePreview(''); }}
                  className="text-slate-400 hover:text-red-500 flex-shrink-0">
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {contractError && <p className="text-red-600 text-sm mt-3">{contractError}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={handleContractSave} disabled={contractSaving || contractUploading}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            {contractSaving || contractUploading ? 'Saving...' : editingContract ? 'Update Contract' : 'Add Contract'}
          </button>
          <button onClick={() => setShowContractModal(false)}
            className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
