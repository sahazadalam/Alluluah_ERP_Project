export type UserRole = 'admin' | 'manager' | 'sales' | 'accountant' | 'inventory' | 'hr' | 'cashier';

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  logo_storage_path: string;
  watermark_enabled: boolean;
  watermark_text: string;
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  company_id: string | null;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  manager_id: string | null;
  is_active: boolean;
  is_head_office: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  role: UserRole;
  email: string;
  phone: string;
  is_active: boolean;
  branch_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  branch?: Branch;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  trn: string;
  city: string;
  country: string;
  credit_limit: number;
  balance: number;
  is_active: boolean;
  notes: string;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  trn: string;
  city: string;
  country: string;
  balance: number;
  is_active: boolean;
  notes: string;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  name_ar: string;
  description: string;
  category_id: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  is_active: boolean;
  branch_id: string | null;
  barcode: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface StockMovement {
  id: string;
  product_id: string;
  barcode: string | null;
  movement_type: 'stock_in' | 'stock_out' | 'adjustment' | 'POS_SALE' | 'POS_RETURN' | 'transfer_in' | 'transfer_out';
  quantity: number;
  previous_quantity: number | null;
  new_quantity: number | null;
  notes: string;
  reference_number: string;
  created_by: string | null;
  created_at: string;
  branch_id: string | null;
  transaction_id: string | null;
  cashier_id: string | null;
  cashier_name: string;
  shift_id: string | null;
  product?: Product;
  branch?: Branch;
}

export interface BranchInventory {
  id: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  committed_quantity: number;
  reordered_at: string | null;
  product?: Product;
  branch?: Branch;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  line_total: number;
  vat_amount: number;
  total: number;
  sort_order: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_trn: string;
  issue_date: string;
  valid_until: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  notes: string;
  terms: string;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: QuotationItem[];
  documents?: QuotationDocument[];
  customer?: Customer;
  branch?: Branch;
}

export interface QuotationDocument {
  id: string;
  quotation_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  file_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  line_total: number;
  vat_amount: number;
  total: number;
  sort_order: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  quotation_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_address: string;
  customer_trn: string;
  issue_date: string;
  due_date: string | null;
  status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  subtotal: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  paid_amount: number;
  balance_due: number;
  notes: string;
  terms: string;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
  customer?: Customer;
  payments?: Payment[];
  branch?: Branch;
}

export interface Payment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'other';
  reference: string;
  notes: string;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  manager_id: string | null;
  branch_id: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string;
  department_id: string | null;
  position: string;
  salary: number;
  daily_wage: number;
  overtime_rate: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowances: number;
  bank_name: string;
  bank_account: string;
  iban: string;
  join_date: string;
  status: 'active' | 'inactive' | 'terminated' | 'on_leave';
  nationality: string;
  passport_number: string;
  emirates_id: string;
  visa_expiry: string | null;
  labor_card: string;
  emergency_contact: string;
  branch_id: string | null;
  biometric_user_id: string | null;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent_id: string | null;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  description: string;
  debit: number;
  credit: number;
  branch_id: string | null;
  account?: Account;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string;
  status: 'draft' | 'posted' | 'reversed';
  total_debit: number;
  total_credit: number;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  lines?: JournalEntryLine[];
}

