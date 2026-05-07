-- =============================================================================
-- Migration  : 20260507180000_create_alert_trades
-- Date       : 2026-05-07
-- Chantier   : C — Positions de trading sur les alertes FHG/LG2
-- =============================================================================
--
-- RÔLE DE LA TABLE
-- ----------------
-- `alert_trades` stocke les mises personnelles de Benjamin sur les alertes
-- FHG/LG2. Supporte plusieurs positions par match (mises échelonnées à
-- différentes cotes).
--
-- DISTINCTION AVEC selected_alerts
-- ---------------------------------
-- selected_alerts  → jugement humain : "je suis cette alerte" (sans €)
--                    Usage : /historique scope=mine (statistiques %)
--
-- alert_trades     → position réelle : "j'ai misé X€ à la cote Y"
--                    Usage : /settings TradeJournal, TradeStats, BankrollCalc
--                    Plusieurs lignes possibles pour un même match (mises
--                    échelonnées à différentes cotes sur le même signal).
--
-- POURQUOI PAS DE FK VERS alerts(match_id)
-- -----------------------------------------
-- alerts.match_id n'est PAS une colonne unique : un même match génère
-- jusqu'à plusieurs lignes dans alerts (signal_type = FHG, LG2...).
-- La relation est résolue côté application (JOIN sur match_id + signal_type).
--
-- POURQUOI PAS DE updated_at
-- ---------------------------
-- Table append-only. Une position ouverte n'est pas modifiée : on insère
-- une nouvelle ligne pour une mise complémentaire. Pas de surface UPDATE.
--
-- =============================================================================


-- ============================================================
-- TABLE: alert_trades
-- ============================================================
create table if not exists alert_trades (
  -- Clé primaire UUID (cohérent avec le pattern uuid du projet).
  id            uuid primary key default gen_random_uuid(),

  -- Référence au match (identifiant FootyStats, ex: "12345678").
  -- Pas de FK sur alerts(match_id) : alerts.match_id n'est pas unique.
  match_id      text not null,

  -- Type de signal joué : FHG_A, FHG_B, FHG_A+B, LG2_A, LG2_B, LG2_A+B...
  -- TEXT libre intentionnel : cohérent avec alerts.signal_type.
  signal_type   text not null,

  -- Cote bookmaker au moment de la mise. Doit être > 1 (jamais de cote nulle
  -- ou égale à 1 qui rendrait le calcul P&L incohérent).
  cote          numeric(6,2) not null check (cote > 1),

  -- Montant misé en € (optionnel : Benjamin peut saisir la cote sans la mise
  -- pour un suivi paper trading, ou renseigner la mise séparément).
  mise          numeric(10,2),

  -- Timestamp de création de la position (immuable — append-only).
  created_at    timestamptz not null default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Requêtes par match + signal (JOIN avec alerts, agrégation dans TradeStats).
create index if not exists idx_alert_trades_match
  on alert_trades(match_id, signal_type);

-- Tri chronologique dans TradeJournal (ORDER BY created_at DESC).
create index if not exists idx_alert_trades_created_at
  on alert_trades(created_at desc);


-- ============================================================
-- RLS
-- ============================================================
alter table alert_trades enable row level security;

-- Accès complet pour le client anon (usage solo — pas de multi-utilisateur).
drop policy if exists "anon_all" on alert_trades;
create policy "anon_all" on alert_trades
  for all to anon using (true) with check (true);

-- Accès complet pour les utilisateurs authentifiés.
drop policy if exists "authenticated_all" on alert_trades;
create policy "authenticated_all" on alert_trades
  for all to authenticated using (true) with check (true);


-- ============================================================
-- COMMENTS
-- ============================================================
comment on table alert_trades is
  'Positions de trading de Benjamin sur les alertes FHG/LG2. '
  'Plusieurs lignes possibles par match (mises échelonnées). '
  'Alimente /settings TradeJournal, TradeStats, BankrollCalc. '
  'Distinct de selected_alerts qui porte le jugement humain sans données €.';

comment on column alert_trades.id          is 'Identifiant unique de la position (UUID).';
comment on column alert_trades.match_id    is 'Identifiant FootyStats du match. Pas de FK : alerts.match_id n''est pas unique.';
comment on column alert_trades.signal_type is 'Signal joué (FHG_A, LG2_B…). TEXT libre, cohérent avec alerts.signal_type.';
comment on column alert_trades.cote        is 'Cote bookmaker au moment de la mise (> 1). Utilisée pour le calcul P&L.';
comment on column alert_trades.mise        is 'Montant misé en € (NULL autorisé : paper trading ou saisie différée).';
comment on column alert_trades.created_at  is 'Timestamp de création de la position. Immuable (table append-only).';
