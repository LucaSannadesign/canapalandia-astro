/**
 * Repository in memoria per i test dell'Advertising Manager.
 * Replica i vincoli critici della migrazione SQL (esclusività EXCLUDE, gate di stato, immutabilità
 * di creatività e posizionamenti dopo la bozza, RPC atomiche con audit e concorrenza ottimistica)
 * così i test di integrazione falliscono come il database.
 */

import { randomUUID } from "node:crypto";
import { BLOCKING_STATUSES, type CampaignContext, type CampaignDraftInput, type OccupiedSlot } from "../../src/lib/ads/campaigns.ts";
import { rangesOverlap } from "../../src/lib/ads/dates.ts";
import {
  AdsConflictError,
  CAMPAIGN_PATCH_FIELDS,
  type AdsRepository,
  type AdvertiserInput,
  type AdvertiserPatch,
  type AuditContext,
  type CampaignPatch,
  type CreativePatch,
} from "../../src/lib/ads/repository.ts";
import type {
  AdEvent,
  AdEventType,
  Advertiser,
  AuditEntry,
  Campaign,
  Creative,
  DailyStat,
  Placement,
  PlacementBundle,
} from "../../src/lib/ads/types.ts";

const clone = <T>(v: T): T => structuredClone(v);

/** Equivalente di public.ads_require_actor. */
function requireActor(actor: string): string {
  const a = (actor ?? "").trim();
  if (a.length < 2 || a.length > 80) throw new AdsConflictError("ads: actor obbligatorio (2-80 caratteri)");
  return a;
}

let clock = Date.parse("2026-01-01T00:00:00Z");
/** updated_at strettamente crescente, come now() in transazioni distinte. */
const nextTimestamp = () => new Date((clock += 1000)).toISOString();

export class MemoryAdsRepository implements AdsRepository {
  advertisers = new Map<string, Advertiser>();
  campaigns = new Map<string, Campaign>();
  creatives = new Map<string, Creative>();
  placements = new Map<string, Placement>();
  events: AdEvent[] = [];
  audit: AuditEntry[] = [];
  /** Numero di chiamate: serve a dimostrare che con ADS_ENABLED=false il DB non viene interrogato. */
  calls = 0;

  private touch() {
    this.calls++;
  }

  async listAdvertisers() {
    this.touch();
    return [...this.advertisers.values()].map(clone);
  }
  async getAdvertiser(id: string) {
    this.touch();
    const a = this.advertisers.get(id);
    return a ? clone(a) : null;
  }
  async createAdvertiser(input: AdvertiserInput, actor: string) {
    this.touch();
    const who = requireActor(actor);
    if ([...this.advertisers.values()].some((a) => a.code === input.code)) throw new AdsConflictError("code già esistente");
    const a: Advertiser = { ...clone(input), id: randomUUID() };
    this.advertisers.set(a.id, a);
    this.audit.push({ campaign_id: null, action: "advertiser_created", from_status: null, to_status: a.negotiation_status, actor: who, details: { advertiser: a.code } });
    return clone(a);
  }
  async updateAdvertiser(id: string, patch: AdvertiserPatch, actor: string) {
    this.touch();
    const who = requireActor(actor);
    const bad = Object.keys(patch).find((k) => ["code", "is_synthetic", "id"].includes(k));
    if (bad) throw new AdsConflictError(`ads: campo non modificabile: ${bad}`);
    const a = this.advertisers.get(id);
    if (!a) throw new AdsConflictError("ads: inserzionista inesistente");
    const from = a.negotiation_status;
    Object.assign(a, clone(patch));
    this.audit.push({ campaign_id: null, action: "advertiser_updated", from_status: from, to_status: a.negotiation_status, actor: who, details: { advertiser: a.code, fields: Object.keys(patch) } });
    return clone(a);
  }

  async listCampaigns(filter?: { advertiser_id?: string }) {
    this.touch();
    return [...this.campaigns.values()].filter((c) => !filter?.advertiser_id || c.advertiser_id === filter.advertiser_id).map(clone);
  }

  async getCampaignContext(id: string): Promise<CampaignContext | null> {
    this.touch();
    const campaign = this.campaigns.get(id);
    if (!campaign) return null;
    return clone({
      campaign,
      advertiser: this.advertisers.get(campaign.advertiser_id)!,
      creatives: [...this.creatives.values()].filter((c) => c.campaign_id === id),
      placements: [...this.placements.values()].filter((p) => p.campaign_id === id),
    });
  }

