-- Expand the existing kanban column behavior constraint without changing
-- existing active/completion values or card positions.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'kanban_columns' AND column_name = 'behavior'
  ) THEN
    FOR constraint_record IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid
        AND att.attname = 'behavior'
        AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'kanban_columns'
        AND con.contype = 'c'
    LOOP
      EXECUTE format('ALTER TABLE kanban_columns DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE kanban_columns
      ADD CONSTRAINT kanban_columns_behavior_check
      CHECK (behavior IN ('active', 'completion', 'progressive'));
  END IF;
END $$;