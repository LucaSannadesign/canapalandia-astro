-- Rollback di 20261103120000_ads_manager.sql
-- DISTRUTTIVO: elimina tabelle e dati pubblicitari. Eseguire solo con autorizzazione umana esplicita.
drop view if exists public.ads_campaign_daily_stats;
drop table if exists public.ads_audit_log;
drop table if exists public.ads_daily_stats;
drop table if exists public.ads_events;
drop table if exists public.ads_placements;
drop table if exists public.ads_creatives;
drop table if exists public.ads_campaigns;
drop table if exists public.ads_positions;
drop table if exists public.ads_advertisers;
drop function if exists public.ads_purge_events(integer);
drop function if exists public.ads_campaigns_propagate();
drop function if exists public.ads_campaigns_guard();
drop function if exists public.ads_creatives_guard();
drop function if exists public.ads_placements_sync_from_campaign();
drop function if exists public.ads_status_is_blocking(text);
-- btree_gist non viene rimossa: potrebbe essere usata da altri oggetti.
