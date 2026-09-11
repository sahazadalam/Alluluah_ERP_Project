/*
  # Fix missing view permissions for manager/payroll and accountant/cashflow

  The manager role was granted 'payroll.approve' but never 'payroll.view',
  and the accountant role was granted 'cashflow.approve' but never
  'cashflow.view'. Since canView() checks specifically for the 'view'
  action, both the sidebar menu and route guard in App.tsx silently hid
  and blocked these pages for these roles, even though ROLE_PERMISSIONS
  lists them as accessible modules.
*/

INSERT INTO permission_templates (role, module, action, granted) VALUES
  ('manager', 'payroll', 'view', true),
  ('accountant', 'cashflow', 'view', true)
ON CONFLICT (role, module, action) DO NOTHING;
