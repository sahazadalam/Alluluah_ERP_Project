import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, Branch, Company } from '../lib/types';
import StatCard from '../components/common/StatCard';
import { statusBadge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import {
  Users, Truck, Package, Receipt, FileText, AlertTriangle,
  TrendingUp, DollarSign, ShoppingBag, Clock, Building, ArrowLeftRight
} from 'lucide-react';

interface DashboardStats {
  totalCustomers: number;
  totalSuppliers: number;
  totalProducts: number;
  lowStockCount: number;
  totalInvoices: number;
  unpaidInvoices: number;
  unpaidAmount: number;
  monthlyRevenue: number;
  pendingQuotations: number;
  pendingTransfers: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  status: string;
  issue_date: string;
  branch_id: string | null;
  branch?: Branch;
}

interface Props {
  branchFilter: string | null;
}

export default function Dashboard({ branchFilter }: Props) {
  const { isGlobalAdmin, currentBranch } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0, totalSuppliers: 0, totalProducts: 0, lowStockCount: 0,
    totalInvoices: 0, unpaidInvoices: 0, unpaidAmount: 0, monthlyRevenue: 0,
    pendingQuotations: 0, pendingTransfers: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => { loadDashboard(); }, [branchFilter]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      let customerQuery = supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true);
      let supplierQuery = supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true);
      let productQuery = supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
      let invoiceQuery = supabase.from('invoices').select('*', { count: 'exact', head: true });
      let unpaidQuery = supabase.from('invoices').select('balance_due').in('status', ['sent', 'partial', 'overdue']);
      let monthQuery = supabase.from('invoices').select('total').eq('status', 'paid').gte('issue_date', monthStart);
      let quoteQuery = supabase.from('quotations').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent']);
      let recentQuery = supabase.from('invoices').select('id, invoice_number, customer_name, total, status, issue_date, branch_id, branch:branches(id, name)').order('created_at', { ascending: false }).limit(5);
      let transferQuery = supabase.from('stock_transfers').select('*', { count: 'exact', head: true }).in('status', ['requested', 'approved', 'shipped']);

      if (branchFilter) {
        customerQuery = customerQuery.eq('branch_id', branchFilter);
        supplierQuery = supplierQuery.eq('branch_id', branchFilter);
        productQuery = productQuery.eq('branch_id', branchFilter);
        invoiceQuery = invoiceQuery.eq('branch_id', branchFilter);
        unpaidQuery = unpaidQuery.eq('branch_id', branchFilter);
        monthQuery = monthQuery.eq('branch_id', branchFilter);
        quoteQuery = quoteQuery.eq('branch_id', branchFilter);
        recentQuery = recentQuery.eq('branch_id', branchFilter);
        transferQuery = transferQuery.or(`from_branch_id.eq.${branchFilter},to_branch_id.eq.${branchFilter}`);
      }

      const [
        { count: customers }, { count: suppliers }, { count: products }, { count: invoices },
        { data: unpaidData }, { data: monthData }, { count: pendingQuotes },
        { data: recent }, { count: transfers },
        { data: companyData },
      ] = await Promise.all([
        customerQuery, supplierQuery, productQuery, invoiceQuery,
        unpaidQuery, monthQuery, quoteQuery, recentQuery, transferQuery,
        supabase.from('companies').select('*').eq('is_active', true).order('name').limit(1).maybeSingle(),
      ]);

      const unpaidAmount = (unpaidData ?? []).reduce((s, i) => s + (i.balance_due ?? 0), 0);
      const monthlyRevenue = (monthData ?? []).reduce((s, i) => s + (i.total ?? 0), 0);

      setStats({
        totalCustomers: customers ?? 0, totalSuppliers: suppliers ?? 0,
        totalProducts: products ?? 0, lowStockCount: 0,
        totalInvoices: invoices ?? 0, unpaidInvoices: (unpaidData ?? []).length,
        unpaidAmount, monthlyRevenue, pendingQuotations: pendingQuotes ?? 0,
        pendingTransfers: transfers ?? 0,
      });
      setRecentInvoices((recent ?? []).map(r => ({
        ...r,
        branch: Array.isArray(r.branch) ? (r.branch[0] as unknown as Branch) : (r.branch as unknown as Branch | undefined),
      })) as RecentInvoice[]);
      setCompany((companyData as Company | null) ?? null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const watermarkText = company?.watermark_enabled ? company.watermark_text : null;

  return (
    <div className="space-y-6 relative">
      {/* Watermark */}
      {watermarkText && (
        <div
          className="pointer-events-none select-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="text-slate-200 font-bold text-[80px] whitespace-nowrap"
            style={{ transform: 'rotate(-30deg)', opacity: 0.12, letterSpacing: '0.05em' }}
          >
            {watermarkText}
          </div>
        </div>
      )}

      {/* Branch Indicator */}
      {isGlobalAdmin && (
        <div className="flex items-center gap-2 text-sm">
          <Building size={14} className="text-slate-400" />
          <span className="text-slate-500">
            Viewing: <span className="font-semibold text-slate-700">{currentBranch?.name ?? 'All Branches'}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Customers" value={stats.totalCustomers.toString()} icon={<Users size={17} />} color="blue" />
        <StatCard title="Suppliers" value={stats.totalSuppliers.toString()} icon={<Truck size={17} />} color="slate" />
        <StatCard title="Products" value={stats.totalProducts.toString()} icon={<Package size={17} />} color="cyan" />
        <StatCard title="Pending Quotes" value={stats.pendingQuotations.toString()} icon={<FileText size={17} />} color="amber" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Monthly Revenue" value={formatCurrency(stats.monthlyRevenue)} icon={<TrendingUp size={17} />} color="green" />
        <StatCard title="Total Invoices" value={stats.totalInvoices.toString()} icon={<Receipt size={17} />} color="blue" />
        <StatCard title="Outstanding" value={formatCurrency(stats.unpaidAmount)} subtitle={`${stats.unpaidInvoices} invoices`} icon={<Clock size={17} />} color="amber" />
        <StatCard title="Overdue Risk" value={stats.unpaidInvoices.toString()} subtitle="invoices unpaid" icon={<AlertTriangle size={17} />} color="red" />
        <StatCard title="Pending Transfers" value={stats.pendingTransfers.toString()} icon={<ArrowLeftRight size={17} />} color="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent Invoices</h3>
            <span className="text-xs text-slate-400">Last 5</span>
          </div>
          <div className="divide-y divide-slate-50">
            {recentInvoices.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-400 text-sm">No invoices yet</div>
            ) : recentInvoices.map(inv => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Receipt size={14} className="text-primary-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{inv.invoice_number}</div>
                    <div className="text-xs text-slate-400">{inv.customer_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-800">{formatCurrency(inv.total)}</div>
                  <div className="flex items-center gap-1 mt-0.5 justify-end">
                    {statusBadge(inv.status)}
                    {isGlobalAdmin && inv.branch && (
                      <span className="text-xs text-slate-400 ml-1">{(inv.branch as unknown as Branch).name}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Quick Stats</h3>
          </div>
          <div className="p-5 space-y-0">
            {[
              { label: 'Monthly Revenue', value: formatCurrency(stats.monthlyRevenue), icon: <DollarSign size={14} className="text-green-500" />, cls: 'text-slate-800' },
              { label: 'Outstanding', value: formatCurrency(stats.unpaidAmount), icon: <Clock size={14} className="text-amber-500" />, cls: 'text-amber-700' },
              { label: 'Total Invoices', value: String(stats.totalInvoices), icon: <ShoppingBag size={14} className="text-primary-500" />, cls: 'text-slate-800' },
              { label: 'Pending Transfers', value: String(stats.pendingTransfers), icon: <ArrowLeftRight size={14} className="text-cyan-500" />, cls: 'text-cyan-700' },
            ].map(({ label, value, icon, cls }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 text-sm text-slate-500">{icon}{label}</div>
                <span className={`text-sm font-bold ${cls}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
