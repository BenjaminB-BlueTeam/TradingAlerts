-- =============================================================================
-- Migration  : 20260507190000_anon_update_alerts
-- Date       : 2026-05-07
-- Objectif   : Permet au client anon de mettre à jour le statut d'une alerte
--              manuellement depuis /mes-matchs (Valider / Perdre).
--              App solo — pas de risque multi-utilisateur.
-- =============================================================================

drop policy if exists "anon_update_alerts" on alerts;
create policy "anon_update_alerts" on alerts
  for update to anon using (true) with check (true);
