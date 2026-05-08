-- =============================================================================
-- Migration  : 20260508120000_rename_fhg_to_lg1
-- Date       : 2026-05-08
-- Contexte   : Rebrand "FHG" (First Half Goal) → "LG1" (Late Goal 1ère mi-temps)
--              pour aligner la terminologie avec LG2 (Late Goal 2e mi-temps)
--              dans le cadre du passage à "Late Goal Tracker".
--
-- Périmètre  :
--   - alerts         : signal_type FHG_A/B/C/D/A+B → LG1_A/B/C/D/A+B
--                      algo_version 'v2' → 'lg1_v2'
--                      contrainte CHECK alerts_signal_type_check mise à jour
--   - selected_alerts: signal_type FHG_* → LG1_*
--   - alert_trades   : signal_type FHG_* → LG1_*
--   - team_fhg_cache : renommée en team_lg1_cache + policies RLS renommées
--
-- Impact données :
--   alerts         — 110 lignes FHG_* renommées, LG2_* intactes
--   selected_alerts —   2 lignes FHG_* renommées
--   alert_trades   —   3 lignes FHG_* renommées
--   team_fhg_cache — aucune donnée supprimée, table entière renommée
--
-- Rollback : voir section ROLLBACK en bas de fichier
-- =============================================================================


-- ============================================================
-- 1. CONTRAINTE CHECK : drop avant les UPDATE
-- ============================================================
-- La contrainte alerts_signal_type_check est validée par PostgreSQL à chaque
-- UPDATE de ligne. On doit donc la supprimer AVANT de transformer les FHG_*
-- en LG1_*, puis la recréer en fin de migration avec les nouvelles valeurs.

alter table public.alerts
  drop constraint if exists alerts_signal_type_check;


-- ============================================================
-- 2. DONNÉES : signal_type FHG_* → LG1_*
-- ============================================================

-- alerts : 12 FHG_A + 4 FHG_B + 2 FHG_C + 92 FHG_D = 110 lignes
update public.alerts
  set signal_type = 'LG1_' || substring(signal_type from 5)
  where signal_type like 'FHG\_%' escape '\';

-- selected_alerts : 2 lignes FHG_A
update public.selected_alerts
  set signal_type = 'LG1_' || substring(signal_type from 5)
  where signal_type like 'FHG\_%' escape '\';

-- alert_trades : 3 lignes FHG_A
update public.alert_trades
  set signal_type = 'LG1_' || substring(signal_type from 5)
  where signal_type like 'FHG\_%' escape '\';


-- ============================================================
-- 3. DONNÉES : algo_version 'v2' → 'lg1_v2'
-- ============================================================

-- Toutes les alertes LG1 ont algo_version = 'v2' (LG2 = 'lg2_v1', non touché)
update public.alerts
  set algo_version = 'lg1_v2'
  where algo_version = 'v2';


-- ============================================================
-- 4. CONTRAINTE CHECK : recréée avec les valeurs LG1_*
-- ============================================================
-- Les valeurs legacy (FHG, FHG_DOM, FHG_EXT, DC) sont conservées dans la
-- liste pour l'historique potentiel mais ne seront plus générées.

alter table public.alerts
  add constraint alerts_signal_type_check
    check (signal_type = any (array[
      -- Legacy (archivés, plus générés)
      'FHG'::text,
      'FHG_DOM'::text,
      'FHG_EXT'::text,
      'DC'::text,
      -- LG1 (anciennement FHG streak v2)
      'LG1_A'::text,
      'LG1_B'::text,
      'LG1_A+B'::text,
      'LG1_C'::text,
      'LG1_D'::text,
      -- LG2
      'LG2_A'::text,
      'LG2_B'::text,
      'LG2_A+B'::text
    ]));


-- ============================================================
-- 5. TABLE : renommer team_fhg_cache → team_lg1_cache
-- ============================================================

alter table public.team_fhg_cache rename to team_lg1_cache;


-- ============================================================
-- 6. POLICIES RLS : renommer les policies fhg → lg1
-- ============================================================

-- Les policies créées dans 20260507120000_harden_rls_authenticated.sql
-- sont nommées "authenticated_select_team_fhg_cache" et
-- "service_role_all_team_fhg_cache". Après le RENAME TABLE, elles
-- existent toujours mais pointent sur la table renommée — seul le
-- nom de la policy est incohérent. On les recrée avec le bon nom.

drop policy if exists "authenticated_select_team_fhg_cache" on public.team_lg1_cache;
drop policy if exists "service_role_all_team_fhg_cache"     on public.team_lg1_cache;

create policy "authenticated_select_team_lg1_cache" on public.team_lg1_cache
  for select to authenticated using (true);

create policy "service_role_all_team_lg1_cache" on public.team_lg1_cache
  for all to service_role using (true) with check (true);


-- ============================================================
-- ROLLBACK (à exécuter manuellement si nécessaire)
-- ============================================================
-- -- 5. Revert policies
-- drop policy if exists "authenticated_select_team_lg1_cache" on public.team_lg1_cache;
-- drop policy if exists "service_role_all_team_lg1_cache"     on public.team_lg1_cache;
-- create policy "authenticated_select_team_fhg_cache" on public.team_lg1_cache
--   for select to authenticated using (true);
-- create policy "service_role_all_team_fhg_cache" on public.team_lg1_cache
--   for all to service_role using (true) with check (true);
--
-- -- 4. Revert table rename
-- alter table public.team_lg1_cache rename to team_fhg_cache;
--
-- -- 3. Revert contrainte CHECK
-- alter table public.alerts drop constraint if exists alerts_signal_type_check;
-- alter table public.alerts add constraint alerts_signal_type_check
--   check (signal_type = any (array[
--     'FHG'::text, 'FHG_DOM'::text, 'FHG_EXT'::text,
--     'FHG_A'::text, 'FHG_B'::text, 'FHG_A+B'::text,
--     'FHG_C'::text, 'FHG_D'::text,
--     'DC'::text,
--     'LG2_A'::text, 'LG2_B'::text, 'LG2_A+B'::text
--   ]));
--
-- -- 2. Revert algo_version
-- update public.alerts set algo_version = 'v2' where algo_version = 'lg1_v2';
--
-- -- 1. Revert signal_type (les 3 tables)
-- update public.alert_trades
--   set signal_type = 'FHG_' || substring(signal_type from 5)
--   where signal_type like 'LG1\_%' escape '\';
-- update public.selected_alerts
--   set signal_type = 'FHG_' || substring(signal_type from 5)
--   where signal_type like 'LG1\_%' escape '\';
-- update public.alerts
--   set signal_type = 'FHG_' || substring(signal_type from 5)
--   where signal_type like 'LG1\_%' escape '\';
