-- Migration: Drop status column on alerts
-- Date: 2026-05-30
-- Suppression du systeme de resolution des resultats (validated/lost/pending).
-- Le cron check-results a ete retire -- la colonne status n a plus aucune utilite.
-- Les valeurs existantes (validated/lost/pending) sont perdues -- c est voulu.

ALTER TABLE public.alerts
  DROP COLUMN IF EXISTS status;
