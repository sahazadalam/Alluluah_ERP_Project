-- Add Arabic name to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ar text NOT NULL DEFAULT '';

-- Add paper_size to receipt_templates
ALTER TABLE receipt_templates ADD COLUMN IF NOT EXISTS paper_size text NOT NULL DEFAULT '80mm';
ALTER TABLE receipt_templates ADD COLUMN IF NOT EXISTS show_branch boolean NOT NULL DEFAULT true;
ALTER TABLE receipt_templates ADD COLUMN IF NOT EXISTS show_cashier boolean NOT NULL DEFAULT true;
ALTER TABLE receipt_templates ADD COLUMN IF NOT EXISTS header_ar text NOT NULL DEFAULT '';
ALTER TABLE receipt_templates ADD COLUMN IF NOT EXISTS footer_ar text NOT NULL DEFAULT '';
