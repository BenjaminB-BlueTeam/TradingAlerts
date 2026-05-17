-- Migration: Drop orphan columns on alerts (vestiges FHG/DC features removed)
-- Date: 2026-05-17
-- Contexte : DC (Double Chance) supprimee le 2026-05-07, et fhg_result remplace par lg1
-- Verification prealable : ces colonnes ont 0 ligne remplie + 0 reference dans le code source.

ALTER TABLE public.alerts
  DROP COLUMN IF EXISTS fhg_result,
  DROP COLUMN IF EXISTS dc_defeat_pct,
  DROP COLUMN IF EXISTS dc_best_side,
  DROP COLUMN IF EXISTS dc_confidence,
  DROP COLUMN IF EXISTS dc_result;
