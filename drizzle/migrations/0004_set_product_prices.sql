CREATE OR REPLACE FUNCTION public.set_product_prices(_barcode text, _purchase numeric, _selling numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_tenant_id() IS NULL THEN RAISE EXCEPTION 'no_store'; END IF;
  IF _purchase < 0 OR _selling < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  UPDATE public.products SET purchase_price = _purchase, selling_price = _selling, updated_at = now()
  WHERE tenant_id = public.current_tenant_id() AND barcode = _barcode;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_product_prices(text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_prices(text, numeric, numeric) TO authenticated;