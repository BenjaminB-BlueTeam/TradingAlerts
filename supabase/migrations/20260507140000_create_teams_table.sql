-- Table teams : une ligne par équipe FootyStats
-- Peuplée pendant le seed (seed-data.js via league-teams)
-- Utilisée pour l'autocomplete équipe sur /matches

CREATE TABLE IF NOT EXISTS public.teams (
  team_id    bigint PRIMARY KEY,
  team_name  text   NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_anon"
  ON public.teams FOR SELECT TO anon USING (true);

CREATE POLICY "teams_all_service"
  ON public.teams FOR ALL TO service_role USING (true);
