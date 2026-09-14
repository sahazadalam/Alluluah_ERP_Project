import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { ROLE_PERMISSIONS, UserRole } from '../lib/types';
import { useAuth } from './AuthContext';

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'print' | 'export' | 'approve' | 'reject';

const ADMIN_ONLY_MODULES = new Set(['branches', 'companies', 'settings']);

interface PermissionRow {
  module: string;
  action: PermAction;
  granted: boolean;
  branch_id: string | null;
  company_id: string | null;
}

interface PermissionsContextType {
  can: (module: string, action: PermAction, branchId?: string | null, companyId?: string | null) => boolean;
  canView: (module: string, branchId?: string | null, companyId?: string | null) => boolean;
  permissions: PermissionRow[];
  loading: boolean;
  reload: () => void;
}

const PermissionsContext = createContext<PermissionsContextType>({
  can: () => false,
  canView: () => false,
  permissions: [],
  loading: true,
  reload: () => {},
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile) { setLoading(false); return; }

    // Admin always gets full permissions from templates
    if (profile.role === 'admin') {
      const { data } = await supabase
        .from('permission_templates')
        .select('module, action, granted')
        .eq('role', 'admin');
      setPermissions((data ?? []).map(r => ({ ...r, branch_id: null, company_id: null })));
      setLoading(false);
      return;
    }

    // Load the role template as the base, then overlay any per-user
    // overrides on top. This way granting a user one custom permission
    // (e.g. a branch-specific override) no longer wipes out every other
    // permission they had from their role.
    const [{ data: template }, { data: userPerms }] = await Promise.all([
      supabase
        .from('permission_templates')
        .select('module, action, granted')
        .eq('role', profile.role),
      supabase
        .from('permissions')
        .select('module, action, granted, branch_id, company_id')
        .eq('user_id', profile.id),
    ]);

    const base: PermissionRow[] = (template ?? []).map(r => ({
      ...r,
      branch_id: null,
      company_id: null,
    }));

    // User-specific rows override the base template for the same
    // (module, action, branch_id, company_id) combination, and are added
    // on top for anything new (e.g. branch-specific grants/revokes).
    const merged = new Map<string, PermissionRow>();
    for (const row of base) {
      merged.set(`${row.module}|${row.action}|${row.branch_id}|${row.company_id}`, row);
    }
    for (const row of userPerms ?? []) {
      merged.set(`${row.module}|${row.action}|${row.branch_id}|${row.company_id}`, row);
    }

    setPermissions(Array.from(merged.values()));
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase.channel(`permissions-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'permissions',
        filter: `user_id=eq.${profile.id}`,
      }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const can = (module: string, action: PermAction, branchId?: string | null, companyId?: string | null): boolean => {
    if (!profile) return false;

    // Admin-only modules can never be inherited by non-admin users through
    // role templates or user-specific permission rows.
    if (profile.role !== 'admin' && ADMIN_ONLY_MODULES.has(module)) {
      return false;
    }

    const roleModules = ROLE_PERMISSIONS[(profile.role as UserRole) ?? 'sales'] ?? [];
    const targetBranch = branchId ?? profile.branch_id ?? null;
    const targetCompany = companyId ?? profile.company_id ?? null;

    const rows = permissions.filter(p => p.module === module && p.action === action);

    // Apply an explicit permission precedence chain:
    // 1. exact branch + exact company row
    // 2. branch-specific row without company
    // 3. exact company row without branch
    // 4. global row without branch/company
    // This lets a custom grant inserted in the user's permissions table
    // dominate the template fallback and become visible to the user session.
    const exactBranchCompany = rows.find(p => p.branch_id === targetBranch && p.company_id === targetCompany);
    if (exactBranchCompany) return exactBranchCompany.granted;

    const branchOnly = rows.find(p => p.branch_id === targetBranch && p.company_id === null);
    if (branchOnly) return branchOnly.granted;

    const companyOnly = rows.find(p => p.branch_id === null && p.company_id === targetCompany);
    if (companyOnly) return companyOnly.granted;

    const globalRow = rows.find(p => p.branch_id === null && p.company_id === null);
    if (globalRow) return globalRow.granted;

    // Fallback to role template list only when there is no explicit user row.
    // This means custom rows inserted by the admin can truly override or add
    // visibility for pages like HR / attendance / payroll / branches, rather
    // than being hidden behind a false static matrix fallback.
    if (action === 'view' && roleModules.includes(module)) {
      return true;
    }

    return false;
  };

  const canView = (module: string, branchId?: string | null, companyId?: string | null) => can(module, 'view', branchId, companyId);

  return (
    <PermissionsContext.Provider value={{ can, canView, permissions, loading, reload: load }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
