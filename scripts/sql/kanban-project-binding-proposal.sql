-- REVIEW PROPOSAL ONLY. Do not run remotely without separate approval.
-- Incremental patch against the inspected legacy schema, NOT a migration baseline.
-- Local verification: node scripts/test-kanban-project-sql.cjs
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- One transaction-scoped mutex across Kanban writes, acquired BEFORE row locks.
-- This deliberately serializes different users too; see the impact document.
SELECT pg_catalog.pg_advisory_xact_lock(1919382512, 1);
LOCK TABLE public.kanban_projects, public.kanban_columns, public.kanban_cards
  IN ACCESS EXCLUSIVE MODE;

DO $preconditions$
DECLARE
  v_expected RECORD;
  v_count INTEGER;
BEGIN
  IF pg_catalog.to_regnamespace('kanban_integrity') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.edit_kanban_project_v1(uuid,uuid,jsonb,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Patch already present or namespace occupied; inspect before proceeding';
  END IF;
  IF pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration history changed; review baseline separately';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid IN ('public.kanban_projects'::regclass,
      'public.kanban_columns'::regclass, 'public.kanban_cards'::regclass)
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS must already be enabled';
  END IF;
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('kanban_projects', 'id', 'uuid'),
      ('kanban_projects', 'user_id', 'uuid'),
      ('kanban_projects', 'name', 'text'),
      ('kanban_projects', 'color', 'text'),
      ('kanban_projects', 'created_at', 'timestamp with time zone'),
      ('kanban_columns', 'id', 'uuid'),
      ('kanban_columns', 'user_id', 'uuid'),
      ('kanban_columns', 'project_id', 'uuid'),
      ('kanban_cards', 'id', 'uuid'),
      ('kanban_cards', 'user_id', 'uuid'),
      ('kanban_cards', 'column_id', 'uuid'),
      ('kanban_cards', 'project_id', 'uuid')
    ) AS fields(table_name, column_name, data_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_expected.table_name
        AND c.column_name = v_expected.column_name AND c.data_type = v_expected.data_type
    ) THEN
      RAISE EXCEPTION 'Required column changed: %.%', v_expected.table_name, v_expected.column_name;
    END IF;
  END LOOP;
  -- Fingerprint function BODIES, not pretty-printed headers (PG-version dependent).
  -- These hashes are metadata only; no real users or card content are embedded.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.edit_kanban_column_v1(uuid,uuid,jsonb)', '95c61fbf871de8b9befdc6a60505cf44'),
      ('public.get_kanban_data(uuid)', '82f11548f2ab0c06d6a8e5e8b4a540ce'),
      ('public.get_user_kanban(uuid)', 'd2af0407087c68fcf2710c1c8ff957b8'),
      ('public.move_card(uuid,uuid,uuid,integer)', '4ed79e3d00ef4f82c9c61ddefba72910'),
      ('public.update_card_positions(uuid,jsonb)', 'e58c9e33a248ee1e7bb0e2a23ef42959'),
      ('public.update_column_positions(uuid,jsonb)', '8770d286fe3d19d0c44aa8175f3e75ec')
    ) AS functions(signature, body_hash)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(v_expected.signature)
        AND p.prolang = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
        AND pg_catalog.md5(p.prosrc) = v_expected.body_hash
    ) THEN
      RAISE EXCEPTION 'RPC changed; refresh inspection: %', v_expected.signature;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.kanban_projects) <> 1
     OR (SELECT count(*) FROM public.kanban_columns) <> 14
     OR (SELECT count(*) FROM public.kanban_cards) <> 21 THEN
    RAISE EXCEPTION 'Record counts changed; refresh impact preview';
  END IF;
  SELECT count(*) INTO v_count FROM public.kanban_cards k
  JOIN public.kanban_columns c ON c.id = k.column_id
  WHERE k.project_id IS DISTINCT FROM c.project_id;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Mismatch count changed; refresh impact preview';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.kanban_cards k LEFT JOIN public.kanban_columns c ON c.id = k.column_id
    WHERE c.id IS NULL OR k.user_id IS DISTINCT FROM c.user_id
  ) OR EXISTS (
    SELECT 1 FROM public.kanban_columns c LEFT JOIN public.kanban_projects p ON p.id = c.project_id
    WHERE c.project_id IS NOT NULL AND (p.id IS NULL OR p.user_id IS DISTINCT FROM c.user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.kanban_cards k LEFT JOIN public.kanban_projects p ON p.id = k.project_id
    WHERE k.project_id IS NOT NULL AND (p.id IS NULL OR p.user_id IS DISTINCT FROM k.user_id)
  ) THEN
    RAISE EXCEPTION 'Invalid parent or ownership; abort instead of guessing';
  END IF;
END
$preconditions$;

-- Recovery records stay INSIDE the database in a non-exposed, restricted schema.
-- They are not printed, exported to this repository, or accessible via app roles.
CREATE SCHEMA kanban_integrity;
REVOKE ALL ON SCHEMA kanban_integrity FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE kanban_integrity.pre_binding_projects AS
  SELECT id, pg_catalog.md5(pg_catalog.to_jsonb(p)::text) AS original_fingerprint
  FROM public.kanban_projects p;
CREATE TABLE kanban_integrity.pre_binding_columns AS
  SELECT id, user_id, project_id, updated_at,
    pg_catalog.md5(pg_catalog.to_jsonb(c)::text) AS original_fingerprint
  FROM public.kanban_columns c;
CREATE TABLE kanban_integrity.pre_binding_cards AS
  SELECT id, user_id, column_id, project_id, updated_at,
    pg_catalog.md5((pg_catalog.to_jsonb(k) - 'project_id' - 'updated_at')::text) AS preserved_fingerprint
  FROM public.kanban_cards k;
CREATE TABLE kanban_integrity.pre_binding_functions AS
  SELECT p.oid::regprocedure::text AS signature,
    pg_catalog.pg_get_functiondef(p.oid) AS definition, p.proacl::text AS original_acl
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('edit_kanban_column_v1',
    'get_kanban_data', 'get_user_kanban', 'move_card',
    'update_card_positions', 'update_column_positions');
CREATE TABLE kanban_integrity.pre_binding_table_permissions AS
  SELECT c.oid::regclass::text AS relation, c.relacl::text AS original_acl
  FROM pg_catalog.pg_class c WHERE c.oid IN ('public.kanban_projects'::regclass,
    'public.kanban_columns'::regclass, 'public.kanban_cards'::regclass);
REVOKE ALL ON ALL TABLES IN SCHEMA kanban_integrity
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE kanban_integrity.pre_binding_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_integrity.pre_binding_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_integrity.pre_binding_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_integrity.pre_binding_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_integrity.pre_binding_table_permissions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION kanban_integrity.serialize()
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT pg_catalog.pg_advisory_xact_lock(1919382512, 1);
$function$;
CREATE FUNCTION kanban_integrity.guard_statement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  PERFORM kanban_integrity.serialize();
  RETURN NULL;
END;
$function$;
CREATE FUNCTION kanban_integrity.guard_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Kanban ownership is immutable';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION kanban_integrity.guard_column()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Kanban ownership is immutable';
  END IF;
  IF NEW.project_id IS NOT NULL THEN
    PERFORM p.id FROM public.kanban_projects p
    WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Project is not owned by column owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION kanban_integrity.inherit_card_project()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_owner uuid;
  v_project uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Kanban ownership is immutable';
  END IF;
  -- The statement guard has already serialized this write before its card locks.
  -- FOR SHARE also rejects stale snapshots under REPEATABLE READ.
  SELECT c.user_id, c.project_id INTO v_owner, v_project
  FROM public.kanban_columns c WHERE c.id = NEW.column_id FOR SHARE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Column is not owned by card owner';
  END IF;
  IF v_project IS NOT NULL THEN
    PERFORM p.id FROM public.kanban_projects p
    WHERE p.id = v_project AND p.user_id = NEW.user_id FOR SHARE;
    IF NOT FOUND THEN
      -- A project DELETE can fire the card SET NULL before the column SET NULL.
      -- Within that transaction the deleted project is no longer visible.
      IF EXISTS (SELECT 1 FROM public.kanban_projects p WHERE p.id = v_project) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Project owner mismatch';
      END IF;
      v_project := NULL;
    END IF;
  END IF;
  NEW.project_id := v_project;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION kanban_integrity.propagate_column_project()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kanban_cards k
    WHERE k.column_id = NEW.id AND k.user_id IS DISTINCT FROM NEW.user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Column contains a card of another owner';
  END IF;
  UPDATE public.kanban_cards k SET project_id = NEW.project_id
  WHERE k.column_id = NEW.id AND k.project_id IS DISTINCT FROM NEW.project_id;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kanban_integrity FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA kanban_integrity TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION kanban_integrity.serialize() TO authenticated, service_role;

CREATE TRIGGER kanban_serialize_projects BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON public.kanban_projects FOR EACH STATEMENT EXECUTE FUNCTION kanban_integrity.guard_statement();
CREATE TRIGGER kanban_serialize_columns BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON public.kanban_columns FOR EACH STATEMENT EXECUTE FUNCTION kanban_integrity.guard_statement();
CREATE TRIGGER kanban_serialize_cards BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON public.kanban_cards FOR EACH STATEMENT EXECUTE FUNCTION kanban_integrity.guard_statement();
CREATE TRIGGER kanban_project_owner BEFORE UPDATE ON public.kanban_projects
  FOR EACH ROW EXECUTE FUNCTION kanban_integrity.guard_owner();
CREATE TRIGGER kanban_column_parent BEFORE INSERT OR UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION kanban_integrity.guard_column();
CREATE TRIGGER kanban_card_parent BEFORE INSERT OR UPDATE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION kanban_integrity.inherit_card_project();
CREATE TRIGGER kanban_column_project AFTER UPDATE OF project_id ON public.kanban_columns
  FOR EACH ROW WHEN (OLD.project_id IS DISTINCT FROM NEW.project_id)
  EXECUTE FUNCTION kanban_integrity.propagate_column_project();

-- Preserve the inspected legacy RPC bodies and response contracts. Patch their
-- FIRST BEGIN only, before SELECT ... FOR SHARE / UPDATE can acquire row locks.
-- Hash preconditions above reject any different body instead of guessing.
DO $rpc_patch$
DECLARE
  v_function RECORD;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.oid::regprocedure::text AS signature,
      p.proname IN ('move_card', 'update_card_positions',
        'update_column_positions', 'edit_kanban_column_v1') AS writes
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_kanban_data', 'get_user_kanban',
      'move_card', 'update_card_positions', 'update_column_positions', 'edit_kanban_column_v1')
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
    IF v_function.writes THEN
      v_definition := pg_catalog.regexp_replace(v_definition,
        E'\\nBEGIN\\n', E'\nBEGIN\n  PERFORM kanban_integrity.serialize();\n');
      IF pg_catalog.strpos(v_definition, 'PERFORM kanban_integrity.serialize();') = 0 THEN
        RAISE EXCEPTION 'RPC body patch did not match';
      END IF;
      EXECUTE v_definition;
    END IF;
    EXECUTE pg_catalog.format('ALTER FUNCTION %s SECURITY INVOKER', v_function.signature);
    -- Catalog first prevents built-in shadowing. Legacy SQL still uses public tables.
    EXECUTE pg_catalog.format('ALTER FUNCTION %s SET search_path TO pg_catalog, public',
      v_function.signature);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_function.signature);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function.signature);
    IF v_function.signature = 'get_user_kanban(uuid)' THEN
      -- This existing function already checks auth.uid() = p_user_id.
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function.signature);
    END IF;
  END LOOP;
