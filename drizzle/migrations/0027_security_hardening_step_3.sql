CREATE OR REPLACE FUNCTION public.place_online_order(_code text, _name text, _phone text, _whatsapp text, _email text, _notes text, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t uuid;
  _enabled boolean;
  _o uuid;
  _num int;
  _total numeric := 0;
  _it jsonb;
  _p record;
  _q numeric;
  _normalized_phone text;
  _recent_count int;
BEGIN
  SELECT t.id, coalesce(s.store_enabled, true)
  INTO _t, _enabled
  FROM public.tenants t
  LEFT JOIN public.store_settings s ON s.tenant_id = t.id
  WHERE lower(t.code) = lower(_code) AND t.is_active;
  IF _t IS NULL THEN RAISE EXCEPTION 'المتجر غير موجود'; END IF;
  IF NOT _enabled THEN RAISE EXCEPTION 'المتجر الإلكتروني مغلق حالياً'; END IF;

  IF length(trim(coalesce(_name,''))) < 2 OR length(_name) > 120 THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF coalesce(_phone,'') !~ '^[0-9+ ]{8,20}$' THEN RAISE EXCEPTION 'رقم الهاتف غير صالح'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 100 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;

  _normalized_phone := regexp_replace(_phone, '\D', '', 'g');
  PERFORM pg_advisory_xact_lock(hashtext('online-order:' || _t::text));

  SELECT count(*) INTO _recent_count
  FROM public.online_orders
  WHERE tenant_id = _t
    AND regexp_replace(phone, '\D', '', 'g') = _normalized_phone
    AND created_at >= now() - interval '10 minutes';
  IF _recent_count >= 3 THEN
    RAISE EXCEPTION 'تم تجاوز عدد الطلبات المسموح به لهذا الرقم. حاول بعد 10 دقائق.';
  END IF;

  SELECT count(*) INTO _recent_count
  FROM public.online_orders
  WHERE tenant_id = _t AND created_at >= now() - interval '1 hour';
  IF _recent_count >= 60 THEN
    RAISE EXCEPTION 'تم تجاوز عدد الطلبات المسموح به للمتجر. حاول بعد ساعة.';
  END IF;

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
REVOKE ALL ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_product_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_manager() AND (
    NEW.system_quantity IS DISTINCT FROM OLD.system_quantity
    OR NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  ) THEN
    RAISE EXCEPTION 'لا يمكن للبائع تعديل كمية المخزون أو سعر الشراء أو المتجر مباشرة';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER products_protect_sensitive_columns
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.protect_product_sensitive_columns();

CREATE OR REPLACE FUNCTION public.inventory_log_update_identity_ok(_id uuid, _counted_by uuid, _session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_logs
    WHERE id = _id
      AND counted_by IS NOT DISTINCT FROM _counted_by
      AND session_id IS NOT DISTINCT FROM _session_id
  )
$$;
REVOKE ALL ON FUNCTION public.inventory_log_update_identity_ok(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_log_update_identity_ok(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Members edit own counts, managers edit all" ON public.inventory_logs;
CREATE POLICY "Members edit own counts, managers edit all" ON public.inventory_logs FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.session_is_active(session_id) AND (counted_by = auth.uid() OR public.is_manager()))
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.is_manager() OR public.inventory_log_update_identity_ok(id, counted_by, session_id))
  );