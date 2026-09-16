/*
  Allow authorized POS users to record sale/return movement history without
  restoring direct INSERT access to stock_movements.
*/

CREATE OR REPLACE FUNCTION public.record_pos_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_previous_quantity numeric,
  p_new_quantity numeric,
  p_branch_id uuid,
  p_transaction_id uuid DEFAULT NULL,
  p_cashier_id uuid DEFAULT NULL,
  p_cashier_name text DEFAULT '',
  p_shift_id uuid DEFAULT NULL,
  p_reference_number text DEFAULT '',
  p_notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_actor_branch_id uuid;
  v_movement_id uuid;
BEGIN
  SELECT role, branch_id
    INTO v_actor_role, v_actor_branch_id
  FROM profiles
  WHERE id = auth.uid()
    AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'manager', 'sales', 'cashier') THEN
    RAISE EXCEPTION 'Not authorized to record POS stock movement';
  END IF;

  IF v_actor_role <> 'admin' AND v_actor_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Not authorized for this branch';
  END IF;

  IF p_movement_type NOT IN ('POS_SALE', 'POS_RETURN') THEN
    RAISE EXCEPTION 'Invalid POS movement type';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'POS movement quantity must be greater than zero';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  INSERT INTO stock_movements (
    product_id,
    movement_type,
    quantity,
    previous_quantity,
    new_quantity,
    branch_id,
    transaction_id,
    cashier_id,
    cashier_name,
    shift_id,
    reference_number,
    notes,
    created_by
  ) VALUES (
    p_product_id,
    p_movement_type,
    p_quantity,
    p_previous_quantity,
    p_new_quantity,
    p_branch_id,
    p_transaction_id,
    p_cashier_id,
    COALESCE(p_cashier_name, ''),
    p_shift_id,
    COALESCE(p_reference_number, ''),
    COALESCE(p_notes, ''),
    auth.uid()
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_stock_movement(uuid, text, numeric, numeric, numeric, uuid, uuid, uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_pos_stock_movement(uuid, text, numeric, numeric, numeric, uuid, uuid, uuid, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_pos_stock_movement(uuid, text, numeric, numeric, numeric, uuid, uuid, uuid, text, uuid, text, text) TO authenticated;
