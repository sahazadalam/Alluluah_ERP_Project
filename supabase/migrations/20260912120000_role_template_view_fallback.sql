/*
  # Restore role-template module view rows explicitly

  Ensures the stored permission_templates table includes the view rows
  that the app's role matrix expects for the enterprise role set.
  This prevents HR, accounting, payroll, attendance, and project windows
  from disappearing when the template seed is incomplete or a role was
  created without a full view grant row.
*/

INSERT INTO permission_templates (role, module, action, granted)
VALUES
  ('manager', 'payroll', 'view', true),
  ('accountant', 'cashflow', 'view', true),
  ('accountant', 'accounting', 'view', true),
  ('hr', 'hr', 'view', true),
  ('hr', 'payroll', 'view', true),
  ('hr', 'attendance', 'view', true),
  ('hr', 'projects', 'view', true),
  ('inventory', 'inventory', 'view', true),
  ('inventory', 'transfers', 'view', true),
  ('cashier', 'cashflow', 'view', true),
  ('sales', 'pos', 'view', true)
ON CONFLICT (role, module, action) DO NOTHING;
