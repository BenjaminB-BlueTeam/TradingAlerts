-- Migration: Rename lg1_pct -> lg1_after30_pct and add lg2_pct on team_lg1_cache
-- Date: 2026-05-17
-- Semantique : lg1_after30_pct cible les buts 31-45 (au lieu de 0-45 precedemment).
-- Les donnees existantes seront ecrasees au prochain run du cron compute-team-lg1 (7h UTC).
-- lg2_pct = % matchs avec but >= 80 min, nullable jusqu'au premier run du cron.

-- ============================================================
-- ALTER TABLE: team_lg1_cache
-- ============================================================

-- Renomme lg1_pct -> lg1_after30_pct (semantique passe de 0-45 a 31-45)
ALTER TABLE public.team_lg1_cache
  RENAME COLUMN lg1_pct TO lg1_after30_pct;

-- Ajoute lg2_pct (% matchs avec but >= 80 min sur la saison, nullable)
ALTER TABLE public.team_lg1_cache
  ADD COLUMN IF NOT EXISTS lg2_pct numeric;

-- ============================================================
-- COMMENTS
-- ============================================================
comment on column public.team_lg1_cache.lg1_after30_pct is '% matchs avec but entre 31e et 45e minute (calcule par compute-team-lg1 cron 7h UTC)';
comment on column public.team_lg1_cache.lg2_pct is '% matchs avec but >= 80 min sur la saison (nullable jusqu au premier run du cron)';
