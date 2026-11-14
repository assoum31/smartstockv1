DROP POLICY IF EXISTS "Managers add products" ON public.products;
DROP POLICY IF EXISTS "Managers update products" ON public.products;
CREATE POLICY "Sellers add products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());
CREATE POLICY "Sellers update products" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_sell())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_sell());