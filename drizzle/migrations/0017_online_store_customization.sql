ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS online_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_description text,
  ADD COLUMN IF NOT EXISTS related_barcodes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS store_title text,
  ADD COLUMN IF NOT EXISTS store_tagline text,
  ADD COLUMN IF NOT EXISTS store_color text,
  ADD COLUMN IF NOT EXISTS store_banner text,
  ADD COLUMN IF NOT EXISTS store_logo text,
  ADD COLUMN IF NOT EXISTS store_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.public_store_info(_code text)
RETURNS TABLE(title text, tagline text, color text, banner text, logo text, phone text, address text, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(s.store_title,''), s.company_name, t.name), s.store_tagline, s.store_color, s.store_banner,
         coalesce(nullif(s.store_logo,''), s.logo), s.phone, s.address, coalesce(s.store_enabled, true)
  FROM public.tenants t LEFT JOIN public.store_settings s ON s.tenant_id = t.id
  WHERE lower(t.code) = lower(_code) AND t.is_active
$$;
REVOKE ALL ON FUNCTION public.public_store_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_store_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_store_catalog_v2(_code text)
RETURNS TABLE(barcode text, name text, famille text, selling_price numeric, available numeric, image_url text, description text, related text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.barcode, p.name, p.famille, p.selling_price, p.system_quantity, p.image_url, p.online_description, p.related_barcodes
  FROM public.tenants t
  JOIN public.products p ON p.tenant_id = t.id
  LEFT JOIN public.store_settings s ON s.tenant_id = t.id
  WHERE lower(t.code) = lower(_code) AND t.is_active AND coalesce(s.store_enabled, true)
    AND p.online_visible AND p.system_quantity > 0
  ORDER BY p.name
  LIMIT 5000
$$;
REVOKE ALL ON FUNCTION public.public_store_catalog_v2(text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_store_catalog_v2(text) TO anon, authenticated;