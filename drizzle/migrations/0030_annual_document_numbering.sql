CREATE TABLE public.document_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind text NOT NULL CHECK (kind IN ('sale','invoice','receipt','customer_return','supplier_return')),
  document_year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, kind, document_year)
);
GRANT ALL ON public.document_counters TO service_role;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales_tickets ADD COLUMN document_year integer, ADD COLUMN document_sequence integer, ADD COLUMN invoice_sequence integer;
ALTER TABLE public.goods_receipts ADD COLUMN document_year integer, ADD COLUMN document_sequence integer;
ALTER TABLE public.stock_returns ADD COLUMN document_year integer, ADD COLUMN document_sequence integer;

WITH numbered AS (
 SELECT id, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers')::integer y,
 row_number() OVER (PARTITION BY tenant_id, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers') ORDER BY created_at,id)::integer n
 FROM public.sales_tickets
) UPDATE public.sales_tickets t SET document_year=n.y,document_sequence=n.n,invoice_sequence=n.n FROM numbered n WHERE t.id=n.id;
WITH numbered AS (
 SELECT id, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers')::integer y,
 row_number() OVER (PARTITION BY tenant_id, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers') ORDER BY created_at,id)::integer n
 FROM public.goods_receipts
) UPDATE public.goods_receipts t SET document_year=n.y,document_sequence=n.n FROM numbered n WHERE t.id=n.id;
WITH numbered AS (
 SELECT id, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers')::integer y,
 row_number() OVER (PARTITION BY tenant_id,kind, extract(year FROM created_at AT TIME ZONE 'Africa/Algiers') ORDER BY created_at,id)::integer n
 FROM public.stock_returns
) UPDATE public.stock_returns t SET document_year=n.y,document_sequence=n.n FROM numbered n WHERE t.id=n.id;

INSERT INTO public.document_counters(tenant_id,kind,document_year,last_number)
 SELECT tenant_id,'sale',document_year,max(document_sequence) FROM public.sales_tickets GROUP BY tenant_id,document_year
 UNION ALL SELECT tenant_id,'invoice',document_year,max(invoice_sequence) FROM public.sales_tickets GROUP BY tenant_id,document_year
 UNION ALL SELECT tenant_id,'receipt',document_year,max(document_sequence) FROM public.goods_receipts GROUP BY tenant_id,document_year
 UNION ALL SELECT tenant_id,CASE WHEN kind='customer' THEN 'customer_return' ELSE 'supplier_return' END,document_year,max(document_sequence) FROM public.stock_returns GROUP BY tenant_id,kind,document_year;

CREATE UNIQUE INDEX sales_document_reference ON public.sales_tickets(tenant_id,document_year,document_sequence);
CREATE UNIQUE INDEX invoice_document_reference ON public.sales_tickets(tenant_id,document_year,invoice_sequence);
CREATE UNIQUE INDEX receipt_document_reference ON public.goods_receipts(tenant_id,document_year,document_sequence);
CREATE UNIQUE INDEX return_document_reference ON public.stock_returns(tenant_id,kind,document_year,document_sequence);

CREATE FUNCTION public.allocate_document_number(_tenant uuid,_kind text,_year integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _next integer;
BEGIN
 INSERT INTO public.document_counters(tenant_id,kind,document_year,last_number) VALUES (_tenant,_kind,_year,1)
 ON CONFLICT(tenant_id,kind,document_year) DO UPDATE SET last_number=document_counters.last_number+1
 RETURNING last_number INTO _next;
 IF _next>9999999 THEN RAISE EXCEPTION 'document_sequence_exhausted'; END IF;
 RETURN _next;
END; $$;
REVOKE ALL ON FUNCTION public.allocate_document_number(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_document_number(uuid,text,integer) TO service_role;

CREATE FUNCTION public.stamp_document_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _kind text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.document_year IS DISTINCT FROM OLD.document_year OR NEW.document_sequence IS DISTINCT FROM OLD.document_sequence THEN
   RAISE EXCEPTION 'document_number_immutable';
  END IF;
  IF TG_TABLE_NAME='sales_tickets' AND (to_jsonb(NEW)->'invoice_sequence') IS DISTINCT FROM (to_jsonb(OLD)->'invoice_sequence') THEN
   RAISE EXCEPTION 'document_number_immutable';
  END IF;
  IF TG_TABLE_NAME='stock_returns' AND (to_jsonb(NEW)->'kind') IS DISTINCT FROM (to_jsonb(OLD)->'kind') THEN
   RAISE EXCEPTION 'document_number_immutable';
  END IF;
  RETURN NEW;
 END IF;
 NEW.document_year:=extract(year FROM coalesce(NEW.created_at,now()) AT TIME ZONE 'Africa/Algiers')::integer;
 _kind:=CASE TG_TABLE_NAME WHEN 'sales_tickets' THEN 'sale' WHEN 'goods_receipts' THEN 'receipt' ELSE CASE WHEN NEW.kind='customer' THEN 'customer_return' ELSE 'supplier_return' END END;
 NEW.document_sequence:=public.allocate_document_number(NEW.tenant_id,_kind,NEW.document_year);
 IF TG_TABLE_NAME='sales_tickets' THEN
  NEW.invoice_sequence:=public.allocate_document_number(NEW.tenant_id,'invoice',NEW.document_year);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.stamp_document_number() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER number_document BEFORE INSERT OR UPDATE ON public.sales_tickets FOR EACH ROW EXECUTE FUNCTION public.stamp_document_number();
CREATE TRIGGER number_document BEFORE INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.stamp_document_number();
CREATE TRIGGER number_document BEFORE INSERT OR UPDATE ON public.stock_returns FOR EACH ROW EXECUTE FUNCTION public.stamp_document_number();