/**
 * Logica degli endpoint pubblicitari, indipendente da Astro: le route in `src/pages/api/ads/`
 * passano richiesta, ambiente e repository. Così i test possono esercitare il flusso completo
 * con un repository in memoria e dati sintetici.
 */

import { checkRateLimit } from "../rateLimit";
import {
  CHECKLIST_MARKS,
  allowedDomainsFor,
  authorizationPhrase,
  availabilityCalendar,
  checkMark,
  checkTransition,
  evaluateChecklist,
  findConflicts,
  isServable,
  validateCampaignDraft,
  type CampaignContext,
  type ChecklistMark,
} from "./campaigns";
import { globalDestinationAllowlist, isAdsEnabled, isTrackingConfigured, type AdsEnv } from "./config";
import { addDays, isIsoDate, romeDate } from "./dates";
import { checkDestination, hostMatchesDomain } from "./destination";
import { UUID_RE, authorizeAdmin, empty, json, notFound, readJsonBody } from "./http";
import { buildCampaignReport, reportToCsv } from "./reports";
import { AdsConflictError, type AdsRepository, type AdvertiserInput } from "./repository";
import { DEDUP_WINDOW_MS, EVENT_RATE_LIMIT, classifyEvent, readSignals, visitorHash } from "./tracking";
import {
  AD_POSITIONS,
  CAMPAIGN_STATUSES,
  NEGOTIATION_STATUSES,
  type AdPosition,
  type CampaignStatus,
  type Creative,
  type NegotiationStatus,
} from "./types";

export interface AdsDeps {
  env: AdsEnv;
  /** Factory pigra: il repository non viene creato se l'interruttore è spento. */
  repo: () => AdsRepository;
  now?: () => Date;
  clientIp?: string;
}

const nowOf = (deps: AdsDeps) => (deps.now ? deps.now() : new Date());
const log = (msg: string, err?: unknown) => console.error(`[ads] ${msg}`, err instanceof Error ? err.message : err ?? "");

// ---------------------------------------------------------------------------
// Pubblicazione (usata dal componente AdSlot)
// ---------------------------------------------------------------------------

export interface ServedAd {
  placementId: string;
  campaignCode: string;
  advertiserName: string;
  sponsorLabel: string;
  headline: string | null;
  body: string | null;
  ctaLabel: string | null;
  altText: string;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  clickHref: string;
  destinationHost: string;
}

const AD_LOOKUP_TIMEOUT_MS = 1500;

/**
 * Restituisce l'annuncio da mostrare o null. Con ADS_ENABLED diverso da "true" ritorna null
 * SENZA interrogare il database. Qualsiasi errore o lentezza produce null: l'articolo non si rompe mai.
 */
