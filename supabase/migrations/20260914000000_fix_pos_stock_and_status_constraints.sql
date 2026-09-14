/*
# POS checkout and return constraint alignment

## Problem
The POS sale and return helpers write stock movement records with
movement_type values POS_SALE and POS_RETURN, but the existing
stock_movements table check constraint only allows stock_in, stock_out,
and adjustment. The POS transaction status field also rejects the return
status value returned that the UI writes for refunds.

## Fix
Broaden the runtime check constraints to match the ERP helper and UI writes.
*/

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'stock_in',
    'stock_out',
    'adjustment',
    'POS_SALE',
    'POS_RETURN',
    'transfer_in',
    'transfer_out'
  ));

ALTER TABLE pos_transactions
  DROP CONSTRAINT IF EXISTS pos_transactions_status_check;

ALTER TABLE pos_transactions
  ADD CONSTRAINT pos_transactions_status_check
  CHECK (status IN ('completed', 'voided', 'refunded', 'returned'));
