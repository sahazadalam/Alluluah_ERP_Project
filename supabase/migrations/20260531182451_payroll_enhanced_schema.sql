/*
  # Enhanced Payroll Schema

  ## Summary
  Extends the employees table with detailed salary components and adds new tables
  for granular payroll management.

  ## Changes

  ### Modified Tables
  - `employees`: Adds daily_wage, overtime_rate, housing_allowance, transport_allowance,
    other_allowances, bank_name, bank_account, iban columns

  ### New Tables
  1. `employee_deductions` — Custom per-employee deductions with reason, date, amount,
     approval status. Automatically linked to payroll items during payroll generation.

  2. `payroll_audit_logs` — Immutable audit trail for every payroll action:
     create, edit, approve, reject, mark_paid. Stores actor, timestamp, old/new values.

  ## Security
  - RLS enabled on all new/modified tables
  - Admin, manager, hr, accountant roles have appropriate access
  - Employees cannot view/modify their own deduction records directly
*/

-- ── Extend employees with salary components ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'daily_wage') THEN
    ALTER TABLE employees ADD COLUMN daily_wage numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'overtime_rate') THEN
    ALTER TABLE employees ADD COLUMN overtime_rate numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'housing_allowance') THEN
    ALTER TABLE employees ADD COLUMN housing_allowance numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'transport_allowance') THEN
    ALTER TABLE employees ADD COLUMN transport_allowance numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'other_allowances') THEN
    ALTER TABLE employees ADD COLUMN other_allowances numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'bank_name') THEN
    ALTER TABLE employees ADD COLUMN bank_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'bank_account') THEN
    ALTER TABLE employees ADD COLUMN bank_account text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'iban') THEN
    ALTER TABLE employees ADD COLUMN iban text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ── Custom Employee Deductions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_deductions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  deduction_date    date NOT NULL,
  category          text NOT NULL DEFAULT 'other'
                    CHECK (category IN ('absence','late','damage','advance_repayment','loan','penalty','other')),
  reason            text NOT NULL DEFAULT '',
  amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','applied')),
  approved_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  rejection_reason  text NOT NULL DEFAULT '',
  applied_to_period uuid REFERENCES payroll_periods(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view deductions"
  ON employee_deductions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  );

CREATE POLICY "HR staff can insert deductions"
  ON employee_deductions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  );

CREATE POLICY "HR staff can update deductions"
  ON employee_deductions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  );

CREATE INDEX IF NOT EXISTS idx_employee_deductions_employee ON employee_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_date ON employee_deductions(deduction_date);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_status ON employee_deductions(status);

-- ── Payroll Audit Logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('payroll_period','payroll_item','salary_advance','employee_deduction')),
  entity_id      uuid NOT NULL,
  action         text NOT NULL CHECK (action IN ('created','edited','approved','rejected','paid','cancelled','reset')),
  actor_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name     text NOT NULL DEFAULT '',
  actor_role     text NOT NULL DEFAULT '',
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  old_values     jsonb,
  new_values     jsonb,
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll staff can view audit logs"
  ON payroll_audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  );

CREATE POLICY "System can insert audit logs"
  ON payroll_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','manager','hr','accountant')
    )
  );

CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON payroll_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_actor ON payroll_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_created ON payroll_audit_logs(created_at DESC);
