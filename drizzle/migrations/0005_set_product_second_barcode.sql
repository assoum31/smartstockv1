CREATE OR REPLACE FUNCTION public.set_product_second_barcode(_barcode text, _second text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text := nullif(btrim(coalesce(_second, '')), '');
BEGIN
  IF public.current_tenant_id() IS NULL THEN RAISE EXCEPTION 'no_store'; END IF;
  IF s = _barcode THEN RAISE EXCEPTION 'same_as_main'; END IF;
  IF s IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products WHERE tenant_id = public.current_tenant_id() AND barcode <> _barcode
      AND (barcode = s OR s = ANY(alt_barcodes))) THEN RAISE EXCEPTION 'barcode_in_use'; END IF;
  UPDATE public.products SET
    alt_barcodes = (CASE WHEN s IS NULL THEN '{}'::text[] ELSE ARRAY[s] END)
      || coalesce((SELECT array_agg(b) FROM unnest(alt_barcodes[2:]) b WHERE b IS DISTINCT FROM s), '{}'::text[]),
    updated_at = now()
  WHERE tenant_id = public.current_tenant_id() AND barcode = _barcode;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_product_second_barcode(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_second_barcode(text, text) TO authenticated;