/*
  # Multi-Branch ERP - Core Branch Management
  
  1. Companies - Support multiple companies in one system
  2. Branches - Each company can have multiple branches
  3. Branch assignments for all transactional data
  4. Stock transfers between branches
*/

-- Companies table (for future multi-company support)
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text DEFAULT '',
  trn text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  logo_url text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read companies"
  ON companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage companies"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update companies"
  ON companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) DEFAULT NULL,
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  manager_id uuid,
  is_active boolean DEFAULT true,
  is_head_office boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read branches"
  ON branches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage branches"
  ON branches FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update branches"
  ON branches FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Insert default company
INSERT INTO companies (name, legal_name, trn, address, is_active)
VALUES ('Al Luluah Tents & Sheds', 'Al Luluah Tents & Shades Trading LLC', '100XXXXXXXXX15003', 'Dubai, UAE', true)
ON CONFLICT DO NOTHING;

-- Insert default branches (3 branches as requested)
DO $$
DECLARE
  company_id uuid;
BEGIN
  SELECT id INTO company_id FROM companies LIMIT 1;
  
  INSERT INTO branches (company_id, name, code, is_head_office, is_active) VALUES
    (company_id, 'Head Office - Dubai', 'DXB-HO', true, true),
    (company_id, 'Abu Dhabi Branch', 'AUH-01', false, true),
    (company_id, 'Sharjah Branch', 'SHJ-01', false, true)
  ON CONFLICT (code) DO NOTHING;
END $$;

-- Add branch_id to profiles table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'branch_id') THEN
    ALTER TABLE profiles ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;
END $$;

-- Add company_id to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'company_id') THEN
    ALTER TABLE profiles ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;
