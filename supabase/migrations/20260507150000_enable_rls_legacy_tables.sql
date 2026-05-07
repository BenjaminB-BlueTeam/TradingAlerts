-- Active RLS sur les tables legacy non protégées
-- leagues et api_cache : non utilisées côté client (service_role only)
-- alerts_v1_backup : backup, accès service_role uniquement

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_v1_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leagues_service_all" ON public.leagues FOR ALL TO service_role USING (true);
CREATE POLICY "api_cache_service_all" ON public.api_cache FOR ALL TO service_role USING (true);
CREATE POLICY "alerts_v1_backup_service_all" ON public.alerts_v1_backup FOR ALL TO service_role USING (true);
