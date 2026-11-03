import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activationPhrase,
  authorizationPhrase,
  availabilityCalendar,
  checkMark,
  checkTransition,
  evaluateChecklist,
  findConflicts,
  isServable,
  validateCampaignDraft,
  type CampaignContext,
} from "../src/lib/ads/campaigns.ts";
import { globalDestinationAllowlist, isAdsEnabled, isTrackingConfigured } from "../src/lib/ads/config.ts";
import { addDays, isIsoDate, rangesOverlap, romeDate } from "../src/lib/ads/dates.ts";
import { checkDestination, isSafeImagePath } from "../src/lib/ads/destination.ts";
import { buildCampaignReport, campaignWeeks, csvCell, reportToCsv } from "../src/lib/ads/reports.ts";
import { automatedTrafficReason, classifyEvent, issueViewToken, verifyViewToken, visitorHash } from "../src/lib/ads/tracking.ts";
import type { DailyStat } from "../src/lib/ads/types.ts";
import { HUMAN_UA, SCENARIO_ARTICLES, synthAdvertiser, synthCampaign, synthCreative, synthPlacement } from "./support/adsFixtures.ts";

function ctx(overrides: { campaign?: Parameters<typeof synthCampaign>[0]; advertiser?: Parameters<typeof synthAdvertiser>[0] } = {}): CampaignContext {
  return {
    campaign: synthCampaign(overrides.campaign),
    advertiser: synthAdvertiser(overrides.advertiser),
    creatives: [synthCreative()],
    placements: [1, 2, 3].map((n) => synthPlacement(n)),
  };
}

const draftInput = () => ({
  code: "synth-exclusive-30d",
  advertiser_id: "00000000-0000-4000-8000-000000000001",
  name: "SYNTH esclusiva fine articolo 30 giorni",
  price_cents: 8000,
  starts_on: "2026-11-02",
  ends_on: "2026-12-01",
  is_synthetic: true,
  creatives: [
    {
      key: "main",
      label: "SYNTH banner",
      image_path: "/ads/synth/banner.webp",
      image_width: 1200,
      image_height: 300,
      alt_text: "Banner sintetico",
      headline: "Attrezzatura di test",
      destination_url: "https://shop.example.test/attrezzatura",
    },
  ],
  placements: SCENARIO_ARTICLES.map((article_slug) => ({ article_slug, position_code: "article_end", creative_key: "main" })),
});

describe("interruttore globale ADS_ENABLED", () => {
  it("è acceso solo con la stringa esatta \"true\"", () => {
    assert.equal(isAdsEnabled({}), false);
    for (const v of ["", "false", "1", "TRUE", "True", "yes", " true", "true "]) assert.equal(isAdsEnabled({ ADS_ENABLED: v }), false, v);
    assert.equal(isAdsEnabled({ ADS_ENABLED: "true" }), true);
  });
  it("il tracciamento richiede interruttore acceso e secret robusto", () => {
    assert.equal(isTrackingConfigured({ ADS_ENABLED: "true" }), false);
    assert.equal(isTrackingConfigured({ ADS_ENABLED: "true", ADS_HASH_SECRET: "corto" }), false);
    assert.equal(isTrackingConfigured({ ADS_ENABLED: "false", ADS_HASH_SECRET: "x".repeat(40) }), false);
    assert.equal(isTrackingConfigured({ ADS_ENABLED: "true", ADS_HASH_SECRET: "x".repeat(40) }), true);
  });
  it("allowlist globale normalizzata", () => {
    assert.deepEqual(globalDestinationAllowlist({ ADS_DESTINATION_ALLOWLIST: " Example.COM, ,shop.test " }), ["example.com", "shop.test"]);
  });
});

