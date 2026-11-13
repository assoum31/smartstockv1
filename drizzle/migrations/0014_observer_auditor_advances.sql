ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'observer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS audit_code text;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS audited_by uuid;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS audited_by_name text;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS audited_at timestamptz;

CREATE OR REPLACE FUNCTION public.next_audit_code(_session_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lpad((coalesce(max(nullif(regexp_replace(audit_code, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  FROM inventory_logs WHERE session_id = _session_id AND tenant_id = current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.audit_inventory_log(_log_id uuid, _code text, _barcode text, _name text, _location text, _qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l inventory_logs; _me text;
BEGIN
  IF NOT (is_manager() OR has_store_role('auditor')) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO _l FROM inventory_logs WHERE id = _log_id AND tenant_id = current_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT session_is_active(_l.session_id) THEN RAISE EXCEPTION 'session_closed'; END IF;
  IF nullif(trim(_code), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventory_logs WHERE session_id = _l.session_id AND audit_code = trim(_code) AND id <> _log_id) THEN
    RAISE EXCEPTION 'duplicate_audit_code';
  END IF;
  SELECT full_name INTO _me FROM profiles WHERE id = auth.uid();
  UPDATE inventory_logs SET
    audit_code = nullif(trim(_code), ''),
    barcode = coalesce(nullif(trim(_barcode), ''), barcode),
    product_name = coalesce(nullif(trim(_name), ''), product_name),
    location = nullif(trim(coalesce(_location, '')), ''),
    counted_quantity = coalesce(_qty, counted_quantity),
    audited_by = auth.uid(), audited_by_name = coalesce(_me, ''), audited_at = now(), updated_at = now()
  WHERE id = _log_id;
  PERFORM log_activity(_l.tenant_id, 'audit', 'تدقيق', coalesce(nullif(trim(_barcode), ''), _l.barcode),
    _qty, jsonb_build_object('product', coalesce(nullif(trim(_name), ''), _l.product_name), 'code', _code, 'location', _location,
      'old_qty', _l.counted_quantity), _qty IS NOT NULL AND _qty <> _l.counted_quantity);
END $$;
GRANT EXECUTE ON FUNCTION public.audit_inventory_log(uuid, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_audit_code(uuid) TO authenticated;

CREATE TABLE public.cash_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  beneficiary_id uuid,
  beneficiary_name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text,
  cash_session_id uuid,
  created_by uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cash_advances TO authenticated;
GRANT ALL ON public.cash_advances TO service_role;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read store advances" ON public.cash_advances FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_sell());

CREATE OR REPLACE FUNCTION public.create_cash_advance(_beneficiary_id uuid, _amount numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _t uuid := current_tenant_id(); _name text; _me text; _cs uuid;
BEGIN
  IF NOT can_sell() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT full_name INTO _name FROM profiles WHERE id = _beneficiary_id AND tenant_id = _t;
  IF _name IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT full_name INTO _me FROM profiles WHERE id = auth.uid();
  SELECT id INTO _cs FROM cash_sessions WHERE tenant_id = _t AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  INSERT INTO cash_advances(tenant_id, beneficiary_id, beneficiary_name, amount, reason, cash_session_id, created_by, created_by_name)
  VALUES (_t, _beneficiary_id, _name, _amount, nullif(trim(coalesce(_reason, '')), ''), _cs, auth.uid(), coalesce(_me, ''))
  RETURNING id INTO _id;
  PERFORM log_activity(_t, 'cash', 'تسبيق', _name, _amount, jsonb_build_object('reason', _reason), true);
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_cash_advance(uuid, numeric, text) TO authenticated;