  async createCampaignDraft(input: CampaignDraftInput, actor: string): Promise<CampaignContext> {
    this.touch();
    const who = requireActor(actor);
    if ([...this.campaigns.values()].some((c) => c.code === input.code)) throw new AdsConflictError("code già esistente");
    const keys = new Set(input.creatives.map((c) => c.key));
    const missing = input.placements.find((p) => !keys.has(p.creative_key));
    if (missing) throw new AdsConflictError(`ads: creative_key ${missing.creative_key} inesistente`);
    const campaign: Campaign = {
      id: randomUUID(),
      code: input.code,
      advertiser_id: input.advertiser_id,
      name: input.name,
      contract_type: input.contract_type ?? "exclusive_time",
      price_cents: input.price_cents ?? null,
      currency: input.currency ?? "EUR",
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      status: "draft",
      auto_renew: false,
      impression_goal: null,
      rotation_weight: null,
      is_synthetic: input.is_synthetic ?? false,
      notes: input.notes ?? null,
      written_confirmation_at: null,
      written_confirmation_ref: null,
      commercial_terms_approved_at: null,
      availability_verified_at: null,
      tax_contract_verified_at: null,
      tracking_tested_at: null,
      tracking_privacy_reviewed_at: null,
      dates_confirmed_at: null,
      activation_authorized_at: null,
      activation_authorized_by: null,
      updated_at: nextTimestamp(),
    };
    this.campaigns.set(campaign.id, campaign);
    const keyToId = new Map<string, string>();
    for (const c of input.creatives) {
      const creative: Creative = {
        id: randomUUID(),
        campaign_id: campaign.id,
        creative_key: c.key,
        label: c.label,
        image_path: c.image_path ?? null,
        image_width: c.image_width ?? null,
        image_height: c.image_height ?? null,
        alt_text: c.alt_text,
        headline: c.headline ?? null,
        body: c.body ?? null,
        cta_label: c.cta_label ?? null,
        destination_url: c.destination_url,
        sponsor_label: c.sponsor_label ?? "Contenuto sponsorizzato",
        review_status: "pending",
        approved_at: null,
        approved_by: null,
        landing_reviewed_at: null,
      };
      this.creatives.set(creative.id, creative);
      keyToId.set(c.key, creative.id);
    }
    for (const p of input.placements) {
      const placement: Placement = {
        id: randomUUID(),
        campaign_id: campaign.id,
        creative_id: keyToId.get(p.creative_key) ?? null,
        article_slug: p.article_slug,
        position_code: p.position_code,
        starts_on: campaign.starts_on,
        ends_on: campaign.ends_on,
        is_blocking: false,
      };
      this.placements.set(placement.id, placement);
    }
    this.audit.push({ campaign_id: campaign.id, action: "campaign_created", from_status: null, to_status: "draft", actor: who, details: { code: campaign.code } });
    return (await this.getCampaignContext(campaign.id))!;
  }

  async updateCampaign(id: string, patch: CampaignPatch, audit: AuditContext, expectedUpdatedAt: string | null) {
    this.touch();
    // Stesse verifiche della RPC ads_admin_update_campaign, tutte PRIMA di qualsiasi modifica
    const who = requireActor(audit.actor);
    if (!/^[a-z_]{3,60}$/.test(audit.action)) throw new AdsConflictError("ads: action di audit non valida");
    const bad = Object.keys(patch).find((k) => !(CAMPAIGN_PATCH_FIELDS as readonly string[]).includes(k));
    if (bad) throw new AdsConflictError(`ads: campo non modificabile: ${bad}`);
    const current = this.campaigns.get(id);
    if (!current) throw new AdsConflictError("ads: campagna inesistente");
    if (expectedUpdatedAt !== null && current.updated_at !== expectedUpdatedAt) {
      throw new AdsConflictError(`ads: modifica concorrente sulla campagna ${current.code}, ricaricare e riprovare`);
    }
    const next = { ...current, ...clone(patch), updated_at: nextTimestamp() };
    this.assertCampaignConstraints(next);
    // Equivalente del trigger di propagazione + vincolo EXCLUDE
    const own = [...this.placements.values()].filter((p) => p.campaign_id === id);
    const blocking = BLOCKING_STATUSES.has(next.status);
    if (blocking) {
      for (const p of own) {
        for (const other of this.placements.values()) {
          if (other.campaign_id === id || !other.is_blocking) continue;
          if (other.article_slug === p.article_slug && other.position_code === p.position_code && rangesOverlap(next.starts_on, next.ends_on, other.starts_on, other.ends_on)) {
            throw new AdsConflictError(`conflicting key value violates exclusion constraint "ads_placements_no_overlap" (${p.article_slug})`);
          }
        }
      }
    }
    if (this.failNextAudit) {
      this.failNextAudit = false;
      // Transazione annullata: né la modifica né l'audit vengono applicati
      throw new Error("audit insert failed (simulato)");
    }
    this.campaigns.set(id, next);
    for (const p of own) Object.assign(p, { starts_on: next.starts_on, ends_on: next.ends_on, is_blocking: blocking });
    this.audit.push({ campaign_id: id, action: audit.action, from_status: current.status, to_status: next.status, actor: who, details: clone(audit.details ?? {}) });
    return clone(next);
  }