END
$rpc_patch$;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.kanban_projects,
  public.kanban_columns, public.kanban_cards FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.edit_kanban_project_v1(
  p_user_id uuid, p_project_id uuid, p_updates jsonb,
  p_expected jsonb, p_column_changes jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_project public.kanban_projects%ROWTYPE;
  v_column RECORD;
  v_change jsonb;
  v_column_id uuid;
  v_previous uuid;
  v_next uuid;
  v_count integer := 0;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  PERFORM kanban_integrity.serialize();
  IF p_user_id IS NULL OR p_project_id IS NULL
    OR pg_catalog.jsonb_typeof(p_updates) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_column_changes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid project update';
  END IF;
  IF pg_catalog.jsonb_array_length(p_column_changes) > 500
    OR (p_updates = '{}'::jsonb AND p_column_changes = '[]'::jsonb)
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_updates) f(key)
      WHERE f.key NOT IN ('name', 'color') OR NOT p_expected ? f.key)
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_expected) f(key)
      WHERE NOT p_updates ? f.key) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid project update fields';
  END IF;
  IF p_updates ? 'name' AND (
    pg_catalog.jsonb_typeof(p_updates->'name') IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(pg_catalog.btrim(p_updates->>'name', E' \t\n\r\f')) NOT BETWEEN 1 AND 120
    OR pg_catalog.jsonb_typeof(p_expected->'name') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid project name';
  END IF;
  IF p_updates ? 'color' AND (
    pg_catalog.jsonb_typeof(p_updates->'color') IS DISTINCT FROM 'string'
    OR p_updates->>'color' !~ '^#[0-9A-Fa-f]{6}$'
    OR pg_catalog.jsonb_typeof(p_expected->'color') IS DISTINCT FROM 'string'
    OR p_expected->>'color' !~ '^#[0-9A-Fa-f]{6}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid project color';
  END IF;
  FOR v_change IN SELECT value FROM pg_catalog.jsonb_array_elements(p_column_changes)
  LOOP
    IF pg_catalog.jsonb_typeof(v_change) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid column change';
    END IF;
    IF NOT (v_change ?& ARRAY['columnId', 'expectedProjectId', 'projectId'])
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_change) f(key)
        WHERE f.key NOT IN ('columnId', 'expectedProjectId', 'projectId'))
      OR pg_catalog.jsonb_typeof(v_change->'columnId') IS DISTINCT FROM 'string'
      OR v_change->>'columnId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(v_change->'expectedProjectId') NOT IN ('string', 'null')
      OR pg_catalog.jsonb_typeof(v_change->'projectId') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid column change fields';
    END IF;
    BEGIN
      v_column_id := (v_change->>'columnId')::uuid;
      v_previous := (v_change->>'expectedProjectId')::uuid;
      v_next := (v_change->>'projectId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid column change UUID';
    END;
    IF (v_next IS NOT NULL AND v_next <> p_project_id)
      OR v_previous IS NOT DISTINCT FROM v_next
      OR (v_next IS NULL AND v_previous IS DISTINCT FROM p_project_id) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid column destination';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT (ch->>'columnId')::uuid)
    FROM pg_catalog.jsonb_array_elements(p_column_changes) ch)
    <> pg_catalog.jsonb_array_length(p_column_changes) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate column change';
  END IF;
  SELECT p.* INTO v_project FROM public.kanban_projects p
  WHERE p.id = p_project_id AND p.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Project is not owned by user';
  END IF;
  IF (p_updates ? 'name' AND v_project.name IS DISTINCT FROM p_expected->>'name')
    OR (p_updates ? 'color' AND v_project.color IS DISTINCT FROM p_expected->>'color') THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Project changed in another session';
  END IF;
  FOR v_column IN
    SELECT c.id, c.user_id, c.project_id, ch.value AS change
    FROM public.kanban_columns c
    JOIN pg_catalog.jsonb_array_elements(p_column_changes) ch(value)
      ON c.id = (ch.value->>'columnId')::uuid
    ORDER BY c.id FOR UPDATE OF c
  LOOP
    IF v_column.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Column is not owned by user';
    END IF;
    IF v_column.project_id IS DISTINCT FROM (v_column.change->>'expectedProjectId')::uuid THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Column changed in another session';
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> pg_catalog.jsonb_array_length(p_column_changes) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'A column was removed';
  END IF;
  IF p_updates <> '{}'::jsonb THEN
    UPDATE public.kanban_projects p
    SET name = CASE WHEN p_updates ? 'name'
          THEN pg_catalog.btrim(p_updates->>'name', E' \t\n\r\f') ELSE p.name END,
        color = CASE WHEN p_updates ? 'color'
          THEN pg_catalog.lower(p_updates->>'color') ELSE p.color END
    WHERE p.id = p_project_id AND p.user_id = p_user_id RETURNING p.* INTO v_project;
  END IF;
  UPDATE public.kanban_columns c SET project_id = (ch.value->>'projectId')::uuid
  FROM pg_catalog.jsonb_array_elements(p_column_changes) ch(value)
  WHERE c.id = (ch.value->>'columnId')::uuid AND c.user_id = p_user_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', c.id, 'projectId', c.project_id) ORDER BY c.id), '[]'::jsonb) INTO v_columns
  FROM public.kanban_columns c
  WHERE c.id IN (SELECT (ch->>'columnId')::uuid FROM pg_catalog.jsonb_array_elements(p_column_changes) ch);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', k.id, 'columnId', k.column_id, 'projectId', k.project_id) ORDER BY k.id), '[]'::jsonb) INTO v_cards
  FROM public.kanban_cards k
  WHERE k.column_id IN (SELECT (ch->>'columnId')::uuid FROM pg_catalog.jsonb_array_elements(p_column_changes) ch);
  RETURN pg_catalog.jsonb_build_object('project', pg_catalog.jsonb_build_object(
    'id', v_project.id, 'name', v_project.name, 'color', v_project.color,
    'createdAt', v_project.created_at, 'updatedAt', v_project.created_at),
    'columns', v_columns, 'cards', v_cards);
