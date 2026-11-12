CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '—',
  category text NOT NULL,
  action text NOT NULL,
  ref text,
  amount numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_tenant_time ON public.activity_log (tenant_id, created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or managers read store" ON public.activity_log FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (actor_id = auth.uid() OR public.is_manager()));

CREATE OR REPLACE FUNCTION public.log_activity(_tenant uuid, _category text, _action text, _ref text, _amount numeric, _details jsonb, _sensitive boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF _tenant IS NULL THEN RETURN; END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO activity_log (tenant_id, actor_id, actor_name, category, action, ref, amount, details, sensitive)
  VALUES (_tenant, auth.uid(), coalesce(_name, '—'), _category, _action, _ref, _amount, coalesce(_details,'{}'::jsonb), _sensitive);
END $$;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, text, numeric, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_tickets' THEN
    PERFORM log_activity(NEW.tenant_id, 'sale', 'بيع', '#' || lpad(NEW.ticket_number::text, 4, '0'), NEW.total_amount, '{}'::jsonb, true);
  ELSIF TG_TABLE_NAME = 'stock_returns' THEN
    PERFORM log_activity(NEW.tenant_id, 'return', CASE WHEN NEW.kind='customer' THEN 'إرجاع زبون' ELSE 'إرجاع مورد' END,
      '#' || lpad(NEW.return_number::text, 4, '0'), NEW.total_amount,
      jsonb_build_object('ticket', NEW.ticket_ref, 'supplier', NEW.supplier_name, 'reason', NEW.reason), true);
  ELSIF TG_TABLE_NAME = 'goods_receipts' THEN
    PERFORM log_activity(NEW.tenant_id, 'receipt', 'وصول سلع', '#' || lpad(NEW.receipt_number::text, 4, '0'), NEW.total_amount,
      jsonb_build_object('supplier', NEW.supplier_name, 'reference', NEW.reference), true);
  ELSIF TG_TABLE_NAME = 'cash_sessions' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM log_activity(NEW.tenant_id, 'cash', 'فتح الصندوق', NULL, NEW.opening_amount, '{}'::jsonb, true);
    ELSIF NEW.status = 'closed' AND OLD.status = 'open' THEN
      PERFORM log_activity(NEW.tenant_id, 'cash', 'غلق الصندوق', NULL, NEW.closing_amount, '{}'::jsonb, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'inventory_sessions' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM log_activity(NEW.tenant_id, 'inventory', 'فتح جلسة جرد', NEW.name, NULL, '{}'::jsonb, false);
    ELSIF NEW.status <> OLD.status THEN
      PERFORM log_activity(NEW.tenant_id, 'inventory', 'غلق جلسة جرد', NEW.name, NULL, '{}'::jsonb, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'inventory_logs' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM log_activity(NEW.tenant_id, 'inventory', 'عدّ', NEW.barcode, NEW.counted_quantity, jsonb_build_object('product', NEW.product_name), false);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM log_activity(OLD.tenant_id, 'inventory', 'حذف عدّ', OLD.barcode, OLD.counted_quantity, jsonb_build_object('product', OLD.product_name), true);
      RETURN OLD;
    END IF;
  ELSIF TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM log_activity(NEW.tenant_id, 'product', 'منتج جديد', NEW.barcode, NULL, jsonb_build_object('product', NEW.name), false);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM log_activity(OLD.tenant_id, 'product', 'حذف منتج', OLD.barcode, NULL, jsonb_build_object('product', OLD.name), true);
      RETURN OLD;
    ELSIF NEW.purchase_price IS DISTINCT FROM OLD.purchase_price OR NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
      PERFORM log_activity(NEW.tenant_id, 'price', 'تغيير السعر', NEW.barcode, NEW.selling_price,
        jsonb_build_object('product', NEW.name, 'old_purchase', OLD.purchase_price, 'new_purchase', NEW.purchase_price,
                           'old_selling', OLD.selling_price, 'new_selling', NEW.selling_price), true);
    END IF;
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    DECLARE _t uuid; _u text;
    BEGIN
      SELECT tenant_id, full_name INTO _t, _u FROM profiles WHERE id = coalesce(NEW.user_id, OLD.user_id);
      PERFORM log_activity(_t, 'team', CASE TG_OP WHEN 'INSERT' THEN 'صلاحية جديدة' WHEN 'DELETE' THEN 'سحب صلاحية' ELSE 'تعديل صلاحية' END,
        _u, NULL, jsonb_build_object('role', coalesce(NEW.role, OLD.role)), true);
    END;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER act_sales AFTER INSERT ON public.sales_tickets FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_returns AFTER INSERT ON public.stock_returns FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_receipts AFTER INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_cash AFTER INSERT OR UPDATE ON public.cash_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_inv_sessions AFTER INSERT OR UPDATE ON public.inventory_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_inv_logs AFTER INSERT OR DELETE ON public.inventory_logs FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_activity();
CREATE TRIGGER act_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.trg_activity();

ALTER TABLE public.stock_returns ADD COLUMN ticket_id uuid REFERENCES public.sales_tickets(id);

CREATE OR REPLACE FUNCTION public.create_ticket_return(_ticket_id uuid, _items jsonb, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.current_tenant_id(); _num int; _id uuid; _bad text;
BEGIN
  IF _tenant IS NULL OR NOT public.can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT ticket_number INTO _num FROM sales_tickets WHERE id = _ticket_id AND tenant_id = _tenant;
  IF _num IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ticketreturn' || _ticket_id::text));
  SELECT x.b INTO _bad FROM (
    SELECT trim(e->>'barcode') b, sum((e->>'quantity')::numeric) q FROM jsonb_array_elements(_items) e GROUP BY 1) x
  WHERE x.q > coalesce((SELECT sum(quantity) FROM sales_ticket_items WHERE ticket_id = _ticket_id AND barcode = x.b), 0)
            - coalesce((SELECT sum(i.quantity) FROM stock_return_items i JOIN stock_returns r ON r.id = i.return_id
                        WHERE r.ticket_id = _ticket_id AND i.barcode = x.b), 0)
  LIMIT 1;
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'return_exceeds_sold'; END IF;
  _id := public.create_stock_return('customer', _items, NULL, lpad(_num::text, 4, '0'), _reason);
  UPDATE stock_returns SET ticket_id = _ticket_id WHERE id = _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_ticket_return(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ticket_return(uuid, jsonb, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;