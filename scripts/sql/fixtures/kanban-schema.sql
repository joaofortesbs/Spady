-- Synthetic local-only fixture for the observed legacy schema. No real records.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claim.sub', true), ''))::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.kanban_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL, position integer NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  behavior text CHECK (behavior IN ('active','completion','progressive')),
  project_id uuid REFERENCES public.kanban_projects(id) ON DELETE SET NULL,
  background_color text CHECK (background_color IS NULL OR
    (char_length(background_color) = 7 AND background_color ~ '^#[0-9A-Fa-f]{6}$'))
);
CREATE TABLE public.kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  title text NOT NULL, description text, priority text NOT NULL CHECK (priority IN ('alta','media','baixa')),
  tags jsonb, subtasks jsonb, position integer NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES public.kanban_projects(id) ON DELETE SET NULL,
  due_date date, completed_at timestamptz
);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_kanban_cards_updated_at BEFORE UPDATE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kanban_columns_updated_at BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.kanban_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_project_owner ON public.kanban_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY fixture_column_owner ON public.kanban_columns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY fixture_card_owner ON public.kanban_cards FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON public.kanban_projects, public.kanban_columns, public.kanban_cards
  TO anon, authenticated, service_role;