describe("date", () => {
  it("giorno Europe/Rome e sovrapposizioni a estremi inclusi", () => {
    assert.equal(romeDate(new Date("2026-11-02T23:30:00Z")), "2026-11-03");
    assert.equal(isIsoDate("2026-02-30"), false);
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(rangesOverlap("2026-11-01", "2026-11-30", "2026-11-30", "2026-12-10"), true);
    assert.equal(rangesOverlap("2026-11-01", "2026-11-30", "2026-12-01", "2026-12-10"), false);
  });
});

describe("destinazioni (allowlist, open redirect)", () => {
  const allow = ["example.test"];
  it("accetta https sul dominio o sottodominio autorizzato", () => {
    assert.equal(checkDestination("https://example.test/p?utm_source=x", allow).ok, true);
    assert.equal(checkDestination("https://shop.example.test/a", allow).ok, true);
  });
  it("rifiuta schemi pericolosi, domini simili, credenziali, IP e porte", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.test/",
      "https://example.test.evil.test/",
      "https://evilexample.test/",
      "https://user:pass@example.test/",
      "https://127.0.0.1/",
      "https://example.test:8443/",
      "https://example.test/\n",
      "//example.test/",
      "",
    ]) {
      assert.equal(checkDestination(bad, allow).ok, false, bad);
    }
    assert.equal(checkDestination("https://example.test/", []).ok, false);
  });
  it("immagini solo self-hosted sotto /ads/", () => {
    assert.equal(isSafeImagePath("/ads/synth/banner.webp"), true);
    for (const bad of ["https://cdn.example/x.png", "/ads/../secret.png", "/ads//x.png", "/images/x.png", "/ads/x.svg", "/ads/x.webp?x=1"]) {
      assert.equal(isSafeImagePath(bad), false, bad);
    }
  });
});

describe("validazione bozza campagna", () => {
  it("accetta lo scenario sintetico esclusivo 30 giorni × 3 articoli", () => {
    const r = validateCampaignDraft(draftInput(), synthAdvertiser());
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.placements.length, 3);
      assert.equal(r.value.contract_type, "exclusive_time");
    }
  });
  it("rifiuta immagini esterne, rinnovo automatico, posizioni non abilitate e duplicati", () => {
    const input = draftInput() as Record<string, any>;
    input.auto_renew = true;
    input.creatives[0].image_path = "https://cdn.example/x.png";
    input.placements.push({ article_slug: "synth-articolo-a", position_code: "article_end", creative_key: "main" });
    input.placements.push({ article_slug: "synth-articolo-d", position_code: "sidebar", creative_key: "main" });
    const r = validateCampaignDraft(input, synthAdvertiser());
    assert.equal(r.ok, false);
    if (!r.ok) {
      const all = r.errors.join("\n");
      assert.match(all, /rinnovo automatico/);
      assert.match(all, /image_path/);
      assert.match(all, /duplicato/);
      assert.match(all, /position_code non abilitata/);
    }
  });
  it("rifiuta destinazioni fuori allowlist e campagne reali su inserzionisti sintetici", () => {
    const input = draftInput() as Record<string, any>;
    input.creatives[0].destination_url = "https://altro-shop.example/";
    input.is_synthetic = false;
    const r = validateCampaignDraft(input, synthAdvertiser());
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.errors.some((e) => e.includes("non in allowlist")));
      assert.ok(r.errors.some((e) => e.includes("solo campagne sintetiche")));
    }
  });
  it("rifiuta date incoerenti e inserzionista inesistente", () => {
    const input = { ...draftInput(), starts_on: "2026-12-10", ends_on: "2026-12-01" };
    const r = validateCampaignDraft(input, null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.errors.includes("inserzionista inesistente"));
  });
});

