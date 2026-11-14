CREATE TABLE public.offline_sales_sync (client_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), user_id uuid NOT NULL, ticket_id uuid NOT NULL REFERENCES public.sales_tickets(id), recorded_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.offline_sales_sync TO authenticated;
GRANT ALL ON public.offline_sales_sync TO service_role;
ALTER TABLE public.offline_sales_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seller reads own synced sales" ON public.offline_sales_sync FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.sync_offline_sale(_client_id uuid, _session_id uuid, _cash_id uuid, _items jsonb, _payment text, _discount numeric, _sold_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid := public.current_tenant_id(); sale_id uuid; num integer; old_user uuid; old_tenant uuid;
BEGIN
 IF t IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(_client_id::text));
 SELECT ticket_id, user_id, tenant_id INTO sale_id, old_user, old_tenant FROM public.offline_sales_sync WHERE client_id=_client_id;
 IF FOUND THEN
  IF old_user<>auth.uid() OR old_tenant<>t THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT ticket_number INTO num FROM public.sales_tickets WHERE id=sale_id;
  RETURN jsonb_build_object('id',sale_id,'ticket_number',num);
 END IF;
 IF _payment NOT IN ('cash','card','credit') OR _discount IS NULL OR _discount<0 OR _sold_at IS NULL OR _sold_at > now()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM 1 FROM public.cash_sessions WHERE id=_cash_id AND tenant_id=t AND opened_by=auth.uid() AND status='open' AND opened_at<=_sold_at FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_session_not_open'; END IF;
 IF _session_id IS NOT NULL THEN
  PERFORM 1 FROM public.inventory_sessions WHERE id=_session_id AND tenant_id=t AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_active'; END IF;
 END IF;
 sale_id := public.create_sales_ticket(_session_id,_items,'نقطة البيع · مزامنة الجهاز');
 UPDATE public.sales_tickets SET created_at=_sold_at, cash_session_id=_cash_id, payment_method=_payment, discount=least(_discount,total_amount), total_amount=total_amount-least(_discount,total_amount), session_id=_session_id WHERE id=sale_id;
 UPDATE public.sales_ticket_items SET session_id=_session_id WHERE ticket_id=sale_id;
 INSERT INTO public.offline_sales_sync(client_id,tenant_id,user_id,ticket_id) VALUES (_client_id,t,auth.uid(),sale_id);
 SELECT ticket_number INTO num FROM public.sales_tickets WHERE id=sale_id;
 RETURN jsonb_build_object('id',sale_id,'ticket_number',num);
END $$;
REVOKE ALL ON FUNCTION public.sync_offline_sale(uuid,uuid,uuid,jsonb,text,numeric,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid,uuid,uuid,jsonb,text,numeric,timestamptz) TO authenticated;