-- Migration: merge fort_double into fort
-- Date: 2026-05-07
-- Contexte: fort_double supprimé du code (fusionné dans fort), nettoyage DB

-- ============================================================
-- 1. DONNÉES : réaffecter les alertes fort_double → fort
-- ============================================================
update public.alerts
  set confidence = 'fort'
  where confidence = 'fort_double';

-- ============================================================
-- 2. CONTRAINTE : retirer fort_double des valeurs autorisées
-- ============================================================
alter table public.alerts
  drop constraint if exists alerts_confidence_check;

alter table public.alerts
  add constraint alerts_confidence_check
    check (confidence = any (array['fort'::text, 'moyen'::text]));
