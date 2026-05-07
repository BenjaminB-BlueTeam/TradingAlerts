-- =============================================================================
-- dc-cleanup.sql — Nettoyage des données DC dans Supabase
-- Date       : 2026-05-07
-- Contexte   : Suppression de la stratégie DC de l'application.
--              Le schéma BDD (colonnes dc_*) est conservé en l'état.
-- =============================================================================
--
-- INSTRUCTIONS
-- ------------
-- Exécuter dans le Supabase SQL Editor (https://supabase.com/dashboard).
-- Lire chaque bloc avant de l'exécuter.
--
-- =============================================================================


-- =============================================================================
-- ÉTAPE 1 (obligatoire) — Expirer les alertes DC encore en attente
-- =============================================================================
-- Les alertes DC en statut 'pending' ne seront plus jamais vérifiées par
-- check-results.js (la logique DC a été retirée). On les passe en 'expired'
-- pour qu'elles ne polluent pas les stats et ne restent pas en suspens.

UPDATE alerts
SET status = 'expired', updated_at = NOW()
WHERE signal_type = 'DC'
  AND status = 'pending';

-- Vérification :
-- SELECT COUNT(*) FROM alerts WHERE signal_type = 'DC' AND status = 'pending';
-- → doit retourner 0 après l'exécution.


-- =============================================================================
-- ÉTAPE 2 (optionnelle) — Purger toutes les alertes DC historiques
-- =============================================================================
-- À n'exécuter que si Benjamin souhaite supprimer l'historique DC de la BDD.
-- Les données historiques DC peuvent être utiles pour des analyses rétrospectives.
-- Par défaut : NE PAS EXÉCUTER.

-- DELETE FROM alerts WHERE signal_type = 'DC';

-- Vérification :
-- SELECT COUNT(*) FROM alerts WHERE signal_type = 'DC';
-- → doit retourner 0 si l'étape 2 est exécutée.


-- =============================================================================
-- ÉTAT ATTENDU APRÈS L'ÉTAPE 1
-- =============================================================================
-- SELECT signal_type, status, COUNT(*) as n
-- FROM alerts
-- WHERE signal_type = 'DC'
-- GROUP BY signal_type, status
-- ORDER BY status;
--
-- Résultat attendu : plus aucune ligne DC avec status = 'pending'.
-- Les lignes DC avec status IN ('validated', 'lost', 'expired') restent.
