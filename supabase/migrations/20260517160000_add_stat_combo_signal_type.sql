-- =============================================================================
-- Migration  : 20260517160000_add_stat_combo_signal_type
-- Date       : 2026-05-17
-- Contexte   : Ajout du signal_type STAT_COMBO à la contrainte CHECK
--              alerts_signal_type_check.
--
-- Ce que fait cette migration :
--   1. Droppe la contrainte alerts_signal_type_check existante
--   2. La recrée en ajoutant 'STAT_COMBO' à la liste des valeurs autorisées
-- =============================================================================

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
      'LG2_MANUAL'::text,
      -- Combo statistique
      'STAT_COMBO'::text
    ]));