export async function getServableAd(
  articleSlug: string,
  position: AdPosition,
  deps: AdsDeps & { allowSynthetic?: boolean },
): Promise<ServedAd | null> {
  if (!isAdsEnabled(deps.env)) return null;
  if (!(AD_POSITIONS as readonly string[]).includes(position)) return null;
  const today = romeDate(nowOf(deps));
  const globalAllowlist = globalDestinationAllowlist(deps.env);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = deps.repo().findCandidatePlacements(articleSlug, position, today);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), AD_LOOKUP_TIMEOUT_MS);
    });
    const candidates = await Promise.race([lookup, timeout]);
    if (!candidates) return null;
    const bundle = candidates
      .filter((b) => isServable(b, today, { globalAllowlist, allowSynthetic: deps.allowSynthetic }).servable)
      .sort((a, b) => a.placement.id.localeCompare(b.placement.id))[0];
    if (!bundle || !bundle.creative) return null;
    const dest = checkDestination(bundle.creative.destination_url, allowedDomainsFor(bundle.advertiser, globalAllowlist));
    if (!dest.ok) return null;
    const c = bundle.creative;
    return {
      placementId: bundle.placement.id,
      campaignCode: bundle.campaign.code,
      advertiserName: bundle.advertiser.display_name,
      sponsorLabel: c.sponsor_label || "Contenuto sponsorizzato",
      headline: c.headline,
      body: c.body,
      ctaLabel: c.cta_label,
      altText: c.alt_text,
      imagePath: c.image_path,
      imageWidth: c.image_width,
      imageHeight: c.image_height,
      clickHref: `/api/ads/click/${bundle.placement.id}/`,
      destinationHost: dest.url.hostname,
    };
  } catch (err) {
    log("lookup annuncio fallito", err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Tracciamento
// ---------------------------------------------------------------------------

async function recordEvent(
  deps: AdsDeps,
  request: Request,
  bundle: { placement: { id: string; campaign_id: string } },
  type: "impression" | "click",
): Promise<void> {
  const now = nowOf(deps);
  const signals = readSignals(request);
  const hash = visitorHash(deps.env.ADS_HASH_SECRET!, romeDate(now), deps.clientIp ?? "", signals.userAgent);
  const since = new Date(now.getTime() - DEDUP_WINDOW_MS[type]).toISOString();
  const repo = deps.repo();
  const last = await repo.lastEventAt(bundle.placement.id, type, hash, since);
  const cls = classifyEvent({ signals, lastSimilarEventAt: last, type, now });
  await repo.insertEvent({
    occurred_at: now.toISOString(),
    event_type: type,
    campaign_id: bundle.placement.campaign_id,
    placement_id: bundle.placement.id,
    visitor_hash: hash,
    ...cls,
  });
}

function rateLimited(deps: AdsDeps, bucket: string): boolean {
  return !checkRateLimit(`ads-${bucket}:${deps.clientIp ?? "unknown"}`, EVENT_RATE_LIMIT.max, EVENT_RATE_LIMIT.windowMs).allowed;
}

/** POST /api/ads/event/ — beacon di impressione `{ "type": "impression", "placement": "<uuid>" }`. */
export async function handleAdEvent(request: Request, deps: AdsDeps): Promise<Response> {
  if (!isTrackingConfigured(deps.env)) return notFound();
  if (rateLimited(deps, "event")) return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  const body = (await readJsonBody(request, 512)) as Record<string, unknown> | null;
  if (!body || body.type !== "impression" || typeof body.placement !== "string" || !UUID_RE.test(body.placement)) {
    return json({ error: "invalid_event" }, 400);
  }
  try {
    const bundle = await deps.repo().getPlacementBundle(body.placement);
    const today = romeDate(nowOf(deps));
    if (!bundle || !isServable(bundle, today, { globalAllowlist: globalDestinationAllowlist(deps.env) }).servable) {
      return notFound();
    }
    await recordEvent(deps, request, bundle, "impression");
    return empty(204);
  } catch (err) {
    log("registrazione impressione fallita", err);
    return json({ error: "unavailable" }, 503);
  }
}

/**
 * GET /api/ads/click/:placement/ — registra il clic e reindirizza alla destinazione APPROVATA salvata
 * nel database. Nessun parametro della richiesta influenza la destinazione.
 */
export async function handleAdClick(placementId: string, request: Request, deps: AdsDeps): Promise<Response> {
  if (!isAdsEnabled(deps.env) || !UUID_RE.test(placementId)) return notFound();
  const globalAllowlist = globalDestinationAllowlist(deps.env);
  let destination: URL;
  let bundle;
  try {
    bundle = await deps.repo().getPlacementBundle(placementId);
    const today = romeDate(nowOf(deps));
    if (!bundle || !bundle.creative || !isServable(bundle, today, { globalAllowlist }).servable) return notFound();
    const dest = checkDestination(bundle.creative.destination_url, allowedDomainsFor(bundle.advertiser, globalAllowlist));
    if (!dest.ok) {
      log(`destinazione rifiutata per ${placementId}: ${dest.reason}`);
      return notFound();
    }
    destination = dest.url;
  } catch (err) {
    log("lookup clic fallito", err);
    return notFound();
  }

  if (isTrackingConfigured(deps.env) && !rateLimited(deps, "click")) {
    try {
      await recordEvent(deps, request, bundle, "click");
    } catch (err) {
      // Il lettore viene comunque reindirizzato: il clic mancante risulterà nei log, non nel report.
      log("registrazione clic fallita", err);
    }
  }
  return empty(302, { Location: destination.toString(), "Referrer-Policy": "origin" });
}

// ---------------------------------------------------------------------------
// Area admin (API JSON protette da token)
// ---------------------------------------------------------------------------

const ADMIN_BODY_LIMIT = 64 * 1024;

async function withAdmin(request: Request, deps: AdsDeps, fn: (repo: AdsRepository) => Promise<Response>): Promise<Response> {
  if (rateLimitedAdmin(deps)) return json({ error: "rate_limited" }, 429, { "Retry-After": "600" });
  const auth = authorizeAdmin(request, deps.env);
  if (!auth.ok) {
    if (auth.response.status === 401) noteAdminFailure(deps);
    return auth.response;
  }
  try {
    return await fn(deps.repo());
  } catch (err) {
    if (err instanceof AdsConflictError) return json({ error: "conflict", detail: err.message }, 409);
    log("errore admin", err);
    return json({ error: "server_error" }, 500);
  }
}

// Tentativi falliti per IP: 10 in 10 minuti, poi 429 anche con token corretto.
const adminFailures = new Map<string, { count: number; resetAt: number }>();
function rateLimitedAdmin(deps: AdsDeps): boolean {
  const e = adminFailures.get(deps.clientIp ?? "unknown");
  return Boolean(e && e.resetAt > nowOf(deps).getTime() && e.count >= 10);
}
function noteAdminFailure(deps: AdsDeps): void {
  const key = deps.clientIp ?? "unknown";
  const now = nowOf(deps).getTime();
  if (adminFailures.size > 1000) {
    for (const [k, v] of adminFailures) if (v.resetAt <= now) adminFailures.delete(k);
  }
  const e = adminFailures.get(key);
  if (!e || e.resetAt <= now) adminFailures.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  else e.count++;
}

function readActor(body: Record<string, unknown>): string | null {
  const actor = typeof body.actor === "string" ? body.actor.trim() : "";
  return actor.length >= 2 && actor.length <= 80 ? actor : null;
}

function validateDomains(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.map((d) => (typeof d === "string" ? d.trim().toLowerCase() : ""));
  return out.every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && hostMatchesDomain(d, d)) ? out : null;
}

function parseAdvertiser(body: Record<string, unknown>, partial: boolean): { value: Partial<AdvertiserInput> } | { errors: string[] } {
  const errors: string[] = [];
  const v: Partial<AdvertiserInput> = {};
  const text = (key: keyof AdvertiserInput, min: number, max: number, required: boolean) => {
    const raw = body[key];
    if (raw === undefined) {
      if (required && !partial) errors.push(`${key} obbligatorio`);
      return;
    }
    if (raw === null && !required) return void ((v as Record<string, unknown>)[key] = null);
    if (typeof raw !== "string" || raw.trim().length < min || raw.trim().length > max) errors.push(`${key}: ${min}-${max} caratteri`);
    else (v as Record<string, unknown>)[key] = raw.trim();
  };
  if (!partial) {
    if (typeof body.code !== "string" || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(body.code)) errors.push("code: 3-60 caratteri [a-z0-9-]");
    else v.code = body.code;
  }
  text("legal_name", 2, 200, true);
  text("display_name", 2, 120, true);
  text("contact_name", 2, 120, false);
  text("contact_email", 3, 200, false);
  text("contact_phone", 3, 40, false);
  text("notes", 0, 2000, false);
  if (body.website_url !== undefined) {
    if (body.website_url === null) v.website_url = null;
    else if (typeof body.website_url !== "string" || !/^https:\/\/[^\s]+$/.test(body.website_url)) errors.push("website_url: https obbligatorio");
    else v.website_url = body.website_url;
  }
  if (body.allowed_domains !== undefined) {
    const domains = validateDomains(body.allowed_domains);
    if (!domains) errors.push("allowed_domains: elenco di domini (es. example.com)");
    else v.allowed_domains = domains;
  } else if (!partial) v.allowed_domains = [];
  if (body.negotiation_status !== undefined) {
    if (!NEGOTIATION_STATUSES.includes(body.negotiation_status as NegotiationStatus)) errors.push("negotiation_status non valido");
    else v.negotiation_status = body.negotiation_status as NegotiationStatus;
  } else if (!partial) v.negotiation_status = "prospect";
  if (!partial) v.is_synthetic = body.is_synthetic === true;
  else if (body.is_synthetic !== undefined) errors.push("is_synthetic non modificabile");
  if (!partial) {
    v.website_url ??= null;
    v.contact_name ??= null;
    v.contact_email ??= null;
    v.contact_phone ??= null;
    v.notes ??= null;
  }
  return errors.length ? { errors } : { value: v };
}

/** GET/POST/PATCH /api/ads/admin/advertisers/ */
export function handleAdminAdvertisers(request: Request, deps: AdsDeps): Promise<Response> {
  return withAdmin(request, deps, async (repo) => {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        if (!UUID_RE.test(id)) return json({ error: "invalid_id" }, 400);
        const advertiser = await repo.getAdvertiser(id);
        if (!advertiser) return notFound();
        return json({ advertiser, campaigns: await repo.listCampaigns({ advertiser_id: id }) });
      }
      return json({ advertisers: await repo.listAdvertisers() });
    }
    const body = (await readJsonBody(request, ADMIN_BODY_LIMIT)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid_body" }, 400);
    const actor = readActor(body);
    if (!actor) return json({ error: "actor obbligatorio (chi esegue l'operazione)" }, 400);

    if (request.method === "POST") {
      const parsed = parseAdvertiser(body, false);
      if ("errors" in parsed) return json({ error: "validation", details: parsed.errors }, 422);
      const advertiser = await repo.createAdvertiser(parsed.value as AdvertiserInput);
      await repo.appendAudit({ campaign_id: null, action: "advertiser_created", from_status: null, to_status: advertiser.negotiation_status, actor, details: { advertiser: advertiser.code } });
      return json({ advertiser }, 201);
    }
    if (request.method === "PATCH") {
      if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return json({ error: "invalid_id" }, 400);
      const current = await repo.getAdvertiser(body.id);
      if (!current) return notFound();
      const parsed = parseAdvertiser(body, true);
      if ("errors" in parsed) return json({ error: "validation", details: parsed.errors }, 422);
      const advertiser = await repo.updateAdvertiser(body.id, parsed.value);
      await repo.appendAudit({
        campaign_id: null,
        action: "advertiser_updated",
        from_status: current.negotiation_status,
        to_status: advertiser.negotiation_status,
        actor,
        details: { advertiser: advertiser.code, fields: Object.keys(parsed.value) },
      });
      return json({ advertiser });
    }
    return json({ error: "method_not_allowed" }, 405);
  });
}