describe("disponibilità ed esclusività", () => {
  const occupied = [
    {
      placement: { article_slug: "synth-articolo-b", position_code: "article_end", starts_on: "2026-11-02", ends_on: "2026-12-01", campaign_id: "A" },
      campaign: { id: "A", code: "synth-a", status: "active" as const },
    },
    {
      placement: { article_slug: "synth-articolo-b", position_code: "article_end", starts_on: "2027-01-01", ends_on: "2027-01-31", campaign_id: "B" },
      campaign: { id: "B", code: "synth-b-draft", status: "draft" as const },
    },
  ];
  it("blocca solo stesso articolo × stessa posizione × periodo sovrapposto con campagna bloccante", () => {
    const req = (slug: string, from: string, to: string) => ({ starts_on: from, ends_on: to, slots: [{ article_slug: slug, position_code: "article_end" }] });
    assert.equal(findConflicts(req("synth-articolo-b", "2026-11-20", "2026-12-20"), occupied).length, 1);
    assert.equal(findConflicts(req("synth-articolo-b", "2026-12-02", "2026-12-31"), occupied).length, 0, "adiacente");
    assert.equal(findConflicts(req("synth-articolo-a", "2026-11-20", "2026-12-20"), occupied).length, 0, "altro articolo");
    assert.equal(findConflicts(req("synth-articolo-b", "2027-01-10", "2027-01-20"), occupied).length, 0, "bozza non blocca");
    assert.equal(findConflicts({ ...req("synth-articolo-b", "2026-11-20", "2026-12-20"), campaign_id: "A" }, occupied).length, 0, "se stessa");
  });
  it("calendario con intervalli occupati e liberi", () => {
    const cal = availabilityCalendar({ article_slug: "synth-articolo-b", position_code: "article_end" }, { from: "2026-10-01", to: "2026-12-31" }, occupied);
    assert.deepEqual(cal.busy.map((b) => b.campaign), ["synth-a"]);
    assert.deepEqual(cal.free, [
      { from: "2026-10-01", to: "2026-11-01" },
      { from: "2026-12-02", to: "2026-12-31" },
    ]);
  });
});

describe("checklist e transizioni", () => {
  const blankChecklist = {
    status: "draft" as const,
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
  };

  it("una bozza ha tutti i passi commerciali aperti", () => {
    const items = evaluateChecklist(ctx({ campaign: blankChecklist }));
    assert.deepEqual(items.filter((i) => !i.done).map((i) => i.key), [
      "written_confirmation",
      "commercial_terms",
      "availability",
      "tax_contract",
      "tracking",
      "tracking_privacy",
      "dates",
      "authorization",
    ]);
  });
  it("la conferma scritta non vale se l'inserzionista è solo un prospect", () => {
    const c = ctx({ campaign: { ...blankChecklist, status: "pending_approval" }, advertiser: { negotiation_status: "prospect" } });
    const mark = checkMark(c, "written_confirmation", { ref: "email-123", conflicts: [] });
    assert.equal(mark.ok, false);
    const t = checkTransition(c, { to: "approved", today: "2026-11-01", conflicts: [] });
    assert.equal(t.ok, false);
  });
  it("transizioni non ammesse e campagne condivise bloccate nell'MVP", () => {
    assert.equal(checkTransition(ctx({ campaign: blankChecklist }), { to: "active", today: "2026-11-05", conflicts: [] }).ok, false);
    const shared = ctx({ campaign: { ...blankChecklist, contract_type: "shared_rotation" } });
    assert.equal(checkTransition(shared, { to: "pending_approval", today: "2026-11-01", conflicts: [] }).ok, false);
  });
  it("attivazione: frase esplicita, periodo valido, mai dati sintetici", () => {
    const scheduledReal = ctx({ campaign: { status: "scheduled", is_synthetic: false }, advertiser: { is_synthetic: false } });
    const noPhrase = checkTransition(scheduledReal, { to: "active", today: "2026-11-05", conflicts: [] });
    assert.equal(noPhrase.ok, false);
    assert.equal(checkTransition(scheduledReal, { to: "active", today: "2026-11-05", conflicts: [], confirm: activationPhrase("synth-exclusive-30d") }).ok, true);
    assert.equal(checkTransition(scheduledReal, { to: "active", today: "2026-11-01", conflicts: [], confirm: activationPhrase("synth-exclusive-30d") }).ok, false, "prima dell'inizio");
    assert.equal(checkTransition(scheduledReal, { to: "active", today: "2026-12-02", conflicts: [], confirm: activationPhrase("synth-exclusive-30d") }).ok, false, "scaduta");
    const scheduledSynth = ctx({ campaign: { status: "scheduled" } });
    assert.equal(checkTransition(scheduledSynth, { to: "active", today: "2026-11-05", conflicts: [], confirm: activationPhrase("synth-exclusive-30d") }).ok, false);
  });
  it("autorizzazione: solo su approvata, con frase e checklist completa", () => {
    const approved = ctx({ campaign: { status: "approved", activation_authorized_at: null, activation_authorized_by: null, is_synthetic: false }, advertiser: { is_synthetic: false } });
    assert.equal(checkMark(approved, "authorization", { conflicts: [] }).ok, false);
    assert.equal(checkMark(approved, "authorization", { conflicts: [], confirm: authorizationPhrase("synth-exclusive-30d") }).ok, true);
    const synthetic = ctx({ campaign: { status: "approved", activation_authorized_at: null, activation_authorized_by: null } });
    assert.equal(checkMark(synthetic, "authorization", { conflicts: [], confirm: authorizationPhrase("synth-exclusive-30d") }).ok, false);
  });
});

