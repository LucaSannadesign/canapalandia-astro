/**
 * Test di integrazione e sicurezza dell'Advertising Manager: handler HTTP + dominio + repository
 * in memoria (vincoli equivalenti al DB). Solo dati sintetici, nessun accesso di rete o a Supabase.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activationPhrase, authorizationPhrase } from "../src/lib/ads/campaigns.ts";
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
} from "../src/lib/ads/handlers.ts";
import { issueViewToken } from "../src/lib/ads/tracking.ts";
import { ADMIN_TOKEN, HASH_SECRET, HUMAN_UA, SCENARIO_ARTICLES, seedActiveCampaign, synthPlacement } from "./support/adsFixtures.ts";
import { MemoryAdsRepository } from "./support/memoryAdsRepository.ts";

const ORIGIN = "https://canapalandia.test";
const ENABLED = { ADS_ENABLED: "true", ADS_HASH_SECRET: HASH_SECRET, ADS_ADMIN_TOKEN: ADMIN_TOKEN };
const NOW = "2026-11-05T10:00:00Z";
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

type TestDeps = AdsDeps & { viewer: { ip: string; userAgent: string | null } };
function deps(repo: MemoryAdsRepository, env: AdsDeps["env"], now = NOW, clientIp = freshIp(), ua: string | null = HUMAN_UA): TestDeps {
  return { env, repo: () => repo, now: () => new Date(now), clientIp, viewer: { ip: clientIp, userAgent: ua } };
}

/** Token come quello emesso dal server al rendering, `ageMs` prima dell'evento. */
const tokenFor = (placement: string, d: TestDeps, ageMs = 5_000, ua: string | null = d.viewer.userAgent) =>
  issueViewToken(HASH_SECRET, placement, { ip: d.viewer.ip, userAgent: ua }, new Date(d.now!().getTime() - ageMs));

function adminReq(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? ADMIN_TOKEN}`;
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

const beacon = (placement: string, token: string | null, ua: string | null = HUMAN_UA, extra: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/ads/event/`, {
    method: "POST",
    headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin", ...(ua ? { "user-agent": ua } : {}), ...extra },
    body: JSON.stringify({ type: "impression", placement, ...(token ? { token } : {}) }),
  });

const clickReq = (placement: string, ua: string | null = HUMAN_UA, query = "") =>
  new Request(`${ORIGIN}/api/ads/click/${placement}/${query}`, { headers: ua ? { "user-agent": ua } : {} });

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("interruttore globale spento (stato di consegna)", () => {
  it("nessun annuncio e nessuna query anche con una campagna 'active' nel database", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    for (const env of [{}, { ADS_ENABLED: "false" }, { ADS_ENABLED: "1" }, { ADS_ENABLED: "TRUE", ADS_HASH_SECRET: HASH_SECRET }]) {
      const d = deps(repo, env);
      for (const slug of SCENARIO_ARTICLES) assert.equal(await getServableAd(slug, "article_end", d), null);
      assert.equal((await handleAdEvent(beacon(synthPlacement(1).id, tokenFor(synthPlacement(1).id, d)), d)).status, 404);
      assert.equal((await handleAdClick(synthPlacement(1).id, clickReq(synthPlacement(1).id), d)).status, 404);
    }
    assert.equal(repo.calls, 0, "il repository non deve essere interrogato");
    assert.equal(repo.events.length, 0);
  });
});

describe("rilievo 1: nessuna erogazione con tracciamento incompleto", () => {
  it("ADS_ENABLED=true ma ADS_HASH_SECRET assente o corto: nessun annuncio, nessuna query, clic 404", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    for (const env of [{ ADS_ENABLED: "true" }, { ADS_ENABLED: "true", ADS_HASH_SECRET: "troppo-corto" }]) {
      const d = deps(repo, env);
      assert.equal(await getServableAd("synth-articolo-a", "article_end", d), null);
      assert.equal((await handleAdClick(synthPlacement(1).id, clickReq(synthPlacement(1).id), d)).status, 404);
      assert.equal((await handleAdEvent(beacon(synthPlacement(1).id, "x"), d)).status, 404);
    }
    assert.equal(repo.calls, 0);
    assert.equal(repo.events.length, 0);
  });
  it("senza lettore identificabile (nessun IP per firmare il token) non si eroga", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const { viewer: _v, ...noViewer } = deps(repo, ENABLED);
    assert.equal(await getServableAd("synth-articolo-a", "article_end", noViewer), null);
    assert.equal(repo.calls, 0);
  });
});

