CREATE TABLE public.recount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  log_id uuid REFERENCES public.inventory_logs(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  assigned_to uuid,
  requested_by uuid,
  requested_by_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
GRANT SELECT ON public.recount_requests TO authenticated;
GRANT ALL ON public.recount_requests TO service_role;
ALTER TABLE public.recount_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or manager recounts" ON public.recount_requests FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (assigned_to = auth.uid() OR public.is_manager()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.recount_requests;

CREATE OR REPLACE FUNCTION public.request_recount(_log_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; _id uuid; _name text;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO l FROM inventory_logs WHERE id = _log_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  UPDATE recount_requests SET status = 'cancelled' WHERE log_id = _log_id AND status = 'pending';
  INSERT INTO recount_requests(tenant_id, session_id, log_id, barcode, product_name, assigned_to, requested_by, requested_by_name)
  VALUES (l.tenant_id, l.session_id, l.id, l.barcode, l.product_name, l.counted_by, auth.uid(), coalesce(_name,''))
  RETURNING id INTO _id;
  PERFORM public.log_activity(l.tenant_id, 'inventory', 'recount_requested', l.barcode, NULL, jsonb_build_object('product', l.product_name), true);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.complete_recount(_req_id uuid, _barcode text, _name text, _qty numeric, _location text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM recount_requests WHERE id = _req_id AND tenant_id = public.current_tenant_id() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.assigned_to IS DISTINCT FROM auth.uid() AND NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _qty IS NULL OR _qty < 0 OR coalesce(trim(_barcode),'') = '' THEN RAISE EXCEPTION 'invalid_input'; END IF;
  UPDATE inventory_logs SET barcode = trim(_barcode), product_name = coalesce(nullif(trim(_name),''), product_name),
    counted_quantity = _qty, location = nullif(trim(coalesce(_location,'')),''), notes = nullif(trim(coalesce(_notes,'')),''),
    counted_at = now(), updated_at = now()
  WHERE id = r.log_id;
  UPDATE recount_requests SET status = 'done', done_at = now() WHERE id = _req_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_sales_ticket(_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
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
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO g FROM goods_receipts WHERE id = _receipt_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE products p SET system_quantity = p.system_quantity - i.quantity, updated_at = now()
    FROM goods_receipt_items i WHERE i.receipt_id = _receipt_id AND p.tenant_id = g.tenant_id AND p.barcode = i.barcode;
  DELETE FROM goods_receipts WHERE id = _receipt_id;
  PERFORM public.log_activity(g.tenant_id, 'receipt', 'receipt_deleted', g.receipt_number::text, g.total_amount, '{}'::jsonb, true);
END $$;

REVOKE ALL ON FUNCTION public.request_recount(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_recount(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_goods_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_recount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recount(uuid, text, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_goods_receipt(uuid) TO authenticated;