END;
$function$;
REVOKE ALL ON FUNCTION public.edit_kanban_project_v1(uuid,uuid,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.edit_kanban_project_v1(uuid,uuid,jsonb,jsonb,jsonb) TO service_role;

-- Correct ONLY divergent bindings; do not depend on any filtered client view.
UPDATE public.kanban_cards k SET project_id = c.project_id
FROM public.kanban_columns c
WHERE c.id = k.column_id AND k.project_id IS DISTINCT FROM c.project_id;

DO $verification$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.kanban_cards k LEFT JOIN public.kanban_columns c ON c.id = k.column_id
    WHERE c.id IS NULL OR k.user_id IS DISTINCT FROM c.user_id
      OR k.project_id IS DISTINCT FROM c.project_id
  ) THEN
    RAISE EXCEPTION 'Project inheritance verification failed';
  END IF;
  IF (SELECT count(*) FROM public.kanban_cards) <> (SELECT count(*) FROM kanban_integrity.pre_binding_cards)
    OR (SELECT count(*) FROM public.kanban_columns) <> (SELECT count(*) FROM kanban_integrity.pre_binding_columns)
    OR (SELECT count(*) FROM public.kanban_projects) <> (SELECT count(*) FROM kanban_integrity.pre_binding_projects)
    OR EXISTS (
      SELECT 1 FROM public.kanban_cards k FULL JOIN kanban_integrity.pre_binding_cards b USING (id)
      WHERE k.id IS NULL OR b.id IS NULL
        OR pg_catalog.md5((pg_catalog.to_jsonb(k) - 'project_id' - 'updated_at')::text)
          IS DISTINCT FROM b.preserved_fingerprint
    ) OR EXISTS (
      SELECT 1 FROM public.kanban_columns c FULL JOIN kanban_integrity.pre_binding_columns b USING (id)
      WHERE c.id IS NULL OR b.id IS NULL
        OR pg_catalog.md5(pg_catalog.to_jsonb(c)::text) IS DISTINCT FROM b.original_fingerprint
    ) OR EXISTS (
      SELECT 1 FROM public.kanban_projects p FULL JOIN kanban_integrity.pre_binding_projects b USING (id)
      WHERE p.id IS NULL OR b.id IS NULL
        OR pg_catalog.md5(pg_catalog.to_jsonb(p)::text) IS DISTINCT FROM b.original_fingerprint
    ) THEN
    RAISE EXCEPTION 'Record preservation verification failed';
  END IF;
END
$verification$;
NOTIFY pgrst, 'reload schema';
COMMIT;