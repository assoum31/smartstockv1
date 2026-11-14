CREATE OR REPLACE VIEW public.stock_movements WITH (security_invoker = true) AS
SELECT i.id, i.tenant_id, i.barcode, i.product_name, 'receipt'::text AS kind, i.quantity AS qty, i.purchase_price AS unit_price,
  ('#' || g.receipt_number || coalesce(' · ' || g.supplier_name, ''))::text AS ref, g.created_by_name AS actor, g.created_at
FROM public.goods_receipt_items i JOIN public.goods_receipts g ON g.id = i.receipt_id
UNION ALL
SELECT i.id, i.tenant_id, i.barcode, i.product_name, 'sale', -i.quantity, i.unit_price, ('#' || t.ticket_number)::text, t.created_by_name, t.created_at
FROM public.sales_ticket_items i JOIN public.sales_tickets t ON t.id = i.ticket_id
UNION ALL
SELECT i.id, i.tenant_id, i.barcode, i.product_name, CASE WHEN r.kind='customer' THEN 'customer_return' ELSE 'supplier_return' END,
  CASE WHEN r.kind='customer' THEN i.quantity ELSE -i.quantity END, i.unit_price,
  ('#' || r.return_number || coalesce(' · ' || r.supplier_name, ''))::text, r.created_by_name, r.created_at
FROM public.stock_return_items i JOIN public.stock_returns r ON r.id = i.return_id;
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;