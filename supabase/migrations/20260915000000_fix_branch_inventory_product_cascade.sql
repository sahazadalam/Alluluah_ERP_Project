/*
# Branch inventory delete cascade

## Problem
The inventory add and delete flow writes a product row in products and a
branch_inventory row in branch_inventory. But the branch_inventory.product_id
foreign key is only tied to products(id) without ON DELETE CASCADE, so deleting a
product from the Inventory page can fail when the branch inventory row is still
present.

## Fix
Make the branch_inventory product FK cascade delete so inventory and POS stock
records disappear cleanly when a product is deleted from the inventory catalog.
*/

ALTER TABLE IF EXISTS branch_inventory
  DROP CONSTRAINT IF EXISTS branch_inventory_product_id_fkey;

ALTER TABLE IF EXISTS branch_inventory
  ADD CONSTRAINT branch_inventory_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES products(id)
  ON DELETE CASCADE;
