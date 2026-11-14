ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS invoice_paper text NOT NULL DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS invoice_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ticket_show_codes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label_show_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label_show_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label_copies integer NOT NULL DEFAULT 1;

ALTER TABLE public.sales_tickets ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0;

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  cash_session_id uuid,
  created_by uuid,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers read payments" ON public.customer_payments FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.can_sell() OR public.is_manager()));
CREATE POLICY "managers delete payments" ON public.customer_payments FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.set_ticket_customer(_ticket_id uuid, _customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sales_tickets;
BEGIN
  SELECT * INTO t FROM public.sales_tickets WHERE id = _ticket_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_manager() OR (public.can_sell() AND t.created_by = auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND tenant_id = t.tenant_id) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  UPDATE public.sales_tickets SET customer_id = _customer_id WHERE id = _ticket_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_customer_payment(_customer_id uuid, _amount numeric, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := public.current_tenant_id(); _id uuid; _cash uuid; _name text;
BEGIN
  IF NOT (public.can_sell() OR public.is_manager()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(_amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND tenant_id = _t) THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT id INTO _cash FROM public.cash_sessions WHERE tenant_id = _t AND opened_by = auth.uid() AND status = 'open' LIMIT 1;
  SELECT full_name INTO _name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.customer_payments(tenant_id, customer_id, amount, note, cash_session_id, created_by, created_by_name)
  VALUES (_t, _customer_id, _amount, nullif(trim(_note),''), _cash, auth.uid(), coalesce(_name,'—')) RETURNING id INTO _id;
  PERFORM public.log_activity(_t, 'sales', 'customer_payment', (SELECT name FROM public.customers WHERE id=_customer_id), _amount, jsonb_build_object('note', _note), true);
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_ticket_customer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid, numeric, text) TO authenticated;