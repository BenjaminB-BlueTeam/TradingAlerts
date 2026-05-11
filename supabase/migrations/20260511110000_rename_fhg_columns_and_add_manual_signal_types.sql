-- =============================================================================
-- Migration  : 20260511110000_rename_fhg_columns_and_add_manual_signal_types
-- Date       : 2026-05-11
-- Contexte   : Suite du rebrand FHG→LG1 (migration 20260508120000).
--              Le renommage des signal_types et d'algo_version avait été fait,
--              mais les colonnes fhg_* de la table alerts n'avaient pas été
--              renommées → generate-alerts.js plantait depuis le 2026-05-09.
--
-- Ce que fait cette migration :
--   1. Renomme fhg_pct → lg1_pct, fhg_confidence → lg1_confidence,
--      fhg_factors → lg1_factors dans la table alerts
--   2. Met à jour la contrainte CHECK alerts_signal_type_check pour inclure
--      LG1_MANUAL et LG2_MANUAL (sélections manuelles depuis /matches)
-- =============================================================================

-- 1. Renommer les colonnes
ALTER TABLE public.alerts RENAME COLUMN fhg_pct        TO lg1_pct;
ALTER TABLE public.alerts RENAME COLUMN fhg_confidence TO lg1_confidence;
ALTER TABLE public.alerts RENAME COLUMN fhg_factors    TO lg1_factors;

-- 2. Mettre à jour la contrainte CHECK signal_type
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_signal_type_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_signal_type_check
    CHECK (signal_type = ANY (ARRAY[
      -- Legacy (archivés, plus générés)
      'FHG'::text, 'FHG_DOM'::text, 'FHG_EXT'::text, 'DC'::text,
      -- LG1 (algo)
      'LG1_A'::text, 'LG1_B'::text, 'LG1_A+B'::text, 'LG1_C'::text, 'LG1_D'::text,
      -- LG1 manuel
      'LG1_MANUAL'::text,
      -- LG2 (algo)
      'LG2_A'::text, 'LG2_B'::text, 'LG2_A+B'::text,
      -- LG2 manuel
      'LG2_MANUAL'::text
    ]));
