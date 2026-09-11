/*
# Company Assets Storage Policies + Biometric Attendance Integration

## Summary
1. Adds storage policies to the existing `company-assets` bucket so authenticated users can read and admin/manager users can upload/update/delete company logos.
2. Adds `biometric_user_id` column to the `employees` table for linking biometric machine user IDs to ERP employees.
3. Adds `overtime_rate` column to `employees` (currently only `overtime_rates` exists — this adds the singular alias the frontend type expects).
4. Creates three new tables for biometric attendance device integration:
   - `attendance_devices` — device settings (ZKTeco, generic, manual)
   - `attendance_punches` — raw punch records from devices or CSV import
   - `attendance_device_sync_logs` — sync attempt history and errors

## Storage Policies
- Public read: anyone can read company-assets (for invoice/quotation/POS logo display without auth).
- Authenticated read: authenticated users can read company-assets.
- Admin/manager upload/insert: only admin or manager roles can upload new files.
- Admin/manager update: only admin or manager roles can overwrite files.
- Admin/manager delete: only admin or manager roles can delete files.

## New Tables
- `attendance_devices`: id, branch_id, device_name, device_type, ip_address, port, location, connection_status, last_sync_at, settings, is_active, created_at, updated_at
- `attendance_punches`: id, employee_id, biometric_user_id, branch_id, device_id, punch_date, punch_time, punch_type, source, raw_data, is_processed, created_at
- `attendance_device_sync_logs`: id, device_id, sync_type, status, records_processed, records_imported, errors, error_details, started_at, completed_at, created_by, created_at

## Security
- RLS enabled on all new tables.
- SELECT: authenticated can read.
- INSERT/UPDATE/DELETE: admin, manager, or hr roles only.
*/

-- ============================================================
-- PART 1: Storage policies for company-assets bucket
-- ============================================================

DROP POLICY IF EXISTS "Public read company-assets" ON storage.objects;
CREATE POLICY "Public read company-assets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Authenticated read company-assets" ON storage.objects;
CREATE POLICY "Authenticated read company-assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Admin manager upload company-assets" ON storage.objects;
CREATE POLICY "Admin manager upload company-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-assets' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Admin manager update company-assets" ON storage.objects;
CREATE POLICY "Admin manager update company-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-assets' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
)
WITH CHECK (
  bucket_id = 'company-assets' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Admin manager delete company-assets" ON storage.objects;
CREATE POLICY "Admin manager delete company-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-assets' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

-- ============================================================
-- PART 2: Add biometric_user_id and overtime_rate to employees
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND table_schema = 'public' AND column_name = 'biometric_user_id'
  ) THEN
    ALTER TABLE employees ADD COLUMN biometric_user_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND table_schema = 'public' AND column_name = 'overtime_rate'
  ) THEN
    ALTER TABLE employees ADD COLUMN overtime_rate numeric DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- PART 3: Attendance device tables
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  device_name text NOT NULL,
  device_type text NOT NULL DEFAULT 'generic_csv' CHECK (device_type IN ('zkteco', 'generic_csv', 'manual')),
  ip_address text,
  port integer,
  location text,
  connection_status text NOT NULL DEFAULT 'offline' CHECK (connection_status IN ('online', 'offline', 'error', 'unknown')),
  last_sync_at timestamptz,
  settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_attendance_devices" ON attendance_devices;
CREATE POLICY "select_attendance_devices" ON attendance_devices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_attendance_devices" ON attendance_devices;
CREATE POLICY "insert_attendance_devices" ON attendance_devices FOR INSERT
  TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

DROP POLICY IF EXISTS "update_attendance_devices" ON attendance_devices;
CREATE POLICY "update_attendance_devices" ON attendance_devices FOR UPDATE
  TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

DROP POLICY IF EXISTS "delete_attendance_devices" ON attendance_devices;
CREATE POLICY "delete_attendance_devices" ON attendance_devices FOR DELETE
  TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

CREATE TABLE IF NOT EXISTS attendance_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  biometric_user_id text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  device_id uuid REFERENCES attendance_devices(id) ON DELETE SET NULL,
  punch_date date NOT NULL,
  punch_time time without time zone NOT NULL,
  punch_type text NOT NULL DEFAULT 'IN' CHECK (punch_type IN ('IN', 'OUT')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('biometric', 'csv', 'manual')),
  raw_data jsonb,
  is_processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_punches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_attendance_punches" ON attendance_punches;
CREATE POLICY "select_attendance_punches" ON attendance_punches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_attendance_punches" ON attendance_punches;
CREATE POLICY "insert_attendance_punches" ON attendance_punches FOR INSERT
  TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

DROP POLICY IF EXISTS "update_attendance_punches" ON attendance_punches;
CREATE POLICY "update_attendance_punches" ON attendance_punches FOR UPDATE
  TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

DROP POLICY IF EXISTS "delete_attendance_punches" ON attendance_punches;
CREATE POLICY "delete_attendance_punches" ON attendance_punches FOR DELETE
  TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_punches_unique_idx
  ON attendance_punches (employee_id, punch_date, punch_time, punch_type)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_punches_biometric
  ON attendance_punches (biometric_user_id, punch_date);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_date
  ON attendance_punches (punch_date);

CREATE TABLE IF NOT EXISTS attendance_device_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES attendance_devices(id) ON DELETE CASCADE,
  sync_type text NOT NULL DEFAULT 'csv_import' CHECK (sync_type IN ('zkteco_sync', 'csv_import', 'manual', 'test_connection')),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed', 'error')),
  records_processed integer NOT NULL DEFAULT 0,
  records_imported integer NOT NULL DEFAULT 0,
  errors text,
  error_details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_device_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_attendance_sync_logs" ON attendance_device_sync_logs;
CREATE POLICY "select_attendance_sync_logs" ON attendance_device_sync_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_attendance_sync_logs" ON attendance_device_sync_logs;
CREATE POLICY "insert_attendance_sync_logs" ON attendance_device_sync_logs FOR INSERT
  TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'hr'))
);

DROP POLICY IF EXISTS "delete_attendance_sync_logs" ON attendance_device_sync_logs;
CREATE POLICY "delete_attendance_sync_logs" ON attendance_device_sync_logs FOR DELETE
  TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager'))
);
