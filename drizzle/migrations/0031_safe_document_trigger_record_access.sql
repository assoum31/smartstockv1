CREATE OR REPLACE FUNCTION public.stamp_document_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _kind text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.document_year IS DISTINCT FROM OLD.document_year OR NEW.document_sequence IS DISTINCT FROM OLD.document_sequence THEN RAISE EXCEPTION 'document_number_immutable'; END IF;
  IF TG_TABLE_NAME='sales_tickets' AND (to_jsonb(NEW)->'invoice_sequence') IS DISTINCT FROM (to_jsonb(OLD)->'invoice_sequence') THEN RAISE EXCEPTION 'document_number_immutable'; END IF;
  IF TG_TABLE_NAME='stock_returns' AND (to_jsonb(NEW)->'kind') IS DISTINCT FROM (to_jsonb(OLD)->'kind') THEN RAISE EXCEPTION 'document_number_immutable'; END IF;
  RETURN NEW;
 END IF;
 NEW.document_year:=extract(year FROM coalesce(NEW.created_at,now()) AT TIME ZONE 'Africa/Algiers')::integer;
 _kind:=CASE TG_TABLE_NAME WHEN 'sales_tickets' THEN 'sale' WHEN 'goods_receipts' THEN 'receipt' ELSE CASE WHEN to_jsonb(NEW)->>'kind'='customer' THEN 'customer_return' ELSE 'supplier_return' END END;
 NEW.document_sequence:=public.allocate_document_number(NEW.tenant_id,_kind,NEW.document_year);
 IF TG_TABLE_NAME='sales_tickets' THEN NEW.invoice_sequence:=public.allocate_document_number(NEW.tenant_id,'invoice',NEW.document_year); END IF;
 RETURN NEW;
END; $$;