/*
  # Fix handle_new_user trigger
  Add default values for is_sso_user and is_anonymous columns
  that were added in newer Supabase versions
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Set required defaults for newer columns
  NEW.is_sso_user := COALESCE(NEW.is_sso_user, false);
  NEW.is_anonymous := COALESCE(NEW.is_anonymous, false);
  
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'sales')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;