/*
  # Fix invoice_items and quotation_items RLS policies

  ## Problem
  1. The insert/update/delete policies for invoice_items and quotation_items only allow
     ['admin','manager','sales'] and ['admin','manager','sales','accountant'] roles.
     The 'cashier' role cannot insert items, causing silent failures.
  2. The quotation_items policies also miss 'accountant' which should be able to create quotes.

  ## Changes
  - Drop and recreate insert/update/delete policies on invoice_items to include 'cashier'
  - Drop and recreate insert/update/delete policies on quotation_items to include 'cashier' and 'accountant'
  - This matches the parent table (invoices/quotations) access patterns
*/

-- Fix invoice_items policies
DROP POLICY IF EXISTS "Sales staff can insert invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Sales staff can update invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Sales staff can delete invoice items" ON invoice_items;

CREATE POLICY "Staff can insert invoice items"
  ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can update invoice items"
  ON invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can delete invoice items"
  ON invoice_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

-- Fix quotation_items policies
DROP POLICY IF EXISTS "Sales staff can insert quotation items" ON quotation_items;
DROP POLICY IF EXISTS "Sales staff can update quotation items" ON quotation_items;
DROP POLICY IF EXISTS "Sales staff can delete quotation items" ON quotation_items;

CREATE POLICY "Staff can insert quotation items"
  ON quotation_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can update quotation items"
  ON quotation_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can delete quotation items"
  ON quotation_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

-- Also fix parent table quotations insert policy to include cashier
DROP POLICY IF EXISTS "Sales staff can insert quotations" ON quotations;
DROP POLICY IF EXISTS "Sales staff can update quotations" ON quotations;

CREATE POLICY "Staff can insert quotations"
  ON quotations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can update quotations"
  ON quotations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

-- Fix invoices insert/update policy to include cashier
DROP POLICY IF EXISTS "Sales staff can insert invoices" ON invoices;
DROP POLICY IF EXISTS "Sales staff can update invoices" ON invoices;

CREATE POLICY "Staff can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));

CREATE POLICY "Staff can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','manager','sales','accountant','cashier')
  ));
