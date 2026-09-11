/*
  # HR Attendance & Payroll Tables

  Extends the HR module with daily attendance tracking, payroll processing,
  advances, deductions, and payroll approval workflow.

  1. New Tables
    - `attendance_records` — daily check-in/check-out per employee per branch/project
    - `leave_requests` — employee leave and absence tracking
    - `payroll_periods` — monthly payroll runs (created per period)
    - `payroll_items` — per-employee payroll breakdown per period
    - `salary_advances` — salary advance requests and approvals
*/

-- Attendance
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  project_id uuid,  -- FK added after projects table exists
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in_time time,
  check_out_time time,
  hours_worked numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  status text DEFAULT 'present' CHECK (status IN ('present','absent','half_day','late','early_leave','holiday','weekend','leave')),
  notes text DEFAULT '',
  marked_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read attendance"
  ON attendance_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR and managers can insert attendance"
  ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR and managers can update attendance"
  ON attendance_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "Admins can delete attendance"
  ON attendance_records FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','hr')));

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  leave_type text DEFAULT 'annual' CHECK (leave_type IN ('annual','sick','emergency','unpaid','maternity','paternity','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested numeric DEFAULT 1,
  reason text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by uuid REFERENCES profiles(id),
  rejection_reason text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read leave requests"
  ON leave_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert leave requests"
  ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "HR can update leave requests"
  ON leave_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

-- Payroll periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id),
  period_name text NOT NULL DEFAULT '',  -- e.g. "May 2026"
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','processing','approved','paid','cancelled')),
  total_gross numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  total_net numeric DEFAULT 0,
  approved_by uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  UNIQUE (branch_id, period_year, period_month)
);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payroll periods"
  ON payroll_periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR and admins can insert payroll periods"
  ON payroll_periods FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

CREATE POLICY "HR and admins can update payroll periods"
  ON payroll_periods FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

-- Payroll items (per employee per period)
CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  branch_id uuid REFERENCES branches(id),
  basic_salary numeric DEFAULT 0,
  housing_allowance numeric DEFAULT 0,
  transport_allowance numeric DEFAULT 0,
  other_allowances numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  overtime_rate numeric DEFAULT 0,
  overtime_amount numeric DEFAULT 0,
  bonus numeric DEFAULT 0,
  advance_deduction numeric DEFAULT 0,
  absence_deduction numeric DEFAULT 0,
  other_deductions numeric DEFAULT 0,
  gross_salary numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  net_salary numeric DEFAULT 0,
  days_worked integer DEFAULT 0,
  days_absent integer DEFAULT 0,
  days_leave integer DEFAULT 0,
  notes text DEFAULT '',
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (payroll_period_id, employee_id)
);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payroll items"
  ON payroll_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR can insert payroll items"
  ON payroll_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

CREATE POLICY "HR can update payroll items"
  ON payroll_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));

-- Salary advances
CREATE TABLE IF NOT EXISTS salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  advance_date date DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  reason text DEFAULT '',
  repayment_months integer DEFAULT 1,
  monthly_deduction numeric DEFAULT 0,
  amount_repaid numeric DEFAULT 0,
  balance_due numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','repaid')),
  approved_by uuid REFERENCES profiles(id),
  requested_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read salary advances"
  ON salary_advances FOR SELECT TO authenticated USING (true);

CREATE POLICY "HR can insert salary advances"
  ON salary_advances FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr')));

CREATE POLICY "HR can update salary advances"
  ON salary_advances FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','hr','accountant')));
