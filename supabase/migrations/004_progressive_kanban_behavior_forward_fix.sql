-- Forward-fix the canonical Kanban behavior constraint.
-- This migration is intentionally limited to the known base constraint:
-- it does not remove custom or unknown constraints and does not rewrite data.
DO $$
BEGIN
  IF to_regclass('public.kanban_columns') IS NULL THEN
    RAISE EXCEPTION 'Table public.kanban_columns does not exist. Run the base Kanban migration first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kanban_columns'
      AND column_name = 'behavior'
  ) THEN
    ALTER TABLE public.kanban_columns
      ADD COLUMN behavior TEXT DEFAULT 'active';
  END IF;

  ALTER TABLE public.kanban_columns
    ALTER COLUMN behavior SET DEFAULT 'active';

  UPDATE public.kanban_columns
  SET behavior = 'active'
  WHERE behavior IS NULL;

  ALTER TABLE public.kanban_columns
    DROP CONSTRAINT IF EXISTS kanban_columns_behavior_check;

  ALTER TABLE public.kanban_columns
    ADD CONSTRAINT kanban_columns_behavior_check
    CHECK (behavior IN ('active', 'completion', 'progressive'));

  ALTER TABLE public.kanban_columns
    ALTER COLUMN behavior SET NOT NULL;
END $$;