describe("idoneità alla pubblicazione", () => {
  const bundle = (campaign = {}, creative = {}) => ({
    placement: synthPlacement(1),
    campaign: synthCampaign(campaign),
    creative: synthCreative(creative),
    advertiser: synthAdvertiser(),
  });
  it("dati sintetici mai pubblicabili senza il flag di test", () => {
    assert.equal(isServable(bundle(), "2026-11-05").servable, false);
    assert.equal(isServable(bundle(), "2026-11-05", { allowSynthetic: true }).servable, true);
  });
  it("gestisce scadenze, campagne non iniziate, non attive o non approvate", () => {
    const opts = { allowSynthetic: true };
    assert.deepEqual(isServable(bundle(), "2026-12-02", opts), { servable: false, reason: "scaduta" });
    assert.deepEqual(isServable(bundle(), "2026-11-01", opts), { servable: false, reason: "non ancora iniziata" });
    for (const status of ["draft", "approved", "scheduled", "paused", "completed", "cancelled"]) {
      assert.equal(isServable(bundle({ status }), "2026-11-05", opts).servable, false, status);
    }
    assert.equal(isServable(bundle({}, { review_status: "pending" }), "2026-11-05", opts).servable, false);
    assert.equal(isServable(bundle({}, { destination_url: "https://evil.example/" }), "2026-11-05", opts).servable, false);
    assert.equal(isServable(bundle({ tracking_privacy_reviewed_at: null }), "2026-11-05", opts).servable, false);
  });
});

