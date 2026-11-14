CREATE OR REPLACE FUNCTION public.claim_pin_attempt(_user_id uuid, _max integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.worker_activations
  SET attempts = attempts + 1
  WHERE user_id = _user_id
    AND attempts < _max
  RETURNING attempts;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pin_attempt(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pin_attempt(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pin_attempt(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pin_attempt(uuid, integer) TO service_role;