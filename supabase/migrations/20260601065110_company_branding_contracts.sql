/*
  # Company Branding & Employee Contracts

  ## Summary
  Adds logo/branding support to companies, a full employee_contracts table,
  and an app_settings table for features like the dashboard watermark.

  ## New Columns
  - `companies.logo_url` — public URL of uploaded logo
  - `companies.logo_storage_path` — storage path for deletion
  - `companies.watermark_enabled` — whether watermark shows on dashboard/reports

  ## New Tables
  1. `employee_contracts` — stores contract details per employee
     - title, start/end dates, salary_terms, job_role, notes
     - attachment_url (PDF), attachment_path (storage)
     - renewal_reminder_date, status, created/updated by
  2. `contract_audit_logs` — immutable log of create/edit/download actions
  3. `app_settings` — key/value store for global feature flags

  ## Security
  - RLS enabled on all new tables
  - Admin, HR can manage contracts
  - All roles can read app_settings
*/

-- ── Company logo columns ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'logo_url') THEN
    ALTER TABLE companies ADD COLUMN logo_url text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'logo_storage_path') THEN
    ALTER TABLE companies ADD COLUMN logo_storage_path text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'watermark_enabled') THEN
    ALTER TABLE companies ADD COLUMN watermark_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'watermark_text') THEN
    ALTER TABLE companies ADD COLUMN watermark_text text NOT NULL DEFAULT 'Tahir Muhammad';
  END IF;
END $$;

-- ── App Settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key       text NOT NULL UNIQUE,
  value     jsonb NOT NULL DEFAULT 'null',
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read settings"
  ON app_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can upsert settings"
  ON app_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update settings"
  ON app_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Employee Contracts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id             uuid REFERENCES branches(id) ON DELETE SET NULL,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,
  title                 text NOT NULL DEFAULT '',
  contract_type         text NOT NULL DEFAULT 'employment'
                        CHECK (contract_type IN ('employment','renewal','amendment','termination','probation','other')),
  start_date            date NOT NULL,
  end_date              date,
  salary_terms          text NOT NULL DEFAULT '',
  job_role              text NOT NULL DEFAULT '',
  notes                 text NOT NULL DEFAULT '',
  attachment_url        text NOT NULL DEFAULT '',
  attachment_path       text NOT NULL DEFAULT '',
  attachment_filename   text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','expired','terminated','renewed')),
  renewal_reminder_date date,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view contracts"
  ON employee_contracts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR staff can insert contracts"
  ON employee_contracts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR staff can update contracts"
  ON employee_contracts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee ON employee_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_status ON employee_contracts(status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_reminder ON employee_contracts(renewal_reminder_date);

-- ── Contract Audit Logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES employee_contracts(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  action       text NOT NULL CHECK (action IN ('created','edited','downloaded','status_changed','deleted')),
  actor_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name   text NOT NULL DEFAULT '',
  actor_role   text NOT NULL DEFAULT '',
  old_values   jsonb,
  new_values   jsonb,
  notes        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contract_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view contract audit"
  ON contract_audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR staff can insert contract audit"
  ON contract_audit_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE INDEX IF NOT EXISTS idx_contract_audit_contract ON contract_audit_logs(contract_id);
