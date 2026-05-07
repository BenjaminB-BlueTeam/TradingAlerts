-- =============================================================================
-- Migration  : 20260507120000_harden_rls_authenticated
-- Date       : 2026-05-07
-- Chantier   : B3 — Supabase Auth Email/Password
-- Auteur     : Benjamin
-- =============================================================================
--
-- OBJECTIF
-- --------
-- Durcir les Row Level Security policies de toutes les tables applicatives :
-- remplacer les policies `anon` (rôle non-authentifié) par des policies
-- `authenticated` (rôle JWT valide émis après signInWithPassword).
--
-- PÉRIMÈTRE
-- ---------
-- Tables concernées :
--   alerts            — alertes FHG/DC/LG2 générées automatiquement
--   trades            — journal des trades Benjamin
--   h2h_matches       — historique matchs H2H avec goal_events (readonly frontend)
--   team_seasons      — stats équipes par saison (readonly frontend)
--   seed_jobs         — suivi progression seed (SELECT + INSERT + UPDATE frontend)
--   team_fhg_cache    — FHG% calculé par cron (readonly frontend)
--   selected_alerts   — alertes sélectionnées manuellement par Benjamin
--
-- IMPACT SUR LES NETLIFY FUNCTIONS
-- ----------------------------------
-- Les fonctions Netlify utilisent SUPABASE_SERVICE_ROLE_KEY, qui bypass RLS
-- nativement côté Supabase. La policy `service_role_all_*` est maintenue par
-- cohérence mais n'est pas techniquement nécessaire pour ces fonctions.
-- Aucune Netlify Function n'est impactée par ce changement.
--
-- ROLLBACK
-- --------
-- Un bloc de rollback est disponible en fin de fichier (commenté).
-- Il restaure les policies `anon` d'origine sur chaque table.
--
-- =============================================================================


-- =============================================================================
-- TABLE: alerts
-- =============================================================================
-- Droits frontend : SELECT (lecture) + UPDATE (exclusion manuelle).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table alerts enable row level security;

-- Drop des policies anon existantes (noms candidats couvrants)
drop policy if exists "anon_select_alerts"              on alerts;
drop policy if exists "anon_update_alerts"              on alerts;
drop policy if exists "anon_all_alerts"                 on alerts;
drop policy if exists "Allow anon select"               on alerts;
drop policy if exists "Allow anon all"                  on alerts;
drop policy if exists "Enable read access for all users" on alerts;
drop policy if exists "authenticated_select_alerts"     on alerts;
drop policy if exists "authenticated_update_alerts"     on alerts;
drop policy if exists "service_role_all_alerts"         on alerts;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_alerts" on alerts
  for select to authenticated using (true);

-- Mise à jour par l'utilisateur connecté (exclusion manuelle depuis l'UI)
create policy "authenticated_update_alerts" on alerts
  for update to authenticated using (true) with check (true);

-- Accès complet pour les Netlify Functions (service_role bypass RLS)
create policy "service_role_all_alerts" on alerts
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: trades
-- =============================================================================
-- Droits frontend : ALL (SELECT + INSERT + UPDATE + DELETE — journal Benjamin).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table trades enable row level security;

drop policy if exists "anon_select_trades"              on trades;
drop policy if exists "anon_all_trades"                 on trades;
drop policy if exists "Allow anon select"               on trades;
drop policy if exists "Allow anon all"                  on trades;
drop policy if exists "Enable read access for all users" on trades;
drop policy if exists "authenticated_all_trades"        on trades;
drop policy if exists "service_role_all_trades"         on trades;

-- Accès complet pour l'utilisateur connecté (journal personnel)
create policy "authenticated_all_trades" on trades
  for all to authenticated using (true) with check (true);

-- Accès complet pour les Netlify Functions
create policy "service_role_all_trades" on trades
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: h2h_matches
-- =============================================================================
-- Droits frontend : SELECT uniquement (données readonly, écrites par seed).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table h2h_matches enable row level security;

drop policy if exists "anon_select_h2h_matches"         on h2h_matches;
drop policy if exists "anon_all_h2h_matches"            on h2h_matches;
drop policy if exists "Allow anon select"               on h2h_matches;
drop policy if exists "Allow anon all"                  on h2h_matches;
drop policy if exists "Enable read access for all users" on h2h_matches;
drop policy if exists "authenticated_select_h2h_matches" on h2h_matches;
drop policy if exists "service_role_all_h2h_matches"    on h2h_matches;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_h2h_matches" on h2h_matches
  for select to authenticated using (true);

-- Accès complet pour les Netlify Functions (seed, daily-seed)
create policy "service_role_all_h2h_matches" on h2h_matches
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: team_seasons
-- =============================================================================
-- Droits frontend : SELECT uniquement (données readonly, écrites par seed).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table team_seasons enable row level security;

