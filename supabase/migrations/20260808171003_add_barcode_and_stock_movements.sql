/*
# Add Barcode Field to Products + Stock Movements Table

## Overview
This migration adds barcode support to the products table and creates a stock_movements table for tracking all inventory changes (stock in, stock out, adjustments). It enables barcode-based inventory management throughout the ERP.

## Changes to Products Table
- `barcode` (text, unique) — unique product barcode for scanning. Nullable so existing products are not affected. A unique index ensures no duplicates.

## New Table: stock_movements
Tracks every stock change for audit and history purposes.
- `id` (uuid, primary key, auto-generated)
- `product_id` (uuid, references products, cascade delete)
- `barcode` (text) — the barcode that was scanned, if applicable
- `movement_type` (text, check constraint: stock_in, stock_out, adjustment)
- `quantity` (numeric, not null) — the amount changed
- `previous_quantity` (numeric) — stock before the change
- `new_quantity` (numeric) — stock after the change
- `notes` (text) — optional notes
- `reference_number` (text) — optional reference (PO number, invoice, etc.)
- `created_by` (uuid, references auth.users) — who made the change
- `created_at` (timestamptz, default now)

## Indexes
- Unique index on products.barcode
- Index on stock_movements.product_id
- Index on stock_movements.created_at

## Security (RLS)
- Products table: already has RLS enabled. The existing policies cover barcode reads/writes since barcode is just another column.
- stock_movements table: RLS enabled with authenticated-only CRUD. All authenticated ERP users can view stock movements. Only authenticated users can create movement records (the application enforces role-based access for stock modifications).

## Important Notes
1. The barcode column is nullable so existing products remain unaffected.
2. A unique index on barcode prevents duplicates at the database level.
3. Stock movements are append-only history records — they are never updated or deleted by the application.
4. The application layer enforces that only authorized roles (admin, manager, inventory) can modify stock.
*/

-- Add barcode column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;

-- Create unique index on barcode (partial — only for non-null values to allow multiple nulls)
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx ON products (barcode) WHERE barcode IS NOT NULL;

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode text,
  movement_type text NOT NULL CHECK (movement_type IN ('stock_in', 'stock_out', 'adjustment')),
  quantity numeric NOT NULL,
  previous_quantity numeric,
  new_quantity numeric,
  notes text DEFAULT '',
  reference_number text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for stock_movements
CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON stock_movements (created_at);

-- Enable RLS on stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Policies for stock_movements (authenticated-only, following ERP pattern)
DROP POLICY IF EXISTS "select_stock_movements" ON stock_movements;
CREATE POLICY "select_stock_movements"
ON stock_movements FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_stock_movements" ON stock_movements;
CREATE POLICY "insert_stock_movements"
ON stock_movements FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_stock_movements" ON stock_movements;
CREATE POLICY "update_stock_movements"
ON stock_movements FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_stock_movements" ON stock_movements;
CREATE POLICY "delete_stock_movements"
ON stock_movements FOR DELETE
TO authenticated USING (true);
