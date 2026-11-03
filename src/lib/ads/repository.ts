/**
 * Contratto di accesso ai dati dell'Advertising Manager.
 * Implementazioni: `supabaseRepository.ts` (server-side, service_role) e, nei test,
 * `tests/support/memoryAdsRepository.ts` che replica i vincoli critici del database.
 */

import type { CampaignContext, CampaignDraftInput, OccupiedSlot } from "./campaigns";
import type { AdEvent, AdEventType, Advertiser, AuditEntry, Campaign, Creative, DailyStat, PlacementBundle } from "./types";

export type AdvertiserInput = Omit<Advertiser, "id">;

export type CampaignPatch = Partial<Omit<Campaign, "id" | "code" | "advertiser_id">>;
export type CreativePatch = Partial<Pick<Creative, "review_status" | "approved_at" | "approved_by" | "landing_reviewed_at">>;

/** Errore di vincolo (esclusività, gate di stato) restituito come 409 dagli endpoint admin. */
export class AdsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsConflictError";
  }
}

export interface AdsRepository {
  listAdvertisers(): Promise<Advertiser[]>;
  getAdvertiser(id: string): Promise<Advertiser | null>;
  createAdvertiser(input: AdvertiserInput): Promise<Advertiser>;
  updateAdvertiser(id: string, patch: Partial<AdvertiserInput>): Promise<Advertiser>;

  listCampaigns(filter?: { advertiser_id?: string }): Promise<Campaign[]>;
  getCampaignContext(id: string): Promise<CampaignContext | null>;
  /** Crea campagna in bozza con creatività e posizionamenti, in modo atomico per quanto possibile. */
  createCampaignDraft(input: CampaignDraftInput): Promise<CampaignContext>;
  updateCampaign(id: string, patch: CampaignPatch): Promise<Campaign>;
  updateCreative(id: string, patch: CreativePatch): Promise<Creative>;

  /** Posizionamenti di campagne bloccanti sugli spazi indicati. */
  listOccupiedSlots(slots: { article_slug: string; position_code: string }[]): Promise<OccupiedSlot[]>;
  /** Candidati per un articolo/posizione nel giorno indicato; l'idoneità la decide il dominio. */
  findCandidatePlacements(articleSlug: string, positionCode: string, day: string): Promise<PlacementBundle[]>;
  getPlacementBundle(placementId: string): Promise<PlacementBundle | null>;

  lastEventAt(placementId: string, type: AdEventType, visitorHash: string, sinceIso: string): Promise<string | null>;
  insertEvent(event: AdEvent): Promise<void>;
  getDailyStats(campaignId: string): Promise<DailyStat[]>;

  appendAudit(entry: AuditEntry): Promise<void>;
}
