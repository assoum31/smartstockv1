CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  name text NOT NULL,
  default_location text,
  system_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  product_name text NOT NULL,
  counted_quantity numeric NOT NULL DEFAULT 0,
  location text,
  counted_by_name text NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_logs_barcode_idx ON public.inventory_logs (barcode, counted_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_logs TO authenticated;
GRANT ALL ON public.inventory_logs TO service_role;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_logs;

CREATE TYPE public.app_role AS ENUM ('master', 'manager', 'worker');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_code_format CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,30}$' AND code <> 'admin')
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  username text NOT NULL,
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_activate boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_tenant_username_key
  ON public.profiles (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), username);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.worker_activations (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.worker_activations TO service_role;
ALTER TABLE public.worker_activations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.tenant_id
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = auth.uid() AND p.is_active AND t.is_active
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_tenant_id() IS NOT NULL AND public.has_role(auth.uid(), 'manager')
$$;

CREATE POLICY "See own store" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.has_role(auth.uid(), 'master'));
CREATE POLICY "See people of own store" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'master'));
CREATE POLICY "See roles of own store" ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id())
  );

CREATE TABLE public.inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid
);
CREATE UNIQUE INDEX inventory_sessions_one_active ON public.inventory_sessions (tenant_id) WHERE status = 'active';
GRANT SELECT ON public.inventory_sessions TO authenticated;
GRANT ALL ON public.inventory_sessions TO service_role;
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own store sessions" ON public.inventory_sessions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE TABLE public.session_stock_snapshots (
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  barcode text NOT NULL,
  product_name text NOT NULL,
  system_quantity numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, barcode)
);
GRANT SELECT ON public.session_stock_snapshots TO authenticated;
GRANT ALL ON public.session_stock_snapshots TO service_role;
ALTER TABLE public.session_stock_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own store snapshots" ON public.session_stock_snapshots FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

ALTER TABLE public.products ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.products ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX products_tenant_barcode_key ON public.products (tenant_id, barcode);
CREATE POLICY "Store members read products" ON public.products FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Managers add products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_manager());
CREATE POLICY "Managers update products" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_manager());
CREATE POLICY "Managers delete products" ON public.products FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

