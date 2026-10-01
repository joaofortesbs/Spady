-- Add persisted column background colors and an atomic, service-only project transfer RPC.
-- This is an additive forward migration: it does not rewrite existing column/card data.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  v_required RECORD;
  v_background_attnum SMALLINT;
BEGIN
  IF pg_catalog.to_regclass('public.kanban_columns') IS NULL
     OR pg_catalog.to_regclass('public.kanban_cards') IS NULL
     OR pg_catalog.to_regclass('public.kanban_projects') IS NULL THEN
    RAISE EXCEPTION
      'Required Kanban columns, cards, or projects table is missing. Apply the canonical Kanban/project migrations before 005.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION
      'Expected Supabase roles anon, authenticated, and service_role; inspect the target before applying this migration.';
  END IF;

  -- This RPC relies on the hardened project schema, but deliberately does not
  -- require kanban_projects.updated_at (older project tables may not have it).
  FOR v_required IN
    SELECT * FROM (VALUES
      ('kanban_columns', 'id', 'uuid'),
      ('kanban_columns', 'user_id', 'uuid'),
      ('kanban_columns', 'title', 'text'),
      ('kanban_columns', 'position', 'int4'),
      ('kanban_columns', 'behavior', 'text'),
      ('kanban_columns', 'project_id', 'uuid'),
      ('kanban_cards', 'column_id', 'uuid'),
      ('kanban_cards', 'user_id', 'uuid'),
      ('kanban_cards', 'project_id', 'uuid'),
      ('kanban_projects', 'id', 'uuid'),
      ('kanban_projects', 'user_id', 'uuid')
    ) AS required_columns(table_name, column_name, expected_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = pg_catalog.to_regclass('public.' || v_required.table_name)
        AND a.attname = v_required.column_name
        AND NOT a.attisdropped
        AND a.atttypid = pg_catalog.to_regtype('pg_catalog.' || v_required.expected_type)
    ) THEN
      RAISE EXCEPTION
        'Expected public.%.% with type %; inspect the remote schema and apply only the approved prerequisite migrations.',
        v_required.table_name, v_required.column_name, v_required.expected_type;
    END IF;
  END LOOP;

  SELECT a.attnum INTO v_background_attnum
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.kanban_columns'::regclass
    AND a.attname = 'background_color'
    AND NOT a.attisdropped;

  IF v_background_attnum IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = 'public.kanban_columns'::regclass
        AND a.attname = 'background_color'
        AND NOT a.attisdropped
        AND a.atttypid = 'pg_catalog.text'::regtype
        AND NOT a.attnotnull
    ) THEN
      RAISE EXCEPTION
        'Existing public.kanban_columns.background_color must be nullable TEXT; inspect the schema before applying this migration.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'edit_kanban_column_v1'
      AND (
        p.pronargs <> 3
        OR p.proargtypes[0] <> 'pg_catalog.uuid'::regtype
        OR p.proargtypes[1] <> 'pg_catalog.uuid'::regtype
        OR p.proargtypes[2] <> 'pg_catalog.jsonb'::regtype
        OR pg_catalog.obj_description(p.oid, 'pg_proc')
          IS DISTINCT FROM 'managed-by-supabase-migration-005-kanban-column-editing'
      )
  ) THEN
    RAISE EXCEPTION
      'An unknown public.edit_kanban_column_v1 function or overload exists; inspect it instead of replacing it.';
  END IF;

  LOCK TABLE public.kanban_columns IN ACCESS EXCLUSIVE MODE;
END $$;

ALTER TABLE public.kanban_columns
  ADD COLUMN IF NOT EXISTS background_color TEXT;

DO $$
DECLARE
  v_background_attnum SMALLINT;
  v_existing_constraint TEXT;
  v_invalid_count BIGINT;
