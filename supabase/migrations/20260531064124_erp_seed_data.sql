/*
  # Al Luluah ERP - Seed Data

  Inserts default chart of accounts and sample categories for Al Luluah Tents & Sheds.
  These are reference data needed for the system to function.
*/

-- Default Chart of Accounts
INSERT INTO accounts (account_code, account_name, account_type) VALUES
  ('1000', 'Cash & Bank', 'asset'),
  ('1001', 'Cash on Hand', 'asset'),
  ('1002', 'Bank Account - FAB', 'asset'),
  ('1100', 'Accounts Receivable', 'asset'),
  ('1200', 'Inventory', 'asset'),
  ('1300', 'Prepaid Expenses', 'asset'),
  ('2000', 'Accounts Payable', 'liability'),
  ('2100', 'VAT Payable', 'liability'),
  ('2200', 'Accrued Expenses', 'liability'),
  ('3000', 'Owner''s Equity', 'equity'),
  ('3100', 'Retained Earnings', 'equity'),
  ('4000', 'Sales Revenue', 'revenue'),
  ('4100', 'Service Revenue', 'revenue'),
  ('5000', 'Cost of Goods Sold', 'expense'),
  ('5100', 'Salaries & Wages', 'expense'),
  ('5200', 'Rent Expense', 'expense'),
  ('5300', 'Utilities', 'expense'),
  ('5400', 'Marketing & Advertising', 'expense'),
  ('5500', 'Transportation & Delivery', 'expense'),
  ('5600', 'Office Supplies', 'expense'),
  ('5700', 'Miscellaneous Expenses', 'expense')
ON CONFLICT (account_code) DO NOTHING;

-- Default Product Categories
INSERT INTO categories (name, description) VALUES
  ('Tents', 'All types of tents including event and camping tents'),
  ('Sheds', 'Metal and fabric sheds for storage and workshops'),
  ('Canopies', 'Canopy structures and awnings'),
  ('Accessories', 'Stakes, ropes, poles and other accessories'),
  ('Frames', 'Metal and aluminum frame structures'),
  ('Fabrics', 'Tent and shade fabrics by meter'),
  ('Services', 'Installation, repair and maintenance services')
ON CONFLICT DO NOTHING;