drop policy if exists "anon_select_team_seasons"         on team_seasons;
drop policy if exists "anon_all_team_seasons"            on team_seasons;
drop policy if exists "Allow anon select"                on team_seasons;
drop policy if exists "Allow anon all"                   on team_seasons;
drop policy if exists "Enable read access for all users" on team_seasons;
drop policy if exists "authenticated_select_team_seasons" on team_seasons;
drop policy if exists "service_role_all_team_seasons"    on team_seasons;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_team_seasons" on team_seasons
  for select to authenticated using (true);

-- Accès complet pour les Netlify Functions (seed-data, daily-seed)
create policy "service_role_all_team_seasons" on team_seasons
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: seed_jobs
-- =============================================================================
-- Droits frontend : SELECT + INSERT + UPDATE (suivi progression seed depuis UI).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table seed_jobs enable row level security;

drop policy if exists "anon_select_seed_jobs"           on seed_jobs;
drop policy if exists "anon_insert_seed_jobs"           on seed_jobs;
drop policy if exists "anon_update_seed_jobs"           on seed_jobs;
drop policy if exists "anon_all_seed_jobs"              on seed_jobs;
drop policy if exists "Allow anon select"               on seed_jobs;
drop policy if exists "Allow anon all"                  on seed_jobs;
drop policy if exists "Enable read access for all users" on seed_jobs;
drop policy if exists "authenticated_select_seed_jobs"  on seed_jobs;
drop policy if exists "authenticated_insert_seed_jobs"  on seed_jobs;
drop policy if exists "authenticated_update_seed_jobs"  on seed_jobs;
drop policy if exists "service_role_all_seed_jobs"      on seed_jobs;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_seed_jobs" on seed_jobs
  for select to authenticated using (true);

-- Insertion par l'utilisateur connecté (démarrage d'un seed depuis l'UI)
create policy "authenticated_insert_seed_jobs" on seed_jobs
  for insert to authenticated with check (true);

-- Mise à jour par l'utilisateur connecté (progression du seed)
create policy "authenticated_update_seed_jobs" on seed_jobs
  for update to authenticated using (true) with check (true);

-- Accès complet pour les Netlify Functions
create policy "service_role_all_seed_jobs" on seed_jobs
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: team_fhg_cache
-- =============================================================================
-- Droits frontend : SELECT uniquement (données calculées par cron compute-team-fhg).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table team_fhg_cache enable row level security;

drop policy if exists "anon_select_team_fhg_cache"       on team_fhg_cache;
drop policy if exists "anon_all_team_fhg_cache"          on team_fhg_cache;
drop policy if exists "Allow anon select"                on team_fhg_cache;
drop policy if exists "Allow anon all"                   on team_fhg_cache;
drop policy if exists "Enable read access for all users" on team_fhg_cache;
drop policy if exists "authenticated_select_team_fhg_cache" on team_fhg_cache;
drop policy if exists "service_role_all_team_fhg_cache"  on team_fhg_cache;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_team_fhg_cache" on team_fhg_cache
  for select to authenticated using (true);

-- Accès complet pour les Netlify Functions (cron compute-team-fhg)
create policy "service_role_all_team_fhg_cache" on team_fhg_cache
  for all to service_role using (true) with check (true);


-- =============================================================================
-- TABLE: selected_alerts
-- =============================================================================
-- Droits frontend : SELECT + INSERT + DELETE (sélection / désélection par Benjamin).
-- Pas de UPDATE : table append-only / delete-only (cf. migration 20260506232305).
-- Droits Netlify  : via service_role (bypass RLS).
-- =============================================================================

alter table selected_alerts enable row level security;

drop policy if exists "anon_select_selected_alerts"      on selected_alerts;
drop policy if exists "anon_insert_selected_alerts"      on selected_alerts;
drop policy if exists "anon_delete_selected_alerts"      on selected_alerts;
drop policy if exists "anon_all_selected_alerts"         on selected_alerts;
drop policy if exists "Allow anon select"                on selected_alerts;
drop policy if exists "Allow anon all"                   on selected_alerts;
drop policy if exists "Enable read access for all users" on selected_alerts;
drop policy if exists "authenticated_select_selected_alerts" on selected_alerts;
drop policy if exists "authenticated_insert_selected_alerts" on selected_alerts;
drop policy if exists "authenticated_delete_selected_alerts" on selected_alerts;
drop policy if exists "service_role_all_selected_alerts" on selected_alerts;

-- Lecture par l'utilisateur connecté
create policy "authenticated_select_selected_alerts" on selected_alerts
  for select to authenticated using (true);

