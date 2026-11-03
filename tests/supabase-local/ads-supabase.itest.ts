/**
 * Collaudo reale dell'Advertising Manager contro uno stack Supabase LOCALE (Postgres + PostgREST).
 * Esegue il repository Supabase vero, gli handler e i vincoli del database con dati sintetici.
 *
 * Avvio: scripts/test-ads-supabase-local.sh (non fa parte di `npm test`: richiede Docker).
 * Rifiuta qualsiasi URL che non sia localhost: non può raggiungere progetti remoti.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { activationPhrase, authorizationPhrase } from "../../src/lib/ads/campaigns.ts";
import { romeDate, addDays } from "../../src/lib/ads/dates.ts";
import {
  getServableAd,
  handleAdClick,
  handleAdEvent,
  handleAdminAdvertisers,
  handleAdminAvailability,
  handleAdminCampaign,
  handleAdminCampaigns,
  handleAdminReport,
  type AdsDeps,
} from "../../src/lib/ads/handlers.ts";
import { AdsConflictError, type AdsRepository } from "../../src/lib/ads/repository.ts";
import { createSupabaseAdsRepository } from "../../src/lib/ads/supabaseRepository.ts";
import { ADMIN_TOKEN, HASH_SECRET, HUMAN_UA } from "../support/adsFixtures.ts";

const URL_ = process.env.ADS_ITEST_SUPABASE_URL ?? "";
const SERVICE = process.env.ADS_ITEST_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.ADS_ITEST_ANON_KEY ?? "";

const host = (() => {
  try {
    return new URL(URL_).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(host) || !SERVICE || !ANON) {
  throw new Error("Collaudo consentito SOLO su Supabase locale (127.0.0.1/localhost) con chiavi locali.");
}

const service = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const realRepo = createSupabaseAdsRepository(service as never);

/** Conta le chiamate al repository reale: serve a provare che con ADS_ENABLED spento non si interroga il DB. */
function counted(repo: AdsRepository) {
  let calls = 0;
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? (...args: unknown[]) => (calls++, v.apply(target, args)) : v;
    },
  });
  return { repo: proxy as AdsRepository, calls: () => calls };
}

const ORIGIN = "http://127.0.0.1";
const RUN = Date.now().toString(36);
const code = (s: string) => `synth-${s}-${RUN}`;
const today = romeDate(new Date());
let ip = 0;
const deps = (env: AdsDeps["env"], repo: AdsRepository = realRepo): AdsDeps => ({ env, repo: () => repo, clientIp: `203.0.113.${++ip % 250}` });
const ENABLED = { ADS_ENABLED: "true", ADS_HASH_SECRET: HASH_SECRET, ADS_ADMIN_TOKEN: ADMIN_TOKEN };
const ADMIN_ONLY = { ADS_ADMIN_TOKEN: ADMIN_TOKEN, ADS_HASH_SECRET: HASH_SECRET };

