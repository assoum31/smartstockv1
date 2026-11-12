CREATE OR REPLACE FUNCTION public.has_store_role(_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_tenant_id() IS NOT NULL AND public.has_role(auth.uid(), _role)
$$;
CREATE OR REPLACE FUNCTION public.can_sell()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager() OR public.has_store_role('cashier')
$$;
REVOKE ALL ON FUNCTION public.has_store_role(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_sell() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_sell() TO authenticated;

ALTER TABLE public.sales_tickets ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.sales_ticket_items ALTER COLUMN session_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS sales_tickets_tenant_created_idx ON public.sales_tickets (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_sales_ticket(_session_id uuid, _items jsonb, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid := public.current_tenant_id();
  _sid uuid := _session_id;
  _id uuid; _num integer; _name text; _item jsonb; _total numeric := 0;
BEGIN
  IF _tenant IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _sid IS NULL THEN
    SELECT id INTO _sid FROM inventory_sessions WHERE tenant_id = _tenant AND status = 'active' LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM inventory_sessions WHERE id = _sid AND tenant_id = _tenant AND status = 'active') THEN
    RAISE EXCEPTION 'session_not_active';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_ticket'; END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce((_item->>'quantity')::numeric, 0) <= 0 OR coalesce((_item->>'unit_price')::numeric, 0) < 0
       OR coalesce(trim(_item->>'barcode'), '') = '' THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    _total := _total + (_item->>'quantity')::numeric * coalesce((_item->>'unit_price')::numeric, 0);
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtext(coalesce(_sid, _tenant)::text));
  IF _sid IS NULL THEN
    SELECT coalesce(max(ticket_number), 0) + 1 INTO _num FROM sales_tickets WHERE tenant_id = _tenant AND session_id IS NULL;
  ELSE
    SELECT coalesce(max(ticket_number), 0) + 1 INTO _num FROM sales_tickets WHERE session_id = _sid;
  END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO sales_tickets (tenant_id, session_id, ticket_number, created_by, created_by_name, notes, total_amount)
  VALUES (_tenant, _sid, _num, auth.uid(), coalesce(_name, '—'), nullif(trim(_notes), ''), _total)
  RETURNING id INTO _id;
  INSERT INTO sales_ticket_items (ticket_id, tenant_id, session_id, barcode, product_name, quantity, unit_price)
  SELECT _id, _tenant, _sid, trim(e->>'barcode'), coalesce(nullif(trim(e->>'product_name'), ''), trim(e->>'barcode')),
         (e->>'quantity')::numeric, coalesce((e->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) e;
  UPDATE products p SET system_quantity = p.system_quantity - x.q, updated_at = now()
  FROM (SELECT trim(e->>'barcode') b, sum((e->>'quantity')::numeric) q FROM jsonb_array_elements(_items) e GROUP BY 1) x
  WHERE p.tenant_id = _tenant AND p.barcode = x.b;
  RETURN _id;
END $$;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Sellers add suppliers" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Sellers edit suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_sell())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Managers delete suppliers" ON public.suppliers FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  receipt_number integer NOT NULL,
  reference text,
  created_by uuid,
  created_by_name text NOT NULL,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_number)
);
CREATE TABLE public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  purchase_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0
);
CREATE INDEX ON public.goods_receipt_items (receipt_id);
GRANT SELECT ON public.goods_receipts TO authenticated;
GRANT SELECT ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads receipts" ON public.goods_receipts FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Store reads receipt items" ON public.goods_receipt_items FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.create_goods_receipt(_supplier_id uuid, _items jsonb, _reference text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid := public.current_tenant_id();
  _id uuid; _num integer; _name text; _sup text; _item jsonb; _total numeric := 0;
BEGIN
  IF _tenant IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_receipt'; END IF;
  IF _supplier_id IS NOT NULL THEN
    SELECT name INTO _sup FROM suppliers WHERE id = _supplier_id AND tenant_id = _tenant;
    IF _sup IS NULL THEN RAISE EXCEPTION 'supplier_not_found'; END IF;
  END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF coalesce((_item->>'quantity')::numeric, 0) <= 0 OR coalesce((_item->>'purchase_price')::numeric, 0) < 0
       OR coalesce((_item->>'selling_price')::numeric, 0) < 0 OR coalesce(trim(_item->>'barcode'), '') = '' THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;
    _total := _total + (_item->>'quantity')::numeric * coalesce((_item->>'purchase_price')::numeric, 0);
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtext('receipt' || _tenant::text));
  SELECT coalesce(max(receipt_number), 0) + 1 INTO _num FROM goods_receipts WHERE tenant_id = _tenant;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO goods_receipts (tenant_id, supplier_id, supplier_name, receipt_number, reference, created_by, created_by_name, notes, total_amount)
  VALUES (_tenant, _supplier_id, _sup, _num, nullif(trim(_reference), ''), auth.uid(), coalesce(_name, '—'), nullif(trim(_notes), ''), _total)
  RETURNING id INTO _id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO goods_receipt_items (receipt_id, tenant_id, barcode, product_name, quantity, purchase_price, selling_price)
    VALUES (_id, _tenant, trim(_item->>'barcode'), coalesce(nullif(trim(_item->>'product_name'), ''), trim(_item->>'barcode')),
            (_item->>'quantity')::numeric, coalesce((_item->>'purchase_price')::numeric, 0), coalesce((_item->>'selling_price')::numeric, 0));
    UPDATE products SET system_quantity = system_quantity + (_item->>'quantity')::numeric,
      purchase_price = CASE WHEN coalesce((_item->>'purchase_price')::numeric, 0) > 0 THEN (_item->>'purchase_price')::numeric ELSE purchase_price END,
      selling_price = CASE WHEN coalesce((_item->>'selling_price')::numeric, 0) > 0 THEN (_item->>'selling_price')::numeric ELSE selling_price END,
      updated_at = now()
    WHERE tenant_id = _tenant AND barcode = trim(_item->>'barcode');
    IF NOT FOUND THEN
      INSERT INTO products (tenant_id, barcode, name, system_quantity, purchase_price, selling_price)
      VALUES (_tenant, trim(_item->>'barcode'), coalesce(nullif(trim(_item->>'product_name'), ''), trim(_item->>'barcode')),
              (_item->>'quantity')::numeric, coalesce((_item->>'purchase_price')::numeric, 0), coalesce((_item->>'selling_price')::numeric, 0));
    END IF;
  END LOOP;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_goods_receipt(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goods_receipt(uuid, jsonb, text, text) TO authenticated;