BEGIN
  SELECT a.attnum INTO v_background_attnum
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.kanban_columns'::regclass
    AND a.attname = 'background_color'
    AND NOT a.attisdropped;

  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO v_existing_constraint
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid = 'public.kanban_columns'::regclass
    AND c.conname = 'kanban_columns_background_color_check';

  IF v_existing_constraint IS NOT NULL
     AND (position('background_color' IN v_existing_constraint) = 0
       OR position('char_length' IN v_existing_constraint) = 0
       OR position('#[0-9A-Fa-f]{6}' IN v_existing_constraint) = 0) THEN
    RAISE EXCEPTION
      'Constraint kanban_columns_background_color_check exists with an unexpected definition; inspect it rather than replacing it.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = 'public.kanban_columns'::regclass
      AND c.contype = 'c'
      AND c.conname <> 'kanban_columns_background_color_check'
      AND v_background_attnum = ANY(c.conkey)
  ) THEN
    RAISE EXCEPTION
      'An unknown CHECK constraint references background_color; inspect it before continuing.';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM public.kanban_columns
  WHERE background_color IS NOT NULL
    AND (
      pg_catalog.char_length(background_color) <> 7
      OR background_color !~ '^#[0-9A-Fa-f]{6}$'
    );
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'Found % invalid existing background_color value(s); correct them explicitly before retrying.',
      v_invalid_count;
  END IF;

  IF v_existing_constraint IS NULL THEN
    ALTER TABLE public.kanban_columns
      ADD CONSTRAINT kanban_columns_background_color_check
      CHECK (
        background_color IS NULL
        OR (
          pg_catalog.char_length(background_color) = 7
          AND background_color ~ '^#[0-9A-Fa-f]{6}$'
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.edit_kanban_column_v1(
  p_user_id UUID,
  p_column_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_column_user_id UUID;
  v_card RECORD;
  v_title TEXT;
  v_behavior TEXT;
  v_position INTEGER;
  v_position_numeric NUMERIC;
  v_project_id UUID;
  v_background_color TEXT;
  v_cards_locked BIGINT := 0;
  v_cards_updated BIGINT := 0;
  v_column JSONB;
BEGIN
  IF p_user_id IS NULL OR p_column_id IS NULL
     OR p_updates IS NULL OR pg_catalog.jsonb_typeof(p_updates) <> 'object'
     OR p_updates = '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid column update';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_updates) AS supplied(key)
    WHERE supplied.key NOT IN ('title', 'behavior', 'position', 'project_id', 'background_color')
  ) THEN
    RAISE EXCEPTION 'Invalid column update field';
  END IF;

  IF p_updates ? 'title' THEN
    IF pg_catalog.jsonb_typeof(p_updates->'title') <> 'string' THEN
      RAISE EXCEPTION 'Invalid column title';
    END IF;
    v_title := pg_catalog.upper(pg_catalog.btrim(p_updates->>'title', E' \t\n\r\f'));
    IF pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid column title';
    END IF;
  END IF;

  IF p_updates ? 'behavior' THEN
    IF pg_catalog.jsonb_typeof(p_updates->'behavior') <> 'string'
       OR p_updates->>'behavior' NOT IN ('active', 'completion', 'progressive') THEN
      RAISE EXCEPTION 'Invalid column behavior';
    END IF;
    v_behavior := p_updates->>'behavior';
  END IF;

  IF p_updates ? 'position' THEN
    IF pg_catalog.jsonb_typeof(p_updates->'position') <> 'number' THEN
      RAISE EXCEPTION 'Invalid column position';
    END IF;
    BEGIN
      v_position_numeric := (p_updates->>'position')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid column position';
    END;
    IF v_position_numeric <> pg_catalog.trunc(v_position_numeric)
       OR v_position_numeric NOT BETWEEN 0 AND 100000 THEN
      RAISE EXCEPTION 'Invalid column position';
    END IF;
    v_position := v_position_numeric::INTEGER;
  END IF;

  IF p_updates ? 'project_id' THEN
    IF pg_catalog.jsonb_typeof(p_updates->'project_id') = 'null' THEN
      v_project_id := NULL;
    ELSIF pg_catalog.jsonb_typeof(p_updates->'project_id') = 'string' THEN
      IF p_updates->>'project_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Invalid destination project';
      END IF;
      BEGIN
        v_project_id := (p_updates->>'project_id')::UUID;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid destination project';
      END;
    ELSE
      RAISE EXCEPTION 'Invalid destination project';
    END IF;
  END IF;

  IF p_updates ? 'background_color' THEN
    IF pg_catalog.jsonb_typeof(p_updates->'background_color') = 'null' THEN
      v_background_color := NULL;
    ELSIF pg_catalog.jsonb_typeof(p_updates->'background_color') = 'string'
       AND pg_catalog.char_length(p_updates->>'background_color') = 7
       AND p_updates->>'background_color' ~ '^#[0-9A-Fa-f]{6}$' THEN
       v_background_color := pg_catalog.lower(p_updates->>'background_color');
    ELSE
      RAISE EXCEPTION 'Invalid column background color';
    END IF;
  END IF;

  IF p_updates ? 'project_id' AND v_project_id IS NOT NULL THEN
    PERFORM p.id
    FROM public.kanban_projects AS p
    WHERE p.id = v_project_id AND p.user_id = p_user_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Destination project is not owned by user';
    END IF;
  END IF;

  SELECT c.user_id INTO v_column_user_id
  FROM public.kanban_columns AS c
  WHERE c.id = p_column_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Column not found';
  END IF;
  IF v_column_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Column is not owned by user';
  END IF;

  -- Lock and validate every database card in the column, not just those
  -- currently visible in a filtered client view.
  FOR v_card IN
    SELECT k.id, k.user_id
    FROM public.kanban_cards AS k
    WHERE k.column_id = p_column_id
    ORDER BY k.id
    FOR UPDATE
  LOOP
    IF v_card.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Column card is not owned by user';
    END IF;
    v_cards_locked := v_cards_locked + 1;
  END LOOP;

  UPDATE public.kanban_columns AS c
  SET title = CASE WHEN p_updates ? 'title' THEN v_title ELSE c.title END,
      behavior = CASE WHEN p_updates ? 'behavior' THEN v_behavior ELSE c.behavior END,
      position = CASE WHEN p_updates ? 'position' THEN v_position ELSE c.position END,
      project_id = CASE WHEN p_updates ? 'project_id' THEN v_project_id ELSE c.project_id END,
      background_color = CASE
        WHEN p_updates ? 'background_color' THEN v_background_color
        ELSE c.background_color
      END
  WHERE c.id = p_column_id AND c.user_id = p_user_id
  RETURNING pg_catalog.jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'position', c.position,
    'behavior', c.behavior,
    'project_id', c.project_id,
    'background_color', c.background_color
  ) INTO v_column;

  IF NOT FOUND OR v_column IS NULL THEN
    RAISE EXCEPTION 'Column update was not confirmed';
  END IF;

  IF p_updates ? 'project_id' THEN
    UPDATE public.kanban_cards AS k
    SET project_id = v_project_id
    WHERE k.column_id = p_column_id AND k.user_id = p_user_id;
    GET DIAGNOSTICS v_cards_updated = ROW_COUNT;
    IF v_cards_updated <> v_cards_locked THEN
      RAISE EXCEPTION 'Column card project update was not confirmed';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'column', v_column,
    'cards_project_updated', p_updates ? 'project_id',
    'cards_updated_count', CASE WHEN p_updates ? 'project_id' THEN v_cards_updated ELSE 0 END
  );
END;
$function$;

COMMENT ON FUNCTION public.edit_kanban_column_v1(UUID, UUID, JSONB)
  IS 'managed-by-supabase-migration-005-kanban-column-editing';
REVOKE EXECUTE ON FUNCTION public.edit_kanban_column_v1(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_kanban_column_v1(UUID, UUID, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;