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
  can: (module: string, action: PermAction, branchId?: string | null) => boolean;
  canView: (module: string) => boolean;
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

  const can = (module: string, action: PermAction, branchId?: string | null): boolean => {
    if (!profile) return false;

    // Admin-only modules can never be inherited by non-admin users through
    // role templates or user-specific permission rows.
    if (profile.role !== 'admin' && ADMIN_ONLY_MODULES.has(module)) {
      return false;
    }

    const roleModules = ROLE_PERMISSIONS[(profile.role as UserRole) ?? 'sales'] ?? [];
    const targetBranch = branchId ?? null;

    // Prefer branch-specific permission, fall back to global (branch_id = null).
    // However, if the template row exists with a false grant, do not let that
    // false row hide the module when the static role matrix says that the user
    // role is supposed to see the page.
    const branchMatch = permissions.find(p =>
      p.module === module && p.action === action && p.branch_id === targetBranch
    );
    if (branchMatch) {
      if (branchMatch.granted) return true;
      if (action === 'view' && roleModules.includes(module)) return true;
      return false;
    }

    const globalMatch = permissions.find(p =>
      p.module === module && p.action === action && p.branch_id === null
    );
    if (globalMatch) {
      if (globalMatch.granted) return true;
      if (action === 'view' && roleModules.includes(module)) return true;
      return false;
    }

    // Fallback for role-template drift: if the template table is missing the
    // explicit row for a role/module 'view' action, the static role list should
    // still let the user access the pages that the product role matrix allows.
    // This keeps HR/accounting/other business windows visible instead of hiding
    // them behind a missing permission row in the database.
    if (action === 'view' && roleModules.includes(module)) {
      return true;
    }

    return false;
  };

  const canView = (module: string) => can(module, 'view');

  return (
    <PermissionsContext.Provider value={{ can, canView, permissions, loading, reload: load }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
