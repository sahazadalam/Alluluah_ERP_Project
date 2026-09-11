/*
# Fix: Allow admins to update any user's profile

## Problem
The UPDATE policy on profiles only allows auth.uid() = id, so when an admin
edits another user role or branch assignment from Settings, the update silently
fails. Admins need to manage all users.

## Solution
Update the UPDATE policy to also allow admins (role = admin) to update any profile.
Add a DELETE policy so admins can remove users.
*/

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile or admin updates any"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
)
WITH CHECK (
  auth.uid() = id
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);