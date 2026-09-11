/*
  # Stock Transfer Between Branches
  
  - Stock transfer requests
  - Transfer items
  - Status tracking: requested -> approved -> shipped -> received
*/

-- Stock transfer requests between branches
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text UNIQUE NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES branches(id),
  to_branch_id uuid NOT NULL REFERENCES branches(id),
  status text DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'shipped', 'received', 'cancelled')),
  requested_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  shipped_by uuid REFERENCES profiles(id),
  received_by uuid REFERENCES profiles(id),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz
);

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transfers"
  ON stock_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can create transfers"
  ON stock_transfers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.role IN ('admin', 'manager', 'inventory')
  ));

CREATE POLICY "Staff can update transfers"
  ON stock_transfers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.role IN ('admin', 'manager', 'inventory')
  ));

-- Stock transfer items
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_requested numeric NOT NULL,
  quantity_shipped numeric DEFAULT 0,
  quantity_received numeric DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transfer items"
  ON stock_transfer_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage transfer items"
  ON stock_transfer_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.role IN ('admin', 'manager', 'inventory')
  ));

CREATE POLICY "Staff can update transfer items"
  ON stock_transfer_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.role IN ('admin', 'manager', 'inventory')
  ));

CREATE POLICY "Staff can delete transfer items"
  ON stock_transfer_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.role IN ('admin', 'manager', 'inventory')
  ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON branch_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_quotations_branch ON quotations(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_branch ON pos_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_income_branch ON income(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_branch_id);
