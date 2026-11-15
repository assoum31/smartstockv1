ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{"sales":true,"inventory":true,"stock_io":true,"import_export":true,"online_store":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_managers integer,
  ADD COLUMN IF NOT EXISTS max_members integer,
  ADD COLUMN IF NOT EXISTS notes text;
CREATE OR REPLACE FUNCTION public.can_sell() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager() OR public.has_store_role('cashier')
    OR (public.current_tenant_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('sales_manager','storekeeper')))
$$;