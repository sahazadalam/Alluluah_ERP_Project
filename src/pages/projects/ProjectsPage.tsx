import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Project, ProjectAssignment, ProjectProgress, ProjectExpense, ProjectActivity, Employee, Customer } from '../../lib/types';
import { formatCurrency, formatDate } from '../../lib/types';
import { calculateProjectFinancials } from '../../lib/projectFinance';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, X, Search, Calendar, Users, DollarSign,
  BarChart2, Trash2, Edit2
} from 'lucide-react';

interface Props { branchFilter: string | null; }

const STATUS_CONFIG: Record<Project['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
  active: { label: 'Active', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  on_hold: { label: 'On Hold', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  completed: { label: 'Completed', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

const PRIORITY_CONFIG: Record<Project['priority'], { color: string }> = {
  low: { color: 'text-slate-400' }, medium: { color: 'text-blue-500' },
  high: { color: 'text-amber-500' }, urgent: { color: 'text-red-500' },
};

export default function ProjectsPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [progressReports, setProgressReports] = useState<ProjectProgress[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'progress' | 'expenses' | 'history'>('overview');
  const [showForm, setShowForm] = useState(false);
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<ProjectAssignment | null>(null);
    const [assignmentError, setAssignmentError] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = () => ({
    name: '', description: '', customer_id: null as string | null, customer_name: '',
    site_address: '', contract_value: 0, estimated_cost: 0,
    status: 'pending' as Project['status'], priority: 'medium' as Project['priority'],
    start_date: '', end_date: '', notes: '',
  });
  const [form, setForm] = useState(emptyForm());
  const [progressForm, setProgressForm] = useState({ report_date: new Date().toISOString().split('T')[0], workers_count: 0, work_completed: '', work_pending: '', materials_used: '', issues: '', notes: '', progress_percent: 0, weather: '' });
  const [expenseForm, setExpenseForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'materials' as ProjectExpense['category'], description: '', amount: 0, reference: '' });
  const [assignForm, setAssignForm] = useState({ employee_id: '', role_on_project: 'worker' as ProjectAssignment['role_on_project'], daily_rate: 0, start_date: new Date().toISOString().split('T')[0], end_date: '' });

  useEffect(() => { loadProjects(); loadCustomers(); loadEmployees(); }, [branchFilter]);

  const loadProjects = async () => {
    setLoading(true);
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setProjects(data ?? []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, name').eq('is_active', true).order('name');
    setCustomers((data ?? []) as Customer[]);
  };

  const loadEmployees = async () => {
    let q = supabase.from('employees').select('*').eq('status', 'active').order('full_name');
    if (branchFilter) q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setEmployees(data ?? []);
  };

  const openProject = async (project: Project) => {
    setSelectedProject(project);
    setActiveTab('overview');
    const [{ data: asn }, { data: prog }, { data: exp }, { data: activityData }] = await Promise.all([
      supabase.from('project_assignments').select('*, employee:employees(full_name,position,employee_id)').eq('project_id', project.id).eq('is_active', true),
      supabase.from('project_progress').select('*').eq('project_id', project.id).order('report_date', { ascending: false }),
      supabase.from('project_expenses').select('*').eq('project_id', project.id).order('expense_date', { ascending: false }),
      supabase.from('project_activities').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    ]);
    setAssignments((asn ?? []) as ProjectAssignment[]);
    setProgressReports(prog ?? []);
    setExpenses(exp ?? []);
    setActivities((activityData ?? []) as ProjectActivity[]);
  };

  const updateProjectCosts = async (project: Project, nextAssignments = assignments, nextExpenses = expenses) => {
    const costs = calculateProjectFinancials(project, nextAssignments, nextExpenses);
    await supabase.from('projects').update({ actual_cost: costs.totalCosts, profit: costs.estimatedProfit, updated_at: new Date().toISOString() }).eq('id', project.id);
  };

  const saveProject = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const ts = Date.now().toString().slice(-6);
    const payload = {
      ...form,
      project_number: editing?.project_number ?? `PRJ-${ts}`,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      created_by: profile?.id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };
    if (editing) {
      await supabase.from('projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      const updatedProject = { ...editing, ...payload } as Project;
      await updateProjectCosts(updatedProject);
      setSelectedProject(updatedProject);
    } else {
      await supabase.from('projects').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    loadProjects();
  };

  const updateProjectStatus = async (status: Project['status']) => {
    if (!selectedProject) return;
    await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedProject.id);
    setSelectedProject(p => p ? { ...p, status } : p);
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, status } : p));
  };

  const addProgress = async () => {
    if (!selectedProject) return;
    setSaving(true);
    await supabase.from('project_progress').insert({
      ...progressForm,
      project_id: selectedProject.id,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      reported_by: profile?.id,
    });
    // Update project progress_percent
    await supabase.from('projects').update({ progress_percent: progressForm.progress_percent, updated_at: new Date().toISOString() }).eq('id', selectedProject.id);
    const { data } = await supabase.from('project_progress').select('*').eq('project_id', selectedProject.id).order('report_date', { ascending: false });
    setProgressReports(data ?? []);
    setShowProgressForm(false);
    setSaving(false);
  };

  const addExpense = async () => {
    if (!selectedProject || !expenseForm.description.trim()) return;
    setSaving(true);
    await supabase.from('project_expenses').insert({
      ...expenseForm,
      project_id: selectedProject.id,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      created_by: profile?.id,
    });
    const { data } = await supabase.from('project_expenses').select('*').eq('project_id', selectedProject.id).order('expense_date', { ascending: false });
    const nextExpenses = data ?? [];
    await updateProjectCosts(selectedProject, assignments, nextExpenses);
    setExpenses(nextExpenses);
    setShowExpenseForm(false);
    setSaving(false);
  };

  const addAssignment = async () => {
    if (!selectedProject || !assignForm.employee_id) return;
    if (assignForm.end_date && assignForm.end_date < assignForm.start_date) {
      setAssignmentError('End Date cannot be earlier than Start Date.');
      return;
    }
    setSaving(true);
    const assignmentPayload = {
      ...assignForm,
      end_date: assignForm.end_date || null,
      project_id: selectedProject.id,
      branch_id: branchFilter ?? profile?.branch_id ?? null,
      assigned_by: profile?.id,
    };
    if (editingAssignment) {
      await supabase.from('project_assignments').update({
        role_on_project: assignmentPayload.role_on_project,
        daily_rate: assignmentPayload.daily_rate,
        start_date: assignmentPayload.start_date,
        end_date: assignmentPayload.end_date,
      }).eq('id', editingAssignment.id);
    } else {
      await supabase.from('project_assignments').insert(assignmentPayload);
    }
    const { data } = await supabase.from('project_assignments').select('*, employee:employees(full_name,position,employee_id)').eq('project_id', selectedProject.id).eq('is_active', true);
    const nextAssignments = (data ?? []) as ProjectAssignment[];
    await updateProjectCosts(selectedProject, nextAssignments, expenses);
    setAssignments(nextAssignments);
    setEditingAssignment(null);
    setAssignmentError('');
    setShowAssignForm(false);
    setSaving(false);
  };

  const removeAssignment = async (id: string) => {
    await supabase.from('project_assignments').update({ is_active: false }).eq('id', id);
    const nextAssignments = assignments.filter(a => a.id !== id);
    if (selectedProject) {
      await updateProjectCosts(selectedProject, nextAssignments, expenses);
    }
    setAssignments(nextAssignments);
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project? This will also remove all assignments, progress reports, expenses, and attendance records. This cannot be undone.')) return;
    await supabase.from('project_assignments').delete().eq('project_id', id);
    await supabase.from('project_progress').delete().eq('project_id', id);
    await supabase.from('project_expenses').delete().eq('project_id', id);
    await supabase.from('project_attendance').delete().eq('project_id', id);
    await supabase.from('projects').delete().eq('id', id);
    loadProjects();
  };

  const filtered = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.project_number.toLowerCase().includes(search.toLowerCase()) || p.customer_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const costs = selectedProject ? calculateProjectFinancials(selectedProject, assignments, expenses) : { directExpenses: 0, employeeCosts: 0, totalCosts: 0, estimatedProfit: 0 };
  const totalExpenses = costs.directExpenses;
  const totalProjectCosts = costs.totalCosts;
  const latestProgress = progressReports[0];

  if (selectedProject) {
    const sc = STATUS_CONFIG[selectedProject.status];
    return (
      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-3">
            <button onClick={() => setSelectedProject(null)} className="text-sm text-slate-500 hover:text-slate-700 mt-1">← Back</button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">{selectedProject.name}</h2>
                <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                <span className={`text-xs font-medium ${PRIORITY_CONFIG[selectedProject.priority].color}`}>{selectedProject.priority}</span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5">{selectedProject.project_number} {selectedProject.customer_name ? `• ${selectedProject.customer_name}` : ''} {selectedProject.site_address ? `• ${selectedProject.site_address}` : ''}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(selectedProject); setForm({ ...selectedProject, customer_id: selectedProject.customer_id ?? null, start_date: selectedProject.start_date ?? '', end_date: selectedProject.end_date ?? '', notes: selectedProject.notes ?? '' }); setShowForm(true); }} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><Edit2 size={13} /> Edit</button>
            <select value={selectedProject.status} onChange={e => updateProjectStatus(e.target.value as Project['status'])}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer focus:outline-none ${sc.bg} ${sc.color}`}>
              {(Object.entries(STATUS_CONFIG) as [Project['status'], typeof STATUS_CONFIG[Project['status']]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Contract Value', val: formatCurrency(selectedProject.contract_value), icon: <DollarSign size={15} className="text-teal-500" /> },
            { label: 'Total Expenses', val: formatCurrency(totalExpenses), icon: <BarChart2 size={15} className="text-red-400" /> },
            { label: 'Total Project Costs', val: formatCurrency(totalProjectCosts), icon: <BarChart2 size={15} className="text-red-400" /> },
            { label: 'Est. Profit', val: formatCurrency(costs.estimatedProfit), icon: <DollarSign size={15} className="text-green-500" /> },
            { label: 'Team Size', val: `${assignments.length} workers`, icon: <Users size={15} className="text-blue-400" /> },
          ].map(({ label, val, icon }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-slate-500">{label}</span></div>
              <div className="text-base font-bold text-slate-800">{val}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {latestProgress && (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</span>
              <span className="text-sm font-bold text-blue-700">{latestProgress.progress_percent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${latestProgress.progress_percent}%` }} />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
          {(['overview', 'team', 'progress', 'expenses', 'history'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${activeTab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Project Details</h4>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Start Date', val: selectedProject.start_date ? formatDate(selectedProject.start_date) : '—' },
                  { label: 'End Date', val: selectedProject.end_date ? formatDate(selectedProject.end_date) : '—' },
                  { label: 'Site Address', val: selectedProject.site_address || '—' },
                  { label: 'Est. Cost', val: formatCurrency(selectedProject.estimated_cost) },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-800 font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Latest Progress Report</h4>
              {latestProgress ? (
                <div className="space-y-2 text-sm">
                  <div className="text-xs text-slate-500">{formatDate(latestProgress.report_date)}</div>
                  {latestProgress.work_completed && <div><span className="text-xs font-medium text-slate-500 uppercase">Completed:</span><p className="text-slate-700 mt-0.5">{latestProgress.work_completed}</p></div>}
                  {latestProgress.work_pending && <div><span className="text-xs font-medium text-slate-500 uppercase">Pending:</span><p className="text-slate-700 mt-0.5">{latestProgress.work_pending}</p></div>}
                  {latestProgress.materials_used && <div><span className="text-xs font-medium text-slate-500 uppercase">Materials:</span><p className="text-slate-700 mt-0.5">{latestProgress.materials_used}</p></div>}
                </div>
              ) : <div className="text-sm text-slate-400 italic">No reports yet.</div>}
            </div>
            {selectedProject.notes && (
              <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">{selectedProject.notes}</div>
            )}
          </div>
        )}

        {activeTab === 'team' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-slate-700">Assigned Team ({assignments.length})</h4>
              <button onClick={() => { setEditingAssignment(null); setAssignForm({ employee_id: '', role_on_project: 'worker', daily_rate: 0, start_date: new Date().toISOString().split('T')[0], end_date: '' }); setAssignmentError(''); setShowAssignForm(true); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                <Plus size={13} /> Assign Employee
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Daily Rate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Start Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">End Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">No team members assigned</td></tr>
                  ) : assignments.map(a => {
                    const emp = (a as ProjectAssignment & { employee?: { full_name: string; position: string; employee_id: string } }).employee;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-800">{emp?.full_name ?? a.employee_id}</div>
                          <div className="text-xs text-slate-500">{emp?.position}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 capitalize">{a.role_on_project.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">{formatCurrency(a.daily_rate)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{formatDate(a.start_date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{a.end_date ? formatDate(a.end_date) : '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setEditingAssignment(a); setAssignForm({ employee_id: a.employee_id, role_on_project: a.role_on_project, daily_rate: a.daily_rate, start_date: a.start_date, end_date: a.end_date ?? '' }); setAssignmentError(''); setShowAssignForm(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                          <button onClick={() => removeAssignment(a.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-slate-700">Daily Progress Reports</h4>
              <button onClick={() => setShowProgressForm(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                <Plus size={13} /> Add Report
              </button>
            </div>
            <div className="space-y-4">
              {progressReports.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">No progress reports yet.</div>
              )}
              {progressReports.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800">{formatDate(r.report_date)}</span>
                      <span className="text-xs text-slate-500">{r.workers_count} workers</span>
                      {r.weather && <span className="text-xs text-slate-400">{r.weather}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700">{r.progress_percent}% complete</span>
                      <div className="w-16 bg-slate-100 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${r.progress_percent}%` }} /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {r.work_completed && <div><div className="text-xs font-semibold text-green-600 uppercase mb-1">Completed</div><p className="text-slate-600">{r.work_completed}</p></div>}
                    {r.work_pending && <div><div className="text-xs font-semibold text-amber-600 uppercase mb-1">Pending</div><p className="text-slate-600">{r.work_pending}</p></div>}
                    {r.materials_used && <div><div className="text-xs font-semibold text-slate-500 uppercase mb-1">Materials Used</div><p className="text-slate-600">{r.materials_used}</p></div>}
                    {r.issues && <div><div className="text-xs font-semibold text-red-500 uppercase mb-1">Issues</div><p className="text-slate-600">{r.issues}</p></div>}
                  </div>
                  {r.notes && <p className="text-sm text-slate-500 mt-2 italic">{r.notes}</p>}
                  {r.image_urls && r.image_urls.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {r.image_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={`Site ${i+1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200 hover:opacity-80" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-700">Project Expenses</h4>
                <div className="text-xs text-slate-500 mt-0.5">Total: <span className="font-semibold text-red-600">{formatCurrency(totalExpenses)}</span></div>
              </div>
              <button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                <Plus size={13} /> Add Expense
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">No expenses recorded</td></tr>
                  ) : expenses.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 capitalize">{e.category}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{e.description}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {activities.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">No project history yet.</div> : activities.map(activity => (
              <div key={activity.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
                <div><div className="text-sm font-medium text-slate-800">{activity.description}</div><div className="text-xs text-slate-500 mt-1">{activity.activity_type.replace(/_/g, ' ')}</div></div>
                <div className="text-xs text-slate-400">{formatDate(activity.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Assign Employee Modal */}
        {showAssignForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowAssignForm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Assign Employee</h3>
                <button onClick={() => setShowAssignForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
                  <select value={assignForm.employee_id} onChange={e => setAssignForm(f => ({ ...f, employee_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select employee</option>
                    {employees.filter(e => !assignments.find(a => a.employee_id === e.id)).map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role on Project</label>
                  <select value={assignForm.role_on_project} onChange={e => setAssignForm(f => ({ ...f, role_on_project: e.target.value as ProjectAssignment['role_on_project'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(['supervisor','foreman','worker','driver','helper','engineer','other'] as const).map(r => (
                      <option key={r} value={r}>{r.replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Daily Rate (AED)</label>
                    <input type="number" min="0" value={assignForm.daily_rate} onChange={e => setAssignForm(f => ({ ...f, daily_rate: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                    <input type="date" value={assignForm.start_date} onChange={e => setAssignForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                    <input type="date" min={assignForm.start_date} value={assignForm.end_date} onChange={e => setAssignForm(f => ({ ...f, end_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                {assignmentError && <p className="text-sm text-red-600">{assignmentError}</p>}
                                {saving ? 'Saving...' : editingAssignment ? 'Save Changes' : 'Assign'}
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
                <button onClick={() => setShowAssignForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={addAssignment} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                  {saving ? 'Saving...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Form Modal */}
        {showProgressForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowProgressForm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Daily Progress Report</h3>
                <button onClick={() => setShowProgressForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="overflow-y-auto flex-1 p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Report Date</label>
                    <input type="date" value={progressForm.report_date} onChange={e => setProgressForm(f => ({ ...f, report_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Workers Today</label>
                    <input type="number" min="0" value={progressForm.workers_count} onChange={e => setProgressForm(f => ({ ...f, workers_count: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Progress %</label>
                    <input type="number" min="0" max="100" value={progressForm.progress_percent} onChange={e => setProgressForm(f => ({ ...f, progress_percent: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                {[
                  { label: 'Work Completed', field: 'work_completed' },
                  { label: 'Work Pending', field: 'work_pending' },
                  { label: 'Materials Used', field: 'materials_used' },
                  { label: 'Issues / Problems', field: 'issues' },
                  { label: 'Notes', field: 'notes' },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    <textarea rows={2} value={(progressForm as Record<string, unknown>)[field] as string ?? ''}
                      onChange={e => setProgressForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Weather</label>
                  <input value={progressForm.weather} onChange={e => setProgressForm(f => ({ ...f, weather: e.target.value }))}
                    placeholder="e.g. Sunny, Hot 38°C" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
                <button onClick={() => setShowProgressForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={addProgress} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                  {saving ? 'Saving...' : 'Submit Report'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expense Form Modal */}
        {showExpenseForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowExpenseForm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Add Expense</h3>
                <button onClick={() => setShowExpenseForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                    <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                    <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value as ProjectExpense['category'] }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {(['materials','labor','transport','equipment','subcontract','other'] as const).map(c => (
                        <option key={c} value={c}>{c.replace(/\b\w/g, ch => ch.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount (AED)</label>
                    <input type="number" min="0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
                    <input value={expenseForm.reference} onChange={e => setExpenseForm(f => ({ ...f, reference: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
                <button onClick={() => setShowExpenseForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={addExpense} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                  {saving ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Projects list view
  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(['all', 'active', 'pending', 'on_hold', 'completed'] as const).map(s => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setStatusFilter(s)}>
            <div className="text-xs text-slate-500 mb-1 capitalize">{s === 'all' ? 'Total Projects' : s.replace('_', ' ')}</div>
            <div className="text-xl font-bold text-slate-800">
              {s === 'all' ? projects.length : projects.filter(p => p.status === s).length}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {(['all', 'pending', 'active', 'on_hold', 'completed', 'cancelled'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 py-16 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-3 py-16 text-center text-slate-400">No projects found</div>
        ) : filtered.map(project => {
          const sc = STATUS_CONFIG[project.status];
          return (
            <div key={project.id} onClick={() => openProject(project)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{project.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{project.project_number}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); setEditing(project); setForm({ ...project, customer_id: project.customer_id ?? null, start_date: project.start_date ?? '', end_date: project.end_date ?? '', notes: project.notes ?? '' }); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                  <button onClick={e => { e.stopPropagation(); deleteProject(project.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                </div>
              </div>
              {project.customer_name && <div className="text-xs text-slate-500 mb-2">{project.customer_name}</div>}
              {project.site_address && <div className="text-xs text-slate-400 mb-3 truncate">{project.site_address}</div>}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  {project.start_date && <span className="text-slate-500 flex items-center gap-1"><Calendar size={11} />{formatDate(project.start_date)}</span>}
                  <span className={`font-medium ${PRIORITY_CONFIG[project.priority].color}`}>{project.priority}</span>
                </div>
                <span className="font-semibold text-slate-700">{formatCurrency(project.contract_value)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Project Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Project' : 'New Project'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                  <select value={form.customer_id ?? ''} onChange={e => { const c = customers.find(c => c.id === e.target.value); setForm(f => ({ ...f, customer_id: e.target.value || null, customer_name: c?.name ?? '' })); }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">No customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Site Address</label>
                  <input value={form.site_address} onChange={e => setForm(f => ({ ...f, site_address: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Project['status'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.entries(STATUS_CONFIG) as [Project['status'], typeof STATUS_CONFIG[Project['status']]][]).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Project['priority'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(['low','medium','high','urgent'] as const).map(p => (
                      <option key={p} value={p}>{p.replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contract Value (AED)</label>
                  <input type="number" min="0" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: Number(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Cost (AED)</label>
                  <input type="number" min="0" value={form.estimated_cost} onChange={e => setForm(f => ({ ...f, estimated_cost: Number(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" value={form.start_date ?? ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" value={form.end_date ?? ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveProject} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
