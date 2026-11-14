ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';

CREATE OR REPLACE FUNCTION public.can_sell() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager() OR public.has_store_role('cashier')
    OR (public.current_tenant_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'sales_manager'))
$$;

-- Managers edit / delete cash advances
GRANT UPDATE, DELETE ON public.cash_advances TO authenticated;
CREATE POLICY "Managers edit advances" ON public.cash_advances FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_manager());
CREATE POLICY "Managers delete advances" ON public.cash_advances FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.trg_advance_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_activity(OLD.tenant_id, 'advances', 'حذف تسبيق', OLD.beneficiary_name, OLD.amount, jsonb_build_object('reason', OLD.reason), true);
    RETURN OLD;
  END IF;
  PERFORM public.log_activity(NEW.tenant_id, 'advances', 'تعديل تسبيق', NEW.beneficiary_name, NEW.amount,
    jsonb_build_object('old_amount', OLD.amount, 'reason', NEW.reason), true);
  RETURN NEW;
END $$;
CREATE TRIGGER act_advance_change AFTER UPDATE OR DELETE ON public.cash_advances FOR EACH ROW EXECUTE FUNCTION public.trg_advance_audit();

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT public.current_tenant_id(),
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  address text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read customers" ON public.customers FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Sellers add customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Sellers edit customers" ON public.customers FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.can_sell()) WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Managers delete customers" ON public.customers FOR DELETE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.is_manager());

-- Online orders
CREATE TABLE public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number serial,
  customer_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text,
  email text,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  handled_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL
);
GRANT SELECT, UPDATE ON public.online_orders TO authenticated;
GRANT SELECT ON public.online_order_items TO authenticated;
GRANT ALL ON public.online_orders, public.online_order_items TO service_role;
GRANT USAGE ON SEQUENCE public.online_orders_order_number_seq TO service_role;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read orders" ON public.online_orders FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Sellers update orders" ON public.online_orders FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.can_sell()) WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell() AND status IN ('new','confirmed','done','cancelled'));
CREATE POLICY "Sellers read order items" ON public.online_order_items FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id() AND public.can_sell());
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;

-- Public catalogue: only in-stock items, no purchase prices
CREATE OR REPLACE FUNCTION public.public_store_catalog(_code text)
RETURNS TABLE(store_name text, barcode text, name text, famille text, selling_price numeric, available numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(s.company_name, t.name), p.barcode, p.name, p.famille, p.selling_price, p.system_quantity
  FROM public.tenants t
  JOIN public.products p ON p.tenant_id = t.id
  LEFT JOIN public.store_settings s ON s.tenant_id = t.id
  WHERE lower(t.code) = lower(_code) AND t.is_active AND p.system_quantity > 0
  ORDER BY p.name
  LIMIT 5000
$$;
REVOKE ALL ON FUNCTION public.public_store_catalog(text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_store_catalog(text) TO anon, authenticated;

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
    SELECT barcode, name, selling_price INTO _p FROM public.products WHERE tenant_id = _t AND barcode = _it->>'barcode' AND system_quantity > 0;
    IF _p IS NULL THEN RAISE EXCEPTION 'منتج غير متوفر'; END IF;
    INSERT INTO public.online_order_items(order_id, tenant_id, barcode, product_name, quantity, unit_price) VALUES (_o, _t, _p.barcode, _p.name, _q, _p.selling_price);
    _total := _total + _q * _p.selling_price;
  END LOOP;
  UPDATE public.online_orders SET total_amount = _total WHERE id = _o;
  RETURN _num;
END $$;
REVOKE ALL ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.place_online_order(text,text,text,text,text,text,jsonb) TO anon, authenticated;