-- Insertion par l'utilisateur connecté (sélection d'une alerte)
create policy "authenticated_insert_selected_alerts" on selected_alerts
  for insert to authenticated with check (true);

-- Suppression par l'utilisateur connecté (désélection d'une alerte)
create policy "authenticated_delete_selected_alerts" on selected_alerts
  for delete to authenticated using (true);

-- Accès complet pour les Netlify Functions
create policy "service_role_all_selected_alerts" on selected_alerts
  for all to service_role using (true) with check (true);


-- =============================================================================
-- RÉVOQUER les droits anon résiduels
-- (Supabase crée des GRANTs sur anon par défaut — on les neutralise)
-- =============================================================================

revoke all on alerts         from anon;
revoke all on trades         from anon;
revoke all on h2h_matches    from anon;
revoke all on team_seasons   from anon;
revoke all on seed_jobs      from anon;
revoke all on team_fhg_cache from anon;
revoke all on selected_alerts from anon;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Exécuter ce bloc en cas de nécessité de revenir aux policies anon.
-- Supprimer les commentaires `--` et adapter si des noms ont changé.
-- =============================================================================

/*

-- ROLLBACK: alerts
drop policy if exists "authenticated_select_alerts"      on alerts;
drop policy if exists "authenticated_update_alerts"      on alerts;
drop policy if exists "service_role_all_alerts"          on alerts;
create policy "anon_select_alerts" on alerts
  for select to anon using (true);
create policy "anon_update_alerts" on alerts
  for update to anon using (true) with check (true);
create policy "service_role_all_alerts" on alerts
  for all to service_role using (true) with check (true);

-- ROLLBACK: trades
drop policy if exists "authenticated_all_trades"         on trades;
drop policy if exists "service_role_all_trades"          on trades;
create policy "anon_all_trades" on trades
  for all to anon using (true) with check (true);
create policy "service_role_all_trades" on trades
  for all to service_role using (true) with check (true);

-- ROLLBACK: h2h_matches
drop policy if exists "authenticated_select_h2h_matches" on h2h_matches;
drop policy if exists "service_role_all_h2h_matches"     on h2h_matches;
create policy "anon_select_h2h_matches" on h2h_matches
  for select to anon using (true);
create policy "service_role_all_h2h_matches" on h2h_matches
  for all to service_role using (true) with check (true);

-- ROLLBACK: team_seasons
drop policy if exists "authenticated_select_team_seasons" on team_seasons;
drop policy if exists "service_role_all_team_seasons"     on team_seasons;
create policy "anon_select_team_seasons" on team_seasons
  for select to anon using (true);
create policy "service_role_all_team_seasons" on team_seasons
  for all to service_role using (true) with check (true);

-- ROLLBACK: seed_jobs
drop policy if exists "authenticated_select_seed_jobs"   on seed_jobs;
drop policy if exists "authenticated_insert_seed_jobs"   on seed_jobs;
drop policy if exists "authenticated_update_seed_jobs"   on seed_jobs;
drop policy if exists "service_role_all_seed_jobs"       on seed_jobs;
create policy "anon_select_seed_jobs" on seed_jobs
  for select to anon using (true);
create policy "anon_insert_seed_jobs" on seed_jobs
  for insert to anon with check (true);
create policy "anon_update_seed_jobs" on seed_jobs
  for update to anon using (true) with check (true);
create policy "service_role_all_seed_jobs" on seed_jobs
  for all to service_role using (true) with check (true);

-- ROLLBACK: team_fhg_cache
drop policy if exists "authenticated_select_team_fhg_cache" on team_fhg_cache;
drop policy if exists "service_role_all_team_fhg_cache"     on team_fhg_cache;
create policy "anon_select_team_fhg_cache" on team_fhg_cache
  for select to anon using (true);
create policy "service_role_all_team_fhg_cache" on team_fhg_cache
  for all to service_role using (true) with check (true);

-- ROLLBACK: selected_alerts
drop policy if exists "authenticated_select_selected_alerts" on selected_alerts;
drop policy if exists "authenticated_insert_selected_alerts" on selected_alerts;
drop policy if exists "authenticated_delete_selected_alerts" on selected_alerts;
drop policy if exists "service_role_all_selected_alerts"     on selected_alerts;
create policy "anon_select_selected_alerts" on selected_alerts
  for select to anon using (true);
create policy "anon_insert_selected_alerts" on selected_alerts
  for insert to anon with check (true);
create policy "anon_delete_selected_alerts" on selected_alerts
  for delete to anon using (true);
create policy "service_role_all_selected_alerts" on selected_alerts
  for all to service_role using (true) with check (true);

*/