describe("pubblicazione con interruttore acceso (ambiente isolato)", () => {
  it("le campagne sintetiche non vengono mai mostrate dal percorso di produzione", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo);
    assert.equal(await getServableAd("synth-articolo-a", "article_end", deps(repo, ENABLED)), null);
    assert.equal((await handleAdClick(synthPlacement(1).id, clickReq(synthPlacement(1).id), deps(repo, ENABLED))).status, 404);
    const shown = await getServableAd("synth-articolo-a", "article_end", { ...deps(repo, ENABLED), allowSynthetic: true });
    assert.equal(shown?.campaignCode, "synth-exclusive-30d");
    assert.match(shown!.viewToken, /^\d{13}\.[a-f0-9]{32}$/);
    assert.equal(shown?.clickHref, `/api/ads/click/${synthPlacement(1).id}/?t=${encodeURIComponent(shown!.viewToken)}`);
  });

  it("solo sugli articoli contrattualizzati, nel periodo, con creatività approvata", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const d = deps(repo, ENABLED);
    assert.ok(await getServableAd("synth-articolo-b", "article_end", d));
    assert.equal(await getServableAd("articolo-non-venduto", "article_end", d), null);
    assert.equal(await getServableAd("synth-articolo-b", "article_end", deps(repo, ENABLED, "2026-12-02T10:00:00Z")), null, "scaduta");
    assert.equal(await getServableAd("synth-articolo-b", "article_end", deps(repo, ENABLED, "2026-11-01T10:00:00Z")), null, "non iniziata");
    repo.campaigns.get("00000000-0000-4000-8000-0000000000a1")!.status = "paused";
    assert.equal(await getServableAd("synth-articolo-b", "article_end", d), null, "in pausa");
  });

  it("un errore del database non rompe l'articolo", async () => {
    const repo = new MemoryAdsRepository();
    repo.findCandidatePlacements = async () => {
      throw new Error("db down");
    };
    assert.equal(await quietly(() => getServableAd("synth-articolo-a", "article_end", deps(repo, ENABLED))), null);
  });
});

describe("clic in uscita", () => {
  it("redirect solo verso la destinazione approvata: i parametri della richiesta sono ignorati", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const id = synthPlacement(1).id;
    const d = deps(repo, ENABLED);
    const res = await handleAdClick(id, clickReq(id, HUMAN_UA, `?t=${tokenFor(id, d)}&url=https://evil.example/&to=//evil.example`), d);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://shop.example.test/attrezzatura");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("referrer-policy"), "origin");
    assert.equal(repo.events.length, 1);
    assert.equal(repo.events[0].is_unverified, false);
  });

  it("destinazione manomessa nel DB fuori allowlist: nessun redirect", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    repo.creatives.get("00000000-0000-4000-8000-0000000000c1")!.destination_url = "https://evil.example/phish";
    const res = await quietly(() => handleAdClick(synthPlacement(1).id, clickReq(synthPlacement(1).id), deps(repo, ENABLED)));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("location"), null);
  });

  it("id non valido o inesistente: 404", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    for (const id of ["../admin", "not-a-uuid", "00000000-0000-4000-8000-00000000ffff"]) {
      assert.equal((await handleAdClick(id, clickReq("x"), deps(repo, ENABLED))).status, 404, id);
    }
  });

  it("clic registrati vs idonei: bot, ripetizioni e clic senza token valido registrati ma esclusi", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const id = synthPlacement(2).id;
    const ip = freshIp();
    const at = (iso: string) => deps(repo, ENABLED, iso, ip);
    const withToken = (iso: string) => `?t=${tokenFor(id, at(iso))}`;
    await handleAdClick(id, clickReq(id, HUMAN_UA, withToken("2026-11-05T10:00:00Z")), at("2026-11-05T10:00:00Z"));
    await handleAdClick(id, clickReq(id, HUMAN_UA, withToken("2026-11-05T10:03:00Z")), at("2026-11-05T10:03:00Z"));
    await handleAdClick(id, clickReq(id, HUMAN_UA, withToken("2026-11-05T10:20:00Z")), at("2026-11-05T10:20:00Z"));
    const bot = deps(repo, ENABLED, NOW, freshIp(), "Googlebot/2.1 (+http://www.google.com/bot.html)");
    await handleAdClick(id, clickReq(id, bot.viewer.userAgent, `?t=${tokenFor(id, bot)}`), bot);
    const noToken = deps(repo, ENABLED);
    const r = await handleAdClick(id, clickReq(id), noToken);
    assert.equal(r.status, 302, "il lettore viene comunque reindirizzato");
    const foreign = deps(repo, ENABLED);
    await handleAdClick(id, clickReq(id, HUMAN_UA, `?t=${tokenFor(id, noToken)}`), foreign);
    const stale = deps(repo, ENABLED);
    await handleAdClick(id, clickReq(id, HUMAN_UA, `?t=${tokenFor(id, stale, 5 * 60 * 60 * 1000)}`), stale);
    assert.deepEqual(
      repo.events.map((e) => [e.is_bot, e.is_duplicate, e.is_unverified, e.filter_reason]),
      [
        [false, false, false, null],
        [false, true, false, "ripetuto nella finestra di deduplica"],
        [false, false, false, null],
        [true, false, false, "user-agent automatizzato"],
        [false, false, true, "token mancante"],
        [false, false, true, "token non valido per questo lettore o posizionamento"],
        [false, false, true, "token scaduto"],
      ],
    );
    assert.ok(repo.events.every((e) => /^[a-f0-9]{32}$/.test(e.visitor_hash!)), "nessun IP in chiaro");
  });
});

