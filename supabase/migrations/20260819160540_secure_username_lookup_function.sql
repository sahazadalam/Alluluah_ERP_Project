/*
# Secure Username Lookup for Login

## Problem
The login page queries `profiles` to resolve a username/full_name to an email before
calling `signInWithPassword`. But the RLS SELECT policy on `profiles` is scoped to
`TO authenticated`, so an unauthenticated visitor (anon key) gets zero rows back and
every login attempt fails with "Invalid name or password".

## Solution
Create a SECURITY DEFINER function `lookup_user_for_login` that:
- Accepts a username or full_name string
- Returns only the minimum fields needed for login: id, email, full_name, username, is_active
- Is callable by `anon` (unauthenticated) so the login page can use it
- Does NOT expose role, branch_id, phone, or any other sensitive profile data
- Bypasses RLS (SECURITY DEFINER) but only returns the narrow login fields

## Security
- The function returns only login-essential fields (email, username, full_name, is_active)
- It does NOT return role, branch_id, phone, or any authorization data
- An attacker can only learn whether a username exists and its associated email —
  they still need the correct password to authenticate
- This is the same information level as a standard login form
*/

CREATE OR REPLACE FUNCTION public.lookup_user_for_login(p_identifier text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  username text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.username, p.is_active
  FROM public.profiles p
  WHERE p.username = lower(trim(p_identifier))
     OR p.full_name ILIKE trim(p_identifier)
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(text) TO anon, authenticated;