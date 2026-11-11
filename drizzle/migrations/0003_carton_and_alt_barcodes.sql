ALTER TABLE public.products ADD COLUMN IF NOT EXISTS carton_size numeric NOT NULL DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alt_barcodes text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS products_alt_barcodes_idx ON public.products USING gin (alt_barcodes);