ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS notes text;