describe("rilievo 2: impressioni solo con token di visualizzazione valido", () => {
  const setup = () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    return { repo, id: synthPlacement(3).id };
  };

  it("beacon con token valido accettato; ripetizione e prefetch registrati ma non idonei", async () => {
    const { repo, id } = setup();
    const d = deps(repo, ENABLED);
    const t = tokenFor(id, d);
    assert.equal((await handleAdEvent(beacon(id, t), d)).status, 204);
    assert.equal((await handleAdEvent(beacon(id, t), d)).status, 204);
    assert.equal((await handleAdEvent(beacon(id, t, HUMAN_UA, { "sec-purpose": "prefetch" }), d)).status, 204);
    assert.deepEqual(repo.events.map((e) => [e.is_duplicate, e.is_bot, e.is_unverified]), [[false, false, false], [true, false, false], [false, true, false]]);
  });

  it("rifiutati SENZA registrazione: token mancante, falsificato, di altro lettore/posizionamento, precoce, scaduto, futuro, cross-site", async () => {
    const { repo, id } = setup();
    const d = deps(repo, ENABLED);
    const other = deps(repo, ENABLED);
    const cases: [string, Request][] = [
      ["mancante", beacon(id, null)],
      ["malformato", beacon(id, "abc")],
      ["falsificato", beacon(id, `${tokenFor(id, d).split(".")[0]}.${"0".repeat(32)}`)],
      ["altro lettore (IP)", beacon(id, tokenFor(id, other))],
      ["altro lettore (user-agent)", beacon(id, tokenFor(id, d), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")],
      ["altro posizionamento", beacon(id, tokenFor(synthPlacement(1).id, d))],
      ["prima di 1 s di visibilità", beacon(id, tokenFor(id, d, 500))],
      ["scaduto (> 30 min)", beacon(id, tokenFor(id, d, 31 * 60 * 1000))],
      ["emesso nel futuro", beacon(id, tokenFor(id, d, -60_000))],
      ["cross-site", beacon(id, tokenFor(id, d), HUMAN_UA, { "sec-fetch-site": "cross-site" })],
    ];
    for (const [label, req] of cases) {
      const res = await handleAdEvent(req, d);
      assert.equal(res.status, 403, label);
    }
    assert.equal(repo.events.length, 0, "nessun evento registrato");
  });

  it("payload non validi e posizionamenti inesistenti; rate limit per IP", async () => {
    const { repo, id } = setup();
    const bad = [
      new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: "{not json" }),
      new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: JSON.stringify({ type: "click", placement: id }) }),
      new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: JSON.stringify({ type: "impression", placement: "x" }) }),
      new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: JSON.stringify(["impression"]) }),
    ];
    for (const r of bad) assert.equal((await handleAdEvent(r, deps(repo, ENABLED))).status, 400);
    const oversize = new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: JSON.stringify({ type: "impression", placement: id, pad: "x".repeat(1000) }) });
    assert.equal((await handleAdEvent(oversize, deps(repo, ENABLED))).status, 413);
    const ghost = "00000000-0000-4000-8000-00000000ffff";
    const d = deps(repo, ENABLED);
    assert.equal((await handleAdEvent(beacon(ghost, tokenFor(ghost, d)), d)).status, 404);

    const flood = deps(repo, ENABLED, "2026-11-05T11:00:00Z", freshIp());
    const t = tokenFor(id, flood);
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) statuses.push((await handleAdEvent(beacon(id, t), flood)).status);
    assert.equal(statuses.filter((s) => s === 429).length, 5);
  });
});

