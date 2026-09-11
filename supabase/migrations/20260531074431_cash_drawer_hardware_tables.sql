/*
  # Cash Drawer and POS Hardware Integration
  
  1. Cash drawers table - track drawer status and assignments
  2. Cash drawer audit log - track all open/close events
  3. Shift management - cashier shifts with reconciliation
  4. Hardware configuration - printers, scanners, displays
  5. Receipt templates - store receipt formats
*/

-- Cash drawers table
CREATE TABLE IF NOT EXISTS cash_drawers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  name text NOT NULL,
  drawer_code text NOT NULL,
  status text DEFAULT 'closed' CHECK (status IN ('open', 'closed', 'locked', 'error')),
  printer_connection text DEFAULT 'USB', -- USB, Bluetooth, Network, Serial
  printer_name text DEFAULT '',
  is_active boolean DEFAULT true,
  assigned_to uuid REFERENCES profiles(id),
  opened_at timestamptz,
  opened_by uuid REFERENCES profiles(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, drawer_code)
);

ALTER TABLE cash_drawers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cash drawers"
  ON cash_drawers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Branch staff can manage drawers"
  ON cash_drawers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')));

CREATE POLICY "Branch staff can update drawers"
  ON cash_drawers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'cashier')));

-- Cash drawer events log (every open/close)
CREATE TABLE IF NOT EXISTS cash_drawer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawer_id uuid NOT NULL REFERENCES cash_drawers(id),
  event_type text NOT NULL CHECK (event_type IN ('open', 'close', 'manual_open', 'error', 'locked', 'unlocked')),
  opened_by uuid REFERENCES profiles(id),
  cashier_id uuid REFERENCES profiles(id),
  shift_id uuid, -- Reference to POS session
  branch_id uuid REFERENCES branches(id),
  reason text DEFAULT '',
  amount_in_drawer numeric DEFAULT 0,
  transaction_id uuid, -- Related POS transaction
  ip_address text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_drawer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read drawer events"
  ON cash_drawer_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role = 'admin' OR p.branch_id = cash_drawer_events.branch_id))
  );

CREATE POLICY "Cashiers can create drawer events"
  ON cash_drawer_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_drawer_events_drawer ON cash_drawer_events(drawer_id);
CREATE INDEX IF NOT EXISTS idx_drawer_events_date ON cash_drawer_events(created_at);
CREATE INDEX IF NOT EXISTS idx_drawer_events_branch ON cash_drawer_events(branch_id);

-- Shift reconciliation
CREATE TABLE IF NOT EXISTS shift_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id),
  drawer_id uuid REFERENCES cash_drawers(id),
  opening_date date NOT NULL,
  opening_time timestamptz NOT NULL,
  closing_time timestamptz,
  cashier_id uuid REFERENCES profiles(id),
  manager_id uuid REFERENCES profiles(id), -- Who approved/verified
  
  -- Expected amounts
  opening_cash numeric DEFAULT 0,
  expected_cash numeric DEFAULT 0,
  expected_card numeric DEFAULT 0,
  expected_other numeric DEFAULT 0,
  total_expected numeric DEFAULT 0,
  
  -- Actual amounts counted
  actual_cash numeric DEFAULT 0,
  actual_card numeric DEFAULT 0,
  actual_other numeric DEFAULT 0,
  total_actual numeric DEFAULT 0,
  
  -- Variance
  cash_variance numeric DEFAULT 0,
  card_variance numeric DEFAULT 0,
  total_variance numeric DEFAULT 0,
  variance_reason text DEFAULT '',
  
  -- Denomination breakdown (JSON)
  cash_breakdown jsonb DEFAULT '{}',
  
  -- Status
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed', 'verified', 'disputed')),
  notes text DEFAULT '',
  
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  verified_at timestamptz
);

ALTER TABLE shift_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reconciliation"
  ON shift_reconciliation FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role = 'admin' OR p.branch_id = shift_reconciliation.branch_id))
  );

CREATE POLICY "Cashiers can create reconciliation"
  ON shift_reconciliation FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Managers can verify reconciliation"
  ON shift_reconciliation FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')));

