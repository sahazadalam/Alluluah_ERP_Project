/**
 * Shared stock management for POS and Inventory modules.
 * All stock changes go through these functions to ensure consistency.
 */

import { supabase } from './supabase';

export type MovementType =
  | 'stock_in'
  | 'stock_out'
  | 'adjustment'
  | 'POS_SALE'
  | 'POS_RETURN'
  | 'transfer_in'
  | 'transfer_out';

export interface StockCheckResult {
  sufficient: boolean;
  available: number;
  requested: number;
  message?: string;
}

export interface StockDeductionResult {
  success: boolean;
  message: string;
  movements?: Array<{ product_id: string; previous_stock: number; new_stock: number }>;
}

/**
 * Get the current stock for a product at a specific branch.
 * Falls back to product.stock_quantity if no branch_inventory row exists.
 */
export async function getBranchStock(productId: string, branchId: string | null): Promise<number> {
  if (!branchId) {
    const { data } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', productId)
      .maybeSingle();
    return Number(data?.stock_quantity ?? 0);
  }

  const { data } = await supabase
    .from('branch_inventory')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (data) return Number(data.quantity);

  // Fallback: check product's own stock_quantity
  const { data: prod } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .maybeSingle();
  return Number(prod?.stock_quantity ?? 0);
}

/**
 * Check if sufficient stock exists for a sale.
 */
export async function checkStock(
  items: Array<{ product_id: string; quantity: number }>,
  branchId: string | null,
  preventNegative: boolean = true
): Promise<StockCheckResult> {
  for (const item of items) {
    const available = await getBranchStock(item.product_id, branchId);
    if (preventNegative && item.quantity > available) {
      return {
        sufficient: false,
        available,
        requested: item.quantity,
        message: `Insufficient stock. Available: ${available}`,
      };
    }
  }
  return { sufficient: true, available: 0, requested: 0 };
}

/**
 * Deduct stock for a POS sale. Updates branch_inventory and creates stock_movement records.
 * Also updates the product's stock_quantity for backward compatibility.
 */
export async function deductStockForSale(
  items: Array<{ product_id: string; quantity: number }>,
  branchId: string | null,
  transactionId: string,
  cashierId: string | null,
  cashierName: string,
  shiftId: string | null,
  transactionNumber: string
): Promise<StockDeductionResult> {
  const movements: Array<{ product_id: string; previous_stock: number; new_stock: number }> = [];

  for (const item of items) {
    const currentStock = await getBranchStock(item.product_id, branchId);
    const newStock = currentStock - item.quantity;

    // Update branch_inventory
    if (branchId) {
      const { data: existing } = await supabase
        .from('branch_inventory')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('branch_inventory')
          .update({ quantity: newStock })
          .eq('id', existing.id);
        if (error) {
          return { success: false, message: `Failed to update stock: ${error.message}` };
        }
      } else {
        const { error } = await supabase
          .from('branch_inventory')
          .insert({ branch_id: branchId, product_id: item.product_id, quantity: newStock });
        if (error) {
          return { success: false, message: `Failed to create inventory: ${error.message}` };
        }
      }
    }

    // Update product stock_quantity (backward compat)
    await supabase
      .from('products')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', item.product_id);

    // Create stock movement record
    const { error: moveErr } = await supabase.rpc('record_pos_stock_movement', {
      p_product_id: item.product_id,
      p_movement_type: 'POS_SALE',
      p_quantity: item.quantity,
      p_previous_quantity: currentStock,
      p_new_quantity: newStock,
      p_branch_id: branchId,
      p_transaction_id: transactionId,
      p_cashier_id: cashierId,
      p_cashier_name: cashierName,
      p_shift_id: shiftId,
      p_reference_number: transactionNumber,
      p_notes: `POS Sale: ${transactionNumber}`,
    });

    if (moveErr) {
      return { success: false, message: `Failed to record stock movement: ${moveErr.message}` };
    }

    movements.push({ product_id: item.product_id, previous_stock: currentStock, new_stock: newStock });
  }

  return { success: true, message: 'Stock deducted successfully', movements };
}

/**
 * Restore stock for a POS return/refund. Increases branch_inventory and creates stock_movement records.
 */
