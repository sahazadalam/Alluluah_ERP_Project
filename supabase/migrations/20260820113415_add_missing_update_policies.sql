-- Add missing UPDATE policies for tables that need them

-- expenses: needed for approve/reject in CashflowPage
CREATE POLICY "Managers and accountants can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant')
  ));

-- income: needed for approve/reject in CashflowPage
CREATE POLICY "Managers and accountants can update income"
  ON income FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant')
  ));

-- payments: needed for updating payment records
CREATE POLICY "Finance staff can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant', 'sales')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'accountant', 'sales')
  ));

-- cash_register: needed for POS cash drawer updates
CREATE POLICY "Branch staff can update cash register"
  ON cash_register FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.role IN ('admin', 'manager', 'cashier', 'accountant') OR p.branch_id = cash_register.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.role IN ('admin', 'manager', 'cashier', 'accountant') OR p.branch_id = cash_register.branch_id)
  ));

-- cash_drawer_events: needed for POS drawer event updates
CREATE POLICY "Branch staff can update drawer events"
  ON cash_drawer_events FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.role = 'admin' OR p.branch_id = cash_drawer_events.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND (p.role = 'admin' OR p.branch_id = cash_drawer_events.branch_id)
  ));

-- pos_transaction_items: needed for POS transaction updates (e.g. returns)
CREATE POLICY "Staff can update pos transaction items"
  ON pos_transaction_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'cashier', 'sales')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'manager', 'cashier', 'sales')
  ));

-- receipt_templates: needed for admin to create receipt templates
-- (existing "Admins can manage templates" is FOR ALL which covers INSERT,
-- but let's add an explicit INSERT in case FOR ALL is not matching)
CREATE POLICY "Admins can insert receipt templates"
  ON receipt_templates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  ));

-- audit_logs: INSERT is done via triggers (service role), so no policy needed
-- contract_audit_logs and payroll_audit_logs: audit tables, UPDATE not needed
-- attendance_device_sync_logs: UPDATE not needed (sync logs are append-only)
