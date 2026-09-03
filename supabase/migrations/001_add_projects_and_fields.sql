-- Migration: Add kanban_projects table and new fields to kanban_cards and kanban_columns
-- Execute this SQL in the Supabase SQL Editor

-- Create kanban_projects table
CREATE TABLE IF NOT EXISTS kanban_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for kanban_projects
ALTER TABLE kanban_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
  ON kanban_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON kanban_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON kanban_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON kanban_projects FOR DELETE
  USING (auth.uid() = user_id);

-- Add new columns to kanban_cards if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kanban_cards' AND column_name = 'project_id') THEN
    ALTER TABLE kanban_cards ADD COLUMN project_id UUID REFERENCES kanban_projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kanban_cards' AND column_name = 'due_date') THEN
    ALTER TABLE kanban_cards ADD COLUMN due_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kanban_cards' AND column_name = 'completed_at') THEN
    ALTER TABLE kanban_cards ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add behavior column to kanban_columns if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kanban_columns' AND column_name = 'behavior') THEN
    ALTER TABLE kanban_columns ADD COLUMN behavior TEXT DEFAULT 'active';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kanban_columns' AND column_name = 'project_id') THEN
    ALTER TABLE kanban_columns ADD COLUMN project_id UUID REFERENCES kanban_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Keep existing behavior values and safely expand the check constraint for
-- installations created before the Progressivo behavior was introduced.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'kanban_columns'
      AND con.conname = 'kanban_columns_behavior_check'
  ) THEN
    ALTER TABLE kanban_columns
      ADD CONSTRAINT kanban_columns_behavior_check
      CHECK (behavior IN ('active', 'completion', 'progressive'));
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_kanban_projects_user_id ON kanban_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_project_id ON kanban_cards(project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_due_date ON kanban_cards(due_date);
