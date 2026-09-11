/*
  # Multi-Branch ERP - Add branch_id to all transactional tables
  
  This migration adds branch_id to:
  - customers, suppliers, products
  - quotations, invoices, payments
  - employees, departments
  - journal entries, accounts
  - POS sessions and transactions
  
  Also creates branch-specific inventory tracking.
*/

-- Add branch_id to customers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'branch_id') THEN
    ALTER TABLE customers ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to suppliers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'branch_id') THEN
    ALTER TABLE suppliers ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to products (for branch-specific pricing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'branch_id') THEN
    ALTER TABLE products ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Create branch inventory table (separate stock per branch)
CREATE TABLE IF NOT EXISTS branch_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric DEFAULT 0,
  committed_quantity numeric DEFAULT 0,
  reordered_at timestamptz,
  UNIQUE(branch_id, product_id)
);

ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read branch inventory"
  ON branch_inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "Branch staff can insert inventory"
  ON branch_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role = 'admin' OR p.branch_id = branch_inventory.branch_id)
  ));

CREATE POLICY "Branch staff can update inventory"
  ON branch_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role = 'admin' OR p.branch_id = branch_inventory.branch_id)
  ));

-- Add branch_id to quotations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'branch_id') THEN
    ALTER TABLE quotations ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'branch_id') THEN
    ALTER TABLE invoices ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to payments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'branch_id') THEN
    ALTER TABLE payments ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to employees
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'branch_id') THEN
    ALTER TABLE employees ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to departments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'branch_id') THEN
    ALTER TABLE departments ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to journal_entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_entries' AND column_name = 'branch_id') THEN
    ALTER TABLE journal_entries ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to pos_sessions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_sessions' AND column_name = 'branch_id') THEN
    ALTER TABLE pos_sessions ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add branch_id to pos_transactions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_transactions' AND column_name = 'branch_id') THEN
    ALTER TABLE pos_transactions ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Expenses and income tracking per branch
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  expense_date date DEFAULT CURRENT_DATE,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  payment_method text DEFAULT 'cash',
  reference text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read expenses"
  ON expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Branch staff can insert expenses"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role IN ('admin', 'manager', 'accountant') OR p.branch_id = expenses.branch_id)
  ));

-- Income tracking per branch (non-invoice income)
CREATE TABLE IF NOT EXISTS income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  income_date date DEFAULT CURRENT_DATE,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  payment_method text DEFAULT 'cash',
  reference text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read income"
  ON income FOR SELECT TO authenticated USING (true);

CREATE POLICY "Branch staff can insert income"
  ON income FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role IN ('admin', 'manager', 'accountant') OR p.branch_id = income.branch_id)
  ));

-- Cash flow tracking per branch
CREATE TABLE IF NOT EXISTS cash_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  register_date date DEFAULT CURRENT_DATE,
  opening_balance numeric DEFAULT 0,
  cash_sales numeric DEFAULT 0,
  card_sales numeric DEFAULT 0,
  bank_transfers numeric DEFAULT 0,
  expenses numeric DEFAULT 0,
  income numeric DEFAULT 0,
  closing_balance numeric DEFAULT 0,
  notes text DEFAULT '',
  closed_by uuid REFERENCES profiles(id),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cash register"
  ON cash_register FOR SELECT TO authenticated USING (true);

CREATE POLICY "Branch staff can manage cash register"
  ON cash_register FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role IN ('admin', 'manager', 'cashier', 'accountant') OR p.branch_id = cash_register.branch_id)
  ));
