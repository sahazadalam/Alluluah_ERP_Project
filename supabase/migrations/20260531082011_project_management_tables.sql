/*
  # Project Management Tables

  Full project tracking including employee assignments, daily site attendance,
  work progress reports, material usage, and image uploads.

  1. New Tables
    - `projects` — main project records linked to customers
    - `project_assignments` — employees assigned to a project/site
    - `project_attendance` — daily worker attendance per project
    - `project_progress` — daily work progress reports with notes and image URLs
    - `project_expenses` — project-level expense tracking
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  description text DEFAULT '',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text DEFAULT '',
  branch_id uuid REFERENCES branches(id),
  company_id uuid REFERENCES companies(id),
  site_address text DEFAULT '',
  contract_value numeric DEFAULT 0,
  estimated_cost numeric DEFAULT 0,
  actual_cost numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','active','on_hold','completed','cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  start_date date,
  end_date date,
  actual_end_date date,
  manager_id uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert projects"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));

CREATE POLICY "Staff can update projects"
  ON projects FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin')));

-- Employee assignments to projects
CREATE TABLE IF NOT EXISTS project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  role_on_project text DEFAULT 'worker' CHECK (role_on_project IN ('supervisor','foreman','worker','driver','helper','engineer','other')),
  daily_rate numeric DEFAULT 0,
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean DEFAULT true,
  notes text DEFAULT '',
  assigned_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, employee_id)
);

ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project assignments"
  ON project_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert project assignments"
  ON project_assignments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Managers can update project assignments"
  ON project_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Admins can delete project assignments"
  ON project_assignments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));

-- Daily project site attendance
CREATE TABLE IF NOT EXISTS project_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in_time time,
  check_out_time time,
  hours_worked numeric DEFAULT 8,
  overtime_hours numeric DEFAULT 0,
  status text DEFAULT 'present' CHECK (status IN ('present','absent','half_day','late')),
  notes text DEFAULT '',
  marked_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, employee_id, attendance_date)
);

ALTER TABLE project_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project attendance"
  ON project_attendance FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert project attendance"
  ON project_attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Managers can update project attendance"
  ON project_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

-- Daily work progress reports
CREATE TABLE IF NOT EXISTS project_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  workers_count integer DEFAULT 0,
  work_completed text DEFAULT '',
  work_pending text DEFAULT '',
  materials_used text DEFAULT '',
  issues text DEFAULT '',
  notes text DEFAULT '',
  weather text DEFAULT '',
  progress_percent integer DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  image_urls text[] DEFAULT '{}',
  reported_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project progress"
  ON project_progress FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert project progress"
  ON project_progress FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Managers can update project progress"
  ON project_progress FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

-- Project expenses
CREATE TABLE IF NOT EXISTS project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  expense_date date DEFAULT CURRENT_DATE,
  category text DEFAULT 'materials' CHECK (category IN ('materials','labor','transport','equipment','subcontract','other')),
  description text NOT NULL DEFAULT '',
  amount numeric DEFAULT 0,
  reference text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project expenses"
  ON project_expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert project expenses"
  ON project_expenses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

CREATE POLICY "Managers can update project expenses"
  ON project_expenses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

-- Add FK from attendance_records to projects now that projects table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'attendance_records' AND column_name = 'project_id'
    AND constraint_name LIKE 'attendance_records_project_id_fkey'
  ) THEN
    ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create sequences for project numbers
CREATE SEQUENCE IF NOT EXISTS project_seq START 1000;