describe("rilievo 6: limite effettivo alla lettura dei body", () => {
  const streamOf = (totalBytes: number) => {
    let pulled = 0;
    const chunk = new Uint8Array(16 * 1024).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulled >= totalBytes) return c.close();
        pulled += chunk.length;
        c.enqueue(chunk);
      },
    });
    return { stream, pulled: () => pulled };
  };

  it("body in streaming senza Content-Length: lettura interrotta al limite, 413", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const s = streamOf(5 * 1024 * 1024);
    const req = new Request(`${ORIGIN}/api/ads/event/`, { method: "POST", body: s.stream, duplex: "half" } as RequestInit);
    assert.equal(req.headers.get("content-length"), null);
    const res = await handleAdEvent(req, deps(repo, ENABLED));
    assert.equal(res.status, 413);
    assert.ok(s.pulled() <= 64 * 1024, `letti ${s.pulled()} byte su 5 MB`);
  });

  it("admin: stream oltre 64 KB interrotto; Content-Length dichiarato oltre il limite rifiutato subito", async () => {
    const repo = new MemoryAdsRepository();
    const s = streamOf(10 * 1024 * 1024);
    const req = new Request(`${ORIGIN}/api/ads/admin/advertisers/`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: s.stream,
      duplex: "half",
    } as RequestInit);
    assert.equal((await handleAdminAdvertisers(req, deps(repo, ENABLED))).status, 413);
    assert.ok(s.pulled() <= 128 * 1024, `letti ${s.pulled()} byte su 10 MB`);
    const declared = new Request(`${ORIGIN}/api/ads/admin/advertisers/`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-length": String(10 * 1024 * 1024) },
      body: "{}",
    });
    assert.equal((await handleAdminAdvertisers(declared, deps(repo, ENABLED))).status, 413);
  });

  it("UTF-8 non valido rifiutato", async () => {
    const repo = new MemoryAdsRepository();
    const req = new Request(`${ORIGIN}/api/ads/admin/advertisers/`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    });
    assert.equal((await handleAdminAdvertisers(req, deps(repo, ENABLED))).status, 400);
  });
});

describe("area admin: autenticazione", () => {
  it("token assente o corto in configurazione: l'area non esiste (404)", async () => {
    const repo = new MemoryAdsRepository();
    for (const env of [{}, { ADS_ADMIN_TOKEN: "corto" }]) {
      assert.equal((await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/"), deps(repo, env))).status, 404);
    }
    assert.equal(repo.calls, 0);
  });

  it("token errato o assente: 401; dopo 10 tentativi falliti: 429; token corretto: 200", async () => {
    const repo = new MemoryAdsRepository();
    const ip = freshIp();
    const d = deps(repo, ENABLED, "2026-11-05T10:00:00Z", ip);
    assert.equal((await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { token: null }), d)).status, 401);
    assert.equal((await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { token: `${ADMIN_TOKEN}x` }), d)).status, 401);
    assert.equal((await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/"), deps(repo, ENABLED))).status, 200);
    for (let i = 0; i < 8; i++) await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { token: "wrong" }), d);
    assert.equal((await handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/"), d)).status, 429);
  });

  it("l'area admin funziona anche con ADS_ENABLED spento (configurazione senza pubblicazione)", async () => {
    const repo = new MemoryAdsRepository();
    const res = await handleAdminAdvertisers(adminReq("/api/ads/admin/advertisers/"), deps(repo, { ADS_ADMIN_TOKEN: ADMIN_TOKEN }));
    assert.equal(res.status, 200);
  });
});

