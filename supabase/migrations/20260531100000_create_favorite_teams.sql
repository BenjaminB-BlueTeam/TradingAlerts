-- =============================================================================
-- Migration  : 20260531100000_create_favorite_teams
-- Date       : 2026-05-31
-- Auteur     : Benjamin
-- =============================================================================
--
-- RÔLE DE LA TABLE
-- ----------------
-- `favorite_teams` stocke les équipes favorites de Benjamin pour un accès
-- rapide depuis l'UI (filtrage, raccourcis, suivi prioritaire).
-- La table est volontairement légère : elle ne duplique que le minimum
-- nécessaire à l'affichage (team_name dénormalisé) pour éviter une jointure
-- systématique sur `teams` à chaque lecture.
--
-- RELATION AVEC LA TABLE `teams`
-- --------------------------------
-- `team_id` est l'identifiant FootyStats présent dans `teams.team_id`.
-- Pas de FK formelle : la table `teams` n'a pas de contrainte UNIQUE
-- garantie sur `team_id` exploitable par PostgreSQL comme cible de FK.
-- L'intégrité référentielle est assurée côté application.
--
-- POURQUOI PAS DE FK
-- -------------------
-- Même décision que `selected_alerts.match_id` : on évite le couplage fort
-- avec une table dont la structure peut changer sans migration coordonnée.
--
-- =============================================================================


-- ============================================================
-- TABLE: favorite_teams
-- ============================================================
create table if not exists favorite_teams (
  -- Clé technique auto-incrémentée (bigint identity, usage solo).
  id          bigint generated always as identity primary key,

  -- Identifiant FootyStats de l'équipe (référence logique vers teams.team_id).
  -- UNIQUE : Benjamin ne peut pas ajouter deux fois la même équipe.
  team_id     bigint not null unique,

  -- Nom de l'équipe dénormalisé pour affichage sans jointure.
  -- Nullable : peut être renseigné à l'insertion ou laissé vide si non dispo.
  team_name   text,

  -- Timestamp d'ajout (immuable — table append-only / delete-only).
  created_at  timestamptz not null default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- La contrainte UNIQUE sur team_id crée déjà un index implicite.
-- Index explicite sur created_at pour le tri chronologique dans l'UI.
create index if not exists idx_favorite_teams_created_at
  on favorite_teams(created_at desc);


-- ============================================================
-- RLS
-- ============================================================
alter table favorite_teams enable row level security;

-- Lecture par l'utilisateur connecté.
drop policy if exists "authenticated_select_favorite_teams" on favorite_teams;
create policy "authenticated_select_favorite_teams" on favorite_teams
  for select to authenticated using (true);

-- Insertion par l'utilisateur connecté (ajout d'une équipe favorite).
drop policy if exists "authenticated_insert_favorite_teams" on favorite_teams;
create policy "authenticated_insert_favorite_teams" on favorite_teams
  for insert to authenticated with check (true);

-- Suppression par l'utilisateur connecté (retrait d'une équipe favorite).
drop policy if exists "authenticated_delete_favorite_teams" on favorite_teams;
create policy "authenticated_delete_favorite_teams" on favorite_teams
  for delete to authenticated using (true);

-- Accès complet pour les Netlify Functions (service_role bypass RLS).
drop policy if exists "service_role_all_favorite_teams" on favorite_teams;
create policy "service_role_all_favorite_teams" on favorite_teams
  for all to service_role using (true) with check (true);

-- Révoquer les droits anon résiduels (cohérence avec le hardening 20260507120000).
revoke all on favorite_teams from anon;


-- ============================================================
-- COMMENTS
-- ============================================================
comment on table favorite_teams is
  'Équipes favorites de Benjamin. Sélection manuelle depuis l''UI pour filtrage '
  'et suivi prioritaire. team_name dénormalisé pour affichage sans jointure. '
  'Table append-only / delete-only (pas de UPDATE).';

comment on column favorite_teams.team_id   is 'Identifiant FootyStats de l''équipe. Pas de FK formelle : cohérence gérée côté app.';
comment on column favorite_teams.team_name is 'Nom dénormalisé pour affichage rapide. Nullable.';
comment on column favorite_teams.created_at is 'Timestamp d''ajout. Immuable (pas de UPDATE policy).';
