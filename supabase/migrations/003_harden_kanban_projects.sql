-- ============================================================================
-- Canonical project persistence hardening
-- ============================================================================
-- Execution order:
--   1. migrations/001_organizations.sql (when organizations are used)
--   2. migrations/003_kanban_tables.sql
--   3. supabase/migrations/001_add_projects_and_fields.sql
--   4. supabase/migrations/002_progressive_kanban_behavior.sql
--   5. this migration
--
-- This migration is safe to run more than once. It never repairs, moves, or
-- deletes existing rows. It aborts before adding integrity constraints when it
-- finds an existing cross-user relationship; resolve that data explicitly and
-- rerun the migration.

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  IF to_regclass('public.kanban_projects') IS NULL
     OR to_regclass('public.kanban_columns') IS NULL
     OR to_regclass('public.kanban_cards') IS NULL THEN
    RAISE EXCEPTION
      'Required Kanban tables are missing. Run the base Kanban and project migrations in the documented order.';
  END IF;

  -- The two project columns were introduced by the earlier project migration.
  -- Add them here as an idempotent compatibility guard for existing installs.
  ALTER TABLE public.kanban_columns ADD COLUMN IF NOT EXISTS project_id UUID;
  ALTER TABLE public.kanban_cards ADD COLUMN IF NOT EXISTS project_id UUID;
  ALTER TABLE public.kanban_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

  -- Do not infer ownership for old rows. A mismatch must be investigated and
  -- fixed by an approved data-restoration operation before constraints exist.
  SELECT count(*) INTO v_count
  FROM public.kanban_columns c
  JOIN public.kanban_projects p ON p.id = c.project_id
  WHERE c.project_id IS NOT NULL AND c.user_id <> p.user_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % cross-user column/project relationships; migration aborted', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.kanban_cards k
  JOIN public.kanban_projects p ON p.id = k.project_id
  WHERE k.project_id IS NOT NULL AND k.user_id <> p.user_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % cross-user card/project relationships; migration aborted', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.kanban_cards k
  JOIN public.kanban_columns c ON c.id = k.column_id
  WHERE k.user_id <> c.user_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % cross-user card/column relationships; migration aborted', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.kanban_projects
  WHERE name IS NULL OR char_length(btrim(name)) NOT BETWEEN 1 AND 120;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % projects with invalid names; migration aborted', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.kanban_projects
  WHERE color IS NULL OR color !~ '^#[0-9A-Fa-f]{6}$';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % projects with invalid colors; migration aborted', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.kanban_projects
  WHERE created_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % projects without created_at; migration aborted', v_count;
  END IF;

  UPDATE public.kanban_projects
  SET updated_at = created_at
  WHERE updated_at IS NULL;

  SELECT count(*) INTO v_count
  FROM public.kanban_projects
  WHERE updated_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % projects without updated_at; migration aborted', v_count;
  END IF;
END $$;

