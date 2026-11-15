CREATE OR REPLACE FUNCTION public.enforce_tenant_feature() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.tenants; f text := TG_ARGV[0];
BEGIN
  SELECT * INTO t FROM public.tenants WHERE id = NEW.tenant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT t.is_active THEN RAISE EXCEPTION 'المتجر موقوف'; END IF;
  IF t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at <= now() THEN
    RAISE EXCEPTION 'انتهى الاشتراك، اتصل بالإدارة للتجديد';
  END IF;
  IF coalesce((t.features ->> f)::boolean, true) = false THEN
    RAISE EXCEPTION 'هذه الخاصية غير مفعلة في اشتراك المتجر';
  END IF;
  IF f = 'sales' AND auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'storekeeper')
     AND NOT (public.is_manager() OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'sales_manager')) THEN
    RAISE EXCEPTION 'أمين المتجر لا يملك صلاحية البيع';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_feature ON public.sales_tickets;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.sales_tickets FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('sales');
DROP TRIGGER IF EXISTS guard_feature ON public.cash_sessions;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.cash_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('sales');
DROP TRIGGER IF EXISTS guard_feature ON public.inventory_sessions;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.inventory_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('inventory');
DROP TRIGGER IF EXISTS guard_feature ON public.inventory_logs;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.inventory_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('inventory');
DROP TRIGGER IF EXISTS guard_feature ON public.goods_receipts;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('stock_io');
DROP TRIGGER IF EXISTS guard_feature ON public.stock_returns;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.stock_returns FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('stock_io');
DROP TRIGGER IF EXISTS guard_feature ON public.online_orders;
CREATE TRIGGER guard_feature BEFORE INSERT ON public.online_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_feature('online_store');

REVOKE EXECUTE ON FUNCTION public.enforce_tenant_feature() FROM PUBLIC, anon, authenticated;