/**
 * Fixture SINTETICHE per l'Advertising Manager: codici "synth-", domini *.example.test,
 * nessun riferimento a inserzionisti reali. Lo scenario ricalca le condizioni di una proposta
 * in trattativa (80 € per 30 giorni, 3 articoli, esclusiva a fine articolo) solo come caso di test.
 */

import type { Advertiser, Campaign, Creative, Placement } from "../../src/lib/ads/types.ts";
import type { MemoryAdsRepository } from "./memoryAdsRepository.ts";

export const ADMIN_TOKEN = "synth-admin-token-0123456789abcdef-test";
export const HASH_SECRET = "synth-hash-secret-0123456789abcdef-test";
export const HUMAN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const SCENARIO_ARTICLES = ["synth-articolo-a", "synth-articolo-b", "synth-articolo-c"];

export function synthAdvertiser(overrides: Partial<Advertiser> = {}): Advertiser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    code: "synth-growshop-a",
    legal_name: "SYNTH Growshop A S.r.l. (dati di test)",
    display_name: "SYNTH Growshop A",
    website_url: "https://shop.example.test/",
    allowed_domains: ["shop.example.test"],
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    negotiation_status: "confirmed",
    is_synthetic: true,
    notes: "fixture di test",
    ...overrides,
  };
}

const T = "2026-11-01T09:00:00.000Z";

export function synthCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    code: "synth-exclusive-30d",
    advertiser_id: "00000000-0000-4000-8000-000000000001",
    name: "SYNTH esclusiva fine articolo 30 giorni",
    contract_type: "exclusive_time",
    price_cents: 8000,
    currency: "EUR",
    starts_on: "2026-11-02",
    ends_on: "2026-12-01",
    status: "active",
    auto_renew: false,
    impression_goal: null,
    rotation_weight: null,
    is_synthetic: true,
    notes: null,
    written_confirmation_at: T,
    written_confirmation_ref: "SYNTH-REF",
    commercial_terms_approved_at: T,
    availability_verified_at: T,
    tax_contract_verified_at: T,
    tracking_tested_at: T,
    tracking_privacy_reviewed_at: T,
    dates_confirmed_at: T,
    activation_authorized_at: T,
    activation_authorized_by: "test",
    updated_at: T,
    ...overrides,
  };
}

export function synthCreative(overrides: Partial<Creative> = {}): Creative {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    campaign_id: "00000000-0000-4000-8000-0000000000a1",
    creative_key: "main",
    label: "SYNTH creatività",
    image_path: "/ads/synth/banner.webp",
    image_width: 1200,
    image_height: 300,
    alt_text: "Creatività sintetica di test",
    headline: "Attrezzatura di test",
    body: "Testo sintetico.",
    cta_label: "Scopri",
    destination_url: "https://shop.example.test/attrezzatura",
    sponsor_label: "Contenuto sponsorizzato",
    review_status: "approved",
    approved_at: T,
    approved_by: "test",
    landing_reviewed_at: T,
    ...overrides,
  };
}

export function synthPlacement(n: number, overrides: Partial<Placement> = {}): Placement {
  return {
    id: `00000000-0000-4000-8000-0000000000e${n}`,
    campaign_id: "00000000-0000-4000-8000-0000000000a1",
    creative_id: "00000000-0000-4000-8000-0000000000c1",
    article_slug: SCENARIO_ARTICLES[n - 1] ?? `synth-articolo-${n}`,
    position_code: "article_end",
    starts_on: "2026-11-02",
    ends_on: "2026-12-01",
    is_blocking: true,
    ...overrides,
  };
}

/**
 * Inserisce DIRETTAMENTE nel repository in memoria una campagna "active" (bypassando i gate),
 * per simulare il caso peggiore: un database configurato come attivo.
 * `markSynthetic: false` serve solo a esercitare il percorso di produzione in un ambiente isolato.
 */
export function seedActiveCampaign(repo: MemoryAdsRepository, options: { markSynthetic?: boolean } = {}) {
  const synthetic = options.markSynthetic ?? true;
  repo.advertisers.set("00000000-0000-4000-8000-000000000001", synthAdvertiser({ is_synthetic: synthetic }));
  repo.campaigns.set("00000000-0000-4000-8000-0000000000a1", synthCampaign({ is_synthetic: synthetic }));
  repo.creatives.set("00000000-0000-4000-8000-0000000000c1", synthCreative());
  for (const n of [1, 2, 3]) {
    const p = synthPlacement(n);
    repo.placements.set(p.id, p);
  }
}
