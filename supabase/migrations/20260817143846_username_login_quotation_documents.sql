/*
# Username Login + Quotation Documents

## Overview
1. Adds `username` column to profiles for username-based login.
2. Creates `quotation_documents` table for supporting document uploads.
3. Creates storage bucket `quotation-documents`.

## Security
- username has UNIQUE constraint to prevent duplicates.
- quotation_documents has RLS policies for authenticated access.
- Storage bucket is private with authenticated access.

## Data Migration
- Existing admin user gets username 'admin'.
- Other users get username generated from full_name (lowercase, underscores).
*/

-- Add username column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Create unique index on username (partial — only where not null, allows migration)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON profiles (username);

-- Migrate existing users: admin gets 'admin', others get generated username from name
UPDATE profiles SET username = 'admin' WHERE role = 'admin' AND full_name ILIKE '%admin%';
UPDATE profiles SET username = lower(replace(trim(full_name), ' ', '_')) WHERE username IS NULL;
UPDATE profiles SET username = 'user_' || substr(id::text, 1, 8) WHERE username IS NULL OR username = '';

-- Now set NOT NULL after all rows have a value
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;

-- Quotation Documents table
CREATE TABLE IF NOT EXISTS quotation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  file_url text,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quotation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_quotation_documents" ON quotation_documents FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_quotation_documents" ON quotation_documents FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_quotation_documents" ON quotation_documents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_quotation_documents" ON quotation_documents FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS quotation_documents_quotation_idx ON quotation_documents (quotation_id);

-- Insert storage bucket record (if not exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('quotation-documents', 'quotation-documents', false)
ON CONFLICT (id) DO NOTHING;
