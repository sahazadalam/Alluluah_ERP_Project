/*
  # Cashflow Audit Module
  
  1. Audit logs table - tracks all cash transactions
  2. Approval workflow for expenses/withdrawals
  3. Audit trail trigger function
  4. Soft delete support
*/

-- Audit logs table for all cash transactions
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SOFT_DELETE', 'RESTORE')),
  old_values jsonb DEFAULT '{}',
  new_values jsonb DEFAULT '{}',
  changed_fields text[] DEFAULT '{}',
  branch_id uuid REFERENCES branches(id),
  user_id uuid REFERENCES profiles(id),
  user_name text DEFAULT '',
  user_role text DEFAULT '',
  amount numeric DEFAULT 0,
  transaction_type text DEFAULT '', -- 'income', 'expense', 'payment', 'withdrawal'
  payment_method text DEFAULT '',
  reason text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  ip_address text DEFAULT '',
  user_agent text DEFAULT ''
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role = 'admin' OR p.branch_id = audit_logs.branch_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(transaction_type);

-- Add soft delete columns to expenses table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'is_deleted') THEN
    ALTER TABLE expenses ADD COLUMN is_deleted boolean DEFAULT false;
    ALTER TABLE expenses ADD COLUMN deleted_by uuid REFERENCES profiles(id);
    ALTER TABLE expenses ADD COLUMN deleted_at timestamptz;
    ALTER TABLE expenses ADD COLUMN delete_reason text DEFAULT '';
    ALTER TABLE expenses ADD COLUMN approved_by uuid REFERENCES profiles(id);
    ALTER TABLE expenses ADD COLUMN approved_at timestamptz;
    ALTER TABLE expenses ADD COLUMN approval_status text DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
    ALTER TABLE expenses ADD COLUMN requires_approval boolean DEFAULT false;
  END IF;
END $$;

-- Add soft delete columns to income table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income' AND column_name = 'is_deleted') THEN
    ALTER TABLE income ADD COLUMN is_deleted boolean DEFAULT false;
    ALTER TABLE income ADD COLUMN deleted_by uuid REFERENCES profiles(id);
    ALTER TABLE income ADD COLUMN deleted_at timestamptz;
    ALTER TABLE income ADD COLUMN delete_reason text DEFAULT '';
    ALTER TABLE income ADD COLUMN approved_by uuid REFERENCES profiles(id);
    ALTER TABLE income ADD COLUMN approved_at timestamptz;
    ALTER TABLE income ADD COLUMN approval_status text DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
    ALTER TABLE income ADD COLUMN requires_approval boolean DEFAULT false;
  END IF;
END $$;

-- Cash withdrawals table (separate from expenses for better tracking)
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  withdrawal_number text UNIQUE NOT NULL,
  amount numeric NOT NULL,
  purpose text NOT NULL,
  notes text DEFAULT '',
  payment_method text DEFAULT 'cash',
  reference text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  requested_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  rejected_by uuid REFERENCES profiles(id),
  completed_by uuid REFERENCES profiles(id),
  rejection_reason text DEFAULT '',
  is_deleted boolean DEFAULT false,
  deleted_by uuid REFERENCES profiles(id),
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read withdrawals"
  ON cash_withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role = 'admin' OR p.branch_id = cash_withdrawals.branch_id)
    )
  );

CREATE POLICY "Staff can create withdrawals"
  ON cash_withdrawals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role IN ('admin', 'manager', 'accountant') OR p.branch_id = cash_withdrawals.branch_id)
    )
  );

CREATE POLICY "Admins/managers can update withdrawals"
  ON cash_withdrawals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_branch ON cash_withdrawals(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_status ON cash_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_date ON cash_withdrawals(created_at);

-- Daily cash closing report
CREATE TABLE IF NOT EXISTS daily_cash_closing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  closing_date date NOT NULL,
  opening_cash numeric DEFAULT 0,
  cash_sales numeric DEFAULT 0,
  card_sales numeric DEFAULT 0,
  bank_transfers numeric DEFAULT 0,
  cash_income numeric DEFAULT 0,
  cash_expenses numeric DEFAULT 0,
  cash_withdrawals numeric DEFAULT 0,
  expected_closing numeric DEFAULT 0,
  actual_closing numeric DEFAULT 0,
  variance numeric DEFAULT 0,
  variance_reason text DEFAULT '',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  notes text DEFAULT '',
  closed_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  UNIQUE(branch_id, closing_date)
);

ALTER TABLE daily_cash_closing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cash closing"
  ON daily_cash_closing FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role = 'admin' OR p.branch_id = daily_cash_closing.branch_id)
    )
  );

CREATE POLICY "Branch staff can manage cash closing"
  ON daily_cash_closing FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role IN ('admin', 'manager', 'cashier', 'accountant') OR p.branch_id = daily_cash_closing.branch_id)
    )
  );

CREATE POLICY "Branch staff can update cash closing"
  ON daily_cash_closing FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
      AND (p.role IN ('admin', 'manager', 'cashier', 'accountant') OR p.branch_id = daily_cash_closing.branch_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_daily_cash_closing_branch ON daily_cash_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_cash_closing_date ON daily_cash_closing(closing_date);
