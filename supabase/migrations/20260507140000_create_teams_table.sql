-- Table teams : une ligne par équipe FootyStats
-- Peuplée pendant le seed (seed-data.js via league-teams)
-- Utilisée pour l'autocomplete équipe sur /matches
--
-- ATTENTION : le schéma réel en production diverge de ce CREATE TABLE.
-- La table préexistait avec colonnes (id, team_id, league_id, name, stats, updated_at)
-- → ce CREATE TABLE IF NOT EXISTS a été un no-op. La colonne réelle pour le nom
-- est `name` (TEXT), pas `team_name`. Ne pas se fier au schéma ci-dessous —
-- vérifier avec information_schema.columns en cas de doute.

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
