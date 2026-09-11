/*
  # Audit Logging Functions and Triggers
  
  Automatically logs all changes to income, expenses, and cash_withdrawals
*/

-- Function to get current user info
CREATE OR REPLACE FUNCTION get_current_user_info()
RETURNS jsonb AS $$
DECLARE
  user_info jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'full_name', full_name,
    'role', role,
    'branch_id', branch_id
  ) INTO user_info
  FROM profiles 
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_info, '{"id": null, "full_name": "System", "role": "system"}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generic audit log function
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_old_values jsonb DEFAULT '{}',
  p_new_values jsonb DEFAULT '{}',
  p_changed_fields text[] DEFAULT '{}',
  p_branch_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT 0,
  p_transaction_type text DEFAULT ''
)
RETURNS void AS $$
DECLARE
  user_info jsonb;
BEGIN
  user_info := get_current_user_info();
  
  INSERT INTO audit_logs (
    table_name, record_id, action, old_values, new_values, changed_fields,
    branch_id, user_id, user_name, user_role, amount, transaction_type
  ) VALUES (
    p_table_name, p_record_id, p_action, p_old_values, p_new_values, p_changed_fields,
    COALESCE(p_branch_id, (user_info->>'branch_id')::uuid),
    (user_info->>'id')::uuid,
    user_info->>'full_name',
    user_info->>'role',
    p_amount,
    p_transaction_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for expenses audit
CREATE OR REPLACE FUNCTION audit_expenses()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_entry(
      'expenses', NEW.id, 'INSERT', '{}', to_jsonb(NEW), '{}',
      NEW.branch_id, NEW.amount, 'expense'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_entry(
      'expenses', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each_text(to_jsonb(NEW)) WHERE value IS DISTINCT FROM (to_jsonb(OLD)->>key)),
      NEW.branch_id, NEW.amount, 'expense'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_entry(
      'expenses', OLD.id, 'DELETE', to_jsonb(OLD), '{}', '{}',
      OLD.branch_id, OLD.amount, 'expense'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for income audit
CREATE OR REPLACE FUNCTION audit_income()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_entry(
      'income', NEW.id, 'INSERT', '{}', to_jsonb(NEW), '{}',
      NEW.branch_id, NEW.amount, 'income'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_entry(
      'income', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each_text(to_jsonb(NEW)) WHERE value IS DISTINCT FROM (to_jsonb(OLD)->>key)),
      NEW.branch_id, NEW.amount, 'income'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_entry(
      'income', OLD.id, 'DELETE', to_jsonb(OLD), '{}', '{}',
      OLD.branch_id, OLD.amount, 'income'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for cash_withdrawals audit
CREATE OR REPLACE FUNCTION audit_cash_withdrawals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_entry(
      'cash_withdrawals', NEW.id, 'INSERT', '{}', to_jsonb(NEW), '{}',
      NEW.branch_id, NEW.amount, 'withdrawal'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_entry(
      'cash_withdrawals', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each_text(to_jsonb(NEW)) WHERE value IS DISTINCT FROM (to_jsonb(OLD)->>key)),
      NEW.branch_id, NEW.amount, 'withdrawal'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_entry(
      'cash_withdrawals', OLD.id, 'DELETE', to_jsonb(OLD), '{}', '{}',
      OLD.branch_id, OLD.amount, 'withdrawal'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for payments audit
CREATE OR REPLACE FUNCTION audit_payments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_entry(
      'payments', NEW.id, 'INSERT', '{}', to_jsonb(NEW), '{}',
      NEW.branch_id, NEW.amount, 'payment'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit_entry(
      'payments', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each_text(to_jsonb(NEW)) WHERE value IS DISTINCT FROM (to_jsonb(OLD)->>key)),
      NEW.branch_id, NEW.amount, 'payment'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_entry(
      'payments', OLD.id, 'DELETE', to_jsonb(OLD), '{}', '{}',
      OLD.branch_id, OLD.amount, 'payment'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_expenses_trigger') THEN
    CREATE TRIGGER audit_expenses_trigger AFTER INSERT OR UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION audit_expenses();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_income_trigger') THEN
    CREATE TRIGGER audit_income_trigger AFTER INSERT OR UPDATE OR DELETE ON income FOR EACH ROW EXECUTE FUNCTION audit_income();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_payments_trigger') THEN
    CREATE TRIGGER audit_payments_trigger AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION audit_payments();
  END IF;
END $$;
