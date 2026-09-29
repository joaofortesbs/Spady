-- Forward-fix the canonical Kanban behavior constraint.
-- This migration is intentionally limited to the known base constraint:
-- it does not remove custom or unknown constraints and does not rewrite data.
DO $$
DECLARE
  behavior_attnum SMALLINT;
BEGIN
  IF to_regclass('public.kanban_columns') IS NULL THEN
    RAISE EXCEPTION 'Table public.kanban_columns does not exist. Run the base Kanban migration first.';
  END IF;

  -- The same short-lived lock required by ALTER TABLE also makes the checks
  -- below and the replacement atomic with respect to concurrent writes.
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE public.kanban_columns IN ACCESS EXCLUSIVE MODE;

  SELECT attnum INTO behavior_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.kanban_columns'::regclass
    AND attname = 'behavior'
    AND NOT attisdropped
    AND atttypid = 'pg_catalog.text'::regtype;

  IF behavior_attnum IS NULL THEN
    RAISE EXCEPTION 'Expected public.kanban_columns.behavior to exist as TEXT; inspect the remote schema first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kanban_columns'::regclass
      AND conname = 'kanban_columns_behavior_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Expected CHECK constraint kanban_columns_behavior_check; inspect the remote schema first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kanban_columns'::regclass
      AND contype = 'c'
      AND conname <> 'kanban_columns_behavior_check'
      AND behavior_attnum = ANY(conkey)
  ) THEN
    RAISE EXCEPTION 'Other CHECK constraints reference behavior; inspect them before replacing the canonical constraint.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.kanban_columns
    WHERE behavior IS NULL
       OR behavior NOT IN ('active', 'completion', 'progressive')
  ) THEN
    RAISE EXCEPTION 'Unexpected or NULL behavior values; resolve them explicitly before replacing the constraint.';
  END IF;

  ALTER TABLE public.kanban_columns
    DROP CONSTRAINT kanban_columns_behavior_check;

  ALTER TABLE public.kanban_columns
    ADD CONSTRAINT kanban_columns_behavior_check
    CHECK (behavior IN ('active', 'completion', 'progressive'));
END $$;