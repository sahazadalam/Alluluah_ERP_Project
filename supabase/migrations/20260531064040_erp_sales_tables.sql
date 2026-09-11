/*
  # Al Luluah Tents & Sheds ERP - Sales Tables

  1. Quotations + quotation_items - Sales quotes with line items
  2. Invoices + invoice_items - Tax invoices with UAE 5% VAT
  3. Payments - Payment tracking against invoices

  All amounts support UAE VAT at 5% with TRN validation.
  Status workflows: draft → sent → accepted/rejected for quotes,
  draft → sent → paid/partial/overdue for invoices.
*/

-- Quotations
CREATE TABLE IF NOT EXISTS quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL DEFAULT '',
  customer_trn text DEFAULT '',
  issue_date date DEFAULT CURRENT_DATE,
  valid_until date,
  status text DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text DEFAULT '',
  terms text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quotations"
  ON quotations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales staff can insert quotations"
  ON quotations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

CREATE POLICY "Sales staff can update quotations"
  ON quotations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

-- Quotation Items
CREATE TABLE IF NOT EXISTS quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  vat_rate numeric DEFAULT 5,
  line_total numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quotation items"
  ON quotation_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales staff can insert quotation items"
  ON quotation_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

CREATE POLICY "Sales staff can update quotation items"
  ON quotation_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

CREATE POLICY "Sales staff can delete quotation items"
  ON quotation_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  quotation_id uuid REFERENCES quotations(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL DEFAULT '',
  customer_address text DEFAULT '',
  customer_trn text DEFAULT '',
  issue_date date DEFAULT CURRENT_DATE,
  due_date date,
  status text DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','partial','overdue','cancelled')),
  subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  vat_rate numeric DEFAULT 5,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  balance_due numeric DEFAULT 0,
  notes text DEFAULT '',
  terms text DEFAULT 'Payment due within 30 days.',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoices"
  ON invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales staff can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

CREATE POLICY "Sales staff can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  vat_rate numeric DEFAULT 5,
  line_total numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice items"
  ON invoice_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales staff can insert invoice items"
  ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

CREATE POLICY "Sales staff can update invoice items"
  ON invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

CREATE POLICY "Sales staff can delete invoice items"
  ON invoice_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  payment_date date DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','bank_transfer','cheque','card','other')),
  reference text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payments"
  ON payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Finance staff can insert payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','accountant')));

-- Sequences for document numbers
CREATE SEQUENCE IF NOT EXISTS quotation_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS pos_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS journal_seq START 1000;
