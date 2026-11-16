CREATE OR REPLACE FUNCTION public.protect_product_sensitive_columns()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_manager() AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR ((NEW.system_quantity IS DISTINCT FROM OLD.system_quantity OR NEW.purchase_price IS DISTINCT FROM OLD.purchase_price) AND NOT public.can_sell())
  ) THEN
    RAISE EXCEPTION 'لا يمكنك تعديل كمية المخزون أو سعر الشراء أو المتجر مباشرة';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.update_goods_receipt(_receipt_id uuid, _supplier_id uuid, _items jsonb, _reference text DEFAULT NULL, _notes text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid := public.current_tenant_id();
  g record; _sup text; _item jsonb; _total numeric := 0;
BEGIN
  IF _tenant IS NULL OR NOT (public.is_manager() OR public.can_sell()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO g FROM goods_receipts WHERE id = _receipt_id AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_receipt'; END IF;
  IF _supplier_id IS NOT NULL THEN
    SELECT name INTO _sup FROM suppliers WHERE id = _supplier_id AND tenant_id = _tenant;
    IF _sup IS NULL THEN RAISE EXCEPTION 'supplier_not_found'; END IF;
  END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce((_item->>'quantity')::numeric, 0) <= 0 OR coalesce((_item->>'purchase_price')::numeric, 0) < 0
       OR coalesce((_item->>'selling_price')::numeric, 0) < 0 OR coalesce(trim(_item->>'barcode'), '') = '' THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    _total := _total + (_item->>'quantity')::numeric * coalesce((_item->>'purchase_price')::numeric, 0);
  END LOOP;
  -- undo old quantities
  UPDATE products p SET system_quantity = p.system_quantity - s.q, updated_at = now()
    FROM (SELECT barcode, sum(quantity) q FROM goods_receipt_items WHERE receipt_id = _receipt_id GROUP BY barcode) s
    WHERE p.tenant_id = _tenant AND p.barcode = s.barcode;
  DELETE FROM goods_receipt_items WHERE receipt_id = _receipt_id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO goods_receipt_items (receipt_id, tenant_id, barcode, product_name, quantity, purchase_price, selling_price)
    VALUES (_receipt_id, _tenant, trim(_item->>'barcode'), coalesce(nullif(trim(_item->>'product_name'), ''), trim(_item->>'barcode')),
            (_item->>'quantity')::numeric, coalesce((_item->>'purchase_price')::numeric, 0), coalesce((_item->>'selling_price')::numeric, 0));
    UPDATE products SET system_quantity = system_quantity + (_item->>'quantity')::numeric,
      purchase_price = CASE WHEN coalesce((_item->>'purchase_price')::numeric, 0) > 0 THEN (_item->>'purchase_price')::numeric ELSE purchase_price END,
      selling_price = CASE WHEN coalesce((_item->>'selling_price')::numeric, 0) > 0 THEN (_item->>'selling_price')::numeric ELSE selling_price END,
      updated_at = now()
    WHERE tenant_id = _tenant AND barcode = trim(_item->>'barcode');
    IF NOT FOUND THEN
      INSERT INTO products (tenant_id, barcode, name, system_quantity, purchase_price, selling_price)
      VALUES (_tenant, trim(_item->>'barcode'), coalesce(nullif(trim(_item->>'product_name'), ''), trim(_item->>'barcode')),
              (_item->>'quantity')::numeric, coalesce((_item->>'purchase_price')::numeric, 0), coalesce((_item->>'selling_price')::numeric, 0));
    END IF;
  END LOOP;
  UPDATE goods_receipts SET supplier_id = _supplier_id, supplier_name = _sup, reference = nullif(trim(_reference), ''),
    notes = nullif(trim(_notes), ''), total_amount = _total WHERE id = _receipt_id;
  PERFORM public.log_activity(_tenant, 'receipt', 'receipt_edited', g.receipt_number::text, _total,
    jsonb_build_object('old_total', g.total_amount), true);
END $function$;

REVOKE ALL ON FUNCTION public.update_goods_receipt(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_goods_receipt(uuid, uuid, jsonb, text, text) TO authenticated;