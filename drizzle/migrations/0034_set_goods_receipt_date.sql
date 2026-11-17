CREATE OR REPLACE FUNCTION public.set_goods_receipt_date(_receipt_id uuid, _date timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _tenant uuid := public.current_tenant_id(); g record;
BEGIN
  IF _tenant IS NULL OR NOT (public.is_manager() OR public.can_sell()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'invalid_date'; END IF;
  SELECT * INTO g FROM goods_receipts WHERE id = _receipt_id AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF g.created_at = _date THEN RETURN; END IF;
  UPDATE goods_receipts SET created_at = _date WHERE id = _receipt_id;
  PERFORM public.log_activity(_tenant, 'receipt', 'receipt_date_changed', g.receipt_number::text, g.total_amount,
    jsonb_build_object('old_date', g.created_at, 'new_date', _date), true);
END $function$;
REVOKE ALL ON FUNCTION public.set_goods_receipt_date(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_goods_receipt_date(uuid, timestamptz) TO authenticated;