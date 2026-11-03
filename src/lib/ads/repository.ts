/**
 * Contratto di accesso ai dati dell'Advertising Manager.
 * Implementazioni: `supabaseRepository.ts` (server-side, service_role, RPC transazionali) e, nei test,
 * `tests/support/memoryAdsRepository.ts` che replica i vincoli critici del database.
 *
 * Ogni scrittura amministrativa riceve il proprio contesto di audit: modifica e riga di audit
 * avvengono insieme o non avvengono (nel DB: una sola funzione/transazione). Non esiste un
 * percorso per scrivere senza audit.
 */

import type { CampaignContext, CampaignDraftInput, OccupiedSlot } from "./campaigns";
import type { AdEvent, AdEventType, Advertiser, Campaign, Creative, DailyStat, PlacementBundle } from "./types";

export type AdvertiserInput = Omit<Advertiser, "id">;
export type AdvertiserPatch = Partial<Omit<AdvertiserInput, "code" | "is_synthetic">>;

/** Campi modificabili di una campagna dopo la creazione (stessa whitelist della RPC SQL). */
export const CAMPAIGN_PATCH_FIELDS = [
  "status",
  "written_confirmation_at",
  "written_confirmation_ref",
  "commercial_terms_approved_at",
  "availability_verified_at",
  "tax_contract_verified_at",
  "tracking_tested_at",
  "tracking_privacy_reviewed_at",
  "dates_confirmed_at",
  "activation_authorized_at",
  "activation_authorized_by",
] as const;
export type CampaignPatch = Partial<Pick<Campaign, (typeof CAMPAIGN_PATCH_FIELDS)[number]>>;
export type CreativePatch = Partial<Pick<Creative, "review_status" | "approved_at" | "approved_by" | "landing_reviewed_at">>;

export interface AuditContext {
  actor: string;
  action: string;
  details?: Record<string, unknown>;
}

/** Errore di vincolo (esclusività, gate di stato, concorrenza) restituito come 409 dagli endpoint admin. */
export class AdsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsConflictError";
  }
}

export interface AdsRepository {
  listAdvertisers(): Promise<Advertiser[]>;
  getAdvertiser(id: string): Promise<Advertiser | null>;
  createAdvertiser(input: AdvertiserInput, actor: string): Promise<Advertiser>;
  updateAdvertiser(id: string, patch: AdvertiserPatch, actor: string): Promise<Advertiser>;

  listCampaigns(filter?: { advertiser_id?: string }): Promise<Campaign[]>;
  getCampaignContext(id: string): Promise<CampaignContext | null>;
  /** Bozza con creatività e posizionamenti (collegati per chiave) + audit, in una transazione. */
  createCampaignDraft(input: CampaignDraftInput, actor: string): Promise<CampaignContext>;
  /**
   * Modifica + audit in una transazione. `expectedUpdatedAt` (concorrenza ottimistica): se la campagna
   * è cambiata dopo la lettura, fallisce con AdsConflictError senza modificare nulla.
   */
  updateCampaign(id: string, patch: CampaignPatch, audit: AuditContext, expectedUpdatedAt: string | null): Promise<Campaign>;
  reviewCreative(id: string, patch: CreativePatch, audit: AuditContext): Promise<Creative>;

  /** Posizionamenti di campagne bloccanti sugli spazi indicati. */
  listOccupiedSlots(slots: { article_slug: string; position_code: string }[]): Promise<OccupiedSlot[]>;
  /** Candidati per un articolo/posizione nel giorno indicato; l'idoneità la decide il dominio. */
  findCandidatePlacements(articleSlug: string, positionCode: string, day: string): Promise<PlacementBundle[]>;
  getPlacementBundle(placementId: string): Promise<PlacementBundle | null>;

  lastEventAt(placementId: string, type: AdEventType, visitorHash: string, sinceIso: string): Promise<string | null>;
  insertEvent(event: AdEvent): Promise<void>;
  getDailyStats(campaignId: string): Promise<DailyStat[]>;
}
