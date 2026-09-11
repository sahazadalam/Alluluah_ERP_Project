/*
  # Al Luluah Tents & Sheds ERP - HR, Accounting, POS Tables

  1. Departments + Employees - HR management with UAE-specific fields
  2. Accounts (Chart of Accounts) + Journal Entries - Double-entry accounting
  3. POS Sessions + Transactions - Point of Sale terminal

  Security: RLS enabled with role-based access on all tables.
*/

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  manager_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read departments"
  ON departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR/Admin can manage departments"
  ON departments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR/Admin can update departments"
  ON departments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  department_id uuid REFERENCES departments(id),
  position text DEFAULT '',
  salary numeric DEFAULT 0,
  join_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'active' CHECK (status IN ('active','inactive','terminated','on_leave')),
  nationality text DEFAULT '',
  passport_number text DEFAULT '',
  emirates_id text DEFAULT '',
  visa_expiry date,
  labor_card text DEFAULT '',
  emergency_contact text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can read employees"
  ON employees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR staff can insert employees"
  ON employees FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR staff can update employees"
  ON employees FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text UNIQUE NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id uuid REFERENCES accounts(id),
  balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read accounts"
  ON accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Accountants can manage accounts"
  ON accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

CREATE POLICY "Accountants can update accounts"
  ON accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text UNIQUE NOT NULL,
  entry_date date DEFAULT CURRENT_DATE,
  description text NOT NULL DEFAULT '',
  reference text DEFAULT '',
  status text DEFAULT 'posted' CHECK (status IN ('draft','posted','reversed')),
  total_debit numeric DEFAULT 0,
  total_credit numeric DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read journal entries"
  ON journal_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Accountants can insert journal entries"
  ON journal_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

CREATE POLICY "Accountants can update journal entries"
  ON journal_entries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  description text DEFAULT '',
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read journal lines"
  ON journal_entry_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Accountants can insert journal lines"
  ON journal_entry_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

CREATE POLICY "Accountants can update journal lines"
  ON journal_entry_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

CREATE POLICY "Accountants can delete journal lines"
  ON journal_entry_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','accountant')));

-- POS Sessions
CREATE TABLE IF NOT EXISTS pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number text UNIQUE NOT NULL,
  cashier_id uuid REFERENCES profiles(id),
  opening_balance numeric DEFAULT 0,
  closing_balance numeric,
  total_sales numeric DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pos sessions"
  ON pos_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers can manage pos sessions"
  ON pos_sessions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

CREATE POLICY "Cashiers can update pos sessions"
  ON pos_sessions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

-- POS Transactions
CREATE TABLE IF NOT EXISTS pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL,
  session_id uuid REFERENCES pos_sessions(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text DEFAULT 'Walk-in Customer',
  subtotal numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','card','bank_transfer')),
  amount_tendered numeric DEFAULT 0,
  change_due numeric DEFAULT 0,
  status text DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pos transactions"
  ON pos_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers can insert pos transactions"
  ON pos_transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

CREATE POLICY "Cashiers can update pos transactions"
  ON pos_transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

-- POS Transaction Items
CREATE TABLE IF NOT EXISTS pos_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric DEFAULT 5,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pos_transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read pos transaction items"
  ON pos_transaction_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Cashiers can insert pos transaction items"
  ON pos_transaction_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));
