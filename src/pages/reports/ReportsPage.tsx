import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, Project, ProjectAssignment, ProjectExpense } from '../../lib/types';
import { calculateProjectFinancials, ProjectFinancialSummary } from '../../lib/projectFinance';
import StatCard from '../../components/common/StatCard';
import { useAuth } from '../../context/AuthContext';
import { TrendingUp, DollarSign, Receipt, TrendingDown, Users, Building, BarChart3, ArrowDownRight, ArrowUpRight, Package, ShoppingCart } from 'lucide-react';

interface ReportStats {
  totalSales: number;
  totalExpenses: number;
  totalIncome: number;
  netProfit: number;
  totalInvoices: number;
  totalPayments: number;
  outstandingAmount: number;
  customerCount: number;
  posSales: number;
  posTransactionCount: number;
  stockMovements: number;
}

interface BranchPerformance {
  branch_id: string;
  branch_name: string;
  sales: number;
  expenses: number;
  profit: number;
}

interface Props {
  branchFilter: string | null;
}

interface ProjectReportRow {
  project: Project;
  summary: ProjectFinancialSummary;
  team: ProjectAssignment[];
}

export default function ReportsPage({ branchFilter }: Props) {
  const { isGlobalAdmin, branches } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats>({
    totalSales: 0, totalExpenses: 0, totalIncome: 0, netProfit: 0,
    totalInvoices: 0, totalPayments: 0, outstandingAmount: 0, customerCount: 0,
    posSales: 0, posTransactionCount: 0, stockMovements: 0,
  });
  const [branchPerformance, setBranchPerformance] = useState<BranchPerformance[]>([]);
  const [posSales, setPosSales] = useState<Array<{ id: string; transaction_number: string; total: number; payment_method: string; cashier_name: string; created_at: string }>>([]);
  const [stockMovements, setStockMovements] = useState<Array<{ id: string; movement_type: string; quantity: number; previous_quantity: number | null; new_quantity: number | null; reference_number: string; notes: string; created_at: string; product: { name: string; code: string } | null }>>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'pos' | 'inventory' | 'projects'>('overview');
  const [projectReports, setProjectReports] = useState<ProjectReportRow[]>([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => { loadReportData(); }, [branchFilter, dateRange]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      // Get invoice totals (sales)
      let invoiceQuery = supabase.from('invoices').select('total, balance_due').gte('issue_date', dateRange.start).lte('issue_date', dateRange.end);
      if (branchFilter) invoiceQuery = invoiceQuery.eq('branch_id', branchFilter);
      const { data: invoices } = await invoiceQuery;

      const totalSales = (invoices ?? []).reduce((s, i) => s + (i.total ?? 0), 0);
      const outstandingAmount = (invoices ?? []).reduce((s, i) => s + (i.balance_due ?? 0), 0);

      // Get expenses
      let expenseQuery = supabase.from('expenses').select('amount').gte('expense_date', dateRange.start).lte('expense_date', dateRange.end);
      if (branchFilter) expenseQuery = expenseQuery.eq('branch_id', branchFilter);
      const { data: expenses } = await expenseQuery;
      const totalExpenses = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);

      // Get income
      let incomeQuery = supabase.from('income').select('amount').gte('income_date', dateRange.start).lte('income_date', dateRange.end);
      if (branchFilter) incomeQuery = incomeQuery.eq('branch_id', branchFilter);
      const { data: income } = await incomeQuery;
      const totalIncome = (income ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);

      let projectQuery = supabase.from('projects').select('*, branch:branches(id, name)').order('created_at', { ascending: false });
      let assignmentQuery = supabase.from('project_assignments').select('*').eq('is_active', true);
      let projectExpenseQuery = supabase.from('project_expenses').select('*');
      if (branchFilter) {
        projectQuery = projectQuery.eq('branch_id', branchFilter);
        assignmentQuery = assignmentQuery.eq('branch_id', branchFilter);
        projectExpenseQuery = projectExpenseQuery.eq('branch_id', branchFilter);
      }
      const [{ data: projects }, { data: assignments }, { data: projectExpenses }] = await Promise.all([
        projectQuery,
        assignmentQuery,
        projectExpenseQuery,
      ]);
      const projectRows = (projects ?? []) as Project[];
      const assignmentRows = (assignments ?? []) as ProjectAssignment[];
      const projectExpenseRows = (projectExpenses ?? []) as ProjectExpense[];
      const assignmentsByProject = new Map<string, ProjectAssignment[]>();
      const expensesByProject = new Map<string, ProjectExpense[]>();
      assignmentRows.forEach(assignment => assignmentsByProject.set(assignment.project_id, [...(assignmentsByProject.get(assignment.project_id) ?? []), assignment]));
      projectExpenseRows.forEach(expense => expensesByProject.set(expense.project_id, [...(expensesByProject.get(expense.project_id) ?? []), expense]));
      setProjectReports(projectRows.map(project => ({
        project,
        team: assignmentsByProject.get(project.id) ?? [],
        summary: calculateProjectFinancials(project, assignmentsByProject.get(project.id), expensesByProject.get(project.id)),
      })));

      // Customer count
      let customerQuery = supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true);
      if (branchFilter) customerQuery = customerQuery.eq('branch_id', branchFilter);
      const { count: customerCount } = await customerQuery;

      // Invoice count
      let invoiceCountQuery = supabase.from('invoices').select('id', { count: 'exact', head: true }).gte('issue_date', dateRange.start).lte('issue_date', dateRange.end);
      if (branchFilter) invoiceCountQuery = invoiceCountQuery.eq('branch_id', branchFilter);
      const { count: totalInvoices } = await invoiceCountQuery;

      setStats({
        totalSales,
        totalExpenses,
        totalIncome,
        netProfit: totalSales + totalIncome - totalExpenses,
        totalInvoices: totalInvoices ?? 0,
        totalPayments: totalSales - outstandingAmount,
        outstandingAmount,
        customerCount: customerCount ?? 0,
        posSales: 0,
        posTransactionCount: 0,
        stockMovements: 0,
      });

      // Load POS sales
      let posQuery = supabase.from('pos_transactions').select('id, transaction_number, total, payment_method, cashier_name, created_at').eq('status', 'completed').gte('created_at', dateRange.start + 'T00:00:00').lte('created_at', dateRange.end + 'T23:59:59').order('created_at', { ascending: false }).limit(20);
      if (branchFilter) posQuery = posQuery.eq('branch_id', branchFilter);
      const { data: posData } = await posQuery;
      setPosSales(posData ?? []);
      const posTotal = (posData ?? []).reduce((s, t) => s + Number(t.total ?? 0), 0);

      // Load stock movements
      let movementQuery = supabase.from('stock_movements').select('id, movement_type, quantity, previous_quantity, new_quantity, reference_number, notes, created_at, product:products(name, code)').gte('created_at', dateRange.start + 'T00:00:00').lte('created_at', dateRange.end + 'T23:59:59').order('created_at', { ascending: false }).limit(30);
      if (branchFilter) movementQuery = movementQuery.eq('branch_id', branchFilter);
      const { data: movementData } = await movementQuery;
      setStockMovements((movementData ?? []) as unknown as Array<{ id: string; movement_type: string; quantity: number; previous_quantity: number | null; new_quantity: number | null; reference_number: string; notes: string; created_at: string; product: { name: string; code: string } | null }>);

      setStats(prev => ({ ...prev, posSales: posTotal, posTransactionCount: posData?.length ?? 0, stockMovements: movementData?.length ?? 0, netProfit: prev.netProfit + posTotal }));

      // Branch performance (for admin)
      if (isGlobalAdmin && !branchFilter) {
        const branchStats: BranchPerformance[] = [];
        for (const branch of branches) {
          const { data: branchInvoices } = await supabase.from('invoices').select('total').eq('branch_id', branch.id).gte('issue_date', dateRange.start).lte('issue_date', dateRange.end);
          const { data: branchExpenses } = await supabase.from('expenses').select('amount').eq('branch_id', branch.id).gte('expense_date', dateRange.start).lte('expense_date', dateRange.end);
          const sales = (branchInvoices ?? []).reduce((s, i) => s + (i.total ?? 0), 0);
          const expenses = (branchExpenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
          branchStats.push({ branch_id: branch.id, branch_name: branch.name, sales, expenses, profit: sales - expenses });
        }
        setBranchPerformance(branchStats);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">From:</label>
          <input type="date" value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">To:</label>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={loadReportData} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Tab Selector */}
          <div className="flex gap-2 bg-white rounded-xl border border-slate-200 p-1">
            <button onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Overview
            </button>
            <button onClick={() => setActiveTab('pos')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'pos' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              POS Sales
            </button>
            <button onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'inventory' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Stock Movements
            </button>
            <button onClick={() => setActiveTab('projects')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'projects' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              Projects
            </button>
          </div>

          {activeTab === 'pos' && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart size={18} /> POS Sales Report</h3>
            <span className="text-sm text-slate-500">{stats.posTransactionCount} transactions | {formatCurrency(stats.posSales)} total</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {posSales.length === 0 ? (
              <div className="text-center text-slate-400 py-8">No POS sales in this period.</div>
            ) : posSales.map(sale => (
              <div key={sale.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <div className="font-medium text-sm text-slate-800">{sale.transaction_number}</div>
                  <div className="text-xs text-slate-500">{new Date(sale.created_at).toLocaleString('en-GB')} | {sale.cashier_name || 'Unknown'}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 capitalize px-2 py-1 bg-slate-100 rounded">{sale.payment_method}</span>
                  <span className="font-semibold text-sm text-green-600">{formatCurrency(Number(sale.total))}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Package size={18} /> Stock Movement Report</h3>
            <span className="text-sm text-slate-500">{stats.stockMovements} movements</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {stockMovements.length === 0 ? (
              <div className="text-center text-slate-400 py-8">No stock movements in this period.</div>
            ) : stockMovements.map(m => {
              const typeColors: Record<string, string> = {
                POS_SALE: 'bg-red-50 text-red-700',
                POS_RETURN: 'bg-green-50 text-green-700',
                stock_in: 'bg-blue-50 text-blue-700',
                stock_out: 'bg-amber-50 text-amber-700',
                adjustment: 'bg-slate-100 text-slate-700',
                transfer_in: 'bg-cyan-50 text-cyan-700',
                transfer_out: 'bg-orange-50 text-orange-700',
              };
              const typeLabels: Record<string, string> = {
                POS_SALE: 'POS Sale',
                POS_RETURN: 'POS Return',
                stock_in: 'Stock In',
                stock_out: 'Stock Out',
                adjustment: 'Adjustment',
                transfer_in: 'Transfer In',
                transfer_out: 'Transfer Out',
              };
              return (
                <div key={m.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[m.movement_type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {typeLabels[m.movement_type] ?? m.movement_type}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{m.product?.name ?? 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{m.notes} | {new Date(m.created_at).toLocaleString('en-GB')}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-slate-400">{m.previous_quantity ?? '—'}</span>
                    <span className="mx-1 text-slate-300">→</span>
                    <span className="font-semibold text-slate-800">{m.new_quantity ?? '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (<>
          {/* Main Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Sales" value={formatCurrency(stats.totalSales)} icon={<TrendingUp size={18} />} color="green" subtitle={`${stats.totalInvoices} invoices`} />
            <StatCard title="Total Income" value={formatCurrency(stats.totalIncome)} icon={<DollarSign size={18} />} color="blue" />
            <StatCard title="Total Expenses" value={formatCurrency(stats.totalExpenses)} icon={<TrendingDown size={18} />} color="red" />
            <StatCard title="Net Profit" value={formatCurrency(stats.netProfit)} icon={<BarChart3 size={18} />} color={stats.netProfit >= 0 ? 'green' : 'red'} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Payments Received" value={formatCurrency(stats.totalPayments)} icon={<Receipt size={18} />} color="cyan" />
            <StatCard title="Outstanding" value={formatCurrency(stats.outstandingAmount)} icon={<TrendingDown size={18} />} color="amber" />
            <StatCard title="Active Customers" value={stats.customerCount.toString()} icon={<Users size={18} />} color="slate" />
            <StatCard title="VAT Collected (5%)" value={formatCurrency(stats.totalSales * 0.05)} icon={<Receipt size={18} />} color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StatCard title="POS Sales" value={formatCurrency(stats.posSales)} icon={<ShoppingCart size={18} />} color="green" subtitle={`${stats.posTransactionCount} transactions`} />
            <StatCard title="Stock Movements" value={stats.stockMovements.toString()} icon={<Package size={18} />} color="slate" subtitle="This period" />
          </div>

          {/* Branch Performance */}
          {isGlobalAdmin && !branchFilter && branchPerformance.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">Branch Performance</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {branchPerformance.map(bp => (
                  <div key={bp.branch_id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building size={18} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{bp.branch_name}</div>
                        <div className="text-xs text-slate-500">This period</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <div className="text-slate-500">Sales</div>
                        <div className="font-semibold text-green-600">{formatCurrency(bp.sales)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500">Expenses</div>
                        <div className="font-semibold text-red-600">{formatCurrency(bp.expenses)}</div>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <div className="text-slate-500">Profit</div>
                        <div className={`font-bold flex items-center justify-end gap-1 ${bp.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {bp.profit >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {formatCurrency(Math.abs(bp.profit))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profit/Loss Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Profit & Loss Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Sales Revenue</span>
                <span className="font-semibold text-green-600">{formatCurrency(stats.totalSales)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Other Income</span>
                <span className="font-semibold text-green-600">{formatCurrency(stats.totalIncome)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Total Revenue</span>
                <span className="font-bold text-green-700">{formatCurrency(stats.totalSales + stats.totalIncome)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Total Expenses</span>
                <span className="font-semibold text-red-600">({formatCurrency(stats.totalExpenses)})</span>
              </div>
              <div className="flex justify-between py-3 text-lg">
                <span className="font-bold text-slate-800">Net Profit / Loss</span>
                <span className={`font-bold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.netProfit)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {activeTab === 'projects' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Project Financial Report</h3>
            <span className="text-sm text-slate-500">{projectReports.length} projects</span>
          </div>
          <table className="w-full text-sm min-w-[1100px]">
            <thead><tr className="bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Project / Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Branch</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status / Dates</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contract Value</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Expenses</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Team Cost</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Est. Profit</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Team</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {projectReports.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-slate-400">No projects found</td></tr> : projectReports.map(({ project, summary, team }) => (
                <tr key={project.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3"><div className="font-medium text-slate-800">{project.name}</div><div className="text-xs text-slate-500">{project.project_number} · {project.customer_name || 'No customer'}</div></td>
                  <td className="px-4 py-3 text-slate-600">{project.branch?.name ?? '—'}</td>
                  <td className="px-4 py-3"><div className="capitalize text-slate-700">{project.status} · {project.priority}</div><div className="text-xs text-slate-500">{project.start_date ?? '—'} to {project.end_date ?? '—'}</div></td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(project.contract_value)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(summary.directExpenses)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{formatCurrency(summary.employeeCosts)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${summary.estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(summary.estimatedProfit)}</td>
                  <td className="px-4 py-3 text-slate-600">{team.length} assigned</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
