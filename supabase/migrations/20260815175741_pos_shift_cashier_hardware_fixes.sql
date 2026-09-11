/*
# POS Shift, Cashier, and Hardware Fixes

## Overview
Fixes POS shift workflow, cashier connection, and hardware settings storage.

## Security Changes
- Cashiers can now close their own shift reconciliation records (previously admin/manager only).
- POS transactions record cashier_id and cashier_name for audit.
- POS sessions enforce one active shift per cashier+branch via partial unique index.

## Important Notes
1. No existing data is lost — all columns are added with defaults.
2. Shift close is now allowed by the shift owner OR admin/manager.
3. Hardware settings are stored per-branch for printer mode, receipt width, and cash drawer config.
*/

-- Add cashier fields to pos_transactions
ALTER TABLE pos_transactions
  ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cashier_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES pos_sessions(id);

-- Add cashier_name to pos_sessions for quick display
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS cashier_name text DEFAULT '';

-- Prevent multiple active shifts for same cashier+branch
CREATE UNIQUE INDEX IF NOT EXISTS pos_sessions_one_active_per_cashier_branch
  ON pos_sessions (cashier_id, branch_id)
  WHERE status = 'open';

-- Create POS hardware settings table
CREATE TABLE IF NOT EXISTS pos_hardware_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  printer_mode text NOT NULL DEFAULT 'browser' CHECK (printer_mode IN ('browser', 'qz_tray', 'webusb')),
  printer_name text DEFAULT '',
  receipt_width text NOT NULL DEFAULT '80mm' CHECK (receipt_width IN ('58mm', '80mm')),
  cash_drawer_enabled boolean NOT NULL DEFAULT true,
  cash_drawer_command text DEFAULT '\x1B\x70\x00\x19\xFA',
  auto_open_drawer boolean NOT NULL DEFAULT true,
  test_printed_at timestamptz,
  test_drawer_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id)
);

ALTER TABLE pos_hardware_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_hardware_settings_select" ON pos_hardware_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.role = 'admin' OR p.branch_id = pos_hardware_settings.branch_id))
  );

CREATE POLICY "pos_hardware_settings_insert" ON pos_hardware_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'manager'))
  );

CREATE POLICY "pos_hardware_settings_update" ON pos_hardware_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'manager'))
  );

CREATE POLICY "pos_hardware_settings_delete" ON pos_hardware_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.role = 'admin')
  );

-- Fix shift_reconciliation UPDATE policy: allow shift owner (cashier_id) to close their own shift
DROP POLICY IF EXISTS "Managers can verify reconciliation" ON shift_reconciliation;
CREATE POLICY "shift_reconciliation_update" ON shift_reconciliation FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.role IN ('admin', 'manager') OR p.id = shift_reconciliation.cashier_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.role IN ('admin', 'manager') OR p.id = shift_reconciliation.cashier_id))
  );
