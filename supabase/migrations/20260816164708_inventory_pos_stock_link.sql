/*
# Inventory-POS Stock Link

## Overview
Links POS sales to inventory stock. Adds branch_id, transaction_id, cashier_id
to stock_movements for full traceability. Adds prevent_negative_stock setting.

## Security Changes
- stock_movements now records branch_id for branch-scoped tracking.
- No new tables created; only additive columns.

## Important Notes
1. No existing data is lost — all columns are added with safe defaults.
2. stock_movements gets new optional columns for POS sale/return tracking.
3. pos_hardware_settings gets prevent_negative_stock boolean (default true).
*/

-- Add branch_id, transaction_id, cashier_id to stock_movements
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES pos_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES pos_sessions(id) ON DELETE SET NULL;

-- Add prevent_negative_stock to pos_hardware_settings
ALTER TABLE pos_hardware_settings
  ADD COLUMN IF NOT EXISTS prevent_negative_stock boolean NOT NULL DEFAULT true;

-- Add index for faster branch-scoped queries
CREATE INDEX IF NOT EXISTS stock_movements_branch_product_idx
  ON stock_movements (branch_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_transaction_idx
  ON stock_movements (transaction_id);

-- Ensure every product has a branch_inventory row for its branch
-- (Run once to migrate existing product stock into branch_inventory)
INSERT INTO branch_inventory (branch_id, product_id, quantity)
SELECT p.branch_id, p.id, p.stock_quantity
FROM products p
WHERE p.branch_id IS NOT NULL
  AND p.stock_quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM branch_inventory bi
    WHERE bi.branch_id = p.branch_id AND bi.product_id = p.id
  )
ON CONFLICT DO NOTHING;
