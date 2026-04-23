-- ============================================================
-- Migration Supabase : algo streak v2 + exclusion manuelle
-- À exécuter manuellement dans le SQL Editor Supabase.
-- ============================================================

-- 1. Backup des alertes v1 (sécurité)
CREATE TABLE IF NOT EXISTS alerts_v1_backup AS SELECT * FROM alerts;

-- 2. Purge des alertes v1 (on repart propre avec le nouvel algo)
--    Les tables trades, h2h_matches, team_seasons, seed_jobs ne sont PAS touchées.
DELETE FROM alerts;

-- 3. Ajout des nouvelles colonnes
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS algo_version text DEFAULT 'v2';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_excluded boolean DEFAULT false;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_exclusion_tags text[];
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_exclusion_note text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_excluded_at timestamptz;

-- 4. Vérifier/mettre à jour la CHECK constraint sur signal_type
--    (vérifier d'abord : SELECT conname FROM pg_constraint WHERE conrelid = 'alerts'::regclass;)
-- Si une constraint existe, la supprimer et recréer :
-- ALTER TABLE alerts DROP CONSTRAINT IF EXISTS <nom_constraint>;
-- ALTER TABLE alerts ADD CONSTRAINT alerts_signal_type_check
--   CHECK (signal_type IN ('FHG', 'FHG_A', 'FHG_B', 'FHG_A+B', 'DC'));
-- (garder 'FHG' pour compatibilité avec alerts_v1_backup)

-- 5. Index pour les nouvelles colonnes
CREATE INDEX IF NOT EXISTS idx_alerts_algo_version ON alerts(algo_version);
CREATE INDEX IF NOT EXISTS idx_alerts_user_excluded ON alerts(user_excluded);

-- 6. RLS : policy UPDATE pour l'exclusion manuelle (anon peut UPDATE)
--    Benjamin est l'unique utilisateur, policy permissive acceptable.
DROP POLICY IF EXISTS "anon can update exclusion fields" ON alerts;
CREATE POLICY "anon can update exclusion fields" ON alerts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Vérifications post-migration
-- ============================================================

-- Vérifier que les colonnes sont bien créées :
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'alerts'
-- ORDER BY ordinal_position;

-- Vérifier le backup :
-- SELECT COUNT(*) FROM alerts_v1_backup;

-- Vérifier que la table alerts est vide :
-- SELECT COUNT(*) FROM alerts;
