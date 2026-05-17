-- Migration: Split team_lg1_cache LG1/LG2 stats par contexte home/away
-- Date: 2026-05-17
-- Ajoute 4 colonnes par contexte + 2 compteurs.
-- Les colonnes overall (lg1_after30_pct, lg2_pct, matches_count) restent pour /leagues.

ALTER TABLE public.team_lg1_cache
  ADD COLUMN IF NOT EXISTS lg1_home_pct numeric,
  ADD COLUMN IF NOT EXISTS lg1_away_pct numeric,
  ADD COLUMN IF NOT EXISTS lg2_home_pct numeric,
  ADD COLUMN IF NOT EXISTS lg2_away_pct numeric,
  ADD COLUMN IF NOT EXISTS matches_home smallint,
  ADD COLUMN IF NOT EXISTS matches_away smallint;

comment on column public.team_lg1_cache.lg1_home_pct is '% matchs avec but 31-45 sur les matchs DOMICILE de l equipe';
comment on column public.team_lg1_cache.lg1_away_pct is '% matchs avec but 31-45 sur les matchs EXTERIEUR de l equipe';
comment on column public.team_lg1_cache.lg2_home_pct is '% matchs avec but >= 80 sur les matchs DOMICILE de l equipe';
comment on column public.team_lg1_cache.lg2_away_pct is '% matchs avec but >= 80 sur les matchs EXTERIEUR de l equipe';
comment on column public.team_lg1_cache.matches_home is 'Nombre de matchs domicile de la saison';
comment on column public.team_lg1_cache.matches_away is 'Nombre de matchs exterieur de la saison';