const admin = (path: string, body?: unknown, method?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
async function call(p: Promise<Response>) {
  const res = await p;
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function createAdvertiser(suffix: string, synthetic: boolean) {
  const r = await call(
    handleAdminAdvertisers(
      admin("/api/ads/admin/advertisers/", {
        actor: "collaudo",
        code: code(suffix),
        legal_name: `SYNTH ${suffix} (collaudo locale)`,
        display_name: `SYNTH ${suffix}`,
        website_url: "https://shop.example.test/",
        allowed_domains: ["shop.example.test"],
        is_synthetic: synthetic,
      }),
      deps(ADMIN_ONLY),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.advertiser.id as string;
}

function draft(advertiserId: string, c: string, startsOn: string, endsOn: string, slugs: string[], synthetic: boolean) {
  return {
    actor: "collaudo",
    code: c,
    advertiser_id: advertiserId,
    name: `SYNTH ${c}`,
    price_cents: 8000,
    starts_on: startsOn,
    ends_on: endsOn,
    is_synthetic: synthetic,
    creatives: [
      {
        key: "main",
        label: "SYNTH banner",
        image_path: "/ads/synth/banner.webp",
        image_width: 1200,
        image_height: 300,
        alt_text: "Banner sintetico di collaudo",
        headline: "Attrezzatura di collaudo",
        destination_url: "https://shop.example.test/attrezzatura",
      },
    ],
    placements: slugs.map((article_slug) => ({ article_slug, position_code: "article_end", creative_key: "main" })),
  };
}

async function prepareApproved(advertiserId: string, c: string, startsOn: string, endsOn: string, slugs: string[], synthetic: boolean) {
  const created = await call(handleAdminCampaigns(admin("/api/ads/admin/campaigns/", draft(advertiserId, c, startsOn, endsOn, slugs, synthetic)), deps(ADMIN_ONLY)));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.campaign.id as string;
  const act = (body: Record<string, unknown>) => call(handleAdminCampaign(id, admin(`/api/ads/admin/campaigns/${id}/`, { actor: "collaudo", ...body }), deps(ADMIN_ONLY)));
  for (const creative of created.body.creatives) {
    const r = await act({ action: "review_creative", creative_id: creative.id, decision: "approved", landing_reviewed: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal((await act({ action: "transition", to: "pending_approval" })).status, 200);
  for (const [mark, extra] of [["written_confirmation", { ref: "SYNTH-COLLAUDO" }], ["commercial_terms", {}], ["availability", {}], ["tax_contract", {}]] as const) {
    const r = await act({ action: "mark", mark, ...extra });
    assert.equal(r.status, 200, `${mark}: ${JSON.stringify(r.body)}`);
  }
  const approved = await act({ action: "transition", to: "approved" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  return { id, act, created };
}

describe("collaudo Supabase locale — Advertising Manager", () => {
  it("RLS e permessi: anon non legge né scrive nulla, nemmeno via RPC", async () => {
    for (const table of ["ads_advertisers", "ads_campaigns", "ads_creatives", "ads_placements", "ads_events", "ads_daily_stats", "ads_audit_log", "ads_positions", "ads_campaign_daily_stats"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      assert.ok(error, `${table}: anon deve ricevere un errore (data=${JSON.stringify(data)})`);
      assert.match(error!.message, /permission denied/i, table);
    }
    const ins = await anon.from("ads_events").insert({ event_type: "click", campaign_id: crypto.randomUUID(), placement_id: crypto.randomUUID() });
    assert.match(ins.error?.message ?? "", /permission denied/i);
    const rpc = await anon.rpc("ads_purge_events", { p_retain_days: 35 });
    assert.ok(rpc.error, "anon non può eseguire la purge");
  });

  it("flusso admin reale: inserzionista sintetico, bozza 3 articoli, approvazione, esclusività", async () => {
    const advertiserId = await createAdvertiser("growshop", true);
    // prospect: conferma scritta impossibile finché non è "confirmed"
    const slugs = [code("art-a"), code("art-b"), code("art-c")];
    const start = addDays(today, 7);
    const end = addDays(start, 29);
    const early = await call(handleAdminCampaigns(admin("/api/ads/admin/campaigns/", draft(advertiserId, code("prospect"), start, end, slugs, true)), deps(ADMIN_ONLY)));
    assert.equal(early.status, 201);
    const earlyMark = await call(
      handleAdminCampaign(early.body.campaign.id, admin(`/api/ads/admin/campaigns/${early.body.campaign.id}/`, { actor: "collaudo", action: "mark", mark: "written_confirmation", ref: "X-123" }), deps(ADMIN_ONLY)),
    );
    assert.equal(earlyMark.status, 422);

    const patch = await call(handleAdminAdvertisers(admin("/api/ads/admin/advertisers/", { actor: "collaudo", id: advertiserId, negotiation_status: "confirmed" }, "PATCH"), deps(ADMIN_ONLY)));
    assert.equal(patch.status, 200);

    const { id, act } = await prepareApproved(advertiserId, code("exclusive-30d"), start, end, slugs, true);
    const ctx = await realRepo.getCampaignContext(id);
    assert.equal(ctx!.campaign.status, "approved");
    assert.equal(ctx!.placements.length, 3);
    assert.ok(ctx!.placements.every((p) => p.is_blocking && p.starts_on === start && p.ends_on === end), "trigger di sincronizzazione");

    // Rivale sovrapposta su un articolo già venduto
    const rival = await call(handleAdminCampaigns(admin("/api/ads/admin/campaigns/", draft(advertiserId, code("rival"), addDays(start, 10), addDays(end, 10), [slugs[1], code("art-z")], true)), deps(ADMIN_ONLY)));
    assert.equal(rival.status, 201);
    assert.equal(rival.body.conflicts.length, 1, "conflitto calcolato via query reale");
    const rivalId = rival.body.campaign.id;
    const rivalMark = await call(handleAdminCampaign(rivalId, admin(`/api/ads/admin/campaigns/${rivalId}/`, { actor: "collaudo", action: "mark", mark: "availability" }), deps(ADMIN_ONLY)));
    assert.equal(rivalMark.status, 422);
    // Forzando direttamente il DB, il vincolo EXCLUDE blocca comunque
    for (const cr of rival.body.creatives) {
      await realRepo.updateCreative(cr.id, { review_status: "approved", approved_at: new Date().toISOString(), approved_by: "collaudo", landing_reviewed_at: new Date().toISOString() });
    }
    const now = new Date().toISOString();
    await assert.rejects(
      realRepo.updateCampaign(rivalId, { status: "approved", written_confirmation_at: now, commercial_terms_approved_at: now, availability_verified_at: now, tax_contract_verified_at: now }),
      (err: unknown) => err instanceof AdsConflictError && /ads_placements_no_overlap/.test((err as Error).message),
    );

    // Calendario disponibilità via PostgREST
    const cal = await call(handleAdminAvailability(admin(`/api/ads/admin/availability/?slug=${slugs[1]},${code("art-z")}&from=${today}&to=${addDays(end, 30)}`), deps(ADMIN_ONLY)));
    assert.equal(cal.status, 200);
    assert.equal(cal.body.calendars[0].busy.length, 1);
    assert.equal(cal.body.calendars[0].busy[0].from, start);
    assert.deepEqual(cal.body.calendars[1].busy, []);

    // Dati sintetici: mai autorizzabili né attivabili
    for (const mark of ["tracking", "tracking_privacy", "dates"]) assert.equal((await act({ action: "mark", mark })).status, 200);
    assert.equal((await act({ action: "mark", mark: "authorization", confirm: authorizationPhrase(code("exclusive-30d")) })).status, 422);
    await assert.rejects(
      realRepo.updateCampaign(id, { status: "scheduled", activation_authorized_at: now, activation_authorized_by: "forzatura" }),
      (err: unknown) => err instanceof AdsConflictError && /ads_campaigns_activation_gate/.test((err as Error).message),
    );
    // Creatività immutabile dopo l'approvazione (trigger)
    await assert.rejects(
      realRepo.updateCreative(ctx!.creatives[0].id, { review_status: "rejected" }),
      (err: unknown) => err instanceof AdsConflictError && /creatività modificabili solo/.test((err as Error).message),
    );

    // Report di una campagna mai avviata
    const rep = await call(handleAdminReport(admin(`/api/ads/admin/report/?campaign=${id}&type=weekly`), deps(ADMIN_ONLY)));
    assert.equal(rep.status, 200);
    assert.equal(rep.body.report.measurement.status, "not_measured");
    assert.equal(rep.body.report.totals.metrics.impressions_registered.value, null);

    // Registro delle decisioni scritto nel DB
    const audit = await service.from("ads_audit_log").select("action, actor").eq("campaign_id", id);
    assert.ok((audit.data ?? []).length >= 8);
    assert.ok((audit.data ?? []).every((a) => a.actor === "collaudo"));
  });

  it("percorso di produzione in locale: pubblicazione, impressioni, clic, deduplica, report, CSV", async () => {
    // Fixture con is_synthetic=false SOLO per esercitare il percorso reale nello stack locale usa-e-getta.
    const advertiserId = await createAdvertiser("prodpath", false);
    await call(handleAdminAdvertisers(admin("/api/ads/admin/advertisers/", { actor: "collaudo", id: advertiserId, negotiation_status: "confirmed" }, "PATCH"), deps(ADMIN_ONLY)));
    const slug = code("art-live");
    const start = today;
    const end = addDays(today, 29);
    const { id, act } = await prepareApproved(advertiserId, code("live"), start, end, [slug], false);
    for (const mark of ["tracking", "tracking_privacy", "dates"]) assert.equal((await act({ action: "mark", mark })).status, 200);
    assert.equal((await act({ action: "mark", mark: "authorization", confirm: authorizationPhrase(code("live")) })).status, 200);
    assert.equal((await act({ action: "transition", to: "scheduled" })).status, 200);
    assert.equal((await act({ action: "transition", to: "active" })).status, 422, "senza frase di conferma");
    const active = await act({ action: "transition", to: "active", confirm: activationPhrase(code("live")) });
    assert.equal(active.status, 200, JSON.stringify(active.body));

    // Interruttore spento: nessun annuncio e ZERO chiamate al DB anche con campagna active
    for (const env of [{}, { ADS_ENABLED: "false" }, { ADS_ENABLED: "1" }]) {
      const c = counted(realRepo);
      assert.equal(await getServableAd(slug, "article_end", deps(env, c.repo)), null);
      assert.equal(c.calls(), 0);
    }

    // Interruttore acceso (solo in questo processo di test): embed PostgREST reale
    const ad = await getServableAd(slug, "article_end", deps(ENABLED));
    assert.ok(ad, "annuncio servito dal percorso reale");
    assert.equal(ad!.campaignCode, code("live"));
    assert.equal(ad!.destinationHost, "shop.example.test");
    assert.equal(await getServableAd(code("art-non-venduto"), "article_end", deps(ENABLED)), null);

    const placementId = ad!.placementId;
    const beacon = (ua: string) =>
      new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", headers: { "user-agent": ua, "content-type": "text/plain" }, body: JSON.stringify({ type: "impression", placement: placementId }) });
    const sameVisitor: AdsDeps = { ...deps(ENABLED), clientIp: "198.51.100.200" };
    assert.equal((await handleAdEvent(beacon(HUMAN_UA), sameVisitor)).status, 204);
    assert.equal((await handleAdEvent(beacon(HUMAN_UA), sameVisitor)).status, 204, "ripetuta");
    assert.equal((await handleAdEvent(beacon("Googlebot/2.1 (+http://www.google.com/bot.html)"), deps(ENABLED))).status, 204);
    assert.equal((await handleAdEvent(beacon(HUMAN_UA), { ...deps(ENABLED), clientIp: "198.51.100.201" })).status, 204);

    const click = await handleAdClick(placementId, new Request(`${ORIGIN}/api/ads/click/${placementId}/?url=https://evil.example/`, { headers: { "user-agent": HUMAN_UA } }), sameVisitor);
    assert.equal(click.status, 302);
    assert.equal(click.headers.get("location"), "https://shop.example.test/attrezzatura");
    await handleAdClick(placementId, new Request(`${ORIGIN}/api/ads/click/${placementId}/`, { headers: { "user-agent": HUMAN_UA } }), sameVisitor);

    const events = await service.from("ads_events").select("event_type, is_bot, is_duplicate, is_eligible, visitor_hash").eq("campaign_id", id).order("id");
    assert.equal(events.error, null);
    assert.deepEqual(
      events.data!.map((e) => [e.event_type, e.is_bot, e.is_duplicate, e.is_eligible]),
      [
        ["impression", false, false, true],
        ["impression", false, true, false],
        ["impression", true, false, false],
        ["impression", false, false, true],
        ["click", false, false, true],
        ["click", false, true, false],
      ],
    );
    assert.ok(events.data!.every((e) => /^[a-f0-9]{32}$/.test(e.visitor_hash)), "nessun IP in chiaro");

    // Report dalla vista ads_campaign_daily_stats
    const rep = await call(handleAdminReport(admin(`/api/ads/admin/report/?campaign=${id}&type=weekly`), deps(ADMIN_ONLY)));
    assert.equal(rep.status, 200);
    const t = rep.body.report.totals.metrics;
    assert.equal(rep.body.report.measurement.status, "measured");
    assert.deepEqual([t.impressions_registered.value, t.impressions_eligible.value, t.clicks_registered.value, t.clicks_eligible.value, t.ctr_percent.value], [4, 2, 2, 1, 50]);
    assert.equal(t.unique_clicks.value, null);
    const csv = await handleAdminReport(admin(`/api/ads/admin/report/?campaign=${id}&type=final&format=csv`), deps(ADMIN_ONLY));
    assert.equal(csv.status, 200);
    assert.match(new TextDecoder().decode(await csv.arrayBuffer()), /totale,.*,4,2,2,1,50,not_measured,measured/);

    // Purge via RPC con service_role (conservazione minima rispettata)
    const purge = await service.rpc("ads_purge_events", { p_retain_days: 35 });
    assert.equal(purge.error, null);
    assert.equal(purge.data, 0, "eventi di oggi non cancellati");
    const tooShort = await service.rpc("ads_purge_events", { p_retain_days: 3 });
    assert.match(tooShort.error?.message ?? "", /conservazione minima/);

    // Chiusura: pausa → nessun annuncio
    assert.equal((await act({ action: "transition", to: "paused" })).status, 200);
    assert.equal(await getServableAd(slug, "article_end", deps(ENABLED)), null);
  });
});
