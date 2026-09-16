import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AuditLog, Expense, Income, CashWithdrawal, DailyCashClosing, ProjectActivity, ProjectExpense } from '../../lib/types';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/types';
import Modal from '../../components/common/Modal';
import StatCard from '../../components/common/StatCard';
import { useAuth } from '../../context/AuthContext';
import {
  Download, Eye, Check, X, Plus, DollarSign, TrendingUp, TrendingDown,
  Calendar, FileText, AlertCircle, Trash2
} from 'lucide-react';

interface Props {
  branchFilter: string | null;
}

type TabType = 'audit' | 'expenses' | 'income' | 'withdrawals' | 'closing';

const AUDIT_FIELD_LABELS: Record<string, string> = {
  id: 'Record ID',
  amount: 'Amount',
  notes: 'Notes',
  reference: 'Reference',
  branch_id: 'Branch',
  created_by: 'Created By',
  created_at: 'Created At',
  updated_at: 'Updated At',
  invoice_id: 'Invoice ID',
  payment_date: 'Payment Date',
  payment_method: 'Payment Method',
  category: 'Category',
  description: 'Description',
};

const AUDIT_HIDDEN_FIELDS = new Set(['id', 'created_by', 'created_at', 'updated_at', 'branch_id', 'invoice_id']);

