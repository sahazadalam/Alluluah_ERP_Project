/*
  # CRM Module Tables

  Customer Relationship Management for tracking leads, follow-ups,
  communication notes, and customer lifecycle stages.

  1. New Tables
    - `leads` — prospect and customer relationship tracking
      - status: new_lead, contacted, quoted, won, lost, follow_up
      - source: walk_in, referral, website, social_media, cold_call, other
      - priority: low, medium, high
    - `lead_activities` — timeline of all interactions per lead
      - type: call, whatsapp, email, meeting, note, follow_up
    - `lead_reminders` — scheduled follow-up reminders
*/

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id),
  company_id uuid REFERENCES companies(id),
  assigned_to uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  full_name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  whatsapp text DEFAULT '',
  company_name text DEFAULT '',
  position text DEFAULT '',
  address text DEFAULT '',
  source text DEFAULT 'walk_in' CHECK (source IN ('walk_in','referral','website','social_media','cold_call','exhibition','other')),
  status text DEFAULT 'new_lead' CHECK (status IN ('new_lead','contacted','quoted','won','lost','follow_up','inactive')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  estimated_value numeric DEFAULT 0,
  actual_value numeric DEFAULT 0,
  notes text DEFAULT '',
  lost_reason text DEFAULT '',
  next_follow_up date,
  last_contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read leads"
  ON leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert leads"
  ON leads FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

CREATE POLICY "Staff can update leads"
  ON leads FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

CREATE POLICY "Admins can delete leads"
  ON leads FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));

-- Lead activities / communication log
CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  created_by uuid REFERENCES profiles(id),
  activity_type text DEFAULT 'note' CHECK (activity_type IN ('call','whatsapp','email','meeting','note','follow_up','quotation','invoice','site_visit')),
  subject text DEFAULT '',
  description text NOT NULL DEFAULT '',
  outcome text DEFAULT '',
  duration_minutes integer DEFAULT 0,
  next_action text DEFAULT '',
  next_action_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read lead activities"
  ON lead_activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert lead activities"
  ON lead_activities FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales','cashier')));

CREATE POLICY "Staff can update lead activities"
  ON lead_activities FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager','sales')));

CREATE POLICY "Admins can delete lead activities"
  ON lead_activities FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));

-- Lead reminders
CREATE TABLE IF NOT EXISTS lead_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  reminder_date timestamptz NOT NULL,
  reminder_type text DEFAULT 'follow_up' CHECK (reminder_type IN ('follow_up','call','meeting','quotation_expiry','payment_due')),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  is_done boolean DEFAULT false,
  done_at timestamptz,
  done_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reminders"
  ON lead_reminders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert reminders"
  ON lead_reminders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Staff can update reminders"
  ON lead_reminders FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Staff can delete reminders"
  ON lead_reminders FOR DELETE TO authenticated
  USING (assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