describe("tracciamento", () => {
  it("filtra bot, client automatizzati e prefetch", () => {
    assert.equal(automatedTrafficReason({ userAgent: HUMAN_UA, purpose: null }), null);
    for (const ua of [null, "", "Googlebot/2.1", "curl/8.4.0", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "Mozilla/5.0 HeadlessChrome/120.0 Safari/537.36", "facebookexternalhit/1.1"]) {
      assert.notEqual(automatedTrafficReason({ userAgent: ua, purpose: null }), null, String(ua));
    }
    assert.equal(automatedTrafficReason({ userAgent: HUMAN_UA, purpose: "prefetch" }), "prefetch/prerender");
  });
  it("hash pseudonimo: stabile nel giorno, diverso tra giorni, non contiene l'IP", () => {
    const a = visitorHash("s".repeat(40), "2026-11-05", "203.0.113.7", HUMAN_UA);
    assert.equal(a, visitorHash("s".repeat(40), "2026-11-05", "203.0.113.7", HUMAN_UA));
    assert.notEqual(a, visitorHash("s".repeat(40), "2026-11-06", "203.0.113.7", HUMAN_UA));
    assert.match(a, /^[a-f0-9]{32}$/);
    assert.equal(a.includes("203"), false);
  });
  it("token di visualizzazione: legato a posizionamento e lettore, età minima/massima, confronto a tempo costante", () => {
    const secret = "s".repeat(40);
    const viewer = { ip: "203.0.113.7", userAgent: HUMAN_UA };
    const issued = new Date("2026-11-05T23:59:59.500Z");
    const t = issueViewToken(secret, "p1", viewer, issued);
    assert.match(t, /^\d{13}\.[a-f0-9]{32}$/);
    assert.equal(t.includes("203"), false, "il token non contiene l'IP");
    const at = (ms: number) => new Date(issued.getTime() + ms);
    assert.deepEqual(verifyViewToken(secret, t, "p1", viewer, at(1000), "impression"), { ok: true });
    assert.deepEqual(verifyViewToken(secret, t, "p1", viewer, at(2 * 60 * 60 * 1000), "click"), { ok: true }, "dopo mezzanotte resta valido");
    assert.equal(verifyViewToken(secret, t, "p1", viewer, at(999), "impression").ok, false);
    assert.equal(verifyViewToken(secret, t, "p1", viewer, at(30 * 60 * 1000 + 1), "impression").ok, false);
    assert.equal(verifyViewToken(secret, t, "p2", viewer, at(1000), "impression").ok, false);
    assert.equal(verifyViewToken(secret, t, "p1", { ...viewer, ip: "203.0.113.8" }, at(1000), "impression").ok, false);
    assert.equal(verifyViewToken("x".repeat(40), t, "p1", viewer, at(1000), "impression").ok, false, "altro secret");
    for (const bad of [null, "", "1.2", `${t}x`, t.toUpperCase()]) assert.equal(verifyViewToken(secret, bad, "p1", viewer, at(1000), "impression").ok, false);
  });
  it("clic con token non valido: registrato come non verificato", () => {
    const c = classifyEvent({ signals: { userAgent: HUMAN_UA, purpose: null }, type: "click", now: new Date(), lastSimilarEventAt: null, token: { ok: false, reason: "token mancante" } });
    assert.deepEqual(c, { is_bot: false, is_duplicate: false, is_unverified: true, filter_reason: "token mancante" });
  });
  it("ripetizioni nella finestra: registrate ma non idonee", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    const signals = { userAgent: HUMAN_UA, purpose: null };
    assert.equal(classifyEvent({ signals, type: "click", now, lastSimilarEventAt: "2026-11-05T09:55:00Z" }).is_duplicate, true);
    assert.equal(classifyEvent({ signals, type: "click", now, lastSimilarEventAt: "2026-11-05T09:49:00Z" }).is_duplicate, false);
    assert.equal(classifyEvent({ signals, type: "impression", now, lastSimilarEventAt: "2026-11-05T09:49:00Z" }).is_duplicate, true);
  });
});

