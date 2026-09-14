import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Branch } from '../../lib/types';
import {
  LayoutDashboard, Users, Truck, Package, FileText, Receipt,
  UserCircle, BookOpen, ShoppingCart, Settings, ChevronDown,
  Building2, LogOut, Menu, X, ChevronRight, ArrowLeftRight,
  BarChart3, Building, Globe, ClipboardCheck,
  HeartHandshake, CalendarCheck, Banknote, FolderKanban,
  ScanLine
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  permission: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, permission: 'dashboard' },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={16} />, permission: 'reports' },
  { id: 'crm', label: 'CRM', icon: <HeartHandshake size={16} />, permission: 'crm' },
  { id: 'cashflow', label: 'Cashflow Audit', icon: <ClipboardCheck size={16} />, permission: 'cashflow' },
  { id: 'customers', label: 'Customers', icon: <Users size={16} />, permission: 'customers' },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck size={16} />, permission: 'suppliers' },
  { id: 'inventory', label: 'Inventory', icon: <Package size={16} />, permission: 'inventory' },
  { id: 'transfers', label: 'Stock Transfers', icon: <ArrowLeftRight size={16} />, permission: 'transfers' },
  { id: 'quotations', label: 'Quotations', icon: <FileText size={16} />, permission: 'quotations' },
  { id: 'invoices', label: 'Invoices', icon: <Receipt size={16} />, permission: 'invoices' },
  { id: 'pos', label: 'Point of Sale', icon: <ShoppingCart size={16} />, permission: 'pos' },
  { id: 'projects', label: 'Projects', icon: <FolderKanban size={16} />, permission: 'projects' },
  { id: 'hr', label: 'HR', icon: <UserCircle size={16} />, permission: 'hr' },
  { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} />, permission: 'attendance' },
  { id: 'payroll', label: 'Payroll', icon: <Banknote size={16} />, permission: 'payroll' },
  { id: 'accounting', label: 'Accounting', icon: <BookOpen size={16} />, permission: 'accounting' },
  { id: 'branches', label: 'Branches', icon: <Building size={16} />, permission: 'branches' },
  { id: 'companies', label: 'Companies', icon: <Globe size={16} />, permission: 'companies' },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} />, permission: 'settings' },
  { id: 'scanner', label: 'Barcode Scanner', icon: <ScanLine size={16} />, permission: 'scanner' },
];

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { profile, branches, currentBranch, setCurrentBranch, signOut, isGlobalAdmin } = useAuth();
  const { canView } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const effectiveBranchId = currentBranch?.id ?? profile?.branch_id ?? null;
  const allowedItems = navItems.filter(item => canView(item.permission, effectiveBranchId, profile?.company_id ?? null) || item.id === 'scanner');

  const roleColors: Record<string, string> = {
    admin: 'bg-red-500', manager: 'bg-amber-500', sales: 'bg-primary-500',
    accountant: 'bg-blue-500', inventory: 'bg-cyan-500', hr: 'bg-pink-500', cashier: 'bg-orange-500',
  };

  const handleBranchChange = (branch: Branch | null) => {
    setCurrentBranch(branch);
    setBranchOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-nav-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">Al Luluah ERP</div>
            <div className="text-nav-400 text-xs">Tents &amp; Sheds TR.</div>
          </div>
        </div>
      </div>

      {/* Branch Selector */}
      {isGlobalAdmin && branches.length > 0 && (
        <div className="px-3 py-2 border-b border-nav-700">
          <button
            onClick={() => setBranchOpen(!branchOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-nav-700/50 rounded-lg hover:bg-nav-700 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Building size={13} className="text-nav-400 flex-shrink-0" />
              <span className="text-sm text-nav-300 truncate">{currentBranch?.name ?? 'All Branches'}</span>
            </div>
            <ChevronDown size={13} className={`text-nav-400 transition-transform flex-shrink-0 ${branchOpen ? 'rotate-180' : ''}`} />
          </button>
          {branchOpen && (
            <div className="mt-1 bg-nav-800 rounded-lg overflow-hidden border border-nav-700">
              <button onClick={() => handleBranchChange(null)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-nav-700 transition-colors ${!currentBranch ? 'text-primary-400 font-medium' : 'text-nav-300'}`}>
                All Branches
              </button>
              {branches.map(b => (
                <button key={b.id} onClick={() => handleBranchChange(b)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-nav-700 transition-colors ${currentBranch?.id === b.id ? 'text-primary-400 font-medium' : 'text-nav-300'}`}>
                  {b.name}{b.is_head_office && <span className="text-xs text-nav-400 ml-1">(HQ)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isGlobalAdmin && currentBranch && (
        <div className="px-3 py-2 border-b border-nav-700">
          <div className="flex items-center gap-2 px-3 py-2 bg-primary-600/20 rounded-lg">
            <Building size={13} className="text-primary-400" />
            <span className="text-sm text-primary-300 truncate">{currentBranch.name}</span>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {allowedItems.map(item => (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              currentPage === item.id
                ? 'bg-primary-600 text-white'
                : 'text-nav-400 hover:text-white hover:bg-nav-700'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {currentPage === item.id && <ChevronRight size={12} className="ml-auto opacity-60" />}
          </button>
        ))}
      </nav>

      {/* Profile */}
      <div className="px-2 py-3 border-t border-nav-700">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-nav-700 transition-colors"
        >
          <div className={`w-7 h-7 ${roleColors[profile?.role ?? 'sales'] ?? 'bg-primary-600'} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-white text-xs font-medium truncate">{profile?.full_name}</div>
            <div className="text-nav-400 text-xs capitalize">{profile?.role}</div>
          </div>
          <ChevronDown size={13} className={`text-nav-400 transition-transform flex-shrink-0 ${profileOpen ? 'rotate-180' : ''}`} />
        </button>

        {profileOpen && (
          <div className="mt-1 bg-nav-700 rounded-lg overflow-hidden border border-nav-600">
            <button onClick={signOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-nav-600 hover:text-red-300 transition-colors">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-nav-800 text-white p-2 rounded-lg shadow-lg">
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 bg-nav-900 flex flex-col shadow-xl">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-nav-400 hover:text-white">
              <X size={18} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="hidden lg:flex lg:w-56 lg:flex-col bg-nav-900 flex-shrink-0">
        <SidebarContent />
      </div>
    </>
  );
}