  /** Simula il fallimento dell'insert di audit dentro la transazione della prossima updateCampaign. */
  failNextAudit = false;

  private assertCampaignConstraints(c: Campaign) {
    if (c.auto_renew) throw new AdsConflictError("ads_campaigns_no_auto_renew");
    if (c.contract_type !== "exclusive_time" && !["draft", "cancelled", "rejected"].includes(c.status)) {
      throw new AdsConflictError("ads_campaigns_shared_not_in_mvp");
    }
    const approvalStates = ["approved", "scheduled", "active", "paused", "completed"];
    if (
      approvalStates.includes(c.status) &&
      !(c.written_confirmation_at && c.commercial_terms_approved_at && c.price_cents !== null && c.availability_verified_at && c.tax_contract_verified_at)
    ) {
      throw new AdsConflictError("ads_campaigns_approval_gate");
    }
    if (
      ["scheduled", "active", "paused", "completed"].includes(c.status) &&
      !(!c.is_synthetic && c.tracking_tested_at && c.tracking_privacy_reviewed_at && c.dates_confirmed_at && c.activation_authorized_at && c.activation_authorized_by)
    ) {
      throw new AdsConflictError("ads_campaigns_activation_gate");
    }
  }

  async reviewCreative(id: string, patch: CreativePatch, audit: AuditContext) {
    this.touch();
    const who = requireActor(audit.actor);
    const c = this.creatives.get(id);
    if (!c) throw new AdsConflictError("ads: creatività inesistente");
    const status = this.campaigns.get(c.campaign_id)?.status ?? null;
    if (status !== "draft" && status !== "pending_approval") throw new AdsConflictError("ads: creatività modificabili solo in bozza o in approvazione");
    const next = { ...c, ...clone(patch) };
    if (next.review_status === "approved" && !(next.approved_at && next.landing_reviewed_at)) throw new AdsConflictError("ads_creatives_approval");
    Object.assign(c, next);
    this.audit.push({ campaign_id: c.campaign_id, action: audit.action, from_status: status, to_status: status, actor: who, details: { ...clone(audit.details ?? {}), creative: c.id } });
    return clone(c);
  }

  async listOccupiedSlots(slots: { article_slug: string; position_code: string }[]): Promise<OccupiedSlot[]> {
    this.touch();
    const keys = new Set(slots.map((s) => `${s.article_slug}|${s.position_code}`));
    return [...this.placements.values()]
      .filter((p) => p.is_blocking && keys.has(`${p.article_slug}|${p.position_code}`))
      .map((p) => {
        const c = this.campaigns.get(p.campaign_id)!;
        return clone({ placement: p, campaign: { id: c.id, code: c.code, status: c.status } });
      });
  }

  private bundle(p: Placement): PlacementBundle {
    const campaign = this.campaigns.get(p.campaign_id)!;
    return clone({
      placement: p,
      campaign,
      creative: p.creative_id ? this.creatives.get(p.creative_id) ?? null : null,
      advertiser: this.advertisers.get(campaign.advertiser_id)!,
    });
  }

  async findCandidatePlacements(articleSlug: string, positionCode: string, day: string) {
    this.touch();
    return [...this.placements.values()]
      .filter((p) => p.article_slug === articleSlug && p.position_code === positionCode && p.starts_on <= day && p.ends_on >= day)
      .map((p) => this.bundle(p));
  }

  async getPlacementBundle(placementId: string) {
    this.touch();
    const p = this.placements.get(placementId);
    return p ? this.bundle(p) : null;
  }

  async lastEventAt(placementId: string, type: AdEventType, visitorHash: string, sinceIso: string) {
    this.touch();
    const matches = this.events
      .filter((e) => e.placement_id === placementId && e.event_type === type && e.visitor_hash === visitorHash && e.occurred_at >= sinceIso)
      .map((e) => e.occurred_at)
      .sort();
    return matches.at(-1) ?? null;
  }

  async insertEvent(event: AdEvent) {
    this.touch();
    this.events.push(clone(event));
  }

  async getDailyStats(campaignId: string): Promise<DailyStat[]> {
    this.touch();
    const rows = new Map<string, DailyStat>();
    for (const e of this.events.filter((x) => x.campaign_id === campaignId)) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(e.occurred_at));
      const key = `${e.placement_id}|${day}`;
      const r =
        rows.get(key) ??
        { campaign_id: campaignId, placement_id: e.placement_id, day, impressions_registered: 0, impressions_eligible: 0, clicks_registered: 0, clicks_eligible: 0 };
      const eligible = !e.is_bot && !e.is_duplicate;
      if (e.event_type === "impression") {
        r.impressions_registered++;
        if (eligible) r.impressions_eligible++;
      } else {
        r.clicks_registered++;
        if (eligible) r.clicks_eligible++;
      }
      rows.set(key, r);
    }
    return [...rows.values()];
  }

}
