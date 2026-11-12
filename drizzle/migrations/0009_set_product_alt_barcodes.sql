CREATE OR REPLACE FUNCTION public.set_product_alt_barcodes(_barcode text, _alts text[])
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid := public.current_tenant_id(); res text[] := '{}'; c text;
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no_store'; END IF;
  FOREACH c IN ARRAY coalesce(_alts, '{}'::text[]) LOOP
    c := nullif(btrim(c), '');
    CONTINUE WHEN c IS NULL OR c = _barcode OR c = ANY(res);
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.products WHERE tenant_id = t AND barcode <> _barcode
      AND (barcode = c OR c = ANY(alt_barcodes)));
    res := res || c;
  END LOOP;
  UPDATE public.products SET alt_barcodes = res, updated_at = now()
  WHERE tenant_id = t AND barcode = _barcode;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.set_product_alt_barcodes(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_alt_barcodes(text, text[]) TO authenticated;