describe("scenario sintetico completo: esclusiva fine articolo 30 giorni × 3 articoli", () => {
  it("dalla trattativa all'approvazione; sovrapposizioni impedite; mai attivabile perché sintetica", async () => {
    const repo = new MemoryAdsRepository();
    const env = { ADS_ADMIN_TOKEN: ADMIN_TOKEN, ADS_HASH_SECRET: HASH_SECRET };
    const d = () => deps(repo, env, "2026-11-03T10:00:00Z");
    const call = async (fn: Promise<Response>) => {
      const res = await fn;
      return { status: res.status, body: (await res.json()) as any };
    };

    // Inserzionista sintetico in trattativa
    const adv = await call(
      handleAdminAdvertisers(
        adminReq("/api/ads/admin/advertisers/", {
          body: {
            actor: "test",
            code: "synth-growshop-a",
            legal_name: "SYNTH Growshop A S.r.l. (dati di test)",
            display_name: "SYNTH Growshop A",
            website_url: "https://shop.example.test/",
            allowed_domains: ["shop.example.test"],
            is_synthetic: true,
          },
        }),
        d(),
      ),
    );
    assert.equal(adv.status, 201);
    assert.equal(adv.body.advertiser.negotiation_status, "prospect");
    const advertiserId = adv.body.advertiser.id;

    const draft = (code: string, starts_on: string, ends_on: string, slugs: string[]) => ({
      actor: "test",
      code,
      advertiser_id: advertiserId,
      name: `SYNTH ${code}`,
      price_cents: 8000,
      starts_on,
      ends_on,
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
      placements: slugs.map((article_slug) => ({ article_slug, position_code: "article_end", creative_key: "main" })),
    });

    // Destinazione esterna all'allowlist rifiutata in creazione
    const evil = draft("synth-evil", "2026-11-10", "2026-12-09", ["synth-articolo-a"]);
    evil.creatives[0].destination_url = "https://evil.example/";
    assert.equal((await call(handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { body: evil }), d()))).status, 422);

    const created = await call(handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { body: draft("synth-exclusive-30d", "2026-11-10", "2026-12-09", SCENARIO_ARTICLES) }), d()));
    assert.equal(created.status, 201);
    assert.equal(created.body.campaign.status, "draft");
    assert.equal(created.body.campaign.auto_renew, false);
    assert.ok(created.body.serving.every((s: any) => s.would_serve_if_enabled === false && s.ads_enabled === false));
    const id = created.body.campaign.id;
    const creativeId = created.body.creatives[0].id;
    const act = (body: Record<string, unknown>) => call(handleAdminCampaign(id, adminReq(`/api/ads/admin/campaigns/${id}/`, { body: { actor: "test", ...body } }), d()));

    // Prospect: la conferma scritta non è registrabile
    assert.equal((await act({ action: "mark", mark: "written_confirmation", ref: "SYNTH-EMAIL-1" })).status, 422);
    // Creatività: serve la revisione esplicita della landing
    assert.equal((await act({ action: "review_creative", creative_id: creativeId, decision: "approved" })).status, 422);
    assert.equal((await act({ action: "review_creative", creative_id: creativeId, decision: "approved", landing_reviewed: true })).status, 200);
    assert.equal((await act({ action: "transition", to: "pending_approval" })).status, 200);
    // Approvazione con checklist incompleta: rifiutata con l'elenco dei passi mancanti
    const early = await act({ action: "transition", to: "approved" });
    assert.equal(early.status, 422);
    assert.ok(early.body.details.some((x: string) => x.startsWith("passo 1 mancante")));

    // L'inserzionista (sintetico) conferma per iscritto
    assert.equal(
      (await call(handleAdminAdvertisers(adminReq("/api/ads/admin/advertisers/", { method: "PATCH", body: { actor: "test", id: advertiserId, negotiation_status: "confirmed" } }), d()))).status,
      200,
    );
    for (const [mark, extra] of [
      ["written_confirmation", { ref: "SYNTH-EMAIL-1" }],
      ["commercial_terms", {}],
      ["availability", {}],
      ["tax_contract", {}],
    ] as const) {
      const r = await act({ action: "mark", mark, ...extra });
      assert.equal(r.status, 200, `${mark}: ${JSON.stringify(r.body)}`);
    }
    const approved = await act({ action: "transition", to: "approved" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.campaign.status, "approved");
    assert.ok(approved.body.placements.every((p: any) => p.is_blocking));

    // Seconda campagna sovrapposta su un articolo già venduto
    const rival = await call(handleAdminCampaigns(adminReq("/api/ads/admin/campaigns/", { body: draft("synth-rival", "2026-12-01", "2026-12-30", ["synth-articolo-b", "synth-articolo-z"]) }), d()));
    assert.equal(rival.status, 201);
    assert.equal(rival.body.conflicts.length, 1);
    assert.equal(rival.body.conflicts[0].conflicting_campaign, "synth-exclusive-30d");
    const rivalId = rival.body.campaign.id;
    const rivalAct = (body: Record<string, unknown>) =>
      call(handleAdminCampaign(rivalId, adminReq(`/api/ads/admin/campaigns/${rivalId}/`, { body: { actor: "test", ...body } }), d()));
    assert.equal((await rivalAct({ action: "mark", mark: "availability" })).status, 422);
    // Anche forzando lo stato a livello repository, il vincolo di esclusività blocca
    await assert.rejects(
      repo.updateCampaign(
        rivalId,
        { status: "approved", written_confirmation_at: "x", commercial_terms_approved_at: "x", availability_verified_at: "x", tax_contract_verified_at: "x" },
        { actor: "forzatura", action: "status_changed" },
        null,
      ),
      /ads_placements_no_overlap/,
    );
    assert.ok(!repo.audit.some((a) => a.actor === "forzatura"), "nessun audit per la modifica respinta");

    // Calendario disponibilità
    const cal = await call(handleAdminAvailability(adminReq("/api/ads/admin/availability/?slug=synth-articolo-b,synth-articolo-z&from=2026-11-01&to=2026-12-31"), d()));
    assert.equal(cal.status, 200);
    assert.deepEqual(cal.body.calendars[0].free, [
      { from: "2026-11-01", to: "2026-11-09" },
      { from: "2026-12-10", to: "2026-12-31" },
    ]);
    assert.deepEqual(cal.body.calendars[1].busy, []);

    // Passi 7-9: l'autorizzazione è rifiutata perché i dati sono sintetici
    for (const mark of ["tracking", "tracking_privacy", "dates"]) assert.equal((await act({ action: "mark", mark })).status, 200);
    const auth = await act({ action: "mark", mark: "authorization", confirm: authorizationPhrase("synth-exclusive-30d") });
    assert.equal(auth.status, 422);
    assert.ok(auth.body.details.includes("campagna sintetica: mai pubblicabile"));
    const sched = await act({ action: "transition", to: "scheduled" });
    assert.equal(sched.status, 422);
    const active = await act({ action: "transition", to: "active", confirm: activationPhrase("synth-exclusive-30d") });
    assert.equal(active.status, 422);
    assert.equal(repo.campaigns.get(id)!.status, "approved");

    // Report: campagna mai avviata → metriche non misurate
    const rep = await call(handleAdminReport(adminReq(`/api/ads/admin/report/?campaign=${id}&type=weekly`), d()));
    assert.equal(rep.status, 200);
    assert.equal(rep.body.report.measurement.status, "not_measured");
    assert.equal(rep.body.report.totals.metrics.clicks_eligible.value, null);

    // Registro delle decisioni completo e attribuito
    assert.ok(repo.audit.length >= 10);
    assert.ok(repo.audit.every((a) => a.actor === "test"));
  });

  it("report CSV scaricabile solo con token", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo);
    const id = "00000000-0000-4000-8000-0000000000a1";
    const ok = await handleAdminReport(adminReq(`/api/ads/admin/report/?campaign=${id}&type=final&format=csv`), { ...deps(repo, ENABLED), syntheticTest: true });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-type")!, /^text\/csv/);
    assert.match(ok.headers.get("content-disposition")!, /report-final-synth-exclusive-30d-/);
    const bytes = new Uint8Array(await ok.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM UTF-8 per Excel");
    assert.match(new TextDecoder().decode(bytes), /^campaign_code,synthetic_data,/);
    const denied = await handleAdminReport(adminReq(`/api/ads/admin/report/?campaign=${id}&format=csv`, { token: null }), deps(repo, ENABLED));
    assert.equal(denied.status, 401);
  });

  it("payload admin oltre il limite o senza actor: rifiutato", async () => {
    const repo = new MemoryAdsRepository();
    const big = adminReq("/api/ads/admin/advertisers/", { body: { actor: "test", notes: "x".repeat(70_000) } });
    assert.equal((await handleAdminAdvertisers(big, deps(repo, ENABLED))).status, 413);
    const noActor = adminReq("/api/ads/admin/advertisers/", { body: { code: "synth-x" } });
    assert.equal((await handleAdminAdvertisers(noActor, deps(repo, ENABLED))).status, 400);
  });

  it("rilievo 4: se l'audit fallisce la modifica non avviene (nessun cambio senza traccia)", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const id = "00000000-0000-4000-8000-0000000000a1";
    repo.failNextAudit = true;
    const res = await quietly(() =>
      handleAdminCampaign(id, adminReq(`/api/ads/admin/campaigns/${id}/`, { body: { actor: "collaudo", action: "transition", to: "paused" } }), deps(repo, ENABLED)),
    );
    assert.equal(res.status, 500);
    assert.equal(repo.campaigns.get(id)!.status, "active", "stato invariato");
    assert.equal(repo.audit.length, 0);
    const ok = await handleAdminCampaign(id, adminReq(`/api/ads/admin/campaigns/${id}/`, { body: { actor: "collaudo", action: "transition", to: "paused" } }), deps(repo, ENABLED));
    assert.equal(ok.status, 200);
    assert.deepEqual(repo.audit.map((a) => [a.action, a.from_status, a.to_status, a.actor]), [["status_changed", "active", "paused", "collaudo"]]);
  });

  it("rilievo 4: modifica concorrente rilevata (concorrenza ottimistica) → 409, nessuna modifica", async () => {
    const repo = new MemoryAdsRepository();
    seedActiveCampaign(repo, { markSynthetic: false });
    const id = "00000000-0000-4000-8000-0000000000a1";
    const snapshot = (await repo.getCampaignContext(id))!.campaign.updated_at;
    await repo.updateCampaign(id, { status: "paused" }, { actor: "operatore-a", action: "status_changed" }, snapshot);
    await assert.rejects(
      repo.updateCampaign(id, { status: "completed" }, { actor: "operatore-b", action: "status_changed" }, snapshot),
      /modifica concorrente/,
    );
    assert.equal(repo.campaigns.get(id)!.status, "paused");
    assert.deepEqual(repo.audit.map((a) => a.actor), ["operatore-a"]);
    // Campi fuori whitelist e actor mancante: respinti prima di qualsiasi modifica
    await assert.rejects(repo.updateCampaign(id, { price_cents: 1 } as never, { actor: "x-op", action: "status_changed" }, null), /campo non modificabile/);
    await assert.rejects(repo.updateCampaign(id, { status: "active" }, { actor: "", action: "status_changed" }, null), /actor obbligatorio/);
    assert.equal(repo.audit.length, 1);
  });

  it("rilievo 7: le creatività si collegano ai posizionamenti per chiave, in qualsiasi ordine", async () => {
    const repo = new MemoryAdsRepository();
    const d = deps(repo, { ADS_ADMIN_TOKEN: ADMIN_TOKEN });
    const adv = await handleAdminAdvertisers(
      adminReq("/api/ads/admin/advertisers/", {
        body: { actor: "test", code: "synth-keys", legal_name: "SYNTH keys", display_name: "SYNTH keys", allowed_domains: ["shop.example.test"], is_synthetic: true },
      }),
      d,
    );
    const advertiserId = ((await adv.json()) as any).advertiser.id;
    const creative = (key: string) => ({ key, label: `SYNTH ${key}`, alt_text: `alt ${key}`, headline: key, destination_url: `https://shop.example.test/${key}` });
    const res = await handleAdminCampaigns(
      adminReq("/api/ads/admin/campaigns/", {
        body: {
          actor: "test",
          code: "synth-keys-campaign",
          advertiser_id: advertiserId,
          name: "SYNTH chiavi",
          starts_on: "2026-12-01",
          ends_on: "2026-12-10",
          is_synthetic: true,
          creatives: [creative("zeta"), creative("alfa"), creative("beta")],
          placements: [
            { article_slug: "synth-uno", position_code: "article_end", creative_key: "beta" },
            { article_slug: "synth-due", position_code: "article_end", creative_key: "zeta" },
            { article_slug: "synth-tre", position_code: "article_end", creative_key: "alfa" },
          ],
        },
      }),
      d,
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    const byId = new Map<string, any>(body.creatives.map((c: any) => [c.id, c]));
    const mapping = Object.fromEntries(body.placements.map((p: any) => [p.article_slug, byId.get(p.creative_id).creative_key]));
    assert.deepEqual(mapping, { "synth-uno": "beta", "synth-due": "zeta", "synth-tre": "alfa" });
  });
});
