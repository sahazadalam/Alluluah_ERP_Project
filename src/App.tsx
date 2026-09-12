import { AuthProvider, useAuth } from './context/AuthContext';
import { PermissionsProvider, usePermissions } from './context/PermissionsContext';
import { ROLE_PERMISSIONS, UserRole } from './lib/types';
import LoginPage from './pages/LoginPage';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import CustomersPage from './pages/customers/CustomersPage';
import SuppliersPage from './pages/suppliers/SuppliersPage';
import InventoryPage from './pages/inventory/InventoryPage';
import QuotationsPage from './pages/quotations/QuotationsPage';
import InvoicesPage from './pages/invoices/InvoicesPage';
import HRPage from './pages/hr/HRPage';
import AttendancePage from './pages/hr/AttendancePage';
import PayrollPage from './pages/hr/PayrollPage';
import AccountingPage from './pages/accounting/AccountingPage';
import POSPage from './pages/pos/POSPage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import TransfersPage from './pages/transfers/TransfersPage';
import BranchesPage from './pages/branches/BranchesPage';
import CompaniesPage from './pages/companies/CompaniesPage';
import CashflowPage from './pages/cashflow/CashflowPage';
import CRMPage from './pages/crm/CRMPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import BarcodeScannerPage from './pages/scanner/BarcodeScannerPage';
import { useState } from 'react';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Business overview and analytics' },
  reports: { title: 'Reports', subtitle: 'Branch performance and financial reports' },
  cashflow: { title: 'Cashflow Audit', subtitle: 'Track all cash transactions and audit logs' },
  crm: { title: 'CRM', subtitle: 'Leads, follow-ups, and customer pipeline' },
  customers: { title: 'Customers', subtitle: 'Manage customer accounts and contacts' },
  suppliers: { title: 'Suppliers', subtitle: 'Manage vendor and supplier information' },
  inventory: { title: 'Inventory', subtitle: 'Products, stock levels and categories' },
  transfers: { title: 'Stock Transfers', subtitle: 'Transfer stock between branches' },
  quotations: { title: 'Quotations', subtitle: 'Create and manage sales quotations' },
  invoices: { title: 'Invoices', subtitle: 'Tax invoices with UAE 5% VAT' },
  hr: { title: 'Human Resources', subtitle: 'Employees, departments and records' },
  attendance: { title: 'Attendance', subtitle: 'Daily check-in, leave requests and overtime' },
  payroll: { title: 'Payroll', subtitle: 'Monthly payroll processing and salary advances' },
  projects: { title: 'Projects', subtitle: 'Site projects, team assignments and progress tracking' },
  accounting: { title: 'Accounting', subtitle: 'Chart of accounts and journal entries' },
  pos: { title: 'Point of Sale', subtitle: 'Retail sales terminal' },
  branches: { title: 'Branches', subtitle: 'Manage company branches' },
  companies: { title: 'Companies', subtitle: 'Manage companies in the system' },
  settings: { title: 'Settings', subtitle: 'User management and permissions' },
  scanner: { title: 'Barcode Scanner', subtitle: 'Scan barcodes to look up products and update stock' },
};

function AppContent() {
  const { user, profile, loading, isGlobalAdmin, currentBranch } = useAuth();
  const { canView } = usePermissions();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const isPageAllowed = (page: string) => {
    const roleList = ROLE_PERMISSIONS[(profile?.role as UserRole) ?? 'sales'];
    if (!roleList.includes(page)) return false;
    if (page === 'scanner') return true;
    return canView(page);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading Al Luluah ERP...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) return <LoginPage />;

  const navigate = (page: string) => {
    if (isPageAllowed(page)) setCurrentPage(page);
  };

  const pageInfo = pageTitles[currentPage] ?? { title: 'Al Luluah ERP', subtitle: '' };

  const getBranchFilter = () => {
    if (isGlobalAdmin) return currentBranch?.id ?? null;
    return profile.branch_id;
  };

  const renderPage = () => {
    if (!isPageAllowed(currentPage)) {
      return <Dashboard branchFilter={getBranchFilter()} />;
    }

    switch (currentPage) {
      case 'dashboard': return <Dashboard branchFilter={getBranchFilter()} />;
      case 'reports': return <ReportsPage branchFilter={getBranchFilter()} />;
      case 'cashflow': return <CashflowPage branchFilter={getBranchFilter()} />;
      case 'crm': return <CRMPage branchFilter={getBranchFilter()} />;
      case 'customers': return <CustomersPage branchFilter={getBranchFilter()} />;
      case 'suppliers': return <SuppliersPage branchFilter={getBranchFilter()} />;
      case 'inventory': return <InventoryPage branchFilter={getBranchFilter()} />;
      case 'transfers': return <TransfersPage branchFilter={getBranchFilter()} />;
      case 'quotations': return <QuotationsPage branchFilter={getBranchFilter()} />;
      case 'invoices': return <InvoicesPage branchFilter={getBranchFilter()} />;
      case 'hr': return <HRPage branchFilter={getBranchFilter()} />;
      case 'attendance': return <AttendancePage branchFilter={getBranchFilter()} />;
      case 'payroll': return <PayrollPage branchFilter={getBranchFilter()} />;
      case 'projects': return <ProjectsPage branchFilter={getBranchFilter()} />;
      case 'accounting': return <AccountingPage branchFilter={getBranchFilter()} />;
      case 'pos': return <POSPage branchFilter={getBranchFilter()} />;
      case 'branches': return <BranchesPage />;
      case 'companies': return <CompaniesPage />;
      case 'settings': return <SettingsPage />;
      case 'scanner': return <BarcodeScannerPage />;
      default: return <Dashboard branchFilter={getBranchFilter()} />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={navigate} title={pageInfo.title} subtitle={pageInfo.subtitle}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PermissionsProvider>
        <AppContent />
      </PermissionsProvider>
    </AuthProvider>
  );
}
