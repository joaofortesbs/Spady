-- Ensure column behavior is persisted for every existing Kanban installation.
-- This migration is idempotent and does not change card positions.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  IF to_regclass('public.kanban_columns') IS NULL THEN
    RAISE EXCEPTION 'Table public.kanban_columns does not exist. Run the base Kanban migration first.';
  END IF;

  ALTER TABLE public.kanban_columns
    ADD COLUMN IF NOT EXISTS behavior TEXT DEFAULT 'active';

  UPDATE public.kanban_columns
  SET behavior = 'active'
  WHERE behavior IS NULL;

  ALTER TABLE public.kanban_columns
    ALTER COLUMN behavior SET DEFAULT 'active',
    ALTER COLUMN behavior SET NOT NULL;

  FOR constraint_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid
      AND att.attname = 'behavior'
      AND att.attnum = ANY(con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'kanban_columns'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.kanban_columns DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;

  ALTER TABLE public.kanban_columns
    ADD CONSTRAINT kanban_columns_behavior_check
    CHECK (behavior IN ('active', 'completion', 'progressive'));
END $$;