CREATE INDEX IF NOT EXISTS idx_reconciliation_shift ON shift_reconciliation(shift_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_date ON shift_reconciliation(opening_date);
CREATE INDEX IF NOT EXISTS idx_reconciliation_branch ON shift_reconciliation(branch_id);

-- Hardware configuration
CREATE TABLE IF NOT EXISTS hardware_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  device_type text NOT NULL CHECK (device_type IN ('receipt_printer', 'label_printer', 'barcode_scanner', 'cash_drawer', 'customer_display', 'pos_terminal')),
  device_name text NOT NULL,
  device_model text DEFAULT '',
  connection_type text DEFAULT 'USB' CHECK (connection_type IN ('USB', 'Bluetooth', 'Network', 'Serial', 'WiFi')),
  connection_string text DEFAULT '', -- IP:port or COM port
  paper_size text DEFAULT '80mm', -- 58mm, 80mm
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}', -- Custom settings per device
  created_at timestamptz DEFAULT now(),
  tested_at timestamptz,
  created_by uuid REFERENCES profiles(id)
);

ALTER TABLE hardware_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hardware"
  ON hardware_config FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND (p.role = 'admin' OR p.branch_id = hardware_config.branch_id))
  );

CREATE POLICY "Managers can manage hardware"
  ON hardware_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')));

CREATE POLICY "Managers can update hardware"
  ON hardware_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')));

-- Receipt templates
CREATE TABLE IF NOT EXISTS receipt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  name text NOT NULL,
  language text DEFAULT 'bilingual' CHECK (language IN ('arabic', 'english', 'bilingual')),
  template_type text DEFAULT 'sales' CHECK (template_type IN ('sales', 'refund', 'shift_close', 'quote')),
  header_text text DEFAULT '',
  footer_text text DEFAULT '',
  show_logo boolean DEFAULT true,
  show_trn boolean DEFAULT true,
  show_vat_breakdown boolean DEFAULT true,
  show_barcode boolean DEFAULT false,
  template_content jsonb DEFAULT '{}',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE receipt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON receipt_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage templates"
  ON receipt_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Insert default receipt template
INSERT INTO receipt_templates (name, language, template_type, is_default, header_text, footer_text)
VALUES 
  ('Default Sales Receipt', 'bilingual', 'sales', true, 'Al Luluah Tents & Shades Trading LLC', 'Thank you for your business! | شكراً لتعاملكم معنا'),
  ('Arabic Receipt', 'arabic', 'sales', false, 'خيمة و مظلات اللؤلؤة للتسليك', 'شكراً لتعاملكم معنا'),
  ('English Receipt', 'english', 'sales', false, 'Al Luluah Tents & Shades', 'Thank you for your business!')
ON CONFLICT DO NOTHING;

-- Insert default hardware for each branch
DO $$
DECLARE
  branch_rec RECORD;
  company_id uuid;
BEGIN
  SELECT id INTO company_id FROM companies LIMIT 1;
  
  FOR branch_rec IN SELECT id FROM branches WHERE is_active = true LOOP
    -- Receipt printer
    INSERT INTO hardware_config (branch_id, device_type, device_name, connection_type, is_default)
    VALUES (branch_rec.id, 'receipt_printer', 'Thermal Receipt Printer', 'USB', true);
    
    -- Cash drawer
    INSERT INTO hardware_config (branch_id, device_type, device_name, connection_type, is_default)
    VALUES (branch_rec.id, 'cash_drawer', 'Cash Drawer', 'USB', true);
    
    -- Barcode scanner
    INSERT INTO hardware_config (branch_id, device_type, device_name, connection_type, is_default)
    VALUES (branch_rec.id, 'barcode_scanner', 'Barcode Scanner', 'USB', true);
    
    -- Customer display
    INSERT INTO hardware_config (branch_id, device_type, device_name, connection_type, is_default)
    VALUES (branch_rec.id, 'customer_display', 'Customer Display', 'USB', false);
    
    -- Cash drawer device
    INSERT INTO cash_drawers (branch_id, name, drawer_code, status)
    VALUES (branch_rec.id, 'Main Cash Drawer', 'DRW-01', 'closed');
  END LOOP;
END $$;
