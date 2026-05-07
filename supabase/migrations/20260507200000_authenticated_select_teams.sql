-- Migration: ajoute la policy SELECT pour le rôle authenticated sur teams.
-- Date: 2026-05-07
-- Contexte: la table teams a été créée APRÈS la migration de hardening
-- (20260507120000_harden_rls_authenticated.sql) qui ne la couvrait pas.
-- Résultat : les utilisateurs connectés (rôle `authenticated`) voyaient
-- 0 ligne en sélection — l'autocomplete de /matches était silencieusement
-- vide. La policy `teams_select_anon` ne s'applique qu'au rôle anon.

drop policy if exists "teams_select_authenticated" on public.teams;

create policy "teams_select_authenticated"
  on public.teams
  for select
  to authenticated
  using (true);
