-- =============================================================================
-- Migration  : 20260509110000_create_cron_runs_table
-- Date       : 2026-05-09
-- =============================================================================
--
-- RÔLE DE LA TABLE
-- ----------------
-- `cron_runs` logge chaque exécution des Netlify Scheduled Functions.
-- Remplace l'inférence approximative via MAX(created_at) sur `alerts` :
-- un cron peut tourner sans créer de ligne (tous les matchs déjà couverts)
-- et être pourtant sain. Cette table fournit une source de vérité fiable.
--
-- WORKFLOW APPLICATIF
-- -------------------
-- 1. Début du cron  → INSERT { cron_name, status='running', started_at=now() }
--                     → récupérer l'id retourné
-- 2. Fin normale    → UPDATE SET status='success', ended_at=now(),
--                     count_created=..., count_updated=..., count_processed=...
--                     WHERE id = <id>
-- 3. Fin avec erreur→ UPDATE SET status='error', ended_at=now(),
--                     error_message='...'  WHERE id = <id>
-- 4. Fin partielle  → UPDATE SET status='partial', ended_at=now(),
--                     error_message='...', count_*=...  WHERE id = <id>
--
-- Aucun trigger — les mises à jour sont faites par le code applicatif
-- (helper prévu : netlify/functions/lib/cronLog.cjs).
--
-- ACCÈS
-- -----
-- - Frontend (authenticated) : SELECT uniquement (dashboard "Santé crons")
-- - Netlify Functions (service_role) : ALL (INSERT + UPDATE)
-- - anon : aucun accès
--
-- =============================================================================


-- ============================================================
-- TABLE: cron_runs
-- ============================================================
create table if not exists cron_runs (

  -- Clé primaire auto-incrémentée. BIGSERIAL pour anticiper le volume :
  -- jusqu'à 4 crons × 24 exécutions/jour × 365 jours = ~35 000 lignes/an.
  id                bigserial primary key,

  -- Identifiant humain du cron. TEXT libre intentionnel : pas de CHECK
  -- strict pour pouvoir enregistrer de nouveaux crons sans migration.
  -- Valeurs actuelles : 'generate-alerts', 'check-results',
  --                     'daily-seed', 'compute-team-lg1'.
  cron_name         text not null,

  -- Horodatage de début d'exécution (posé par le cron dès son démarrage).
  started_at        timestamptz not null default now(),

  -- Horodatage de fin d'exécution. NULL tant que le cron est en cours.
  ended_at          timestamptz null,

  -- Statut courant de l'exécution.
  -- 'running'  → en cours (valeur initiale à l'INSERT)
  -- 'success'  → terminé sans erreur
  -- 'partial'  → terminé avec des erreurs non-bloquantes (ex. qqs matchs KO)
  -- 'error'    → terminé en erreur bloquante
  status            text not null default 'running'
                    check (status in ('running', 'success', 'partial', 'error')),

  -- Nombre de lignes créées (ex. alertes générées par generate-alerts).
  -- NULL si non applicable pour ce cron.
  count_created     int null,

  -- Nombre de lignes mises à jour (ex. alertes validées par check-results).
  -- NULL si non applicable pour ce cron.
  count_updated     int null,

  -- Nombre de lignes traitées en entrée (ex. matchs analysés, équipes scannées).
  -- NULL si non applicable pour ce cron.
  count_processed   int null,

  -- Message d'erreur si status = 'error' ou 'partial'.
  -- Contient le message d'exception ou un résumé des échecs partiels.
  error_message     text null,

  -- Bag JSON libre pour des contextes spécifiques à chaque cron :
  -- ex. { "dates": ["2026-05-09", "2026-05-10"], "league_ids": [1234, 5678] }
  -- NULL si aucune métadonnée supplémentaire n'est nécessaire.
  metadata          jsonb null

);


-- ============================================================
-- INDEXES
-- ============================================================

-- Requête principale du dashboard : dernier run par cron_name.
-- Supporte aussi les filtres sur started_at (plage temporelle).
create index if not exists idx_cron_runs_name_started
  on cron_runs(cron_name, started_at desc);


-- ============================================================
-- RLS
-- ============================================================
alter table cron_runs enable row level security;

-- Lecture par le frontend authentifié (dashboard "Santé crons").
-- IMPORTANT : policy explicite `to authenticated` obligatoire car cette table
-- est créée APRÈS la migration 20260507120000_harden_rls_authenticated.sql.
-- Sans cette policy, le rôle `authenticated` voit 0 ligne silencieusement.
drop policy if exists "authenticated_select" on cron_runs;
create policy "authenticated_select" on cron_runs
  for select
  to authenticated
  using (true);

-- Accès complet pour les Netlify Functions (INSERT au démarrage, UPDATE à la fin).
-- Le rôle service_role bypasse RLS par défaut dans Supabase, mais la policy
-- est déclarée explicitement pour la lisibilité et la cohérence du projet.
drop policy if exists "service_role_all" on cron_runs;
create policy "service_role_all" on cron_runs
  for all
  to service_role
  using (true)
  with check (true);


-- ============================================================
-- COMMENTS
-- ============================================================
comment on table cron_runs is
  'Journal d''exécution des Netlify Scheduled Functions (generate-alerts, '
  'check-results, daily-seed, compute-team-lg1). '
  'Chaque run insère une ligne au démarrage (status=running) puis la met '
  'à jour à la fin (success/partial/error). '
  'Alimente le dashboard KPI "Santé crons".';

comment on column cron_runs.id              is 'Identifiant auto-incrémenté du run (BIGSERIAL).';
comment on column cron_runs.cron_name       is 'Nom du cron : generate-alerts, check-results, daily-seed, compute-team-lg1. TEXT libre (pas de CHECK strict).';
comment on column cron_runs.started_at      is 'Horodatage de début d''exécution, posé par le cron dès son entrée.';
comment on column cron_runs.ended_at        is 'Horodatage de fin d''exécution. NULL tant que status = running.';
comment on column cron_runs.status          is 'État du run : running | success | partial | error.';
comment on column cron_runs.count_created   is 'Nombre de lignes créées (alertes générées, matchs seedés…). NULL si non applicable.';
comment on column cron_runs.count_updated   is 'Nombre de lignes mises à jour (alertes validées/perdues…). NULL si non applicable.';
comment on column cron_runs.count_processed is 'Nombre d''entités traitées en entrée (matchs analysés, équipes scannées…). NULL si non applicable.';
comment on column cron_runs.error_message   is 'Message d''erreur si status = error ou partial. NULL sinon.';
comment on column cron_runs.metadata        is 'Bag JSON libre : contextes spécifiques au cron (dates couvertes, league_ids, etc.). NULL si absent.';
