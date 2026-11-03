/**
 * Modello dati dell'Advertising Manager (specchio di supabase/migrations/20261103120000_ads_manager.sql).
 * Le date di campagna sono giorni di calendario Europe/Rome in formato YYYY-MM-DD, estremi inclusi.
 */

export const NEGOTIATION_STATUSES = [
  "prospect",
  "negotiating",
  "offer_sent",
  "confirmed",
  "declined",
  "paused",
  "archived",
] as const;
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
  "rejected",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CONTRACT_TYPES = ["exclusive_time", "shared_rotation"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const AD_EVENT_TYPES = ["impression", "click"] as const;
export type AdEventType = (typeof AD_EVENT_TYPES)[number];

/** Unica posizione abilitata nell'MVP. */
export const AD_POSITIONS = ["article_end"] as const;
export type AdPosition = (typeof AD_POSITIONS)[number];

export interface Advertiser {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  website_url: string | null;
  allowed_domains: string[];
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  negotiation_status: NegotiationStatus;
  is_synthetic: boolean;
  notes: string | null;
}

/** Passi della checklist di attivazione registrati sulla campagna. */
export interface ActivationChecklist {
  written_confirmation_at: string | null;
  written_confirmation_ref: string | null;
  commercial_terms_approved_at: string | null;
  availability_verified_at: string | null;
  tax_contract_verified_at: string | null;
  tracking_tested_at: string | null;
  tracking_privacy_reviewed_at: string | null;
  dates_confirmed_at: string | null;
  activation_authorized_at: string | null;
  activation_authorized_by: string | null;
}

export interface Campaign extends ActivationChecklist {
  id: string;
  code: string;
  advertiser_id: string;
  name: string;
  contract_type: ContractType;
  price_cents: number | null;
  currency: string;
  starts_on: string;
  ends_on: string;
  status: CampaignStatus;
  auto_renew: boolean;
  impression_goal: number | null;
  rotation_weight: number | null;
  is_synthetic: boolean;
  notes: string | null;
}

export interface Creative {
  id: string;
  campaign_id: string;
  label: string;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  alt_text: string;
  headline: string | null;
  body: string | null;
  cta_label: string | null;
  destination_url: string;
  sponsor_label: string;
  review_status: "pending" | "approved" | "rejected";
  approved_at: string | null;
  approved_by: string | null;
  landing_reviewed_at: string | null;
}

export interface Placement {
  id: string;
  campaign_id: string;
  creative_id: string | null;
  article_slug: string;
  position_code: string;
  starts_on: string;
  ends_on: string;
  is_blocking: boolean;
}

/** Tutto ciò che serve per decidere se mostrare un annuncio e dove reindirizzare un clic. */
export interface PlacementBundle {
  placement: Placement;
  campaign: Campaign;
  creative: Creative | null;
  advertiser: Advertiser;
}

export interface AdEvent {
  occurred_at: string;
  event_type: AdEventType;
  campaign_id: string;
  placement_id: string;
  visitor_hash: string | null;
  is_bot: boolean;
  is_duplicate: boolean;
  filter_reason: string | null;
}

export interface DailyStat {
  campaign_id: string;
  placement_id: string;
  day: string;
  impressions_registered: number;
  impressions_eligible: number;
  clicks_registered: number;
  clicks_eligible: number;
}

export interface AuditEntry {
  campaign_id: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  details: Record<string, unknown>;
}
