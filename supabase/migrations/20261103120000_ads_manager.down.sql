-- Rollback di 20261103120000_ads_manager.sql
-- DISTRUTTIVO: elimina tabelle e dati pubblicitari. Eseguire solo con autorizzazione umana esplicita.
-- Ordine: prima le funzioni che restituiscono tipi riga delle tabelle, poi vista e tabelle, infine i trigger.
drop function if exists public.ads_admin_review_creative(uuid, jsonb, text, text, jsonb);
drop function if exists public.ads_admin_update_campaign(uuid, timestamptz, jsonb, text, text, jsonb);
drop function if exists public.ads_admin_create_campaign(jsonb, jsonb, jsonb, text);
drop function if exists public.ads_admin_update_advertiser(uuid, jsonb, text);
drop function if exists public.ads_admin_create_advertiser(jsonb, text);
drop function if exists public.ads_require_actor(text);
drop function if exists public.ads_retention_status(integer, integer);
drop function if exists public.ads_purge_events(integer, integer);
drop function if exists public.ads_purge_events(integer);
drop view if exists public.ads_campaign_daily_stats;
drop table if exists public.ads_audit_log;
drop table if exists public.ads_daily_stats;
drop table if exists public.ads_events;
drop table if exists public.ads_placements;
drop table if exists public.ads_creatives;
drop table if exists public.ads_campaigns;
drop table if exists public.ads_positions;
drop table if exists public.ads_advertisers;
drop function if exists public.ads_campaigns_propagate();
drop function if exists public.ads_campaigns_guard();
drop function if exists public.ads_creatives_guard();
drop function if exists public.ads_placements_sync_from_campaign();
drop function if exists public.ads_status_is_blocking(text);
-- btree_gist (schema extensions) non viene rimossa: potrebbe essere usata da altri oggetti.
