-- Project history, progress persistence, and branch/company-scoped access.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0
  CHECK (progress_percent BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS project_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  company_id uuid REFERENCES companies(id),
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read project activities"
  ON project_activities FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (project_activities.branch_id IS NOT NULL AND p.branch_id = project_activities.branch_id)
          OR (project_activities.company_id IS NOT NULL AND p.company_id = project_activities.company_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION record_project_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_row projects%ROWTYPE;
  current_row jsonb;
  project_id_value uuid;
  activity_branch_id uuid;
  activity_company_id uuid;
  activity_description text;
BEGIN
  current_row := to_jsonb(NEW);
  project_id_value := CASE
    WHEN TG_TABLE_NAME = 'projects' THEN (current_row->>'id')::uuid
    ELSE (current_row->>'project_id')::uuid
  END;

  SELECT * INTO project_row FROM projects WHERE id = project_id_value;
  activity_branch_id := COALESCE((current_row->>'branch_id')::uuid, project_row.branch_id);
  activity_company_id := project_row.company_id;
  activity_description := CASE TG_TABLE_NAME
    WHEN 'projects' THEN format('Project %s %s', lower(TG_OP), COALESCE(current_row->>'name', project_row.name))
    WHEN 'project_assignments' THEN format('Team assignment %s', lower(TG_OP))
    WHEN 'project_progress' THEN format('Progress report %s', lower(TG_OP))
    WHEN 'project_expenses' THEN format('Project expense %s', lower(TG_OP))
    ELSE format('Project record %s', lower(TG_OP))
  END;

  INSERT INTO project_activities (project_id, branch_id, company_id, activity_type, description, metadata, created_by)
  VALUES (
    project_id_value,
    activity_branch_id,
    activity_company_id,
    lower(TG_TABLE_NAME || '_' || TG_OP),
    activity_description,
    current_row,
    COALESCE((current_row->>'created_by')::uuid, (current_row->>'reported_by')::uuid, (current_row->>'assigned_by')::uuid)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_activity_trigger ON projects;
CREATE TRIGGER projects_activity_trigger
  AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION record_project_activity();

DROP TRIGGER IF EXISTS project_assignments_activity_trigger ON project_assignments;
CREATE TRIGGER project_assignments_activity_trigger
  AFTER INSERT OR UPDATE ON project_assignments
  FOR EACH ROW EXECUTE FUNCTION record_project_activity();

DROP TRIGGER IF EXISTS project_progress_activity_trigger ON project_progress;
CREATE TRIGGER project_progress_activity_trigger
  AFTER INSERT OR UPDATE ON project_progress
  FOR EACH ROW EXECUTE FUNCTION record_project_activity();

DROP TRIGGER IF EXISTS project_expenses_activity_trigger ON project_expenses;
CREATE TRIGGER project_expenses_activity_trigger
  AFTER INSERT OR UPDATE ON project_expenses
  FOR EACH ROW EXECUTE FUNCTION record_project_activity();

DROP POLICY IF EXISTS "Authenticated users can read projects" ON projects;
CREATE POLICY "Authorized users can read projects"
  ON projects FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (projects.branch_id IS NOT NULL AND p.branch_id = projects.branch_id)
          OR (projects.company_id IS NOT NULL AND p.company_id = projects.company_id)
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read project assignments" ON project_assignments;
CREATE POLICY "Authorized users can read project assignments"
  ON project_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_assignments.project_id));

DROP POLICY IF EXISTS "Authenticated users can read project progress" ON project_progress;
CREATE POLICY "Authorized users can read project progress"
  ON project_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_progress.project_id));

DROP POLICY IF EXISTS "Authenticated users can read project expenses" ON project_expenses;
CREATE POLICY "Authorized users can read project expenses"
  ON project_expenses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_expenses.project_id));