describe("report", () => {
  const stat = (day: string, placement: number, i: number, ie: number, c: number, ce: number): DailyStat => ({
    campaign_id: "00000000-0000-4000-8000-0000000000a1",
    placement_id: synthPlacement(placement).id,
    day,
    impressions_registered: i,
    impressions_eligible: ie,
    clicks_registered: c,
    clicks_eligible: ce,
  });
  const base = {
    advertiser: synthAdvertiser(),
    placements: [1, 2, 3].map((n) => synthPlacement(n)),
    now: new Date("2026-11-20T10:00:00Z"),
  };

  it("30 giorni = 4 settimane piene + 2 giorni", () => {
    const w = campaignWeeks("2026-11-02", "2026-12-01");
    assert.equal(w.length, 5);
    assert.deepEqual(w.at(-1), { index: 5, from: "2026-11-30", to: "2026-12-01" });
  });

  it("campagna mai avviata: metriche non misurate (null), mai zero", () => {
    const r = buildCampaignReport({ ...base, type: "weekly", campaign: synthCampaign({ status: "approved", activation_authorized_at: null }), stats: [], today: "2026-11-20" });
    assert.equal(r.measurement.status, "not_measured");
    assert.equal(r.totals.metrics.impressions_registered.value, null);
    assert.equal(r.totals.metrics.ctr_percent.status, "not_measured");
    const cancelledEarly = buildCampaignReport({ ...base, type: "final", campaign: synthCampaign({ status: "cancelled", is_synthetic: false }), stats: [], today: "2026-11-20" });
    assert.equal(cancelledEarly.measurement.status, "not_measured", "annullata prima di andare online");
  });

  it("totali, CTR su eventi idonei, clic unici non misurati, settimane future escluse dal settimanale", () => {
    const stats = [stat("2026-11-03", 1, 100, 80, 5, 4), stat("2026-11-10", 2, 50, 40, 2, 0), stat("2026-12-05", 1, 9, 9, 9, 9)];
    const r = buildCampaignReport({ ...base, type: "weekly", campaign: synthCampaign(), stats, today: "2026-11-20", syntheticTest: true });
    assert.equal(r.synthetic_data, true);
    assert.ok(r.warnings.some((w) => w.startsWith("DATI SINTETICI")));
    assert.equal(r.weeks.length, 3);
    assert.equal(r.totals.metrics.impressions_registered.value, 150);
    assert.equal(r.totals.metrics.impressions_eligible.value, 120);
    assert.equal(r.totals.metrics.clicks_registered.value, 7);
    assert.equal(r.totals.metrics.clicks_eligible.value, 4);
    assert.equal(r.totals.metrics.ctr_percent.value, 3.33);
    assert.equal(r.totals.metrics.unique_clicks.value, null);
    assert.ok(r.warnings.some((w) => w.includes("fuori dal periodo")));
    assert.equal(r.by_article.find((a) => a.scope.endsWith("synth-articolo-c"))!.metrics.impressions_registered.value, 0);
  });

  it("report conclusivo: provvisorio prima della fine, avviso se scaduta ma non chiusa", () => {
    const provisional = buildCampaignReport({ ...base, type: "final", campaign: synthCampaign(), stats: [], today: "2026-11-20", syntheticTest: true });
    assert.equal(provisional.provisional, true);
    assert.equal(provisional.weeks.length, 5);
    assert.equal(provisional.weeks[4].metrics.impressions_registered.status, "not_measured");
    const expired = buildCampaignReport({ ...base, type: "final", campaign: synthCampaign(), stats: [], today: "2026-12-10", syntheticTest: true });
    assert.equal(expired.provisional, false);
    assert.ok(expired.warnings.some((w) => w.includes("scaduta")));
    assert.equal(expired.totals.metrics.ctr_percent.value, null, "CTR non calcolabile senza impressioni");
  });

  it("CSV: escape e protezione da formula injection", () => {
    assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
    assert.equal(csvCell("+1"), "'+1");
    assert.equal(csvCell("a,b"), "\"a,b\"");
    assert.equal(csvCell(null), "");
    const r = buildCampaignReport({ ...base, type: "final", campaign: synthCampaign({ code: "synth-exclusive-30d" }), stats: [stat("2026-11-03", 1, 10, 10, 1, 1)], today: "2026-12-10", syntheticTest: true });
    const csv = reportToCsv(r);
    const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
    assert.equal(lines[0].split(",")[0], "campaign_code");
    assert.equal(lines.length, 1 + 5 + 3 + 1);
    assert.match(lines.at(-1)!, /^synth-exclusive-30d,yes,final,totale,/);
    assert.match(lines.at(-1)!, /not_measured/);
  });
});
