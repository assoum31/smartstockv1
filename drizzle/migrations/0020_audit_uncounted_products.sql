CREATE OR REPLACE FUNCTION public.audit_uncounted_product(_session_id uuid, _barcode text, _mode text, _code text, _location text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid := current_tenant_id(); p record; _me text; w record;
BEGIN
  IF NOT (has_store_role('auditor') OR is_manager()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_sessions WHERE id = _session_id AND tenant_id = _t AND status = 'active') THEN RAISE EXCEPTION 'no_active_session'; END IF;
  SELECT * INTO p FROM products WHERE tenant_id = _t AND barcode = _barcode;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM inventory_logs WHERE session_id = _session_id AND barcode = p.barcode) THEN RAISE EXCEPTION 'already_counted'; END IF;
  SELECT full_name INTO _me FROM profiles WHERE id = auth.uid();
  IF _mode = 'zero' THEN
    IF nullif(trim(coalesce(_code,'')),'') IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_logs WHERE session_id = _session_id AND audit_code = trim(_code)) THEN
      RAISE EXCEPTION 'duplicate_audit_code';
    END IF;
    INSERT INTO inventory_logs(tenant_id, session_id, barcode, product_name, counted_quantity, location, counted_by, counted_by_name,
      audit_code, audited_by, audited_by_name, audited_at, notes)
    VALUES (_t, _session_id, p.barcode, p.name, 0, coalesce(nullif(trim(coalesce(_location,'')),''), p.default_location), auth.uid(), coalesce(_me,''),
      nullif(trim(coalesce(_code,'')),''), auth.uid(), coalesce(_me,''), now(), 'سجله المدقق كـ 0 (غير محسوب)');
    PERFORM log_activity(_t, 'inventory', 'audit_zero', p.barcode, NULL, jsonb_build_object('product', p.name), true);
  ELSIF _mode = 'alert' THEN
    FOR w IN SELECT pr.id FROM profiles pr JOIN user_roles ur ON ur.user_id = pr.id
      WHERE pr.tenant_id = _t AND pr.is_active AND ur.role = 'worker' LOOP
      IF NOT EXISTS (SELECT 1 FROM recount_requests WHERE session_id = _session_id AND barcode = p.barcode AND assigned_to = w.id AND status = 'pending') THEN
        INSERT INTO recount_requests(tenant_id, session_id, log_id, barcode, product_name, assigned_to, requested_by, requested_by_name)
        VALUES (_t, _session_id, NULL, p.barcode, p.name, w.id, auth.uid(), coalesce(_me,''));
      END IF;
    END LOOP;
    PERFORM log_activity(_t, 'inventory', 'count_requested', p.barcode, NULL, jsonb_build_object('product', p.name), false);
  ELSE
    RAISE EXCEPTION 'invalid_input';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.audit_uncounted_product(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_uncounted_product(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_recount(_req_id uuid, _barcode text, _name text, _qty numeric, _location text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _me text;
BEGIN
  SELECT * INTO r FROM recount_requests WHERE id = _req_id AND tenant_id = public.current_tenant_id() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.assigned_to IS DISTINCT FROM auth.uid() AND NOT public.is_manager() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _qty IS NULL OR _qty < 0 OR coalesce(trim(_barcode),'') = '' THEN RAISE EXCEPTION 'invalid_input'; END IF;
  IF r.log_id IS NULL THEN
    SELECT full_name INTO _me FROM profiles WHERE id = auth.uid();
    INSERT INTO inventory_logs(tenant_id, session_id, barcode, product_name, counted_quantity, location, notes, counted_by, counted_by_name)
    VALUES (r.tenant_id, r.session_id, trim(_barcode), coalesce(nullif(trim(_name),''), r.product_name), _qty,
      nullif(trim(coalesce(_location,'')),''), nullif(trim(coalesce(_notes,'')),''), auth.uid(), coalesce(_me,''));
    UPDATE recount_requests SET status = 'done', done_at = now()
      WHERE session_id = r.session_id AND barcode = r.barcode AND log_id IS NULL AND status = 'pending';
  ELSE
    UPDATE inventory_logs SET barcode = trim(_barcode), product_name = coalesce(nullif(trim(_name),''), product_name),
      counted_quantity = _qty, location = nullif(trim(coalesce(_location,'')),''), notes = nullif(trim(coalesce(_notes,'')),''),
      counted_at = now(), updated_at = now()
    WHERE id = r.log_id;
    UPDATE recount_requests SET status = 'done', done_at = now() WHERE id = _req_id;
  END IF;
END $$;