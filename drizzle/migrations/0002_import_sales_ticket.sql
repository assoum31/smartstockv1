CREATE OR REPLACE FUNCTION public.import_sales_ticket(_session_id uuid, _items jsonb, _notes text DEFAULT NULL, _sold_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  _id := public.create_sales_ticket(_session_id, _items, _notes);
  IF _sold_at IS NOT NULL THEN
    UPDATE public.sales_tickets SET created_at = _sold_at WHERE id = _id;
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.import_sales_ticket(uuid, jsonb, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_sales_ticket(uuid, jsonb, text, timestamptz) TO authenticated;