ALTER TABLE public.inventory_logs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_logs ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.inventory_logs ADD COLUMN session_id uuid REFERENCES public.inventory_sessions(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_logs ADD COLUMN counted_by uuid DEFAULT auth.uid();
ALTER TABLE public.inventory_logs ADD COLUMN client_id uuid UNIQUE;
ALTER TABLE public.inventory_logs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX inventory_logs_tenant_session_barcode_idx ON public.inventory_logs (tenant_id, session_id, barcode);

CREATE OR REPLACE FUNCTION public.session_is_active(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_sessions s
    WHERE s.id = _session_id AND s.status = 'active' AND s.tenant_id = public.current_tenant_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.stamp_inventory_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.tenant_id := public.current_tenant_id();
      NEW.counted_by := auth.uid();
    ELSE
      NEW.tenant_id := OLD.tenant_id;
      NEW.session_id := OLD.session_id;
      NEW.client_id := OLD.client_id;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_logs_stamp BEFORE INSERT OR UPDATE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_inventory_log();

CREATE POLICY "Store members read counts" ON public.inventory_logs FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Members add counts to the active session" ON public.inventory_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND counted_by = auth.uid() AND public.session_is_active(session_id));
CREATE POLICY "Members edit own counts, managers edit all" ON public.inventory_logs FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.session_is_active(session_id) AND (counted_by = auth.uid() OR public.is_manager()))
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Managers delete counts" ON public.inventory_logs FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_manager());

CREATE OR REPLACE FUNCTION public.start_inventory_session(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid := public.current_tenant_id();
  _id uuid;
BEGIN
  IF _tenant IS NULL OR NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_sessions WHERE tenant_id = _tenant AND status = 'active') THEN
    RAISE EXCEPTION 'session_already_active';
  END IF;
  INSERT INTO public.inventory_sessions (tenant_id, name, created_by)
  VALUES (_tenant, COALESCE(NULLIF(trim(_name), ''), 'جرد ' || to_char(now(), 'YYYY-MM-DD')), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.session_stock_snapshots (session_id, tenant_id, barcode, product_name, system_quantity)
  SELECT _id, _tenant, p.barcode, p.name, p.system_quantity FROM public.products p WHERE p.tenant_id = _tenant;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_inventory_session(_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  UPDATE public.inventory_sessions SET status = 'closed', closed_at = now()
  WHERE id = _session_id AND tenant_id = public.current_tenant_id() AND status = 'active';
END;
$$;

CREATE VIEW public.session_variances WITH (security_invoker = true) AS
SELECT
  COALESCE(s.session_id, l.session_id) AS session_id,
  COALESCE(s.tenant_id, l.tenant_id) AS tenant_id,
  COALESCE(s.barcode, l.barcode) AS barcode,
  COALESCE(s.product_name, l.product_name) AS product_name,
  COALESCE(s.system_quantity, 0) AS system_quantity,
  COALESCE(l.counted, 0) AS counted_quantity,
  COALESCE(l.counted, 0) - COALESCE(s.system_quantity, 0) AS variance,
  COALESCE(l.entries, 0) AS entries,
  (s.barcode IS NOT NULL) AS in_snapshot,
  l.locations
FROM public.session_stock_snapshots s
FULL OUTER JOIN (
  SELECT session_id, tenant_id, barcode,
         max(product_name) AS product_name,
         sum(counted_quantity) AS counted,
         count(*)::int AS entries,
         array_agg(DISTINCT COALESCE(location, '')) AS locations
  FROM public.inventory_logs
  WHERE session_id IS NOT NULL
  GROUP BY session_id, tenant_id, barcode
) l ON l.session_id = s.session_id AND l.barcode = s.barcode;
GRANT SELECT ON public.session_variances TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.session_is_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_inventory_session(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_inventory_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stamp_inventory_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.session_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_inventory_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_inventory_session(uuid) TO authenticated, service_role;

CREATE POLICY "Master reads all sessions" ON public.inventory_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master reads all snapshots" ON public.session_stock_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master reads all counts" ON public.inventory_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
CREATE POLICY "Master reads all products" ON public.products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE TABLE public.sales_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  ticket_number integer NOT NULL,
  created_by uuid,
  created_by_name text NOT NULL,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, ticket_number)
);
CREATE TABLE public.sales_ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.sales_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0
);
CREATE INDEX ON public.sales_ticket_items (session_id);
CREATE INDEX ON public.sales_tickets (session_id);
GRANT SELECT ON public.sales_tickets TO authenticated;
GRANT SELECT ON public.sales_ticket_items TO authenticated;
GRANT ALL ON public.sales_tickets TO service_role;
GRANT ALL ON public.sales_ticket_items TO service_role;
ALTER TABLE public.sales_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_ticket_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads tickets" ON public.sales_tickets FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'master'));
CREATE POLICY "Store reads ticket items" ON public.sales_ticket_items FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.has_role(auth.uid(), 'master'));

CREATE OR REPLACE FUNCTION public.create_sales_ticket(_session_id uuid, _items jsonb, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid := public.current_tenant_id();
  _id uuid;
  _num integer;
  _name text;
  _item jsonb;
  _total numeric := 0;
BEGIN
  IF _tenant IS NULL OR NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_sessions WHERE id = _session_id AND tenant_id = _tenant AND status = 'active') THEN
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
  PERFORM pg_advisory_xact_lock(hashtext(_session_id::text));
  SELECT coalesce(max(ticket_number), 0) + 1 INTO _num FROM sales_tickets WHERE session_id = _session_id;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO sales_tickets (tenant_id, session_id, ticket_number, created_by, created_by_name, notes, total_amount)
  VALUES (_tenant, _session_id, _num, auth.uid(), coalesce(_name, '—'), nullif(trim(_notes), ''), _total)
  RETURNING id INTO _id;
  INSERT INTO sales_ticket_items (ticket_id, tenant_id, session_id, barcode, product_name, quantity, unit_price)
  SELECT _id, _tenant, _session_id, trim(e->>'barcode'), coalesce(nullif(trim(e->>'product_name'), ''), trim(e->>'barcode')),
         (e->>'quantity')::numeric, coalesce((e->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) e;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_sales_ticket(_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  DELETE FROM sales_tickets t WHERE t.id = _ticket_id AND t.tenant_id = public.current_tenant_id()
    AND public.session_is_active(t.session_id);
END $$;
REVOKE ALL ON FUNCTION public.create_sales_ticket(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_sales_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_ticket(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sales_ticket(uuid) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_tickets;