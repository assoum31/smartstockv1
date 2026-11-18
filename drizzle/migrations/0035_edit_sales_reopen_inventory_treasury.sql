CREATE OR REPLACE FUNCTION public.update_sales_ticket(_ticket_id uuid, _items jsonb, _payment text, _discount numeric DEFAULT 0, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.current_tenant_id(); t record; _item jsonb; _sub numeric := 0; _disc numeric;
BEGIN
  IF _tenant IS NULL OR NOT (public.is_manager() OR public.can_sell()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO t FROM sales_tickets WHERE id = _ticket_id AND tenant_id = _tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _payment NOT IN ('cash','card','credit') THEN RAISE EXCEPTION 'invalid'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_ticket'; END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce((_item->>'quantity')::numeric,0) <= 0 OR coalesce((_item->>'unit_price')::numeric,0) < 0 OR coalesce(trim(_item->>'barcode'),'') = '' THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    _sub := _sub + (_item->>'quantity')::numeric * coalesce((_item->>'unit_price')::numeric,0);
  END LOOP;
  _disc := least(greatest(coalesce(_discount,0),0), _sub);
  -- give back old quantities
  UPDATE products p SET system_quantity = p.system_quantity + s.q, updated_at = now()
    FROM (SELECT barcode, sum(quantity) q FROM sales_ticket_items WHERE ticket_id = _ticket_id GROUP BY barcode) s
    WHERE p.tenant_id = _tenant AND p.barcode = s.barcode;
  DELETE FROM sales_ticket_items WHERE ticket_id = _ticket_id;
  INSERT INTO sales_ticket_items (ticket_id, tenant_id, session_id, barcode, product_name, quantity, unit_price)
  SELECT _ticket_id, _tenant, t.session_id, trim(e->>'barcode'), coalesce(nullif(trim(e->>'product_name'),''), trim(e->>'barcode')),
         (e->>'quantity')::numeric, coalesce((e->>'unit_price')::numeric,0)
  FROM jsonb_array_elements(_items) e;
  UPDATE products p SET system_quantity = p.system_quantity - s.q, updated_at = now()
    FROM (SELECT barcode, sum(quantity) q FROM sales_ticket_items WHERE ticket_id = _ticket_id GROUP BY barcode) s
    WHERE p.tenant_id = _tenant AND p.barcode = s.barcode;
  UPDATE sales_tickets SET payment_method = _payment, discount = _disc, total_amount = _sub - _disc,
    notes = coalesce(nullif(trim(_notes),''), notes) WHERE id = _ticket_id;
  PERFORM public.log_activity(_tenant, 'sale', 'sale_edited', 'T' || lpad(t.ticket_number::text, 4, '0'), _sub - _disc,
    jsonb_build_object('old_total', t.total_amount, 'old_payment', t.payment_method, 'payment', _payment), true);
END $$;
REVOKE ALL ON FUNCTION public.update_sales_ticket(uuid, jsonb, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sales_ticket(uuid, jsonb, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_sales_ticket(_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NOT (public.is_manager() OR public.can_sell()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO t FROM sales_tickets WHERE id = _ticket_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE products p SET system_quantity = p.system_quantity + i.quantity, updated_at = now()
    FROM sales_ticket_items i WHERE i.ticket_id = _ticket_id AND p.tenant_id = t.tenant_id AND p.barcode = i.barcode;
  UPDATE stock_returns SET ticket_id = NULL WHERE ticket_id = _ticket_id;
  DELETE FROM sales_tickets WHERE id = _ticket_id;
  PERFORM public.log_activity(t.tenant_id, 'sale', 'sale_deleted', 'T' || lpad(t.ticket_number::text, 4, '0'), t.total_amount, '{}'::jsonb, true);
END $$;

CREATE OR REPLACE FUNCTION public.delete_goods_receipt(_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record;
BEGIN
  IF NOT (public.is_manager() OR public.can_sell()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO g FROM goods_receipts WHERE id = _receipt_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE products p SET system_quantity = p.system_quantity - i.quantity, updated_at = now()
    FROM goods_receipt_items i WHERE i.receipt_id = _receipt_id AND p.tenant_id = g.tenant_id AND p.barcode = i.barcode;
  DELETE FROM goods_receipts WHERE id = _receipt_id;
  PERFORM public.log_activity(g.tenant_id, 'receipt', 'receipt_deleted', g.receipt_number::text, g.total_amount, '{}'::jsonb, true);
END $$;

CREATE OR REPLACE FUNCTION public.reopen_inventory_session(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.current_tenant_id(); _name text;
BEGIN
  IF _tenant IS NULL OR NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM inventory_sessions WHERE tenant_id = _tenant AND status = 'active') THEN
    RAISE EXCEPTION 'session_already_active';
  END IF;
  UPDATE inventory_sessions SET status = 'active', closed_at = NULL
  WHERE id = _session_id AND tenant_id = _tenant AND status = 'closed' RETURNING name INTO _name;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.log_activity(_tenant, 'inventory', 'session_reopened', _name, NULL, '{}'::jsonb, true);
END $$;
REVOKE ALL ON FUNCTION public.reopen_inventory_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_inventory_session(uuid) TO authenticated;

CREATE TABLE public.treasury_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('versement','alimentation','deposit','withdrawal')),
  amount numeric NOT NULL CHECK (amount > 0),
  cash_session_id uuid,
  note text,
  created_by uuid,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.treasury_transactions (tenant_id, created_at);
GRANT SELECT, DELETE ON public.treasury_transactions TO authenticated;
GRANT ALL ON public.treasury_transactions TO service_role;
ALTER TABLE public.treasury_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers read treasury" ON public.treasury_transactions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.can_sell() OR public.is_manager()));
CREATE POLICY "managers delete treasury" ON public.treasury_transactions FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.record_treasury(_kind text, _amount numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := public.current_tenant_id(); _id uuid; _cash uuid; _name text;
BEGIN
  IF _t IS NULL OR NOT (public.can_sell() OR public.is_manager()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _kind NOT IN ('versement','alimentation','deposit','withdrawal') THEN RAISE EXCEPTION 'invalid'; END IF;
  IF coalesce(_amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _kind IN ('versement','alimentation') THEN
    SELECT id INTO _cash FROM cash_sessions WHERE tenant_id = _t AND opened_by = auth.uid() AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
    IF _cash IS NULL THEN
      SELECT id INTO _cash FROM cash_sessions WHERE tenant_id = _t AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
    END IF;
    IF _cash IS NULL THEN RAISE EXCEPTION 'no_open_cash'; END IF;
  END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO treasury_transactions (tenant_id, kind, amount, cash_session_id, note, created_by, created_by_name)
  VALUES (_t, _kind, _amount, _cash, nullif(trim(_note),''), auth.uid(), coalesce(_name,'—')) RETURNING id INTO _id;
  PERFORM public.log_activity(_t, 'cash', 'treasury_' || _kind, NULL, _amount, jsonb_build_object('note', _note), true);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.record_treasury(text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_treasury(text, numeric, text) TO authenticated;