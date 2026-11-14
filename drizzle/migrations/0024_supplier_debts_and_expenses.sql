ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS paid_amount numeric;

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  source text NOT NULL DEFAULT 'external',
  note text,
  cash_session_id uuid,
  created_by uuid,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers read supplier payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.can_sell() OR public.is_manager()));
CREATE POLICY "managers delete supplier payments" ON public.supplier_payments FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  category text NOT NULL,
  amount numeric NOT NULL,
  source text NOT NULL DEFAULT 'cash',
  note text,
  cash_session_id uuid,
  created_by uuid,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.can_sell() OR public.is_manager()));
CREATE POLICY "managers delete expenses" ON public.expenses FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.set_receipt_paid(_receipt_id uuid, _paid numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := public.current_tenant_id(); _total numeric; _num int;
BEGIN
  IF NOT (public.can_sell() OR public.is_manager()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT total_amount, receipt_number INTO _total, _num FROM public.goods_receipts WHERE id = _receipt_id AND tenant_id = _t;
  IF _total IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF coalesce(_paid,0) < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.goods_receipts SET paid_amount = least(_paid, _total) WHERE id = _receipt_id;
  PERFORM public.log_activity(_t, 'receipts', 'receipt_paid', _num::text, least(_paid,_total), jsonb_build_object('total', _total), true);
END $$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(_supplier_id uuid, _amount numeric, _note text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := public.current_tenant_id(); _id uuid; _cash uuid; _name text;
BEGIN
  IF NOT (public.can_sell() OR public.is_manager()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(_amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _supplier_id AND tenant_id = _t) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _source = 'cash' THEN
    SELECT id INTO _cash FROM public.cash_sessions WHERE tenant_id = _t AND opened_by = auth.uid() AND status = 'open' LIMIT 1;
    IF _cash IS NULL THEN RAISE EXCEPTION 'cash_session_not_open'; END IF;
  END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.supplier_payments(tenant_id, supplier_id, amount, source, note, cash_session_id, created_by, created_by_name)
  VALUES (_t, _supplier_id, _amount, CASE WHEN _source='cash' THEN 'cash' ELSE 'external' END, nullif(trim(_note),''), _cash, auth.uid(), coalesce(_name,'—')) RETURNING id INTO _id;
  PERFORM public.log_activity(_t, 'receipts', 'supplier_payment', (SELECT name FROM public.suppliers WHERE id=_supplier_id), _amount, jsonb_build_object('note', _note, 'source', _source), true);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.create_expense(_category text, _amount numeric, _note text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := public.current_tenant_id(); _id uuid; _cash uuid; _name text;
BEGIN
  IF NOT (public.can_sell() OR public.is_manager()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(_amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _source = 'cash' THEN
    SELECT id INTO _cash FROM public.cash_sessions WHERE tenant_id = _t AND opened_by = auth.uid() AND status = 'open' LIMIT 1;
    IF _cash IS NULL THEN RAISE EXCEPTION 'cash_session_not_open'; END IF;
  END IF;
  SELECT full_name INTO _name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.expenses(tenant_id, category, amount, source, note, cash_session_id, created_by, created_by_name)
  VALUES (_t, coalesce(nullif(trim(_category),''),'عام'), _amount, CASE WHEN _source='cash' THEN 'cash' ELSE 'external' END, nullif(trim(_note),''), _cash, auth.uid(), coalesce(_name,'—')) RETURNING id INTO _id;
  PERFORM public.log_activity(_t, 'expenses', 'expense', _category, _amount, jsonb_build_object('note', _note, 'source', _source), true);
  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.set_receipt_paid(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense(text, numeric, text, text) TO authenticated;