CREATE TABLE public.store_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name text,
  logo text,
  phone text,
  address text,
  email text,
  rc text,
  nif text,
  nis text,
  ai text,
  ticket_footer text,
  invoice_footer text,
  ticket_width integer NOT NULL DEFAULT 80 CHECK (ticket_width IN (58,60,80)),
  label_width numeric NOT NULL DEFAULT 40,
  label_height numeric NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store reads settings" ON public.store_settings FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "Managers add settings" ON public.store_settings FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_manager());
CREATE POLICY "Managers edit settings" ON public.store_settings FOR UPDATE TO authenticated USING (tenant_id = public.current_tenant_id() AND public.is_manager()) WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_manager());