-- =============================================================================
-- Migration  : 20260506232305_create_selected_alerts
-- Date       : 2026-05-06
-- Chantier   : B — Sélection manuelle des alertes
-- Auteur     : Benjamin
-- =============================================================================
--
-- RÔLE DE LA TABLE
-- ----------------
-- `selected_alerts` capture le jugement humain de Benjamin : quelles alertes
-- (FHG / DC / LG2) il décide effectivement de jouer, parmi celles générées
-- automatiquement dans `alerts`.
-- Elle alimente le scope "Mes sélections" dans /historique (taux %, sans €).
--
-- DISTINCTION AVEC LA FUTURE TABLE `trade_positions` (Chantier C)
-- ----------------------------------------------------------------
-- selected_alerts  → résultat MATCH (validated / lost / expired)
--                    obtenu par JOIN runtime sur alerts.status
--                    Usage : /historique scope=mine (statistiques %)
--
-- trade_positions  → résultat TRADE en € (mise, cote, P&L) — table future
--                    Une selected_alert peut avoir 0 ou 1 trade_position
--                    (FK optionnelle : trade_positions.selected_alert_id → selected_alerts.id)
--                    Usage : /settings TradeStats (argent réel)
--
-- Une selected_alert N'est PAS un trade. Benjamin peut sélectionner une alerte
-- pour la suivre sans nécessairement ouvrir une position (paper trading, suivi).
--
-- POURQUOI PAS DE FK VERS alerts(match_id)
-- -----------------------------------------
-- alerts.match_id n'est PAS une colonne unique : un même match peut générer
-- jusqu'à 3 lignes dans alerts (signal_type = FHG, DC, LG2). Il est donc
-- impossible d'ajouter une contrainte REFERENCES alerts(match_id).
-- La relation est résolue côté application (JOIN sur match_id + signal_type).
--
-- POURQUOI PAS DE TRIGGER
-- ------------------------
-- Toute la logique métier (cascade FHG→DC, blocage anti-sélection sur alerte
-- exclue, unicité de la sélection par couple match/signal) est gérée côté UI
-- et store Svelte. Les triggers SQL cachent la logique et compliquent le debug
-- en session de développement solo.
--
-- =============================================================================


-- ============================================================
-- TABLE: selected_alerts
-- ============================================================
create table if not exists selected_alerts (
  -- Clé technique auto-incrémentée (pas UUID : on n'a pas besoin
  -- d'un identifiant distribué pour une table d'usage solo).
  id          bigserial primary key,

  -- Référence au match (identifiant FootyStats, ex: "12345678").
  -- Pas de FK sur alerts(match_id) car alerts.match_id n'est pas unique.
  match_id    text not null,

  -- Type de signal sélectionné : FHG_A, FHG_B, FHG_A+B, DC, LG2_A, LG2_B, LG2_A+B...
  -- TEXT libre intentionnel : cohérent avec alerts.signal_type (pas de CHECK côté DB).
  signal_type text not null,

  -- Note libre de Benjamin (non exposée en UI v1 mais stockée pour éviter
  -- une migration future lors de l'ajout de cette feature).
  user_note   text,

  -- Timestamp de sélection (immuable — la table est append-only / delete-only).
  created_at  timestamptz not null default now(),

  -- Unicité fonctionnelle : Benjamin ne peut pas sélectionner deux fois
  -- la même alerte (même match + même signal). Un match peut avoir au plus
  -- une sélection par signal_type (FHG et DC sont deux sélections distinctes).
  constraint uq_selected_alerts_match_signal unique (match_id, signal_type)
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Filtrage par match (JOIN avec alerts pour récupérer le statut).
create index if not exists idx_selected_alerts_match_id
  on selected_alerts(match_id);

-- Filtrage par type de signal dans /historique.
create index if not exists idx_selected_alerts_signal_type
  on selected_alerts(signal_type);

-- Tri chronologique (ORDER BY created_at DESC) dans /historique.
create index if not exists idx_selected_alerts_created_at
  on selected_alerts(created_at desc);


-- ============================================================
-- RLS
-- ============================================================
alter table selected_alerts enable row level security;

-- Lecture libre pour le frontend (client anon Supabase).
drop policy if exists "anon_select_selected_alerts" on selected_alerts;
create policy "anon_select_selected_alerts" on selected_alerts
  for select to anon using (true);

-- Insertion par Benjamin depuis l'UI (pas de trigger, logique côté store).
drop policy if exists "anon_insert_selected_alerts" on selected_alerts;
create policy "anon_insert_selected_alerts" on selected_alerts
  for insert to anon with check (true);

-- Suppression par Benjamin (désélection d'une alerte).
-- Pas de policy UPDATE : append-only / delete-only. Pour modifier user_note,
-- on supprime + réinsère (édition v2). Minimise la surface d'écriture.
drop policy if exists "anon_delete_selected_alerts" on selected_alerts;
create policy "anon_delete_selected_alerts" on selected_alerts
  for delete to anon using (true);

-- Accès complet pour les Netlify Functions (service_role bypass RLS).
drop policy if exists "service_role_all_selected_alerts" on selected_alerts;
create policy "service_role_all_selected_alerts" on selected_alerts
  for all to service_role using (true) with check (true);


-- ============================================================
-- COMMENTS
-- ============================================================
comment on table selected_alerts is
  'Alertes sélectionnées manuellement par Benjamin pour suivi/play. '
  'Alimente /historique scope=mine. '
  'Résultat match obtenu par JOIN runtime sur alerts.status (pas stocké ici). '
  'Distinct de trade_positions (futur Chantier C) qui portera les données €.';

comment on column selected_alerts.match_id    is 'Identifiant FootyStats du match. Pas de FK : alerts.match_id n''est pas unique.';
comment on column selected_alerts.signal_type is 'Signal sélectionné (FHG_A, DC, LG2_B…). TEXT libre, cohérent avec alerts.signal_type.';
comment on column selected_alerts.user_note   is 'Note libre de Benjamin. Non exposé en UI v1, réservé pour une feature future.';
comment on column selected_alerts.created_at  is 'Timestamp de sélection. Immuable (pas de UPDATE policy).';
