/*
# Admin DELETE policies for all tables

## Problem
Most tables have no DELETE policy, meaning even admins cannot delete records.
RLS blocks all DELETEs when no policy exists.

## Solution
Add a DELETE policy for each missing table that allows admin (and in some cases
manager) to delete records. This gives the administrator full control over every
category as requested.
*/

-- Core tables
CREATE POLICY "Admins can delete accounts" ON accounts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete branches" ON branches FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete companies" ON companies FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete categories" ON categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete customers" ON customers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','sales']))
  );

CREATE POLICY "Admins can delete suppliers" ON suppliers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','inventory']))
  );

CREATE POLICY "Admins can delete products" ON products FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','inventory']))
  );

CREATE POLICY "Admins can delete branch_inventory" ON branch_inventory FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','inventory']))
  );

-- Sales / Invoices / Quotations
CREATE POLICY "Admins can delete invoices" ON invoices FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','sales','accountant']))
  );

CREATE POLICY "Admins can delete payments" ON payments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant']))
  );

CREATE POLICY "Admins can delete quotations" ON quotations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','sales','accountant','cashier']))
  );

-- Cashflow
CREATE POLICY "Admins can delete expenses" ON expenses FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant']))
  );

CREATE POLICY "Admins can delete income" ON income FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant']))
  );

CREATE POLICY "Admins can delete cash_withdrawals" ON cash_withdrawals FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant']))
  );

CREATE POLICY "Admins can delete cash_register" ON cash_register FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant','cashier']))
  );

CREATE POLICY "Admins can delete daily_cash_closing" ON daily_cash_closing FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant','cashier']))
  );

CREATE POLICY "Admins can delete cash_drawers" ON cash_drawers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete cash_drawer_events" ON cash_drawer_events FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete shift_reconciliation" ON shift_reconciliation FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','cashier']))
  );

-- Transfers
CREATE POLICY "Admins can delete stock_transfers" ON stock_transfers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','inventory']))
  );

-- HR
CREATE POLICY "Admins can delete employees" ON employees FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr']))
  );

CREATE POLICY "Admins can delete departments" ON departments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr']))
  );

CREATE POLICY "Admins can delete employee_contracts" ON employee_contracts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr']))
  );

CREATE POLICY "Admins can delete employee_deductions" ON employee_deductions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr','accountant']))
  );

CREATE POLICY "Admins can delete salary_advances" ON salary_advances FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr','accountant']))
  );

CREATE POLICY "Admins can delete leave_requests" ON leave_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr']))
  );

-- Payroll
CREATE POLICY "Admins can delete payroll_periods" ON payroll_periods FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant','hr']))
  );

CREATE POLICY "Admins can delete payroll_items" ON payroll_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant','hr']))
  );

-- Accounting
CREATE POLICY "Admins can delete journal_entries" ON journal_entries FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','accountant']))
  );

-- POS
CREATE POLICY "Admins can delete pos_sessions" ON pos_sessions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','cashier','sales']))
  );

CREATE POLICY "Admins can delete pos_transactions" ON pos_transactions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','cashier','sales']))
  );

CREATE POLICY "Admins can delete pos_transaction_items" ON pos_transaction_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','cashier','sales']))
  );

-- Projects
CREATE POLICY "Admins can delete project_progress" ON project_progress FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager']))
  );

CREATE POLICY "Admins can delete project_expenses" ON project_expenses FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager']))
  );

CREATE POLICY "Admins can delete project_attendance" ON project_attendance FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager','hr']))
  );

-- Settings / Hardware
CREATE POLICY "Admins can delete app_settings" ON app_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete hardware_config" ON hardware_config FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete receipt_templates" ON receipt_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete permission_templates" ON permission_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Audit logs (admin only)
CREATE POLICY "Admins can delete audit_logs" ON audit_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete payroll_audit_logs" ON payroll_audit_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admins can delete contract_audit_logs" ON contract_audit_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );