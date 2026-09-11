/*
  # Advanced Permissions System

  Replaces the hardcoded role-based permissions with a granular per-user,
  per-module, per-action permissions system.

  1. New Tables
    - `permissions` — one row per (user, module, action) tuple
      - user_id: the profile this permission applies to
      - module: e.g. 'invoices', 'hr', 'pos'
      - action: 'view' | 'create' | 'edit' | 'delete' | 'print' | 'export' | 'approve' | 'reject'
      - granted: boolean
      - branch_id: null means all branches, set to restrict to one branch
      - company_id: null means all companies
    - `permission_templates` — named presets per role (admin, manager, …)
      for initial setup and resetting

  2. Security
    - RLS enabled on permissions
    - Only admins can insert/update/delete permissions
    - Users can SELECT their own permissions
*/

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL CHECK (action IN ('view','create','edit','delete','print','export','approve','reject')),
  granted boolean NOT NULL DEFAULT true,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, module, action, branch_id, company_id)
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own permissions"
  ON permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can insert permissions"
  ON permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update permissions"
  ON permissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete permissions"
  ON permissions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Permission templates for default role setup
CREATE TABLE IF NOT EXISTS permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  UNIQUE (role, module, action)
);

ALTER TABLE permission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permission templates"
  ON permission_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage permission templates"
  ON permission_templates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update permission templates"
  ON permission_templates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed default templates
INSERT INTO permission_templates (role, module, action, granted) VALUES
  -- Admin: everything
  ('admin','dashboard','view',true),
  ('admin','reports','view',true),('admin','reports','export',true),
  ('admin','customers','view',true),('admin','customers','create',true),('admin','customers','edit',true),('admin','customers','delete',true),('admin','customers','export',true),
  ('admin','suppliers','view',true),('admin','suppliers','create',true),('admin','suppliers','edit',true),('admin','suppliers','delete',true),
  ('admin','inventory','view',true),('admin','inventory','create',true),('admin','inventory','edit',true),('admin','inventory','delete',true),('admin','inventory','export',true),
  ('admin','transfers','view',true),('admin','transfers','create',true),('admin','transfers','edit',true),('admin','transfers','approve',true),('admin','transfers','reject',true),
  ('admin','quotations','view',true),('admin','quotations','create',true),('admin','quotations','edit',true),('admin','quotations','delete',true),('admin','quotations','print',true),('admin','quotations','export',true),
  ('admin','invoices','view',true),('admin','invoices','create',true),('admin','invoices','edit',true),('admin','invoices','delete',true),('admin','invoices','print',true),('admin','invoices','export',true),('admin','invoices','approve',true),
  ('admin','pos','view',true),('admin','pos','create',true),('admin','pos','print',true),
  ('admin','hr','view',true),('admin','hr','create',true),('admin','hr','edit',true),('admin','hr','delete',true),('admin','hr','export',true),
  ('admin','payroll','view',true),('admin','payroll','create',true),('admin','payroll','edit',true),('admin','payroll','approve',true),('admin','payroll','export',true),
  ('admin','attendance','view',true),('admin','attendance','create',true),('admin','attendance','edit',true),('admin','attendance','export',true),
  ('admin','projects','view',true),('admin','projects','create',true),('admin','projects','edit',true),('admin','projects','delete',true),('admin','projects','export',true),
  ('admin','crm','view',true),('admin','crm','create',true),('admin','crm','edit',true),('admin','crm','delete',true),
  ('admin','accounting','view',true),('admin','accounting','create',true),('admin','accounting','edit',true),
  ('admin','cashflow','view',true),('admin','cashflow','create',true),('admin','cashflow','approve',true),('admin','cashflow','export',true),
  ('admin','branches','view',true),('admin','branches','create',true),('admin','branches','edit',true),
  ('admin','companies','view',true),('admin','companies','create',true),('admin','companies','edit',true),
  ('admin','settings','view',true),('admin','settings','create',true),('admin','settings','edit',true),('admin','settings','delete',true),
  -- Manager
  ('manager','dashboard','view',true),
  ('manager','reports','view',true),('manager','reports','export',true),
  ('manager','customers','view',true),('manager','customers','create',true),('manager','customers','edit',true),
  ('manager','suppliers','view',true),('manager','suppliers','create',true),('manager','suppliers','edit',true),
  ('manager','inventory','view',true),('manager','inventory','create',true),('manager','inventory','edit',true),
  ('manager','transfers','view',true),('manager','transfers','create',true),('manager','transfers','approve',true),
  ('manager','quotations','view',true),('manager','quotations','create',true),('manager','quotations','edit',true),('manager','quotations','print',true),
  ('manager','invoices','view',true),('manager','invoices','create',true),('manager','invoices','edit',true),('manager','invoices','print',true),
  ('manager','pos','view',true),('manager','pos','create',true),
  ('manager','hr','view',true),('manager','hr','create',true),('manager','hr','edit',true),
  ('manager','payroll','view',true),('manager','payroll','approve',true),
  ('manager','attendance','view',true),('manager','attendance','create',true),('manager','attendance','edit',true),
  ('manager','projects','view',true),('manager','projects','create',true),('manager','projects','edit',true),
  ('manager','crm','view',true),('manager','crm','create',true),('manager','crm','edit',true),
  ('manager','cashflow','view',true),('manager','cashflow','create',true),
  -- Sales
  ('sales','dashboard','view',true),
  ('sales','customers','view',true),('sales','customers','create',true),('sales','customers','edit',true),
  ('sales','quotations','view',true),('sales','quotations','create',true),('sales','quotations','edit',true),('sales','quotations','print',true),
  ('sales','invoices','view',true),('sales','invoices','create',true),('sales','invoices','print',true),
  ('sales','pos','view',true),('sales','pos','create',true),
  ('sales','crm','view',true),('sales','crm','create',true),('sales','crm','edit',true),
  -- Accountant
  ('accountant','dashboard','view',true),
  ('accountant','reports','view',true),('accountant','reports','export',true),
  ('accountant','invoices','view',true),('accountant','invoices','create',true),('accountant','invoices','edit',true),('accountant','invoices','print',true),
  ('accountant','accounting','view',true),('accountant','accounting','create',true),('accountant','accounting','edit',true),
  ('accountant','cashflow','view',true),('accountant','cashflow','approve',true),
  ('accountant','payroll','view',true),('accountant','payroll','approve',true),('accountant','payroll','export',true),
  -- Inventory
  ('inventory','dashboard','view',true),
  ('inventory','inventory','view',true),('inventory','inventory','create',true),('inventory','inventory','edit',true),
  ('inventory','transfers','view',true),('inventory','transfers','create',true),
  ('inventory','suppliers','view',true),
  -- HR
  ('hr','dashboard','view',true),
  ('hr','hr','view',true),('hr','hr','create',true),('hr','hr','edit',true),
  ('hr','payroll','view',true),('hr','payroll','create',true),
  ('hr','attendance','view',true),('hr','attendance','create',true),('hr','attendance','edit',true),
  ('hr','projects','view',true),
  -- Cashier
  ('cashier','dashboard','view',true),
  ('cashier','pos','view',true),('cashier','pos','create',true),('cashier','pos','print',true),
  ('cashier','invoices','view',true),('cashier','invoices','create',true),('cashier','invoices','print',true),
  ('cashier','cashflow','view',true)
ON CONFLICT (role, module, action) DO NOTHING;
