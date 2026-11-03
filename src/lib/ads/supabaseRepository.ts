/**
 * Implementazione Supabase di AdsRepository. Solo server-side (service_role tramite getSupabaseServer):
 * le tabelle ads_* hanno RLS attiva senza policy, quindi anon/authenticated non hanno alcun accesso.
 * Viene istanziata solo dalle route API / dal componente quando servono (factory pigra).
 */

import { getSupabaseServer } from "../supabaseServer";
import type { CampaignContext, CampaignDraftInput, OccupiedSlot } from "./campaigns";
import { AdsConflictError, type AdsRepository, type AdvertiserInput, type AuditContext, type CampaignPatch, type CreativePatch } from "./repository";
import type { AdEvent, AdEventType, Advertiser, Campaign, Creative, DailyStat, Placement, PlacementBundle } from "./types";

type Db = ReturnType<typeof getSupabaseServer>;
type PgError = { code?: string; message: string } | null;

/** Errori di vincolo del database (EXCLUDE, CHECK, trigger, unique) → 409 lato admin. */
function raise(error: PgError, context: string): never {
  const code = error?.code ?? "";
  if (["23P01", "23514", "23505", "P0001"].includes(code)) throw new AdsConflictError(error!.message);
  throw new Error(`${context}: ${error?.message ?? "errore sconosciuto"}`);
}

// Hint espliciti sulle FK: ads_events/ads_daily_stats collegano placements e campaigns anche come
// "tabelle ponte" e PostgREST rifiuterebbe l'embed come ambiguo.
const PLACEMENT_BUNDLE_SELECT =
  "*, campaign:ads_campaigns!ads_placements_campaign_id_fkey!inner(*, advertiser:ads_advertisers!ads_campaigns_advertiser_id_fkey!inner(*)), creative:ads_creatives!ads_placements_creative_id_fkey(*)";

type BundleRow = Placement & { campaign: Campaign & { advertiser: Advertiser }; creative: Creative | null };

function toBundle(row: BundleRow): PlacementBundle {
  const { campaign, creative, ...placement } = row;
  const { advertiser, ...campaignOnly } = campaign;
  return { placement: placement as Placement, campaign: campaignOnly as Campaign, creative: creative ?? null, advertiser };
}