function auditValueLabel(key: string) {
  return AUDIT_FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function auditValueDisplay(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') return formatCurrency(Number(value));
  if (key === 'payment_method') return String(value).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (key === 'payment_date' || key === 'expense_date' || key === 'income_date' || key === 'issue_date' || key === 'due_date') {
    return formatDate(String(value));
  }
  if (key === 'created_at') return formatDateTime(String(value));
  if (key === 'notes' && String(value).trim().length === 0) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function auditRowsFromValues(values?: Record<string, unknown>) {
  if (!values) return [];
  return Object.entries(values)
    .filter(([key]) => !AUDIT_HIDDEN_FIELDS.has(key))
    .map(([key, value]) => ({
      key,
      label: auditValueLabel(key),
      value: auditValueDisplay(key, value),
    }));
}

const actionColors: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  APPROVE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  SOFT_DELETE: 'bg-amber-100 text-amber-700',
  RESTORE: 'bg-cyan-100 text-cyan-700',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

export default function CashflowPage({ branchFilter }: Props) {
  const { profile, isGlobalAdmin } = useAuth();
  const [tab, setTab] = useState<TabType>('audit');
  const [loading, setLoading] = useState(true);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [projectExpenses, setProjectExpenses] = useState<Array<ProjectExpense & { project?: { id: string; name: string; customer_name: string } }>>([]);
  const [auditFilters, setAuditFilters] = useState({
    date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    transaction_type: 'all',
    action: 'all',
    user_id: '',
  });

  // Expenses & Income
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [withdrawals, setWithdrawals] = useState<CashWithdrawal[]>([]);
  const [closings, setClosings] = useState<DailyCashClosing[]>([]);

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AuditLog | Expense | CashWithdrawal | null>(null);

  // Forms
  const [expenseForm, setExpenseForm] = useState({ category: '', description: '', amount: 0, payment_method: 'cash', notes: '', expense_date: new Date().toISOString().split('T')[0] });
  const [incomeForm, setIncomeForm] = useState({ category: '', description: '', amount: 0, payment_method: 'cash', notes: '', income_date: new Date().toISOString().split('T')[0] });
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: 0, purpose: '', notes: '', payment_method: 'cash', reference: '' });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [branchFilter, tab, auditFilters]);

  const loadData = async () => {
    setLoading(true);
    const branchId = branchFilter;

    try {
      // Load audit logs
      let auditQuery = supabase.from('audit_logs').select('*, branch:branches(*)').order('created_at', { ascending: false }).limit(100);
      if (branchId) auditQuery = auditQuery.eq('branch_id', branchId);
      if (auditFilters.date_from) auditQuery = auditQuery.gte('created_at', auditFilters.date_from);
      if (auditFilters.date_to) auditQuery = auditQuery.lte('created_at', auditFilters.date_to + ' 23:59:59');
      if (auditFilters.transaction_type !== 'all') auditQuery = auditQuery.eq('transaction_type', auditFilters.transaction_type);
      if (auditFilters.action !== 'all') auditQuery = auditQuery.eq('action', auditFilters.action);
      const { data: auditData } = await auditQuery;
      setAuditLogs(auditData ?? []);

      let projectActivityQuery = supabase.from('project_activities').select('*, project:projects(name)').order('created_at', { ascending: false }).limit(100);
      if (branchId) projectActivityQuery = projectActivityQuery.eq('branch_id', branchId);
      if (auditFilters.date_from) projectActivityQuery = projectActivityQuery.gte('created_at', auditFilters.date_from);
      if (auditFilters.date_to) projectActivityQuery = projectActivityQuery.lte('created_at', auditFilters.date_to + ' 23:59:59');
      const { data: projectActivityData } = await projectActivityQuery;
      setProjectActivities((projectActivityData ?? []) as ProjectActivity[]);

      let projectExpenseQuery = supabase.from('project_expenses').select('*, project:projects(id, name, customer_name)').order('expense_date', { ascending: false });
      if (branchId) projectExpenseQuery = projectExpenseQuery.eq('branch_id', branchId);
      if (auditFilters.date_from) projectExpenseQuery = projectExpenseQuery.gte('expense_date', auditFilters.date_from);
      if (auditFilters.date_to) projectExpenseQuery = projectExpenseQuery.lte('expense_date', auditFilters.date_to);
      const { data: projectExpenseData } = await projectExpenseQuery;
      setProjectExpenses((projectExpenseData ?? []) as Array<ProjectExpense & { project?: { id: string; name: string; customer_name: string } }>);

      // Load expenses
      let expenseQuery = supabase.from('expenses').select('*, branch:branches(*)').eq('is_deleted', false).order('expense_date', { ascending: false });
      if (branchId) expenseQuery = expenseQuery.eq('branch_id', branchId);
      if (auditFilters.date_from) expenseQuery = expenseQuery.gte('expense_date', auditFilters.date_from);
      if (auditFilters.date_to) expenseQuery = expenseQuery.lte('expense_date', auditFilters.date_to);
      const { data: expenseData } = await expenseQuery;
      setExpenses(expenseData ?? []);

      // Load income
      let incomeQuery = supabase.from('income').select('*, branch:branches(*)').eq('is_deleted', false).order('income_date', { ascending: false });
      if (branchId) incomeQuery = incomeQuery.eq('branch_id', branchId);
      if (auditFilters.date_from) incomeQuery = incomeQuery.gte('income_date', auditFilters.date_from);
      if (auditFilters.date_to) incomeQuery = incomeQuery.lte('income_date', auditFilters.date_to);
      const { data: incomeData } = await incomeQuery;
      setIncomes(incomeData ?? []);

      // Load withdrawals
      let withdrawalQuery = supabase.from('cash_withdrawals').select('*, branch:branches(*)').eq('is_deleted', false).order('created_at', { ascending: false });
      if (branchId) withdrawalQuery = withdrawalQuery.eq('branch_id', branchId);
      const { data: withdrawalData } = await withdrawalQuery;
      setWithdrawals(withdrawalData ?? []);

      // Load daily closings
      let closingQuery = supabase.from('daily_cash_closing').select('*, branch:branches(*)').order('closing_date', { ascending: false });
      if (branchId) closingQuery = closingQuery.eq('branch_id', branchId);
      const { data: closingData } = await closingQuery;
      setClosings(closingData ?? []);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const projectExpenseTotal = projectExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const totalExpenses = expenses.filter(e => e.approval_status === 'approved').reduce((s, e) => s + e.amount, 0) + projectExpenseTotal;
  const totalIncome = incomes.filter(i => i.approval_status === 'approved').reduce((s, i) => s + i.amount, 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
  const netCashflow = totalIncome - totalExpenses;

  // Actions
  const saveExpense = async () => {
    if (!expenseForm.description || expenseForm.amount <= 0) { setError('Description and amount required'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('expenses').insert({
      ...expenseForm,
      branch_id: branchFilter || profile?.branch_id,
      created_by: profile?.id,
      approval_status: expenseForm.amount >= 5000 ? 'pending' : 'approved',
      requires_approval: expenseForm.amount >= 5000,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    setShowExpenseModal(false);
    setExpenseForm({ category: '', description: '', amount: 0, payment_method: 'cash', notes: '', expense_date: new Date().toISOString().split('T')[0] });
    loadData();
  };

  const saveIncome = async () => {
    if (!incomeForm.description || incomeForm.amount <= 0) { setError('Description and amount required'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('income').insert({
      ...incomeForm,
      branch_id: branchFilter || profile?.branch_id,
      created_by: profile?.id,
      approval_status: 'approved',
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    setShowIncomeModal(false);
    setIncomeForm({ category: '', description: '', amount: 0, payment_method: 'cash', notes: '', income_date: new Date().toISOString().split('T')[0] });
    loadData();
  };

  const saveWithdrawal = async () => {
    if (!withdrawalForm.purpose || withdrawalForm.amount <= 0) { setError('Purpose and amount required'); return; }
    setSaving(true);
    setError('');
    const ts = Date.now().toString().slice(-6);
    const { error: err } = await supabase.from('cash_withdrawals').insert({
      ...withdrawalForm,
      withdrawal_number: `WD-${ts}`,
      branch_id: branchFilter || profile?.branch_id,
      requested_by: profile?.id,
      status: 'pending',
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    setShowWithdrawalModal(false);
    setWithdrawalForm({ amount: 0, purpose: '', notes: '', payment_method: 'cash', reference: '' });
    loadData();
  };

  const approveWithdrawal = async (w: CashWithdrawal) => {
    await supabase.from('cash_withdrawals').update({
      status: 'approved',
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', w.id);
    loadData();
  };

  const rejectWithdrawal = async (w: CashWithdrawal, reason: string) => {
    await supabase.from('cash_withdrawals').update({
      status: 'rejected',
      rejected_by: profile?.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    }).eq('id', w.id);
    loadData();
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Permanently delete this expense?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    loadData();
  };

  const deleteIncome = async (id: string) => {
    if (!confirm('Permanently delete this income record?')) return;
    await supabase.from('income').delete().eq('id', id);
    loadData();
  };

  const deleteWithdrawal = async (id: string) => {
    if (!confirm('Permanently delete this withdrawal?')) return;
    await supabase.from('cash_withdrawals').delete().eq('id', id);
    loadData();
  };

  const approveExpense = async (e: Expense) => {
    await supabase.from('expenses').update({
      approval_status: 'approved',
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', e.id);
    loadData();
  };

  const exportAuditReport = () => {
    const csv = [
      ['Date', 'User', 'Role', 'Branch', 'Action', 'Type', 'Amount', 'Table', 'Record ID'].join(','),
      ...auditLogs.map(log => [
        formatDateTime(log.created_at), log.user_name, log.user_role, log.branch?.name || 'All', log.action, log.transaction_type,
        log.amount || '', log.table_name, log.record_id
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'audit', label: 'Audit Trail', icon: <FileText size={14} /> },
    { id: 'expenses', label: 'Expenses', icon: <TrendingDown size={14} /> },
    { id: 'income', label: 'Income', icon: <TrendingUp size={14} /> },
    { id: 'withdrawals', label: 'Withdrawals', icon: <DollarSign size={14} /> },
    { id: 'closing', label: 'Daily Closing', icon: <Calendar size={14} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Income" value={formatCurrency(totalIncome)} icon={<TrendingUp size={18} />} color="green" />
        <StatCard title="Total Expenses" value={formatCurrency(totalExpenses)} icon={<TrendingDown size={18} />} color="red" />
        <StatCard title="Net Cashflow" value={formatCurrency(netCashflow)} icon={<DollarSign size={18} />} color={netCashflow >= 0 ? 'green' : 'red'} />
        <StatCard title="Pending Withdrawals" value={pendingWithdrawals.toString()} icon={<AlertCircle size={18} />} color="amber" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Audit Tab */}
              {tab === 'audit' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="date" value={auditFilters.date_from} onChange={e => setAuditFilters(f => ({ ...f, date_from: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                    <span className="text-slate-400">to</span>
                    <input type="date" value={auditFilters.date_to} onChange={e => setAuditFilters(f => ({ ...f, date_to: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                    <select value={auditFilters.transaction_type} onChange={e => setAuditFilters(f => ({ ...f, transaction_type: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                      <option value="all">All Types</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="payment">Payment</option>
                      <option value="withdrawal">Withdrawal</option>
                    </select>
                    <select value={auditFilters.action} onChange={e => setAuditFilters(f => ({ ...f, action: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                      <option value="all">All Actions</option>
                      <option value="INSERT">Created</option>
                      <option value="UPDATE">Updated</option>
                      <option value="DELETE">Deleted</option>
                      <option value="APPROVE">Approved</option>
                      <option value="REJECT">Rejected</option>
                    </select>
                    <button onClick={exportAuditReport} className="ml-auto flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
                      <Download size={14} /> Export CSV
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Project Financial Movements</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Project ID</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Expense</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {projectExpenses.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">No project expenses found</td></tr> : projectExpenses.map(expense => (
                          <tr key={expense.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-600">{formatDate(expense.expense_date)}</td>
                            <td className="px-4 py-3 text-slate-800">{expense.project?.name ?? 'Project'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{expense.project_id}</td>
                            <td className="px-4 py-3 text-slate-700">{expense.description}</td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(expense.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date/Time</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Branch</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogs.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-10 text-slate-400">No audit logs found</td></tr>
                        ) : auditLogs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="text-slate-800">{formatDateTime(log.created_at)}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center text-xs">
                                  {log.user_name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <div className="text-slate-800">{log.user_name || 'System'}</div>
                                  <div className="text-xs text-slate-400 capitalize">{log.user_role}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{log.branch?.name || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] || 'bg-slate-100'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{log.transaction_type}</td>
                            <td className="px-4 py-3 text-right font-medium">{log.amount ? formatCurrency(log.amount) : '—'}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => { setSelectedItem(log); setShowDetailModal(true); }}
                                className="p-1 text-slate-400 hover:text-blue-600"><Eye size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Project Activity</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date/Time</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Activity</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {projectActivities.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-slate-400">No project activity found</td></tr> : projectActivities.map(activity => (
                          <tr key={activity.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-600">{formatDateTime(activity.created_at)}</td>
                            <td className="px-4 py-3 text-slate-800">{Array.isArray(activity.project) ? activity.project[0]?.name : activity.project?.name ?? 'Project'}</td>
                            <td className="px-4 py-3 text-slate-700">{activity.description}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{activity.activity_type.replace(/_/g, ' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expenses Tab */}
              {tab === 'expenses' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      <Plus size={14} /> Add Expense
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Payment</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expenses.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-10 text-slate-400">No expenses found</td></tr>
                        ) : expenses.map(exp => (
                          <tr key={exp.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{formatDate(exp.expense_date)}</td>
                            <td className="px-4 py-3 text-slate-600">{exp.category}</td>
                            <td className="px-4 py-3 text-slate-800">{exp.description}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{exp.payment_method}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[exp.approval_status ?? ''] || 'bg-slate-100'}`}>
                                {exp.approval_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(exp.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {exp.approval_status === 'pending' && (isGlobalAdmin || profile?.role === 'manager') && (
                                  <button onClick={() => approveExpense(exp)} className="p-1 text-slate-400 hover:text-green-600" title="Approve"><Check size={14} /></button>
                                )}
                                {isGlobalAdmin && (
                                  <button onClick={() => deleteExpense(exp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
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

              {/* Income Tab */}
              {tab === 'income' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowIncomeModal(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      <Plus size={14} /> Add Income
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Payment</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {incomes.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-10 text-slate-400">No income recorded</td></tr>
                        ) : incomes.map(inc => (
                          <tr key={inc.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{formatDate(inc.income_date)}</td>
                            <td className="px-4 py-3 text-slate-600">{inc.category}</td>
                            <td className="px-4 py-3 text-slate-800">{inc.description}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{inc.payment_method}</td>
                            <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(inc.amount)}</td>
                            <td className="px-4 py-3">
                              {isGlobalAdmin && (
                                <button onClick={() => deleteIncome(inc.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Withdrawals Tab */}
              {tab === 'withdrawals' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowWithdrawalModal(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      <Plus size={14} /> Request Withdrawal
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Number</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Purpose</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {withdrawals.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-10 text-slate-400">No withdrawals found</td></tr>
                        ) : withdrawals.map(w => (
                          <tr key={w.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-slate-600">{w.withdrawal_number}</td>
                            <td className="px-4 py-3">{formatDate(w.created_at)}</td>
                            <td className="px-4 py-3 text-slate-800">{w.purpose}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[w.status] || 'bg-slate-100'}`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(w.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {w.status === 'pending' && (isGlobalAdmin || profile?.role === 'manager') && (
                                  <>
                                    <button onClick={() => approveWithdrawal(w)} className="p-1 text-slate-400 hover:text-green-600" title="Approve"><Check size={14} /></button>
                                    <button onClick={() => rejectWithdrawal(w, 'Rejected by ' + profile?.full_name)} className="p-1 text-slate-400 hover:text-red-600" title="Reject"><X size={14} /></button>
                                  </>
                                )}
                                {isGlobalAdmin && (
                                  <button onClick={() => deleteWithdrawal(w.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
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

              {/* Daily Closing Tab */}
              {tab === 'closing' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Branch</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Expected</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actual</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Variance</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {closings.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-10 text-slate-400">No closing reports found</td></tr>
                        ) : closings.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{formatDate(c.closing_date)}</td>
                            <td className="px-4 py-3 text-slate-600">{c.branch?.name}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(c.expected_closing)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.actual_closing)}</td>
                            <td className={`px-4 py-3 text-right font-semibold ${c.variance < 0 ? 'text-red-600' : c.variance > 0 ? 'text-green-600' : 'text-slate-800'}`}>
                              {c.variance !== 0 && (c.variance > 0 ? '+' : '')}{formatCurrency(c.variance)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[c.status] || 'bg-slate-100'}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      <Modal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Add Expense" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <input value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g., Rent, Utilities, Salary" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
              <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <select value={expenseForm.payment_method} onChange={e => setExpenseForm(f => ({ ...f, payment_method: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {expenseForm.amount >= 5000 && (
            <p className="text-xs text-amber-600">Expenses of AED 5,000+ require manager approval</p>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={saveExpense} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : 'Add Expense'}
            </button>
            <button onClick={() => setShowExpenseModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Income Modal */}
      <Modal isOpen={showIncomeModal} onClose={() => setShowIncomeModal(false)} title="Add Income" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <input value={incomeForm.category} onChange={e => setIncomeForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g., Services, Commission, Refund" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <input value={incomeForm.description} onChange={e => setIncomeForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
              <input type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={incomeForm.income_date} onChange={e => setIncomeForm(f => ({ ...f, income_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <select value={incomeForm.payment_method} onChange={e => setIncomeForm(f => ({ ...f, payment_method: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
            </select>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={saveIncome} disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : 'Add Income'}
            </button>
            <button onClick={() => setShowIncomeModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Withdrawal Modal */}
      <Modal isOpen={showWithdrawalModal} onClose={() => setShowWithdrawalModal(false)} title="Request Cash Withdrawal" size="md">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            All withdrawals require manager approval before processing.
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
            <input type="number" value={withdrawalForm.amount} onChange={e => setWithdrawalForm(f => ({ ...f, amount: Number(e.target.value) }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose *</label>
            <input value={withdrawalForm.purpose} onChange={e => setWithdrawalForm(f => ({ ...f, purpose: e.target.value }))}
              placeholder="e.g., Petty cash, Vendor payment" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
            <input value={withdrawalForm.reference} onChange={e => setWithdrawalForm(f => ({ ...f, reference: e.target.value }))}
              placeholder="Invoice # or PO #" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={withdrawalForm.notes} onChange={e => setWithdrawalForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={saveWithdrawal} disabled={saving}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
            <button onClick={() => setShowWithdrawalModal(false)} className="px-6 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title="Audit Log Details" size="lg">
        {selectedItem && 'table_name' in selectedItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-lg p-4">
              <div>
                <div className="text-xs text-slate-500">Table</div>
                <div className="font-medium">{selectedItem.table_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Action</div>
                <div className="mt-0.5">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${actionColors[selectedItem.action]}`}>
                    {selectedItem.action}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">User</div>
                <div className="font-medium">{selectedItem.user_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Branch</div>
                <div className="font-medium">{selectedItem.branch?.name || 'All'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Amount</div>
                <div className="font-medium">{selectedItem.amount ? formatCurrency(selectedItem.amount) : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Type</div>
                <div className="font-medium capitalize">{selectedItem.transaction_type}</div>
              </div>
            </div>

            {(auditRowsFromValues(selectedItem.old_values).length > 0 || auditRowsFromValues(selectedItem.new_values).length > 0) && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Recorded Values</div>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-slate-600">Field</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-600">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditRowsFromValues(selectedItem.new_values).map(row => (
                          <tr key={row.key} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-500 font-medium">{row.label}</td>
                            <td className="px-3 py-2 text-slate-800">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {auditRowsFromValues(selectedItem.old_values).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Previous Values</div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-slate-600">Field</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-600">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditRowsFromValues(selectedItem.old_values).map(row => (
                            <tr key={row.key} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-500 font-medium">{row.label}</td>
                              <td className="px-3 py-2 text-slate-800">{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