ALTER TABLE public.kanban_projects
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kanban_projects_name_length_check'
      AND conrelid = 'public.kanban_projects'::regclass
  ) THEN
    ALTER TABLE public.kanban_projects
      ADD CONSTRAINT kanban_projects_name_length_check
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kanban_projects_color_check'
      AND conrelid = 'public.kanban_projects'::regclass
  ) THEN
    ALTER TABLE public.kanban_projects
      ADD CONSTRAINT kanban_projects_color_check
      CHECK (color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_kanban_projects_id_user
  ON public.kanban_projects(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kanban_columns_id_user
  ON public.kanban_columns(id, user_id);
CREATE INDEX IF NOT EXISTS idx_kanban_projects_user_created
  ON public.kanban_projects(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_user_project
  ON public.kanban_columns(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_user_project
  ON public.kanban_cards(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_project
  ON public.kanban_cards(project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kanban_columns_project_owner_fkey'
      AND conrelid = 'public.kanban_columns'::regclass
  ) THEN
    ALTER TABLE public.kanban_columns
      ADD CONSTRAINT kanban_columns_project_owner_fkey
      FOREIGN KEY (project_id, user_id)
      REFERENCES public.kanban_projects(id, user_id)
      ON DELETE SET NULL (project_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kanban_cards_project_owner_fkey'
      AND conrelid = 'public.kanban_cards'::regclass
  ) THEN
    ALTER TABLE public.kanban_cards
      ADD CONSTRAINT kanban_cards_project_owner_fkey
      FOREIGN KEY (project_id, user_id)
      REFERENCES public.kanban_projects(id, user_id)
      ON DELETE SET NULL (project_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kanban_cards_column_owner_fkey'
      AND conrelid = 'public.kanban_cards'::regclass
  ) THEN
    ALTER TABLE public.kanban_cards
      ADD CONSTRAINT kanban_cards_column_owner_fkey
      FOREIGN KEY (column_id, user_id)
      REFERENCES public.kanban_columns(id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.kanban_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

-- Replace every policy name created by the previous Kanban migrations. The
-- policies below include both USING and WITH CHECK where an operation writes.
DROP POLICY IF EXISTS "Users can view their own projects" ON public.kanban_projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON public.kanban_projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.kanban_projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.kanban_projects;
DROP POLICY IF EXISTS kanban_projects_select ON public.kanban_projects;
DROP POLICY IF EXISTS kanban_projects_insert ON public.kanban_projects;
DROP POLICY IF EXISTS kanban_projects_update ON public.kanban_projects;
DROP POLICY IF EXISTS kanban_projects_delete ON public.kanban_projects;

DROP POLICY IF EXISTS "Users can view their own columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Users can create their own columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Users can update their own columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Users can delete their own columns" ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_select ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_insert ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_update ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_delete ON public.kanban_columns;
DROP POLICY IF EXISTS columns_select ON public.kanban_columns;
DROP POLICY IF EXISTS columns_insert ON public.kanban_columns;
DROP POLICY IF EXISTS columns_update ON public.kanban_columns;
DROP POLICY IF EXISTS columns_delete ON public.kanban_columns;

DROP POLICY IF EXISTS "Users can view their own cards" ON public.kanban_cards;
DROP POLICY IF EXISTS "Users can create their own cards" ON public.kanban_cards;
DROP POLICY IF EXISTS "Users can update their own cards" ON public.kanban_cards;
DROP POLICY IF EXISTS "Users can delete their own cards" ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_select ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_insert ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_update ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_delete ON public.kanban_cards;
DROP POLICY IF EXISTS cards_select ON public.kanban_cards;
DROP POLICY IF EXISTS cards_insert ON public.kanban_cards;
DROP POLICY IF EXISTS cards_update ON public.kanban_cards;
DROP POLICY IF EXISTS cards_delete ON public.kanban_cards;

CREATE POLICY kanban_projects_select ON public.kanban_projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY kanban_projects_insert ON public.kanban_projects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY kanban_projects_update ON public.kanban_projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY kanban_projects_delete ON public.kanban_projects
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY kanban_columns_select ON public.kanban_columns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY kanban_columns_insert ON public.kanban_columns
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.kanban_projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY kanban_columns_update ON public.kanban_columns
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.kanban_projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY kanban_columns_delete ON public.kanban_columns
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY kanban_cards_select ON public.kanban_cards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY kanban_cards_insert ON public.kanban_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.kanban_columns c
      WHERE c.id = column_id AND c.user_id = auth.uid()
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.kanban_projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY kanban_cards_update ON public.kanban_cards
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.kanban_columns c
      WHERE c.id = column_id AND c.user_id = auth.uid()
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.kanban_projects p
        WHERE p.id = project_id AND p.user_id = auth.uid()
      )
    )
  );
CREATE POLICY kanban_cards_delete ON public.kanban_cards
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_kanban_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_kanban_projects_updated_at ON public.kanban_projects;
CREATE TRIGGER set_kanban_projects_updated_at
  BEFORE UPDATE ON public.kanban_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_kanban_updated_at();

-- Canonical RPC contract: server routes pass p_user_id after authenticating
-- the session, while direct authenticated calls must match auth.uid().
DROP FUNCTION IF EXISTS public.move_card(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.move_card(UUID, UUID, UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.move_card(
  p_user_id UUID,
  p_card_id UUID,
  p_target_column_id UUID,
  p_new_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_column_id UUID;
BEGIN
  IF p_user_id IS NULL
     OR (auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_new_position < 0 THEN RAISE EXCEPTION 'Invalid position'; END IF;

  SELECT column_id INTO v_old_column_id
  FROM public.kanban_cards
  WHERE id = p_card_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kanban_columns
    WHERE id = p_target_column_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target column not found';
  END IF;

  UPDATE public.kanban_cards
  SET column_id = p_target_column_id, position = p_new_position, updated_at = now()
  WHERE id = p_card_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', 1,
    'card_id', p_card_id,
    'old_column_id', v_old_column_id,
    'new_column_id', p_target_column_id,
    'new_position', p_new_position
  );
END;
$$;

DROP FUNCTION IF EXISTS public.update_card_positions(JSONB);
DROP FUNCTION IF EXISTS public.update_card_positions(UUID, JSONB);
CREATE OR REPLACE FUNCTION public.update_card_positions(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_card_id UUID;
  v_column_id UUID;
  v_position INTEGER;
  v_expected INTEGER;
  v_updated INTEGER := 0;
BEGIN
  IF p_user_id IS NULL
     OR (auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF jsonb_typeof(p_updates) <> 'array' THEN RAISE EXCEPTION 'Invalid updates'; END IF;
  v_expected := jsonb_array_length(p_updates);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    BEGIN
      v_card_id := (v_item->>'id')::UUID;
      v_column_id := (v_item->>'column_id')::UUID;
      v_position := (v_item->>'position')::INTEGER;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid card update';
    END;
    IF v_position < 0 OR NOT EXISTS (
      SELECT 1 FROM public.kanban_cards
      WHERE id = v_card_id AND user_id = p_user_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.kanban_columns
      WHERE id = v_column_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Card update is not owned by user';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    v_card_id := (v_item->>'id')::UUID;
    v_column_id := (v_item->>'column_id')::UUID;
    v_position := (v_item->>'position')::INTEGER;
    UPDATE public.kanban_cards
    SET column_id = v_column_id, position = v_position, updated_at = now()
    WHERE id = v_card_id AND user_id = p_user_id;
    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated <> v_expected THEN RAISE EXCEPTION 'Card update was not confirmed'; END IF;
  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

DROP FUNCTION IF EXISTS public.update_column_positions(JSONB);
DROP FUNCTION IF EXISTS public.update_column_positions(UUID, JSONB);
CREATE OR REPLACE FUNCTION public.update_column_positions(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_column_id UUID;
  v_position INTEGER;
  v_expected INTEGER;
  v_updated INTEGER := 0;
BEGIN
  IF p_user_id IS NULL
     OR (auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF jsonb_typeof(p_updates) <> 'array' THEN RAISE EXCEPTION 'Invalid updates'; END IF;
  v_expected := jsonb_array_length(p_updates);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    BEGIN
      v_column_id := (v_item->>'id')::UUID;
      v_position := (v_item->>'position')::INTEGER;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid column update';
    END;
    IF v_position < 0 OR NOT EXISTS (
      SELECT 1 FROM public.kanban_columns
      WHERE id = v_column_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Column update is not owned by user';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    v_column_id := (v_item->>'id')::UUID;
    v_position := (v_item->>'position')::INTEGER;
    UPDATE public.kanban_columns
    SET position = v_position, updated_at = now()
    WHERE id = v_column_id AND user_id = p_user_id;
    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated <> v_expected THEN RAISE EXCEPTION 'Column update was not confirmed'; END IF;
  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

DROP FUNCTION IF EXISTS public.get_kanban_data();
DROP FUNCTION IF EXISTS public.get_kanban_data(UUID);
CREATE OR REPLACE FUNCTION public.get_kanban_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_columns JSONB;
  v_cards JSONB;
BEGIN
  IF p_user_id IS NULL
     OR (auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.position), '[]'::jsonb)
  INTO v_columns
  FROM (
    SELECT id, title, position, behavior, project_id, created_at, updated_at
    FROM public.kanban_columns WHERE user_id = p_user_id
  ) c;

  SELECT COALESCE(jsonb_agg(to_jsonb(k) ORDER BY k.position), '[]'::jsonb)
  INTO v_cards
  FROM (
    SELECT id, column_id, title, description, priority, tags, subtasks, position,
      project_id, due_date, completed_at, created_at, updated_at
    FROM public.kanban_cards WHERE user_id = p_user_id
  ) k;

  RETURN jsonb_build_object('success', true, 'columns', v_columns, 'cards', v_cards);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_card(UUID, UUID, UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_card_positions(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_column_positions(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kanban_data(UUID) TO authenticated, service_role;

-- Verification (read-only; run after applying):
-- SELECT conname FROM pg_constraint
--   WHERE conname IN ('kanban_columns_project_owner_fkey',
--     'kanban_cards_project_owner_fkey', 'kanban_cards_column_owner_fkey');
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename IN ('kanban_projects', 'kanban_columns', 'kanban_cards');
-- SELECT indexname FROM pg_indexes
--   WHERE indexname IN ('idx_kanban_projects_user_created',
--     'idx_kanban_columns_user_project', 'idx_kanban_cards_user_project');