export function createSupabaseAdsRepository(db: Db = getSupabaseServer()): AdsRepository {
  // Client non tipizzato sullo schema: le righe sono validate dai vincoli SQL e dal dominio.
  const client = db as unknown as { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
  const from = (table: string) => client.from(table);
  const rpc = (fn: string, args: Record<string, unknown>) => client.rpc(fn, args);

  const repo: AdsRepository = {
    async listAdvertisers() {
      const { data, error } = await from("ads_advertisers").select("*").order("display_name");
      if (error) raise(error, "listAdvertisers");
      return data as Advertiser[];
    },
    async getAdvertiser(id) {
      const { data, error } = await from("ads_advertisers").select("*").eq("id", id).maybeSingle();
      if (error) raise(error, "getAdvertiser");
      return (data as Advertiser | null) ?? null;
    },
    async createAdvertiser(input: AdvertiserInput, actor) {
      const { data, error } = await rpc("ads_admin_create_advertiser", { p_data: input, p_actor: actor });
      if (error) raise(error, "createAdvertiser");
      return data as Advertiser;
    },
    async updateAdvertiser(id, patch, actor) {
      const { data, error } = await rpc("ads_admin_update_advertiser", { p_id: id, p_patch: patch, p_actor: actor });
      if (error) raise(error, "updateAdvertiser");
      return data as Advertiser;
    },

    async listCampaigns(filter) {
      let q = from("ads_campaigns").select("*").order("starts_on", { ascending: false });
      if (filter?.advertiser_id) q = q.eq("advertiser_id", filter.advertiser_id);
      const { data, error } = await q;
      if (error) raise(error, "listCampaigns");
      return data as Campaign[];
    },
    async getCampaignContext(id): Promise<CampaignContext | null> {
      const { data: campaign, error } = await from("ads_campaigns").select("*").eq("id", id).maybeSingle();
      if (error) raise(error, "getCampaignContext");
      if (!campaign) return null;
      const [adv, creatives, placements] = await Promise.all([
        from("ads_advertisers").select("*").eq("id", (campaign as Campaign).advertiser_id).single(),
        from("ads_creatives").select("*").eq("campaign_id", id).order("created_at"),
        from("ads_placements").select("id, campaign_id, creative_id, article_slug, position_code, starts_on, ends_on, is_blocking").eq("campaign_id", id).order("article_slug"),
      ]);
      for (const r of [adv, creatives, placements]) if (r.error) raise(r.error, "getCampaignContext");
      return {
        campaign: campaign as Campaign,
        advertiser: adv.data as Advertiser,
        creatives: creatives.data as Creative[],
        placements: placements.data as Placement[],
      };
    },
    async createCampaignDraft(input: CampaignDraftInput, actor) {
      // Una sola transazione SQL: campagna, creatività, posizionamenti (collegati per chiave) e audit
      const { creatives, placements, ...campaign } = input;
      const { data, error } = await rpc("ads_admin_create_campaign", {
        p_campaign: campaign,
        p_creatives: creatives,
        p_placements: placements,
        p_actor: actor,
      });
      if (error) raise(error, "createCampaignDraft");
      return (await repo.getCampaignContext(data as string))!;
    },
    async updateCampaign(id, patch: CampaignPatch, audit: AuditContext, expectedUpdatedAt) {
      const { data, error } = await rpc("ads_admin_update_campaign", {
        p_id: id,
        p_expected_updated_at: expectedUpdatedAt,
        p_patch: patch,
        p_actor: audit.actor,
        p_action: audit.action,
        p_details: audit.details ?? {},
      });
      if (error) raise(error, "updateCampaign");
      return data as Campaign;
    },
    async reviewCreative(id, patch: CreativePatch, audit: AuditContext) {
      const { data, error } = await rpc("ads_admin_review_creative", {
        p_creative_id: id,
        p_patch: patch,
        p_actor: audit.actor,
        p_action: audit.action,
        p_details: audit.details ?? {},
      });
      if (error) raise(error, "reviewCreative");
      return data as Creative;
    },

    async listOccupiedSlots(slots): Promise<OccupiedSlot[]> {
      if (slots.length === 0) return [];
      const slugs = [...new Set(slots.map((s) => s.article_slug))];
      const positions = [...new Set(slots.map((s) => s.position_code))];
      const { data, error } = await from("ads_placements")
        .select("article_slug, position_code, starts_on, ends_on, campaign_id, campaign:ads_campaigns!ads_placements_campaign_id_fkey!inner(id, code, status)")
        .eq("is_blocking", true)
        .in("article_slug", slugs)
        .in("position_code", positions);
      if (error) raise(error, "listOccupiedSlots");
      return (data as (OccupiedSlot["placement"] & { campaign: OccupiedSlot["campaign"] })[]).map(({ campaign, ...placement }) => ({
        placement,
        campaign,
      }));
    },
    async findCandidatePlacements(articleSlug, positionCode, day) {
      const { data, error } = await from("ads_placements")
        .select(PLACEMENT_BUNDLE_SELECT)
        .eq("article_slug", articleSlug)
        .eq("position_code", positionCode)
        .eq("is_blocking", true)
        .lte("starts_on", day)
        .gte("ends_on", day)
        .eq("campaign.status", "active")
        .limit(5);
      if (error) raise(error, "findCandidatePlacements");
      return (data as BundleRow[]).map(toBundle);
    },
    async getPlacementBundle(placementId) {
      const { data, error } = await from("ads_placements").select(PLACEMENT_BUNDLE_SELECT).eq("id", placementId).maybeSingle();
      if (error) raise(error, "getPlacementBundle");
      return data ? toBundle(data as BundleRow) : null;
    },

    async lastEventAt(placementId, type: AdEventType, visitorHash, sinceIso) {
      const { data, error } = await from("ads_events")
        .select("occurred_at")
        .eq("placement_id", placementId)
        .eq("event_type", type)
        .eq("visitor_hash", visitorHash)
        .gte("occurred_at", sinceIso)
        .order("occurred_at", { ascending: false })
        .limit(1);
      if (error) raise(error, "lastEventAt");
      return (data as { occurred_at: string }[])[0]?.occurred_at ?? null;
    },
    async insertEvent(event: AdEvent) {
      const { error } = await from("ads_events").insert(event);
      if (error) raise(error, "insertEvent");
    },
    async getDailyStats(campaignId) {
      const { data, error } = await from("ads_campaign_daily_stats").select("*").eq("campaign_id", campaignId).order("day");
      if (error) raise(error, "getDailyStats");
      return data as DailyStat[];
    },

  };
  return repo;
}
