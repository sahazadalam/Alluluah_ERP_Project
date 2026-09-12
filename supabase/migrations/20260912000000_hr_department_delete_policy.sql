DROP POLICY IF EXISTS "Admins can delete departments" ON departments;

CREATE POLICY "HR/Admin can delete departments"
  ON departments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'manager', 'hr')
    )
  );
