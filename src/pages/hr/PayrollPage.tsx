import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Company, Employee, PayrollPeriod, PayrollItem, SalaryAdvance,
  EmployeeDeduction, PayrollAuditLog, formatDate
} from '../../lib/types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, Search, CheckCircle, XCircle, Printer,
  ChevronLeft, History, Banknote, Calculator, Trash2
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props { branchFilter: string | null; }

function statusColor(s: string) {
  const m: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    processing: 'bg-blue-100 text-blue-700',
    approved: 'bg-slate-100 text-primary-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
    applied: 'bg-slate-100 text-primary-700',
  };
  return m[s] ?? 'bg-slate-100 text-slate-600';
}

export default function PayrollPage({ branchFilter }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'periods' | 'deductions' | 'advances' | 'auditlog'>('periods');
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>([]);
  const [auditLogs, setAuditLogs] = useState<PayrollAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [payslipEmp, setPayslipEmp] = useState<PayrollItem | null>(null);
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const now = new Date();
  const [periodForm, setPeriodForm] = useState({
    period_year: now.getFullYear(),
    period_month: now.getMonth() + 1,
  });
  const [advanceForm, setAdvanceForm] = useState({
    employee_id: '', advance_date: now.toISOString().split('T')[0],
    amount: 0, reason: '', repayment_months: 3,
  });
  const [deductionForm, setDeductionForm] = useState({
    employee_id: '', deduction_date: now.toISOString().split('T')[0],
    category: 'other' as EmployeeDeduction['category'],
    reason: '', amount: 0,
  });

  useEffect(() => { loadAll(); }, [branchFilter]);

  const loadAll = async () => {
    setLoading(true);
    let pq = supabase.from('payroll_periods').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false });
    let eq = supabase.from('employees').select('*').eq('status', 'active').order('full_name');
    let aq = supabase.from('salary_advances').select('*, employee:employees(*)').order('created_at', { ascending: false });
    let dq = supabase.from('employee_deductions').select('*, employee:employees(*)').order('deduction_date', { ascending: false });
    let logq = supabase.from('payroll_audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (branchFilter) {
      pq = pq.eq('branch_id', branchFilter);
      eq = eq.eq('branch_id', branchFilter);
      aq = aq.eq('branch_id', branchFilter);
      dq = dq.eq('branch_id', branchFilter);
      logq = logq.eq('branch_id', branchFilter);
    }
    const [{ data: p }, { data: e }, { data: a }, { data: d }, { data: l }] = await Promise.all([pq, eq, aq, dq, logq]);
    setPeriods(p ?? []);
    setEmployees(e ?? []);
    setAdvances(a ?? []);
    setDeductions(d ?? []);
    setAuditLogs(l ?? []);
    setLoading(false);
  };

  const loadPeriodItems = async (periodId: string) => {
    const { data } = await supabase
      .from('payroll_items')
      .select('*, employee:employees(*)')
      .eq('payroll_period_id', periodId);
    setPayrollItems(data ?? []);
  };

  const openPeriod = async (p: PayrollPeriod) => {
    setSelectedPeriod(p);
    await loadPeriodItems(p.id);
  };

  const writeAudit = async (
    entityType: PayrollAuditLog['entity_type'],
    entityId: string,
    action: PayrollAuditLog['action'],
    notes = '',
    old_values?: Record<string, unknown>,
    new_values?: Record<string, unknown>
  ) => {
    await supabase.from('payroll_audit_logs').insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor_id: profile?.id,
      actor_name: profile?.full_name ?? '',
      actor_role: profile?.role ?? '',
      branch_id: branchFilter || profile?.branch_id,
      old_values: old_values ?? null,
      new_values: new_values ?? null,
      notes,
    });
  };

  const createPeriod = async () => {
    setSaving(true);
    setError('');
    const year = periodForm.period_year;
    const month = periodForm.period_month;
    const branchId = branchFilter || profile?.branch_id;
    const period_name = `${MONTHS[month - 1]} ${year}`;
    const start_date = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end_date = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data: period, error: pe } = await supabase.from('payroll_periods').insert({
      branch_id: branchId, period_name, period_year: year, period_month: month,
      start_date, end_date, status: 'draft',
      total_gross: 0, total_deductions: 0, total_net: 0,
      created_by: profile?.id,
    }).select().maybeSingle();

    if (pe || !period) { setError(pe?.message ?? 'Failed to create period'); setSaving(false); return; }

    const items = employees.map(emp => {
      const housing = emp.housing_allowance ?? 0;
      const transport = emp.transport_allowance ?? 0;
      const other = emp.other_allowances ?? 0;
      const gross = emp.salary + housing + transport + other;
      return {
        payroll_period_id: period.id,
        employee_id: emp.id,
        branch_id: branchId,
        basic_salary: emp.salary,
        housing_allowance: housing,
        transport_allowance: transport,
        other_allowances: other,
        overtime_hours: 0,
        overtime_rate: emp.overtime_rate ?? 0,
        overtime_amount: 0,
        bonus: 0,
        advance_deduction: 0,
        absence_deduction: 0,
        other_deductions: 0,
        gross_salary: gross,
        total_deductions: 0,
        net_salary: gross,
        days_worked: 0,
        days_absent: 0,
        days_leave: 0,
        notes: '',
        status: 'draft',
      };
    });

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('payroll_items').insert(items);
      if (itemsError) {
        await supabase.from('payroll_periods').delete().eq('id', period.id);
        setError(itemsError.message);
        setSaving(false);
        return;
      }
    }
    await writeAudit('payroll_period', period.id, 'created', `Created ${period_name} with ${items.length} employees`);
    setSaving(false);
    setShowCreatePeriod(false);
    loadAll();
  };

  const updateItem = async (item: PayrollItem, field: keyof PayrollItem, value: number) => {
    const updated = { ...item, [field]: value };
    updated.overtime_amount = updated.overtime_hours * updated.overtime_rate;
    updated.gross_salary = updated.basic_salary + updated.housing_allowance + updated.transport_allowance + updated.other_allowances + updated.overtime_amount + updated.bonus;
    updated.total_deductions = updated.advance_deduction + updated.absence_deduction + updated.other_deductions;
    updated.net_salary = updated.gross_salary - updated.total_deductions;

    const { error: itemError } = await supabase.from('payroll_items').update({
      [field]: value,
      overtime_amount: updated.overtime_amount,
      gross_salary: updated.gross_salary,
      total_deductions: updated.total_deductions,
      net_salary: updated.net_salary,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    if (itemError) { setError(itemError.message); return; }

    const allItems = payrollItems.map(p => p.id === item.id ? updated : p);
    setPayrollItems(allItems);
    const totalGross = allItems.reduce((s, i) => s + i.gross_salary, 0);
    const totalDeductions = allItems.reduce((s, i) => s + i.total_deductions, 0);
    const totalNet = allItems.reduce((s, i) => s + i.net_salary, 0);
    if (selectedPeriod) {
      await supabase.from('payroll_periods').update({ total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet }).eq('id', selectedPeriod.id);
      setSelectedPeriod(p => p ? { ...p, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet } : p);
    }
  };

  const approvePeriod = async () => {
    if (!selectedPeriod) return;
    await supabase.from('payroll_periods').update({ status: 'approved', approved_by: profile?.id, approved_at: new Date().toISOString() }).eq('id', selectedPeriod.id);
    await supabase.from('payroll_items').update({ status: 'approved' }).eq('payroll_period_id', selectedPeriod.id);
    await writeAudit('payroll_period', selectedPeriod.id, 'approved', '', { status: selectedPeriod.status }, { status: 'approved' });
    setSelectedPeriod(p => p ? { ...p, status: 'approved' } : p);
    loadAll();
  };

  const markPaid = async () => {
    if (!selectedPeriod) return;
    await supabase.from('payroll_periods').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', selectedPeriod.id);
    await supabase.from('payroll_items').update({ status: 'paid' }).eq('payroll_period_id', selectedPeriod.id);
    await writeAudit('payroll_period', selectedPeriod.id, 'paid', '', { status: selectedPeriod.status }, { status: 'paid' });
    setSelectedPeriod(p => p ? { ...p, status: 'paid' } : p);
    loadAll();
  };

  const deletePayrollPeriod = async (id: string, periodName: string) => {
    if (!confirm(`Delete payroll period "${periodName}"? This will also delete all associated payroll items. This cannot be undone.`)) return;
    await supabase.from('payroll_items').delete().eq('payroll_period_id', id);
    await supabase.from('payroll_periods').delete().eq('id', id);
    await writeAudit('payroll_period', id, 'cancelled', `Deleted period ${periodName}`);
    loadAll();
  };

  const approveAdvance = async (id: string, approve: boolean) => {
    await supabase.from('salary_advances').update({
      status: approve ? 'approved' : 'rejected',
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    await writeAudit('salary_advance', id, approve ? 'approved' : 'rejected');
    loadAll();
  };

  const approveDeduction = async (id: string, approve: boolean) => {
    await supabase.from('employee_deductions').update({
      status: approve ? 'approved' : 'rejected',
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    await writeAudit('employee_deduction', id, approve ? 'approved' : 'rejected');
    loadAll();
  };

  const createAdvance = async () => {
    if (!advanceForm.employee_id || advanceForm.amount <= 0) { setError('Employee and amount required'); return; }
    setSaving(true);
    setError('');
    const monthly = advanceForm.repayment_months > 0 ? advanceForm.amount / advanceForm.repayment_months : advanceForm.amount;
    const { data, error: e } = await supabase.from('salary_advances').insert({
      ...advanceForm,
      branch_id: branchFilter || profile?.branch_id,
      monthly_deduction: monthly,
      amount_repaid: 0,
      balance_due: advanceForm.amount,
      status: 'pending',
      requested_by: profile?.id,
    }).select().maybeSingle();
    if (e) { setError(e.message); setSaving(false); return; }
    if (data) await writeAudit('salary_advance', data.id, 'created');
    setSaving(false);
    setShowAdvanceModal(false);
    setAdvanceForm({ employee_id: '', advance_date: now.toISOString().split('T')[0], amount: 0, reason: '', repayment_months: 3 });
    loadAll();
  };

  const createDeduction = async () => {
    if (!deductionForm.employee_id || deductionForm.amount <= 0) { setError('Employee and amount required'); return; }
    setSaving(true);
    setError('');
    const { data, error: e } = await supabase.from('employee_deductions').insert({
      ...deductionForm,
      branch_id: branchFilter || profile?.branch_id,
      status: 'pending',
      created_by: profile?.id,
    }).select().maybeSingle();
    if (e) { setError(e.message); setSaving(false); return; }
    if (data) await writeAudit('employee_deduction', data.id, 'created');
    setSaving(false);
    setShowDeductionModal(false);
    setDeductionForm({ employee_id: '', deduction_date: now.toISOString().split('T')[0], category: 'other', reason: '', amount: 0 });
    loadAll();
  };

  const printPayslip = async (item: PayrollItem) => {
    const emp = item.employee as Employee | undefined;
    const period = selectedPeriod;

    const escapeHtml = (value: string | number | null | undefined) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');

    let company: Company | null = null;
    const activeCompanyId = branchFilter || profile?.company_id;
    if (branchFilter) {
      const { data: branch, error: branchErr } = await supabase.from('branches').select('company_id').eq('id', branchFilter).maybeSingle();
      const resolvedCompanyId = branch?.company_id ?? profile?.company_id ?? activeCompanyId;
      if (!branchErr && resolvedCompanyId) {
        const { data: c } = await supabase.from('companies').select('*').eq('id', resolvedCompanyId).maybeSingle();
        if (c) company = c as Company;
      }
    } else if (profile?.company_id) {
      const { data: c } = await supabase.from('companies').select('*').eq('id', profile.company_id).maybeSingle();
      if (c) company = c as Company;
    }

    const companyName = company?.name ?? 'Al Luluah Tents & Sheds TR.';
    const companyLegalName = company?.legal_name ?? companyName;
    const companyAddress = company?.address ?? 'Company address';
    const companyPhone = company?.phone ?? '';
    const companyEmail = company?.email ?? '';
    const companyWebsite = company?.website ?? '';
    const logoUrl = company?.logo_url ?? '';
    const logoHtml = logoUrl
      ? `<img class="company-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" />`
      : `<div class="company-logo-fallback">${escapeHtml(companyName.charAt(0) || 'A')}</div>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`
      <html><head><title>Payslip</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a1a1a;background:#fff}
        .header{background:#0B6B3A;color:white;padding:20px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px}
        .header-left{display:flex;flex-direction:column}
        .header h1{margin:0;font-size:20px}.header p{margin:4px 0 0;font-size:13px;opacity:.85}
        .company-logo{width:56px;height:56px;object-fit:contain;border-radius:10px;background:white;padding:4px}
        .company-logo-fallback{width:56px;height:56px;border-radius:10px;background:#ffffff;color:#0B6B3A;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center}
        .company-details{margin:2px 0 0;font-size:11px;opacity:.86;line-height:1.4}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .card{background:#f0faf4;padding:14px;border-radius:8px}
        .card h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;color:#0B6B3A;letter-spacing:.05em}
        .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8f5ee;font-size:13px}
        .row span:first-child{color:#667085}
        .row span:last-child{font-weight:600;color:#1f2937;text-align:right}
        .total{font-weight:bold;font-size:15px;color:#0B6B3A;border-top:2px solid #0B6B3A;padding-top:8px}
        .net{background:#0B6B3A;color:white;padding:14px;border-radius:8px;text-align:center;margin-top:16px}
        .net h2{margin:0;font-size:24px}.net p{margin:4px 0 0;font-size:12px;opacity:.8}
        @media print{body{padding:0}.header{border-radius:0}.company-logo{max-height:56px}}
      </style></head><body>
      <div class="header">
        <div class="header-left">
          <h1>${escapeHtml(companyName)}</h1>
          <p>PAYSLIP &mdash; ${escapeHtml(period?.period_name ?? '')}</p>
          <div class="company-details">
            ${escapeHtml(companyLegalName)}<br/>
            ${escapeHtml(companyAddress)}<br/>
            ${escapeHtml(companyPhone)}${companyPhone && companyEmail ? ' · ' : ''}${escapeHtml(companyEmail)}<br/>
            ${escapeHtml(companyWebsite)}
          </div>
        </div>
        ${logoHtml}
      </div>
      <div class="grid">
        <div class="card">
          <h3>Employee</h3>
          <div class="row"><span>Name</span><span>${escapeHtml(emp?.full_name ?? '')}</span></div>
          <div class="row"><span>ID</span><span>${escapeHtml(emp?.employee_id ?? '')}</span></div>
          <div class="row"><span>Position</span><span>${escapeHtml(emp?.position ?? '')}</span></div>
          <div class="row"><span>Bank</span><span>${escapeHtml(emp?.bank_name ?? '&mdash;')}</span></div>
          <div class="row"><span>IBAN</span><span>${escapeHtml(emp?.iban ?? '&mdash;')}</span></div>
        </div>
        <div class="card">
          <h3>Period Details</h3>
          <div class="row"><span>Month</span><span>${escapeHtml(period?.period_name ?? '')}</span></div>
          <div class="row"><span>Days Worked</span><span>${escapeHtml(item.days_worked)}</span></div>
          <div class="row"><span>Days Absent</span><span>${escapeHtml(item.days_absent)}</span></div>
          <div class="row"><span>OT Hours</span><span>${escapeHtml(item.overtime_hours)}</span></div>
          <div class="row"><span>Status</span><span>${escapeHtml(item.status.toUpperCase())}</span></div>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <h3>Earnings</h3>
          <div class="row"><span>Basic Salary</span><span>AED ${escapeHtml(item.basic_salary.toFixed(2))}</span></div>
          <div class="row"><span>Housing Allowance</span><span>AED ${escapeHtml(item.housing_allowance.toFixed(2))}</span></div>
          <div class="row"><span>Transport Allowance</span><span>AED ${escapeHtml(item.transport_allowance.toFixed(2))}</span></div>
          <div class="row"><span>Other Allowances</span><span>AED ${escapeHtml(item.other_allowances.toFixed(2))}</span></div>
          <div class="row"><span>Overtime (${escapeHtml(item.overtime_hours)}h @ AED${escapeHtml(item.overtime_rate)})</span><span>AED ${escapeHtml(item.overtime_amount.toFixed(2))}</span></div>
          <div class="row"><span>Bonus</span><span>AED ${escapeHtml(item.bonus.toFixed(2))}</span></div>
          <div class="row total"><span>Gross Salary</span><span>AED ${escapeHtml(item.gross_salary.toFixed(2))}</span></div>
        </div>
        <div class="card">
          <h3>Deductions</h3>
          <div class="row"><span>Advance Deduction</span><span>AED ${escapeHtml(item.advance_deduction.toFixed(2))}</span></div>
          <div class="row"><span>Absence Deduction</span><span>AED ${escapeHtml(item.absence_deduction.toFixed(2))}</span></div>
          <div class="row"><span>Other Deductions</span><span>AED ${escapeHtml(item.other_deductions.toFixed(2))}</span></div>
          <div class="row total"><span>Total Deductions</span><span>AED ${escapeHtml(item.total_deductions.toFixed(2))}</span></div>
        </div>
      </div>
      <div class="net">
        <p>Net Salary</p>
        <h2>AED ${escapeHtml(item.net_salary.toFixed(2))}</h2>
        <p>${escapeHtml(companyName)} &bull; ${new Date().toLocaleDateString()}</p>
      </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const f2 = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500';
  const labelCls = 'block text-xs font-semibold text-primary-700 mb-1 uppercase tracking-wide';

  const tabBtn = (id: typeof tab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-primary-600 text-white' : 'bg-white text-primary-700 border border-slate-200 hover:bg-slate-50'}`}>
      {icon}{label}
    </button>
  );

  // ── Period Detail View ──────────────────────────────────────────────────────
  if (selectedPeriod) {
    const canEdit = selectedPeriod.status === 'draft';
    const filteredItems = payrollItems.filter(i =>
      ((i.employee as Employee | undefined)?.full_name ?? '').toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => { setSelectedPeriod(null); setPayslipEmp(null); setSearch(''); }}
            className="flex items-center gap-2 text-primary-600 hover:text-slate-800 font-medium text-sm">
            <ChevronLeft size={16} /> Back to Periods
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900">{selectedPeriod.period_name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selectedPeriod.status)}`}>
              {selectedPeriod.status.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedPeriod.status === 'draft' && (
              <button onClick={approvePeriod}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <CheckCircle size={15} /> Approve Payroll
              </button>
            )}
            {selectedPeriod.status === 'approved' && (
              <button onClick={markPaid}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Banknote size={15} /> Mark as Paid
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Gross', value: selectedPeriod.total_gross, cls: 'text-slate-800' },
            { label: 'Total Deductions', value: selectedPeriod.total_deductions, cls: 'text-red-600' },
            { label: 'Total Net Payable', value: selectedPeriod.total_net, cls: 'text-primary-600 font-bold' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">{label}</div>
              <div className={`text-xl font-bold ${cls}`}>AED {f2(value)}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..."
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>
          <span className="text-sm text-slate-500">{payrollItems.length} employees</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee','Basic','Allowances','OT Hrs','OT Amt','Bonus','Gross','Advance','Absence','Other Ded.','Net','Days',''].map(h => (
                    <th key={h} className={`px-3 py-3 text-xs font-semibold text-primary-600 uppercase ${h && h !== '' && h !== 'Employee' && h !== 'Days' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredItems.map(item => {
                  const emp = item.employee as Employee | undefined;
                  const editable = (field: keyof PayrollItem, redBorder = false) => (
                    canEdit ? (
                      <input type="number" min={0} step={0.01} defaultValue={item[field] as number}
                        onBlur={e => updateItem(item, field, parseFloat(e.target.value) || 0)}
                        className={`w-20 text-right border ${redBorder ? 'border-red-200' : 'border-slate-200'} rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 ${redBorder ? 'focus:ring-red-300' : 'focus:ring-slate-400'}`} />
                    ) : (
                      <span className={redBorder ? 'text-red-600' : ''}>{f2(item[field] as number)}</span>
                    )
                  );
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/40">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{emp?.full_name ?? '—'}</div>
                        <div className="text-xs text-slate-500">{emp?.position ?? ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-primary-700">{f2(item.basic_salary)}</td>
                      <td className="px-3 py-2.5 text-right text-primary-600">{f2(item.housing_allowance + item.transport_allowance + item.other_allowances)}</td>
                      <td className="px-2 py-2 text-right">{canEdit ? (
                        <input type="number" min={0} step={0.5} defaultValue={item.overtime_hours}
                          onBlur={e => updateItem(item, 'overtime_hours', parseFloat(e.target.value) || 0)}
                          className="w-16 text-right border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400" />
                      ) : item.overtime_hours}</td>
                      <td className="px-3 py-2.5 text-right text-primary-600">{f2(item.overtime_amount)}</td>
                      <td className="px-2 py-2 text-right">{canEdit ? (
                        <input type="number" min={0} step={0.01} defaultValue={item.bonus}
                          onBlur={e => updateItem(item, 'bonus', parseFloat(e.target.value) || 0)}
                          className="w-20 text-right border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400" />
                      ) : f2(item.bonus)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{f2(item.gross_salary)}</td>
                      <td className="px-2 py-2 text-right">{editable('advance_deduction', true)}</td>
                      <td className="px-2 py-2 text-right">{editable('absence_deduction', true)}</td>
                      <td className="px-2 py-2 text-right">{editable('other_deductions', true)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-primary-600">{f2(item.net_salary)}</td>
                      <td className="px-2 py-2 text-center">{canEdit ? (
                        <input type="number" min={0} step={1} defaultValue={item.days_worked}
                          onBlur={e => updateItem(item, 'days_worked', parseInt(e.target.value) || 0)}
                          className="w-10 text-center border border-slate-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400" />
                      ) : item.days_worked}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => setPayslipEmp(item)}
                          className="p-1.5 text-slate-500 hover:text-primary-700 hover:bg-slate-100 rounded-lg transition-colors" title="Print Payslip">
                          <Printer size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payslip Modal */}
        {payslipEmp && (
          <Modal isOpen={!!payslipEmp} onClose={() => setPayslipEmp(null)} title="Employee Payslip" size="lg">
            <div className="bg-slate-50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{(payslipEmp.employee as Employee | undefined)?.full_name}</h3>
                  <p className="text-sm text-primary-600">{(payslipEmp.employee as Employee | undefined)?.position} · {selectedPeriod.period_name}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusColor(payslipEmp.status)}`}>{payslipEmp.status.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary-600 uppercase mb-2">Earnings</p>
                  {[
                    ['Basic Salary', payslipEmp.basic_salary],
                    ['Housing Allowance', payslipEmp.housing_allowance],
                    ['Transport Allowance', payslipEmp.transport_allowance],
                    ['Other Allowances', payslipEmp.other_allowances],
                    ['Overtime', payslipEmp.overtime_amount],
                    ['Bonus', payslipEmp.bonus],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between py-1 border-b border-slate-50 text-sm">
                      <span className="text-primary-600">{label}</span>
                      <span className="font-medium">AED {f2(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 font-bold text-primary-700">
                    <span>Gross</span><span>AED {f2(payslipEmp.gross_salary)}</span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-600 uppercase mb-2">Deductions</p>
                  {[
                    ['Advance', payslipEmp.advance_deduction],
                    ['Absence', payslipEmp.absence_deduction],
                    ['Other', payslipEmp.other_deductions],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between py-1 border-b border-slate-50 text-sm">
                      <span className="text-primary-600">{label}</span>
                      <span className="font-medium text-red-600">AED {f2(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 font-bold text-red-600">
                    <span>Total Deductions</span><span>AED {f2(payslipEmp.total_deductions)}</span>
                  </div>
                  <div className="mt-4 bg-primary-600 text-white rounded-lg p-3 text-center">
                    <p className="text-xs mb-1 opacity-80">Net Salary</p>
                    <p className="text-2xl font-bold">AED {f2(payslipEmp.net_salary)}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => printPayslip(payslipEmp)}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Printer size={14} /> Print Payslip
              </button>
              <button onClick={() => setPayslipEmp(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Main List View ──────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabBtn('periods', 'Payroll Periods', <Calculator size={14} />)}
        {tabBtn('deductions', 'Deductions', <XCircle size={14} />)}
        {tabBtn('advances', 'Salary Advances', <Banknote size={14} />)}
        {tabBtn('auditlog', 'Audit Log', <History size={14} />)}
      </div>

      {tab === 'periods' && (
        <>
          <div className="flex justify-between items-center mb-5">
            <p className="text-sm text-primary-600">{periods.length} payroll periods</p>
            <button onClick={() => { setError(''); setShowCreatePeriod(true); }}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Create Period
            </button>
          </div>
          {loading ? (
            <div className="text-center py-10 text-slate-400">Loading...</div>
          ) : periods.length === 0 ? (
            <div className="text-center py-10 text-slate-400">No payroll periods yet</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {periods.map(p => (
                <button key={p.id} onClick={() => openPeriod(p)}
                  className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm text-left hover:border-slate-400 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-slate-900 group-hover:text-primary-700">{p.period_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatDate(p.start_date)} – {formatDate(p.end_date)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>{p.status.toUpperCase()}</span>
                      <span onClick={e => { e.stopPropagation(); deletePayrollPeriod(p.id, p.period_name); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Period">
                        <Trash2 size={14} />
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Gross</span>
                      <span className="font-medium text-primary-700">AED {f2(p.total_gross)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Deductions</span>
                      <span className="font-medium text-red-500">AED {f2(p.total_deductions)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-slate-100 pt-1">
                      <span className="font-semibold text-primary-700">Net Payable</span>
                      <span className="font-bold text-primary-600">AED {f2(p.total_net)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'deductions' && (
        <>
          <div className="flex justify-between items-center mb-5">
            <p className="text-sm text-primary-600">{deductions.length} deduction records</p>
            <button onClick={() => { setError(''); setShowDeductionModal(true); }}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Add Deduction
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee','Date','Category','Reason','Amount','Status',''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-primary-600 uppercase ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deductions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No deductions</td></tr>
                ) : deductions.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{(d.employee as Employee | undefined)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{formatDate(d.deduction_date)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-primary-700 capitalize">
                        {d.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-primary-600 max-w-xs truncate">{d.reason}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">AED {f2(d.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>{d.status.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      {d.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => approveDeduction(d.id, true)} className="p-1.5 text-primary-600 hover:bg-slate-100 rounded-lg transition-colors" title="Approve"><CheckCircle size={14} /></button>
                          <button onClick={() => approveDeduction(d.id, false)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Reject"><XCircle size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'advances' && (
        <>
          <div className="flex justify-between items-center mb-5">
            <p className="text-sm text-primary-600">{advances.length} advance records</p>
            <button onClick={() => { setError(''); setShowAdvanceModal(true); }}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> New Advance
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Employee','Date','Amount','Monthly Ded.','Balance','Status',''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-primary-600 uppercase ${['Amount','Monthly Ded.','Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {advances.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No advances</td></tr>
                ) : advances.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{(a.employee as Employee | undefined)?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-primary-600">{formatDate(a.advance_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">AED {f2(a.amount)}</td>
                    <td className="px-4 py-3 text-right text-red-600">AED {f2(a.monthly_deduction)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">AED {f2(a.balance_due)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(a.status)}`}>{a.status.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      {a.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => approveAdvance(a.id, true)} className="p-1.5 text-primary-600 hover:bg-slate-100 rounded-lg transition-colors" title="Approve"><CheckCircle size={14} /></button>
                          <button onClick={() => approveAdvance(a.id, false)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Reject"><XCircle size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'auditlog' && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Date','Action','Entity','Actor','Notes'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-primary-600 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {auditLogs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No audit records</td></tr>
              ) : auditLogs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50/40">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(l.action)}`}>{l.action.toUpperCase()}</span></td>
                  <td className="px-4 py-3 text-primary-600 capitalize">{l.entity_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{l.actor_name}</div>
                    <div className="text-xs text-slate-500 capitalize">{l.actor_role}</div>
                  </td>
                  <td className="px-4 py-3 text-primary-600 max-w-xs truncate">{l.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Period Modal */}
      <Modal isOpen={showCreatePeriod} onClose={() => setShowCreatePeriod(false)} title="Create Payroll Period" size="sm">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Year</label>
            <input type="number" value={periodForm.period_year} onChange={e => setPeriodForm(f => ({ ...f, period_year: parseInt(e.target.value) }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Month</label>
            <select value={periodForm.period_month} onChange={e => setPeriodForm(f => ({ ...f, period_month: parseInt(e.target.value) }))} className={inputCls}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-primary-600">
            This will auto-generate payroll items for all {employees.length} active employees based on their salary profiles.
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={createPeriod} disabled={saving}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Creating...' : 'Create Period'}
            </button>
            <button onClick={() => setShowCreatePeriod(false)}
              className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Advance Modal */}
      <Modal isOpen={showAdvanceModal} onClose={() => setShowAdvanceModal(false)} title="New Salary Advance" size="md">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Employee</label>
            <select value={advanceForm.employee_id} onChange={e => setAdvanceForm(f => ({ ...f, employee_id: e.target.value }))} className={inputCls}>
              <option value="">-- Select Employee --</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={advanceForm.advance_date} onChange={e => setAdvanceForm(f => ({ ...f, advance_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Amount (AED)</label>
              <input type="number" min={0} value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: Number(e.target.value) }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Repayment Months</label>
              <input type="number" min={1} max={24} value={advanceForm.repayment_months} onChange={e => setAdvanceForm(f => ({ ...f, repayment_months: Number(e.target.value) }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly Deduction</label>
              <div className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-800">
                AED {advanceForm.repayment_months > 0 ? f2(advanceForm.amount / advanceForm.repayment_months) : '0.00'}
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <textarea value={advanceForm.reason} onChange={e => setAdvanceForm(f => ({ ...f, reason: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={createAdvance} disabled={saving}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Submit Advance'}</button>
            <button onClick={() => setShowAdvanceModal(false)}
              className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Deduction Modal */}
      <Modal isOpen={showDeductionModal} onClose={() => setShowDeductionModal(false)} title="Add Deduction" size="md">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Employee</label>
            <select value={deductionForm.employee_id} onChange={e => setDeductionForm(f => ({ ...f, employee_id: e.target.value }))} className={inputCls}>
              <option value="">-- Select Employee --</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={deductionForm.deduction_date} onChange={e => setDeductionForm(f => ({ ...f, deduction_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select value={deductionForm.category} onChange={e => setDeductionForm(f => ({ ...f, category: e.target.value as EmployeeDeduction['category'] }))} className={inputCls}>
                {['absence','late','damage','advance_repayment','loan','penalty','other'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Amount (AED)</label>
              <input type="number" min={0} step={0.01} value={deductionForm.amount} onChange={e => setDeductionForm(f => ({ ...f, amount: Number(e.target.value) }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <textarea value={deductionForm.reason} onChange={e => setDeductionForm(f => ({ ...f, reason: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={createDeduction} disabled={saving}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Add Deduction'}</button>
            <button onClick={() => setShowDeductionModal(false)}
              className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-primary-700 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
