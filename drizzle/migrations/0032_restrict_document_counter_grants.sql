REVOKE ALL ON public.document_counters FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.document_counters TO service_role;