export async function restoreStockForReturn(
  items: Array<{ product_id: string; quantity: number }>,
  branchId: string | null,
  transactionId: string,
  originalTransactionId: string,
  cashierId: string | null,
  cashierName: string,
  shiftId: string | null,
  returnNumber: string
): Promise<StockDeductionResult> {
  const movements: Array<{ product_id: string; previous_stock: number; new_stock: number }> = [];

  for (const item of items) {
    const currentStock = await getBranchStock(item.product_id, branchId);
    const newStock = currentStock + item.quantity;

    // Update branch_inventory
    if (branchId) {
      const { data: existing } = await supabase
        .from('branch_inventory')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (existing) {
        const { error: updErr } = await supabase
          .from('branch_inventory')
          .update({ quantity: newStock })
          .eq('id', existing.id);
        if (updErr) return { success: false, message: `Failed to update inventory: ${updErr.message}` };
      } else {
        const { error: insErr } = await supabase
          .from('branch_inventory')
          .insert({ branch_id: branchId, product_id: item.product_id, quantity: newStock });
        if (insErr) return { success: false, message: `Failed to create inventory: ${insErr.message}` };
      }
    }

    // Update product stock_quantity
    const { error: prodErr } = await supabase
      .from('products')
      .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
      .eq('id', item.product_id);
    if (prodErr) return { success: false, message: `Failed to update product stock: ${prodErr.message}` };

    // Create stock movement record
    const { error: moveErr } = await supabase.rpc('record_pos_stock_movement', {
      p_product_id: item.product_id,
      p_movement_type: 'POS_RETURN',
      p_quantity: item.quantity,
      p_previous_quantity: currentStock,
      p_new_quantity: newStock,
      p_branch_id: branchId,
      p_transaction_id: transactionId,
      p_cashier_id: cashierId,
      p_cashier_name: cashierName,
      p_shift_id: shiftId,
      p_reference_number: returnNumber,
      p_notes: `POS Return: ${returnNumber} (Original: ${originalTransactionId})`,
    });
    if (moveErr) return { success: false, message: `Failed to record stock movement: ${moveErr.message}` };

    movements.push({ product_id: item.product_id, previous_stock: currentStock, new_stock: newStock });
  }

  return { success: true, message: 'Stock restored successfully', movements };
}

/**
 * Record a stock adjustment (from Inventory module). Creates a stock_movement and updates branch_inventory.
 */
export async function recordStockAdjustment(
  productId: string,
  branchId: string | null,
  newQuantity: number,
  oldQuantity: number,
  notes: string,
  userId: string | null
): Promise<{ success: boolean; message: string }> {
  // Update branch_inventory
  if (branchId) {
    const { data: existing } = await supabase
      .from('branch_inventory')
      .select('id')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from('branch_inventory')
        .update({ quantity: newQuantity })
        .eq('id', existing.id);
      if (updErr) return { success: false, message: `Failed to update inventory: ${updErr.message}` };
    } else {
      const { error: insErr } = await supabase
        .from('branch_inventory')
        .insert({ branch_id: branchId, product_id: productId, quantity: newQuantity });
      if (insErr) return { success: false, message: `Failed to create inventory: ${insErr.message}` };
    }
  }

  // Update product stock_quantity
  const { error: prodErr } = await supabase
    .from('products')
    .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
    .eq('id', productId);
  if (prodErr) return { success: false, message: `Failed to update product stock: ${prodErr.message}` };

  // Create stock movement
  const movementType = newQuantity > oldQuantity ? 'stock_in' : newQuantity < oldQuantity ? 'stock_out' : 'adjustment';
  const { error } = await supabase.from('stock_movements').insert({
    product_id: productId,
    movement_type: movementType,
    quantity: Math.abs(newQuantity - oldQuantity),
    previous_quantity: oldQuantity,
    new_quantity: newQuantity,
    branch_id: branchId,
    notes: notes || 'Manual stock adjustment',
    reference_number: `ADJ-${Date.now().toString().slice(-6)}`,
    created_by: userId,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: 'Stock adjusted successfully' };
}

/**
 * Get stock movement history for a product.
 */
export async function getStockHistory(productId: string, branchId?: string | null) {
  let query = supabase
    .from('stock_movements')
    .select('*, product:products(name, code)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Stock history error:', error);
    return [];
  }
  return data ?? [];
}
