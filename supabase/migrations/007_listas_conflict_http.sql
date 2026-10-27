-- Business revision conflicts must be HTTP 409, not transient serialization failures.
-- Preserve the already-applied migration and change ONLY this feature's RPC.
BEGIN;
DO $$
DECLARE source text;
BEGIN
  SELECT pg_get_functiondef('public.listas_commit_v1(uuid,text,jsonb,text)'::regprocedure) INTO source;
  IF position('ERRCODE=''40001''' IN source)=0 THEN
    RAISE EXCEPTION 'Unexpected Listas function definition';
  END IF;
  EXECUTE replace(source, 'ERRCODE=''40001''', 'ERRCODE=''PT409''');
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
