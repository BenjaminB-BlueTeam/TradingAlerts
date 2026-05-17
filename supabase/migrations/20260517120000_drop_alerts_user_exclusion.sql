-- Migration: Drop user exclusion columns on alerts
-- Date: 2026-05-17
-- Suppression de la feature "Exclure une alerte" (UI + BDD).
-- Les 4 colonnes orphelines retiraient de l espace, etaient utilisees uniquement par
-- ExcludeAlertModal.svelte (supprime) + handlers /alerts/[type] (supprimes).

ALTER TABLE public.alerts
  DROP COLUMN IF EXISTS user_excluded,
  DROP COLUMN IF EXISTS user_exclusion_tags,
  DROP COLUMN IF EXISTS user_exclusion_note,
  DROP COLUMN IF EXISTS user_excluded_at;