async function conflictsFor(repo: AdsRepository, ctx: CampaignContext) {
  const slots = ctx.placements.map((p) => ({ article_slug: p.article_slug, position_code: p.position_code }));
  const occupied = await repo.listOccupiedSlots(slots);
  return findConflicts({ campaign_id: ctx.campaign.id, starts_on: ctx.campaign.starts_on, ends_on: ctx.campaign.ends_on, slots }, occupied);
}

function campaignView(ctx: CampaignContext, env: AdsEnv, conflicts: ReturnType<typeof findConflicts>, today: string) {
  const globalAllowlist = globalDestinationAllowlist(env);
  return {
    ...ctx,
    checklist: evaluateChecklist(ctx, globalAllowlist),
    conflicts,
    serving: ctx.placements.map((p) => {
      const creative = ctx.creatives.find((c) => c.id === p.creative_id) ?? null;
      const r = isServable({ placement: p, campaign: ctx.campaign, creative, advertiser: ctx.advertiser }, today, { globalAllowlist });
      return {
        article_slug: p.article_slug,
        position_code: p.position_code,
        would_serve_if_enabled: r.servable,
        reason: r.servable ? null : r.reason,
        ads_enabled: isAdsEnabled(env),
      };
    }),
  };
}

/** GET/POST /api/ads/admin/campaigns/ — elenco e creazione bozze. */
export function handleAdminCampaigns(request: Request, deps: AdsDeps): Promise<Response> {
  return withAdmin(request, deps, async (repo) => {
    if (request.method === "GET") {
      const advertiserId = new URL(request.url).searchParams.get("advertiser_id");
      if (advertiserId && !UUID_RE.test(advertiserId)) return json({ error: "invalid_id" }, 400);
      return json({ campaigns: await repo.listCampaigns(advertiserId ? { advertiser_id: advertiserId } : undefined) });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = (await readJsonBody(request, ADMIN_BODY_LIMIT)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid_body" }, 400);
    const actor = readActor(body);
    if (!actor) return json({ error: "actor obbligatorio (chi esegue l'operazione)" }, 400);
    if (typeof body.advertiser_id !== "string" || !UUID_RE.test(body.advertiser_id)) return json({ error: "advertiser_id non valido" }, 422);
    const advertiser = await repo.getAdvertiser(body.advertiser_id);
    const parsed = validateCampaignDraft(body, advertiser, globalDestinationAllowlist(deps.env));
    if (!parsed.ok) return json({ error: "validation", details: parsed.errors }, 422);
    const ctx = await repo.createCampaignDraft(parsed.value);
    await repo.appendAudit({ campaign_id: ctx.campaign.id, action: "campaign_created", from_status: null, to_status: "draft", actor, details: { code: ctx.campaign.code } });
    const conflicts = await conflictsFor(repo, ctx);
    return json(campaignView(ctx, deps.env, conflicts, romeDate(nowOf(deps))), 201);
  });
}

/**
 * GET/POST /api/ads/admin/campaigns/:id/
 * POST actions: `mark` (passo checklist), `review_creative`, `transition`.
 */
export function handleAdminCampaign(id: string, request: Request, deps: AdsDeps): Promise<Response> {
  return withAdmin(request, deps, async (repo) => {
    if (!UUID_RE.test(id)) return json({ error: "invalid_id" }, 400);
    const ctx = await repo.getCampaignContext(id);
    if (!ctx) return notFound();
    const now = nowOf(deps);
    const today = romeDate(now);
    const globalAllowlist = globalDestinationAllowlist(deps.env);

    if (request.method === "GET") return json(campaignView(ctx, deps.env, await conflictsFor(repo, ctx), today));
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const body = (await readJsonBody(request, ADMIN_BODY_LIMIT)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid_body" }, 400);
    const actor = readActor(body);
    if (!actor) return json({ error: "actor obbligatorio (chi esegue l'operazione)" }, 400);
    const confirm = typeof body.confirm === "string" ? body.confirm : undefined;
    const audit = (action: string, details: Record<string, unknown>, to: CampaignStatus | null = null) =>
      repo.appendAudit({ campaign_id: id, action, from_status: ctx.campaign.status, to_status: to, actor, details });

    if (body.action === "mark") {
      const mark = body.mark as ChecklistMark;
      if (!(mark in CHECKLIST_MARKS)) return json({ error: `mark non valido: ${Object.keys(CHECKLIST_MARKS).join(", ")}` }, 422);
      const ref = typeof body.ref === "string" ? body.ref.trim() : undefined;
      const conflicts = mark === "availability" ? await conflictsFor(repo, ctx) : [];
      const check = checkMark(ctx, mark, { ref, confirm, conflicts, globalAllowlist });
      if (!check.ok) return json({ error: "precondition_failed", details: check.errors }, 422);
      const patch: Record<string, unknown> = { [CHECKLIST_MARKS[mark]]: now.toISOString() };
      if (mark === "written_confirmation") patch.written_confirmation_ref = ref;
      if (mark === "authorization") patch.activation_authorized_by = actor;
      await repo.updateCampaign(id, patch);
      await audit(`checklist_${mark}`, { ref: ref ?? null });
      const updated = (await repo.getCampaignContext(id))!;
      return json(campaignView(updated, deps.env, await conflictsFor(repo, updated), today));
    }

    if (body.action === "review_creative") {
      if (!["draft", "pending_approval"].includes(ctx.campaign.status)) {
        return json({ error: "precondition_failed", details: ["creatività revisionabili solo in bozza o in approvazione"] }, 422);
      }
      const creative = ctx.creatives.find((c) => c.id === body.creative_id);
      if (!creative) return json({ error: "creative_id non appartiene alla campagna" }, 422);
      const decision = body.decision;
      if (decision !== "approved" && decision !== "rejected") return json({ error: "decision: approved | rejected" }, 422);
      let patch: Partial<Creative>;
      if (decision === "approved") {
        if (body.landing_reviewed !== true) return json({ error: "precondition_failed", details: ["confermare landing_reviewed: true dopo aver visto la landing page"] }, 422);
        const dest = checkDestination(creative.destination_url, allowedDomainsFor(ctx.advertiser, globalAllowlist));
        if (!dest.ok) return json({ error: "precondition_failed", details: [dest.reason] }, 422);
        patch = { review_status: "approved", approved_at: now.toISOString(), approved_by: actor, landing_reviewed_at: now.toISOString() };
      } else {
        patch = { review_status: "rejected", approved_at: null, approved_by: null, landing_reviewed_at: null };
      }
      await repo.updateCreative(creative.id, patch);
      await audit(`creative_${decision}`, { creative: creative.id, destination: creative.destination_url });
      const updated = (await repo.getCampaignContext(id))!;
      return json(campaignView(updated, deps.env, await conflictsFor(repo, updated), today));
    }

    if (body.action === "transition") {
      const to = body.to as CampaignStatus;
      if (!CAMPAIGN_STATUSES.includes(to)) return json({ error: "stato di destinazione non valido" }, 422);
      const conflicts = await conflictsFor(repo, ctx);
      const check = checkTransition(ctx, { to, confirm, today, conflicts, globalAllowlist });
      if (!check.ok) return json({ error: "precondition_failed", details: check.errors }, 422);
      await repo.updateCampaign(id, { status: to });
      await audit("status_changed", { reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null }, to);
      const updated = (await repo.getCampaignContext(id))!;
      return json(campaignView(updated, deps.env, await conflictsFor(repo, updated), today));
    }

    return json({ error: "action: mark | review_creative | transition", hint: { authorization_phrase: authorizationPhrase(ctx.campaign.code) } }, 422);
  });
}

/** GET /api/ads/admin/availability/?slug=…&position=article_end&from=YYYY-MM-DD&to=YYYY-MM-DD */
export function handleAdminAvailability(request: Request, deps: AdsDeps): Promise<Response> {
  return withAdmin(request, deps, async (repo) => {
    const q = new URL(request.url).searchParams;
    const slugs = (q.get("slug") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const position = q.get("position") ?? "article_end";
    const today = romeDate(nowOf(deps));
    const from = q.get("from") ?? today;
    const to = q.get("to") ?? addDays(from, 89);
    if (slugs.length === 0 || slugs.length > 50 || slugs.some((s) => !/^[a-z0-9][a-z0-9-]{0,199}$/.test(s))) {
      return json({ error: "slug: uno o più slug separati da virgola" }, 400);
    }
    if (!(AD_POSITIONS as readonly string[]).includes(position)) return json({ error: "position non abilitata" }, 400);
    if (!isIsoDate(from) || !isIsoDate(to) || to < from || to > addDays(from, 400)) return json({ error: "from/to non validi" }, 400);
    const occupied = await repo.listOccupiedSlots(slugs.map((article_slug) => ({ article_slug, position_code: position })));
    return json({
      calendars: slugs.map((article_slug) => availabilityCalendar({ article_slug, position_code: position }, { from, to }, occupied)),
    });
  });
}

/** GET /api/ads/admin/report/?campaign=<uuid>&type=weekly|final&format=json|csv */
export function handleAdminReport(request: Request, deps: AdsDeps & { syntheticTest?: boolean }): Promise<Response> {
  return withAdmin(request, deps, async (repo) => {
    const q = new URL(request.url).searchParams;
    const id = q.get("campaign") ?? "";
    const type = q.get("type") === "final" ? "final" : "weekly";
    const format = q.get("format") === "csv" ? "csv" : "json";
    if (!UUID_RE.test(id)) return json({ error: "campaign non valido" }, 400);
    const ctx = await repo.getCampaignContext(id);
    if (!ctx) return notFound();
    const now = nowOf(deps);
    const report = buildCampaignReport({
      type,
      campaign: ctx.campaign,
      advertiser: ctx.advertiser,
      placements: ctx.placements,
      stats: await repo.getDailyStats(id),
      today: romeDate(now),
      now,
      syntheticTest: deps.syntheticTest,
    });
    if (format === "csv") {
      const filename = `report-${type}-${ctx.campaign.code}-${report.as_of}.csv`;
      return new Response(reportToCsv(report), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return json({ report });
  });
}

