/*
# Restrict SECURITY DEFINER function execution grants

## Security
The database grants EXECUTE to PUBLIC by default for functions. Revoking only
from anon does not remove that inherited PUBLIC privilege. This migration
removes PUBLIC access from internal audit and profile helper functions, then
explicitly grants only the roles that need them.

## Changes
- Internal audit functions: no client role can call them directly; triggers call them internally.
- Current-user helper: authenticated users only.
- User lookup helper: anon and authenticated are intentional because it is used before login.
- Stock movement function: authenticated users only.
*/

REVOKE EXECUTE ON FUNCTION public.audit_cash_withdrawals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_expenses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_income() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_payments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_entry(
  p_table_name text, p_record_id uuid, p_action text,
  p_old_values jsonb, p_new_values jsonb, p_changed_fields text[],
  p_branch_id uuid, p_amount numeric, p_transaction_type text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_current_user_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_info() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.lookup_user_for_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid, text, numeric, text, text) TO authenticated;