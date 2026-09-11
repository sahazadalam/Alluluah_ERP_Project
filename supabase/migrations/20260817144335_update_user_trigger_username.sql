/*
# Update handle_new_user trigger to copy username and branch_id from auth metadata

The existing trigger only copies full_name and role. New users created via
the Settings page now also pass username and branch_id in the signUp metadata,
so the trigger must copy those into the profiles row too.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  BEGIN
    INSERT INTO profiles (id, email, full_name, username, role, branch_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'username', lower(replace(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))), ' ', '_'))),
      COALESCE(NEW.raw_user_meta_data->>'role', 'sales'),
      NULLIF(NEW.raw_user_meta_data->>'branch_id', '')::uuid
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
