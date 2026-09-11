/*
# Secure Barcode Stock Updates

## Overview
This migration moves barcode scanner stock changes behind a database function that checks the signed-in user's ERP role and performs the product update plus movement history insert together.

## Security Changes
- Only `admin`, `manager`, and `inventory` profiles may update stock through the function.
- Authenticated users may read stock movement history but cannot directly insert, update, or delete movement rows.
- Authenticated users may no longer directly update `products.stock_quantity`; the protected function is the only stock-count write path.
- The function derives `created_by` from `auth.uid()` and never trusts a client-supplied actor.
- Negative stock is rejected for stock-out operations.

## Important Notes
1. Existing product editing remains available for non-stock fields.
2. Stock changes are atomic: the product quantity and history record succeed or fail together.
3. The function uses a fixed search path and is executable only by authenticated users.
*/

CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_notes text DEFAULT '',
  p_reference_number text DEFAULT ''
)
RETURNS TABLE (new_quantity numeric, movement_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_product products%ROWTYPE;
  v_new_quantity numeric;
  v_movement_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'inventory') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_movement_type NOT IN ('stock_in', 'stock_out', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid movement type';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF p_movement_type = 'stock_in' THEN
    v_new_quantity := COALESCE(v_product.stock_quantity, 0) + p_quantity;
  ELSIF p_movement_type = 'stock_out' THEN
    v_new_quantity := COALESCE(v_product.stock_quantity, 0) - p_quantity;
    IF v_new_quantity < 0 THEN
      RAISE EXCEPTION 'Insufficient stock';
    END IF;
  ELSE
    v_new_quantity := p_quantity;
  END IF;

  UPDATE products
  SET stock_quantity = v_new_quantity, updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO stock_movements (
    product_id, barcode, movement_type, quantity, previous_quantity,
    new_quantity, notes, reference_number, created_by
  ) VALUES (
    p_product_id, v_product.barcode, p_movement_type, p_quantity,
    COALESCE(v_product.stock_quantity, 0), v_new_quantity,
    COALESCE(p_notes, ''), COALESCE(p_reference_number, ''), auth.uid()
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_new_quantity, v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_movement(uuid, text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_movement(uuid, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid, text, numeric, text, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON stock_movements FROM authenticated;
GRANT SELECT ON stock_movements TO authenticated;

REVOKE UPDATE (stock_quantity) ON products FROM authenticated;
