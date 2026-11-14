ALTER TABLE public.sales_tickets ADD COLUMN IF NOT EXISTS online_order_id uuid REFERENCES public.online_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tickets_online_order_uq ON public.sales_tickets(online_order_id) WHERE online_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.deliver_online_order(_order_id uuid, _payment text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _o online_orders; _items jsonb; _tid uuid; _name text;
BEGIN
  IF NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO _o FROM online_orders WHERE id = _order_id AND tenant_id = public.current_tenant_id() FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _o.status <> 'confirmed' THEN RAISE EXCEPTION 'order_not_confirmed'; END IF;
  SELECT jsonb_agg(jsonb_build_object('barcode', barcode, 'product_name', product_name, 'quantity', quantity, 'unit_price', unit_price))
    INTO _items FROM online_order_items WHERE order_id = _o.id;
  _tid := public.create_sales_ticket(NULL, _items, 'متجر أونلاين #' || _o.order_number || ' · ' || _o.customer_name);
  PERFORM public.set_ticket_payment(_tid, _payment, 0);
  UPDATE sales_tickets SET online_order_id = _o.id WHERE id = _tid;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  UPDATE online_orders SET status = 'done', handled_by_name = coalesce(_name, handled_by_name), updated_at = now() WHERE id = _o.id;
  RETURN _tid;
END $$;
REVOKE ALL ON FUNCTION public.deliver_online_order(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.deliver_online_order(uuid, text) TO authenticated;