export interface POSSession {
  id: string;
  session_number: string;
  cashier_id: string | null;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  status: 'open' | 'closed';
  branch_id: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface POSTransactionItem {
  id: string;
  transaction_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  product?: Product;
}

export interface POSTransaction {
  id: string;
  transaction_number: string;
  session_id: string | null;
  customer_id: string | null;
  customer_name: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'bank_transfer';
  amount_tendered: number;
  change_due: number;
  status: 'completed' | 'voided' | 'refunded' | 'returned';
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  items?: POSTransactionItem[];
}

export interface Expense {
  id: string;
  branch_id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  reference: string;
  notes: string;
  approval_status?: string;
  created_by: string | null;
  created_at: string;
  branch?: Branch;
}

export interface Income {
  id: string;
  branch_id: string;
  income_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  reference: string;
  notes: string;
  approval_status?: string;
  created_by: string | null;
  created_at: string;
  branch?: Branch;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'SOFT_DELETE' | 'RESTORE';
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  changed_fields: string[];
  branch_id: string | null;
  user_id: string | null;
  user_name: string;
  user_role: string;
  amount: number;
  transaction_type: string;
  payment_method: string;
  reason: string;
  created_at: string;
  branch?: Branch;
}

export interface CashWithdrawal {
  id: string;
  branch_id: string;
  withdrawal_number: string;
  amount: number;
  purpose: string;
  notes: string;
  payment_method: string;
  reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  requested_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  completed_by: string | null;
  rejection_reason: string;
  is_deleted: boolean;
  deleted_by: string | null;
  deleted_at: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  branch?: Branch;
}

export interface CashDrawer {
  id: string;
  branch_id: string;
  name: string;
  drawer_code: string;
  status: 'open' | 'closed' | 'locked' | 'error';
  printer_connection: string;
  printer_name: string;
  is_active: boolean;
  assigned_to: string | null;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  branch?: Branch;
}

export interface CashDrawerEvent {
  id: string;
  drawer_id: string;
  event_type: 'open' | 'close' | 'manual_open' | 'error' | 'locked' | 'unlocked';
  opened_by: string | null;
  cashier_id: string | null;
  shift_id: string | null;
  branch_id: string;
  reason: string;
  amount_in_drawer: number;
  transaction_id: string | null;
  created_at: string;
  drawer?: CashDrawer;
  branch?: Branch;
}

export interface ShiftReconciliation {
  id: string;
  shift_id: string;
  branch_id: string;
  drawer_id: string | null;
  opening_date: string;
  opening_time: string;
  closing_time: string | null;
  cashier_id: string | null;
  manager_id: string | null;
  opening_cash: number;
  expected_cash: number;
  expected_card: number;
  expected_other: number;
  total_expected: number;
  actual_cash: number;
  actual_card: number;
  actual_other: number;
  total_actual: number;
  cash_variance: number;
  card_variance: number;
  total_variance: number;
  variance_reason: string;
  cash_breakdown: Record<string, number>;
  status: 'open' | 'closed' | 'verified' | 'disputed';
  notes: string;
  created_at: string;
  closed_at: string | null;
  verified_at: string | null;
  branch?: Branch;
}

export interface HardwareConfig {
  id: string;
  branch_id: string;
  device_type: 'receipt_printer' | 'label_printer' | 'barcode_scanner' | 'cash_drawer' | 'customer_display' | 'pos_terminal';
  device_name: string;
  device_model: string;
  connection_type: 'USB' | 'Bluetooth' | 'Network' | 'Serial' | 'WiFi';
  connection_string: string;
  paper_size: '58mm' | '80mm';
  is_default: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  tested_at: string | null;
  created_by: string | null;
  branch?: Branch;
}

export interface ReceiptTemplate {
  id: string;
  company_id: string | null;
  name: string;
  language: 'arabic' | 'english' | 'bilingual';
  paper_size: '58mm' | '80mm';
  template_type: 'sales' | 'refund' | 'shift_close' | 'quote';
  header_text: string;
  header_ar: string;
  footer_text: string;
  footer_ar: string;
  show_logo: boolean;
  show_trn: boolean;
  show_vat_breakdown: boolean;
  show_barcode: boolean;
  show_branch: boolean;
  show_cashier: boolean;
  template_content: Record<string, unknown>;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyCashClosing {
  id: string;
  branch_id: string;
  closing_date: string;
  opening_cash: number;
  cash_sales: number;
  card_sales: number;
  bank_transfers: number;
  cash_income: number;
  cash_expenses: number;
  cash_withdrawals: number;
  expected_closing: number;
  actual_closing: number;
  variance: number;
  variance_reason: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  notes: string;
  closed_by: string | null;
  approved_by: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  branch?: Branch;
}

export interface CashRegister {
  id: string;
  branch_id: string;
  register_date: string;
  opening_balance: number;
  cash_sales: number;
  card_sales: number;
  bank_transfers: number;
  expenses: number;
  income: number;
  closing_balance: number;
  notes: string;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity_requested: number;
  quantity_shipped: number;
  quantity_received: number;
  notes: string;
  product?: Product;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_branch_id: string;
  to_branch_id: string;
  status: 'requested' | 'approved' | 'rejected' | 'shipped' | 'received' | 'cancelled';
  requested_by: string | null;
  approved_by: string | null;
  shipped_by: string | null;
  received_by: string | null;
  notes: string;
  created_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  items?: StockTransferItem[];
  from_branch?: Branch;
  to_branch?: Branch;
}

// Role permissions — used as fallback nav gating; fine-grained control via PermissionsContext
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['dashboard', 'reports', 'branches', 'customers', 'suppliers', 'inventory', 'transfers', 'quotations', 'invoices', 'hr', 'payroll', 'attendance', 'accounting', 'pos', 'settings', 'companies', 'cashflow', 'crm', 'projects', 'scanner'],
  manager: ['dashboard', 'reports', 'customers', 'suppliers', 'inventory', 'transfers', 'quotations', 'invoices', 'pos', 'hr', 'payroll', 'attendance', 'cashflow', 'crm', 'projects', 'scanner'],
  sales: ['dashboard', 'customers', 'quotations', 'invoices', 'pos', 'crm', 'scanner'],
  accountant: ['dashboard', 'reports', 'invoices', 'accounting', 'cashflow', 'payroll', 'scanner'],
  inventory: ['dashboard', 'inventory', 'transfers', 'suppliers', 'scanner'],
  hr: ['dashboard', 'hr', 'payroll', 'attendance', 'projects', 'scanner'],
  cashier: ['dashboard', 'pos', 'invoices', 'cashflow', 'scanner'],
};

// ---- CRM ----

export interface Lead {
  id: string;
  customer_id: string | null;
  branch_id: string | null;
  company_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company_name: string;
  position: string;
  address: string;
  source: 'walk_in' | 'referral' | 'website' | 'social_media' | 'cold_call' | 'exhibition' | 'other';
  status: 'new_lead' | 'contacted' | 'quoted' | 'won' | 'lost' | 'follow_up' | 'inactive';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_value: number;
  actual_value: number;
  notes: string;
  lost_reason: string;
  next_follow_up: string | null;
  last_contacted_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  branch_id: string | null;
  created_by: string | null;
  activity_type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note' | 'follow_up' | 'quotation' | 'invoice' | 'site_visit';
  subject: string;
  description: string;
  outcome: string;
  duration_minutes: number;
  next_action: string;
  next_action_date: string | null;
  created_at: string;
}

export interface LeadReminder {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  created_by: string | null;
  reminder_date: string;
  reminder_type: 'follow_up' | 'call' | 'meeting' | 'quotation_expiry' | 'payment_due';
  title: string;
  description: string;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
}

// ---- Attendance & Payroll ----

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  branch_id: string | null;
  project_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  status: 'present' | 'absent' | 'half_day' | 'late' | 'early_leave' | 'holiday' | 'weekend' | 'leave';
  notes: string;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface AttendanceDevice {
  id: string;
  branch_id: string | null;
  device_name: string;
  device_type: 'zkteco' | 'generic_csv' | 'manual';
  ip_address: string | null;
  port: number | null;
  location: string | null;
  connection_status: 'online' | 'offline' | 'error' | 'unknown';
  last_sync_at: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendancePunch {
  id: string;
  employee_id: string | null;
  biometric_user_id: string | null;
  branch_id: string | null;
  device_id: string | null;
  punch_date: string;
  punch_time: string;
  punch_type: 'IN' | 'OUT';
  source: 'biometric' | 'csv' | 'manual';
  is_processed: boolean;
  created_at: string;
  employee?: Employee;
}

export interface AttendanceSyncLog {
  id: string;
  device_id: string | null;
  sync_type: 'zkteco_sync' | 'csv_import' | 'manual' | 'test_connection';
  status: 'success' | 'partial' | 'failed' | 'error';
  records_processed: number;
  records_imported: number;
  errors: string | null;
  error_details: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  branch_id: string | null;
  leave_type: 'annual' | 'sick' | 'emergency' | 'unpaid' | 'maternity' | 'paternity' | 'other';
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by: string | null;
  rejection_reason: string;
  created_by: string | null;
  created_at: string;
  approved_at: string | null;
  employee?: Employee;
}

export interface PayrollPeriod {
  id: string;
  branch_id: string | null;
  period_name: string;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  status: 'draft' | 'processing' | 'approved' | 'paid' | 'cancelled';
  total_gross: number;
  total_deductions: number;
  total_net: number;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
}

export interface PayrollItem {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  branch_id: string | null;
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowances: number;
  overtime_hours: number;
  overtime_rate: number;
  overtime_amount: number;
  bonus: number;
  advance_deduction: number;
  absence_deduction: number;
  other_deductions: number;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  days_worked: number;
  days_absent: number;
  days_leave: number;
  notes: string;
  status: 'draft' | 'approved' | 'paid';
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface SalaryAdvance {
  id: string;
  employee_id: string;
  branch_id: string | null;
  advance_date: string;
  amount: number;
  reason: string;
  repayment_months: number;
  monthly_deduction: number;
  amount_repaid: number;
  balance_due: number;
  status: 'pending' | 'approved' | 'rejected' | 'repaid';
  approved_by: string | null;
  requested_by: string | null;
  created_at: string;
  approved_at: string | null;
  employee?: Employee;
}

// ---- Projects ----

export interface Project {
  id: string;
  project_number: string;
  name: string;
  description: string;
  customer_id: string | null;
  customer_name: string;
  branch_id: string | null;
  company_id: string | null;
  site_address: string;
  contract_value: number;
  estimated_cost: number;
  actual_cost: number;
  profit: number;
  status: 'pending' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  start_date: string | null;
  end_date: string | null;
  actual_end_date: string | null;
  manager_id: string | null;
  created_by: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  branch?: Branch;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  employee_id: string;
  branch_id: string | null;
  role_on_project: 'supervisor' | 'foreman' | 'worker' | 'driver' | 'helper' | 'engineer' | 'other';
  daily_rate: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string;
  assigned_by: string | null;
  created_at: string;
  employee?: Employee;
}

export interface ProjectAttendance {
  id: string;
  project_id: string;
  employee_id: string;
  branch_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  status: 'present' | 'absent' | 'half_day' | 'late';
  notes: string;
  marked_by: string | null;
  created_at: string;
  employee?: Employee;
}

export interface ProjectProgress {
  id: string;
  project_id: string;
  branch_id: string | null;
  report_date: string;
  workers_count: number;
  work_completed: string;
  work_pending: string;
  materials_used: string;
  issues: string;
  notes: string;
  weather: string;
  progress_percent: number;
  image_urls: string[];
  reported_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectExpense {
  id: string;
  project_id: string;
  branch_id: string | null;
  expense_date: string;
  category: 'materials' | 'labor' | 'transport' | 'equipment' | 'subcontract' | 'other';
  description: string;
  amount: number;
  reference: string;
  created_by: string | null;
  created_at: string;
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  branch_id: string | null;
  company_id: string | null;
  activity_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  project?: Project;
}

export interface EmployeeContract {
  id: string;
  employee_id: string;
  branch_id: string | null;
  company_id: string | null;
  title: string;
  contract_type: 'employment' | 'renewal' | 'amendment' | 'termination' | 'probation' | 'other';
  start_date: string;
  end_date: string | null;
  salary_terms: string;
  job_role: string;
  notes: string;
  attachment_url: string;
  attachment_path: string;
  attachment_filename: string;
  status: 'draft' | 'active' | 'expired' | 'terminated' | 'renewed';
  renewal_reminder_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

// ---- Permissions ----

export interface Permission {
  id: string;
  user_id: string;
  module: string;
  action: string;
  granted: boolean;
  branch_id: string | null;
  company_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDeduction {
  id: string;
  employee_id: string;
  branch_id: string | null;
  deduction_date: string;
  category: 'absence' | 'late' | 'damage' | 'advance_repayment' | 'loan' | 'penalty' | 'other';
  reason: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string;
  applied_to_period: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface PayrollAuditLog {
  id: string;
  entity_type: 'payroll_period' | 'payroll_item' | 'salary_advance' | 'employee_deduction';
  entity_id: string;
  action: 'created' | 'edited' | 'approved' | 'rejected' | 'paid' | 'cancelled' | 'reset';
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  branch_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  notes: string;
  created_at: string;
}

export interface PosTransaction {
  id: string;
  transaction_number: string;
  session_id: string | null;
  shift_id: string | null;
  cashier_id: string | null;
  cashier_name: string;
  customer_id: string | null;
  customer_name: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'bank_transfer';
  amount_tendered: number;
  change_due: number;
  status: string;
  created_by: string | null;
  created_at: string;
  branch_id: string | null;
}

export interface PosSession {
  id: string;
  session_number: string;
  cashier_id: string | null;
  cashier_name: string;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  branch_id: string | null;
}

export interface PosHardwareSettings {
  id: string;
  branch_id: string;
  printer_mode: 'browser' | 'qz_tray' | 'webusb';
  printer_name: string;
  receipt_width: '58mm' | '80mm';
  cash_drawer_enabled: boolean;
  cash_drawer_command: string;
  auto_open_drawer: boolean;
  prevent_negative_stock?: boolean;
  test_printed_at: string | null;
  test_drawer_at: string | null;
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 2 }).format(amount);

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (date: string) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
