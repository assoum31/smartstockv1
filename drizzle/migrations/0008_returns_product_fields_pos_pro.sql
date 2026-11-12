ALTER TABLE public.products ADD COLUMN IF NOT EXISTS famille text, ADD COLUMN IF NOT EXISTS model text, ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0;

ALTER TABLE public.sales_tickets ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_session_id uuid;

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  opened_by_name text NOT NULL,
  opening_amount numeric NOT NULL DEFAULT 0,
  closing_amount numeric,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads cash sessions" ON public.cash_sessions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE TABLE public.stock_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer','supplier')),
  return_number integer NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  ticket_ref text,
  reason text,
  created_by uuid,
  created_by_name text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, return_number)
);
CREATE TABLE public.stock_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.stock_returns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0
);
CREATE INDEX ON public.stock_return_items (return_id);
GRANT SELECT ON public.stock_returns TO authenticated;
GRANT SELECT ON public.stock_return_items TO authenticated;
GRANT ALL ON public.stock_returns TO service_role;
GRANT ALL ON public.stock_return_items TO service_role;
ALTER TABLE public.stock_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads returns" ON public.stock_returns FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Store reads return items" ON public.stock_return_items FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.create_stock_return(_kind text, _items jsonb, _supplier_id uuid DEFAULT NULL, _ticket_ref text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid := public.current_tenant_id();
  _id uuid; _num integer; _name text; _sup text; _item jsonb; _total numeric := 0; _sign numeric;
BEGIN
  IF _tenant IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _kind NOT IN ('customer','supplier') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_return'; END IF;
  IF _kind = 'supplier' THEN
    SELECT name INTO _sup FROM suppliers WHERE id = _supplier_id AND tenant_id = _tenant;
    IF _sup IS NULL THEN RAISE EXCEPTION 'supplier_not_found'; END IF;
  END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce((_item->>'quantity')::numeric, 0) <= 0 OR coalesce((_item->>'unit_price')::numeric, 0) < 0
       OR coalesce(trim(_item->>'barcode'), '') = '' THEN RAISE EXCEPTION 'invalid_item'; END IF;
    _total := _total + (_item->>'quantity')::numeric * coalesce((_item->>'unit_price')::numeric, 0);
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtext('return' || _kind || _tenant::text));
  SELECT coalesce(max(return_number), 0) + 1 INTO _num FROM stock_returns WHERE tenant_id = _tenant AND kind = _kind;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO stock_returns (tenant_id, kind, return_number, supplier_id, supplier_name, ticket_ref, reason, created_by, created_by_name, total_amount)
  VALUES (_tenant, _kind, _num, CASE WHEN _kind='supplier' THEN _supplier_id END, _sup, nullif(trim(_ticket_ref),''), nullif(trim(_reason),''), auth.uid(), coalesce(_name,'—'), _total)
  RETURNING id INTO _id;
  INSERT INTO stock_return_items (return_id, tenant_id, barcode, product_name, quantity, unit_price)
  SELECT _id, _tenant, trim(e->>'barcode'), coalesce(nullif(trim(e->>'product_name'),''), trim(e->>'barcode')),
         (e->>'quantity')::numeric, coalesce((e->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) e;
  _sign := CASE WHEN _kind = 'customer' THEN 1 ELSE -1 END;
  UPDATE products p SET system_quantity = p.system_quantity + _sign * x.q, updated_at = now()
  FROM (SELECT trim(e->>'barcode') b, sum((e->>'quantity')::numeric) q FROM jsonb_array_elements(_items) e GROUP BY 1) x
  WHERE p.tenant_id = _tenant AND p.barcode = x.b;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_stock_return(text, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_return(text, jsonb, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_cash_session(_opening numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.current_tenant_id(); _id uuid; _name text;
BEGIN
  IF _tenant IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF coalesce(_opening,0) < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT id INTO _id FROM cash_sessions WHERE tenant_id = _tenant AND opened_by = auth.uid() AND status = 'open' LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO cash_sessions (tenant_id, opened_by, opened_by_name, opening_amount)
  VALUES (_tenant, auth.uid(), coalesce(_name,'—'), coalesce(_opening,0)) RETURNING id INTO _id;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.close_cash_session(_id uuid, _closing numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE cash_sessions SET status = 'closed', closed_at = now(), closing_amount = coalesce(_closing,0)
  WHERE id = _id AND tenant_id = public.current_tenant_id() AND status = 'open'
    AND (opened_by = auth.uid() OR public.is_manager());
  IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.open_cash_session(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ticket_payment(_ticket_id uuid, _payment text, _discount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cs uuid;
BEGIN
  IF NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _payment NOT IN ('cash','card','credit') OR coalesce(_discount,0) < 0 THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT id INTO _cs FROM cash_sessions WHERE tenant_id = public.current_tenant_id() AND opened_by = auth.uid() AND status='open' LIMIT 1;
  UPDATE sales_tickets SET payment_method = _payment,
    discount = least(coalesce(_discount,0), total_amount),
    total_amount = total_amount - least(coalesce(_discount,0), total_amount),
    cash_session_id = _cs
  WHERE id = _ticket_id AND tenant_id = public.current_tenant_id() AND created_by = auth.uid()
    AND created_at > now() - interval '5 minutes' AND discount = 0 AND cash_session_id IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.set_ticket_payment(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ticket_payment(uuid, text, numeric) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_returns;