CREATE OR REPLACE FUNCTION public.public_store_catalog_v2(_code text)
RETURNS TABLE(barcode text, name text, famille text, selling_price numeric, available numeric, image_url text, description text, related text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.barcode, p.name, p.famille, p.selling_price, p.system_quantity, p.image_url, p.online_description, p.related_barcodes
  FROM public.tenants t
  JOIN public.products p ON p.tenant_id = t.id
  LEFT JOIN public.store_settings s ON s.tenant_id = t.id
  WHERE lower(t.code) = lower(_code) AND t.is_active AND coalesce(s.store_enabled, true)
    AND p.online_visible
  ORDER BY p.name
  LIMIT 5000
$$;

CREATE OR REPLACE FUNCTION public.place_online_order(_code text, _name text, _phone text, _whatsapp text, _email text, _notes text, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid; _o uuid; _num int; _total numeric := 0; _it jsonb; _p record; _q numeric;
BEGIN
  SELECT id INTO _t FROM public.tenants WHERE lower(code) = lower(_code) AND is_active;
  IF _t IS NULL THEN RAISE EXCEPTION 'المتجر غير موجود'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 OR length(_name) > 120 THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF coalesce(_phone,'') !~ '^[0-9+ ]{8,20}$' THEN RAISE EXCEPTION 'رقم الهاتف غير صالح'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 100 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;
  INSERT INTO public.online_orders(tenant_id, customer_name, phone, whatsapp, email, notes)
  VALUES (_t, trim(_name), trim(_phone), nullif(left(trim(coalesce(_whatsapp,'')),20),''), nullif(left(trim(coalesce(_email,'')),160),''), nullif(left(trim(coalesce(_notes,'')),500),''))
  RETURNING id, order_number INTO _o, _num;
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _q := (_it->>'quantity')::numeric;
    IF _q IS NULL OR _q <= 0 OR _q > 10000 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    SELECT barcode, name, selling_price INTO _p FROM public.products WHERE tenant_id = _t AND barcode = _it->>'barcode' AND online_visible;
    IF _p IS NULL THEN RAISE EXCEPTION 'منتج غير متوفر'; END IF;
    INSERT INTO public.online_order_items(order_id, tenant_id, barcode, product_name, quantity, unit_price) VALUES (_o, _t, _p.barcode, _p.name, _q, _p.selling_price);
    _total := _total + _q * _p.selling_price;
  END LOOP;
  UPDATE public.online_orders SET total_amount = _total WHERE id = _o;
  RETURN _num;
END $$;
REVOKE ALL ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) TO anon, authenticated;