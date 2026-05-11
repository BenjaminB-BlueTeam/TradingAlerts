-- =============================================================================
-- Migration  : 20260511100000_authenticated_insert_manual_alerts
-- Date       : 2026-05-11
-- Objectif   : Permet au frontend authentifié d'insérer des alertes manuelles
--              dans la table `alerts`, restreint aux lignes dont
--              algo_version = 'manual'. Les alertes générées par les crons
--              (algo_version != 'manual') restent en écriture service_role only.
-- =============================================================================

-- =============================================================================
-- TABLE: alerts — ajout policy INSERT authenticated (alertes manuelles)
-- =============================================================================

drop policy if exists "authenticated_insert_manual_alerts" on alerts;

create policy "authenticated_insert_manual_alerts" on alerts
  for insert to authenticated
  with check (algo_version = 'manual');
