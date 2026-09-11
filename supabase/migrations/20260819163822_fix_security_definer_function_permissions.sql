/*
# Fix SECURITY DEFINER function permissions

## Problem
Several SECURITY DEFINER functions are executable by the anon role, meaning
unauthenticated users could call them. Audit functions and get_current_user_info
should only be callable by authenticated users. handle_new_user is a trigger
function that should not be directly executable.

## Changes
1. Revoke EXECUTE from anon on audit functions and get_current_user_info
2. Revoke EXECUTE from anon and authenticated on handle_new_user (trigger only)
3. Set search_path = public on all SECURITY DEFINER functions
*/

REVOKE EXECUTE ON FUNCTION public.audit_cash_withdrawals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_expenses() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_income() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_payments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_info() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_current_user_info() SET search_path = public;
ALTER FUNCTION public.log_audit_entry(
  p_table_name text, p_record_id uuid, p_action text,
  p_old_values jsonb, p_new_values jsonb, p_changed_fields text[],
  p_branch_id uuid, p_amount numeric, p_transaction_type text
) SET search_path = public;
ALTER FUNCTION public.audit_expenses() SET search_path = public;
ALTER FUNCTION public.audit_income() SET search_path = public;
ALTER FUNCTION public.audit_cash_withdrawals() SET search_path = public;
ALTER FUNCTION public.audit_payments() SET search_path = public;
ALTER FUNCTION public.lookup_user_for_login(text) SET search_path = public;