/**
 * Regole di dominio delle campagne: validazione delle bozze, disponibilità/esclusività,
 * checklist di attivazione, transizioni di stato e idoneità alla pubblicazione.
 * Le stesse regole critiche sono ripetute come vincoli e trigger nel database (difesa in profondità).
 */

import { checkDestination, isSafeImagePath } from "./destination";
import { addDays, daysInclusive, isIsoDate, rangesOverlap } from "./dates";
import {
  AD_POSITIONS,
  CONTRACT_TYPES,
  type ActivationChecklist,
  type Advertiser,
  type Campaign,
  type CampaignStatus,
  type ContractType,
  type Creative,
  type Placement,
  type PlacementBundle,
} from "./types";

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;
const MAX_CAMPAIGN_DAYS = 367;
const MAX_PLACEMENTS = 50;

/** Stati che occupano lo spazio pubblicitario (bozza e proposta non bloccano). */
export const BLOCKING_STATUSES: ReadonlySet<CampaignStatus> = new Set(["approved", "scheduled", "active", "paused"]);
export const TERMINAL_STATUSES: ReadonlySet<CampaignStatus> = new Set(["completed", "cancelled", "rejected"]);

export const ALLOWED_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "draft", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["active", "paused", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};

// ---------------------------------------------------------------------------
// Validazione bozza
// ---------------------------------------------------------------------------

export interface CreativeInput {
  key: string;
  label: string;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  alt_text: string;
  headline?: string | null;
  body?: string | null;
  cta_label?: string | null;
  destination_url: string;
  sponsor_label?: string | null;
}

export interface PlacementInput {
  article_slug: string;
  position_code: string;
  creative_key: string;
}

export interface CampaignDraftInput {
  code: string;
  advertiser_id: string;
  name: string;
  contract_type?: ContractType;
  price_cents?: number | null;
  currency?: string;
  starts_on: string;
  ends_on: string;
  notes?: string | null;
  is_synthetic?: boolean;
  creatives: CreativeInput[];
  placements: PlacementInput[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function optText(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError("testo non valido");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new RangeError(`testo oltre ${max} caratteri`);
  return trimmed || null;
}

function reqText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length >= min && t.length <= max ? t : null;
}

function optDimension(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 4000 ? (value as number) : NaN;
}

export function allowedDomainsFor(advertiser: Pick<Advertiser, "allowed_domains">, globalAllowlist: readonly string[]) {
  return [...advertiser.allowed_domains, ...globalAllowlist];
}

/**
 * Valida una bozza di campagna. Non tocca il database: restituisce i valori normalizzati o l'elenco degli errori.
 */
export function validateCampaignDraft(
  input: unknown,
  advertiser: Advertiser | null,
  globalAllowlist: readonly string[] = [],
): ValidationResult<CampaignDraftInput> {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { ok: false, errors: ["payload non valido"] };
  const i = input as Record<string, unknown>;

  if (!advertiser) errors.push("inserzionista inesistente");
  const code = typeof i.code === "string" ? i.code.trim() : "";
  if (!CODE_RE.test(code)) errors.push("code: 3-60 caratteri [a-z0-9-]");
  const name = reqText(i.name, 2, 200);
  if (!name) errors.push("name: 2-200 caratteri");

  const contractType = (i.contract_type ?? "exclusive_time") as ContractType;
  if (!CONTRACT_TYPES.includes(contractType)) errors.push("contract_type non valido");

  const price = i.price_cents ?? null;
  if (price !== null && !(Number.isInteger(price) && (price as number) >= 0 && (price as number) <= 100_000_000)) {
    errors.push("price_cents: intero >= 0 (centesimi)");
  }
  const currency = typeof i.currency === "string" ? i.currency.toUpperCase() : "EUR";
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("currency: codice ISO a 3 lettere");

  const startsOn = i.starts_on;
  const endsOn = i.ends_on;
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) {
    errors.push("starts_on/ends_on: date YYYY-MM-DD");
  } else if (endsOn < startsOn) {
    errors.push("ends_on precedente a starts_on");
  } else if (daysInclusive(startsOn, endsOn) > MAX_CAMPAIGN_DAYS) {
    errors.push("durata massima 367 giorni");
  }

  if ("auto_renew" in i && i.auto_renew !== false) errors.push("rinnovo automatico non supportato");
  const isSynthetic = i.is_synthetic === true;
  if (advertiser && advertiser.is_synthetic && !isSynthetic) {
    errors.push("un inserzionista sintetico può avere solo campagne sintetiche");
  }

  let notes: string | null = null;
  try {
    notes = optText(i.notes, 2000);
  } catch {
    errors.push("notes: massimo 2000 caratteri");
  }

  const allowlist = advertiser ? allowedDomainsFor(advertiser, globalAllowlist) : globalAllowlist;
  const creatives: CreativeInput[] = [];
  const rawCreatives = Array.isArray(i.creatives) ? i.creatives : [];
  if (rawCreatives.length === 0 || rawCreatives.length > 20) errors.push("creatives: da 1 a 20 elementi");
  const keys = new Set<string>();
  rawCreatives.forEach((raw, idx) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const at = `creatives[${idx}]`;
    const key = typeof c.key === "string" ? c.key.trim() : "";
    if (!/^[a-z0-9_-]{1,40}$/.test(key) || keys.has(key)) errors.push(`${at}.key mancante o duplicata`);
    keys.add(key);
    const label = reqText(c.label, 2, 120);
    if (!label) errors.push(`${at}.label: 2-120 caratteri`);
    const alt = reqText(c.alt_text, 2, 200);
    if (!alt) errors.push(`${at}.alt_text: 2-200 caratteri`);
    const imagePath = c.image_path ?? null;
    if (imagePath !== null && !isSafeImagePath(imagePath)) errors.push(`${at}.image_path: solo file self-hosted sotto /ads/`);
    const w = optDimension(c.image_width);
    const h = optDimension(c.image_height);
    if (Number.isNaN(w) || Number.isNaN(h)) errors.push(`${at}: dimensioni immagine non valide`);
    if (imagePath !== null && (w === null || h === null)) errors.push(`${at}: immagine senza dimensioni (rischio CLS)`);
    const dest = checkDestination(c.destination_url, allowlist);
    if (!dest.ok) errors.push(`${at}.destination_url: ${dest.reason}`);
    let headline: string | null = null;
    let body: string | null = null;
    let cta: string | null = null;
    let sponsor: string | null = null;
    try {
      headline = optText(c.headline, 120);
      body = optText(c.body, 300);
      cta = optText(c.cta_label, 40);
      sponsor = optText(c.sponsor_label, 60);
    } catch {
      errors.push(`${at}: testi oltre la lunghezza massima`);
    }
    if (imagePath === null && !headline) errors.push(`${at}: serve un'immagine o un titolo`);
    creatives.push({
      key,
      label: label ?? "",
      image_path: (imagePath as string | null) ?? null,
      image_width: w,
      image_height: h,
      alt_text: alt ?? "",
      headline,
      body,
      cta_label: cta,
      destination_url: dest.ok ? dest.url.toString() : String(c.destination_url ?? ""),
      sponsor_label: sponsor ?? "Contenuto sponsorizzato",
    });
  });

  const placements: PlacementInput[] = [];
  const rawPlacements = Array.isArray(i.placements) ? i.placements : [];
  if (rawPlacements.length === 0 || rawPlacements.length > MAX_PLACEMENTS) errors.push(`placements: da 1 a ${MAX_PLACEMENTS} elementi`);
  const seen = new Set<string>();
  rawPlacements.forEach((raw, idx) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const at = `placements[${idx}]`;
    const slug = typeof p.article_slug === "string" ? p.article_slug.trim() : "";
    const position = typeof p.position_code === "string" ? p.position_code.trim() : "";
    const creativeKey = typeof p.creative_key === "string" ? p.creative_key.trim() : "";
    if (!SLUG_RE.test(slug)) errors.push(`${at}.article_slug non valido`);
    if (!(AD_POSITIONS as readonly string[]).includes(position)) errors.push(`${at}.position_code non abilitata`);
    if (!keys.has(creativeKey)) errors.push(`${at}.creative_key non corrisponde a nessuna creatività`);
    const dedupe = `${slug}|${position}`;
    if (seen.has(dedupe)) errors.push(`${at}: posizionamento duplicato`);
    seen.add(dedupe);
    placements.push({ article_slug: slug, position_code: position, creative_key: creativeKey });
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code,
      advertiser_id: String(i.advertiser_id),
      name: name!,
      contract_type: contractType,
      price_cents: price as number | null,
      currency,
      starts_on: startsOn as string,
      ends_on: endsOn as string,
      notes,
      is_synthetic: isSynthetic,
      creatives,
      placements,
    },
  };
}

// ---------------------------------------------------------------------------
// Disponibilità ed esclusività
// ---------------------------------------------------------------------------

export interface OccupiedSlot {
  placement: Pick<Placement, "article_slug" | "position_code" | "starts_on" | "ends_on" | "campaign_id">;
  campaign: Pick<Campaign, "id" | "code" | "status">;
}

export interface SlotConflict {
  article_slug: string;
  position_code: string;
  conflicting_campaign: string;
  occupied_from: string;
  occupied_to: string;
}

/**
 * Conflitti tra gli spazi richiesti e quelli già occupati da campagne bloccanti.
 * L'esclusività vale solo per la coppia articolo × posizione contrattualizzata.
 */
export function findConflicts(
  request: { campaign_id?: string; starts_on: string; ends_on: string; slots: { article_slug: string; position_code: string }[] },
  occupied: readonly OccupiedSlot[],
): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  for (const slot of request.slots) {
    for (const o of occupied) {
      if (o.campaign.id === request.campaign_id) continue;
      if (!BLOCKING_STATUSES.has(o.campaign.status)) continue;
      if (o.placement.article_slug !== slot.article_slug || o.placement.position_code !== slot.position_code) continue;
      if (!rangesOverlap(request.starts_on, request.ends_on, o.placement.starts_on, o.placement.ends_on)) continue;
      conflicts.push({
        article_slug: slot.article_slug,
        position_code: slot.position_code,
        conflicting_campaign: o.campaign.code,
        occupied_from: o.placement.starts_on,
        occupied_to: o.placement.ends_on,
      });
    }
  }
  return conflicts;
}

/** Calendario per uno spazio: intervalli occupati e intervalli liberi nella finestra richiesta. */
export function availabilityCalendar(
  slot: { article_slug: string; position_code: string },
  window: { from: string; to: string },
  occupied: readonly OccupiedSlot[],
) {
  const busy = occupied
    .filter(
      (o) =>
        BLOCKING_STATUSES.has(o.campaign.status) &&
        o.placement.article_slug === slot.article_slug &&
        o.placement.position_code === slot.position_code &&
        rangesOverlap(window.from, window.to, o.placement.starts_on, o.placement.ends_on),
    )
    .map((o) => ({ from: o.placement.starts_on, to: o.placement.ends_on, campaign: o.campaign.code, status: o.campaign.status }))
    .sort((a, b) => a.from.localeCompare(b.from));

  const free: { from: string; to: string }[] = [];
  let cursor = window.from;
  for (const b of busy) {
    if (b.from > cursor) free.push({ from: cursor, to: addDays(b.from, -1) });
    if (b.to >= cursor) cursor = addDays(b.to, 1);
  }
  if (cursor <= window.to) free.push({ from: cursor, to: window.to });
  return { ...slot, window, busy, free };
}

// ---------------------------------------------------------------------------
// Checklist di attivazione
// ---------------------------------------------------------------------------

export const CHECKLIST_MARKS = {
  written_confirmation: "written_confirmation_at",
  commercial_terms: "commercial_terms_approved_at",
  availability: "availability_verified_at",
  tax_contract: "tax_contract_verified_at",
  tracking: "tracking_tested_at",
  tracking_privacy: "tracking_privacy_reviewed_at",
  dates: "dates_confirmed_at",
  authorization: "activation_authorized_at",
} as const satisfies Record<string, keyof ActivationChecklist>;
export type ChecklistMark = keyof typeof CHECKLIST_MARKS;

export interface ChecklistItem {
  step: string;
  key: string;
  label: string;
  done: boolean;
  detail?: string;
}

export interface CampaignContext {
  campaign: Campaign;
  advertiser: Advertiser;
  creatives: Creative[];
  placements: Placement[];
}

function creativeIssues(ctx: CampaignContext, globalAllowlist: readonly string[]) {
  const byId = new Map(ctx.creatives.map((c) => [c.id, c]));
  const allowlist = allowedDomainsFor(ctx.advertiser, globalAllowlist);
  const missing: string[] = [];
  const unapproved: string[] = [];
  for (const p of ctx.placements) {
    const c = p.creative_id ? byId.get(p.creative_id) : undefined;
    if (!c) {
      missing.push(p.article_slug);
      continue;
    }
    if (c.review_status !== "approved" || !c.approved_at || !c.landing_reviewed_at) unapproved.push(p.article_slug);
    else if (!checkDestination(c.destination_url, allowlist).ok) unapproved.push(`${p.article_slug} (destinazione fuori allowlist)`);
  }
  return { missing, unapproved };
}

/** Stato dei 10 passi della procedura di attivazione (il 10° è l'avvio stesso). */
export function evaluateChecklist(ctx: CampaignContext, globalAllowlist: readonly string[] = []): ChecklistItem[] {
  const c = ctx.campaign;
  const { missing, unapproved } = creativeIssues(ctx, globalAllowlist);
  return [
    {
      step: "1",
      key: "written_confirmation",
      label: "Conferma scritta dell'inserzionista acquisita",
      done: Boolean(c.written_confirmation_at && c.written_confirmation_ref) && ctx.advertiser.negotiation_status === "confirmed",
      detail: ctx.advertiser.negotiation_status === "confirmed" ? undefined : `inserzionista in stato "${ctx.advertiser.negotiation_status}"`,
    },
    {
      step: "2",
      key: "commercial_terms",
      label: "Dati commerciali approvati inseriti (prezzo, periodo, spazi)",
      done: Boolean(c.commercial_terms_approved_at) && c.price_cents !== null,
    },
    { step: "3", key: "availability", label: "Disponibilità degli spazi verificata", done: Boolean(c.availability_verified_at) },
    {
      step: "4",
      key: "creative",
      label: "Creatività caricata per ogni posizionamento",
      done: ctx.placements.length > 0 && missing.length === 0,
      detail: missing.length ? `mancano: ${missing.join(", ")}` : undefined,
    },
    {
      step: "5",
      key: "landing",
      label: "Creatività e landing page riviste e approvate",
      done: ctx.placements.length > 0 && missing.length === 0 && unapproved.length === 0,
      detail: unapproved.length ? `da approvare: ${unapproved.join(", ")}` : undefined,
    },
    { step: "6", key: "tax_contract", label: "Condizioni fiscali e contrattuali verificate", done: Boolean(c.tax_contract_verified_at) },
    { step: "7", key: "tracking", label: "Tracciamento testato", done: Boolean(c.tracking_tested_at) },
    {
      step: "7b",
      key: "tracking_privacy",
      label: "Conformità privacy del tracciamento verificata",
      done: Boolean(c.tracking_privacy_reviewed_at),
    },
    { step: "8", key: "dates", label: "Date confermate", done: Boolean(c.dates_confirmed_at) },
    {
      step: "9",
      key: "authorization",
      label: "Autorizzazione umana all'attivazione",
      done: Boolean(c.activation_authorized_at && c.activation_authorized_by),
    },
  ];
}

const APPROVAL_KEYS = new Set(["written_confirmation", "commercial_terms", "availability", "creative", "landing", "tax_contract"]);

export function missingSteps(items: ChecklistItem[], scope: "approval" | "activation"): ChecklistItem[] {
  return items.filter((it) => !it.done && (scope === "activation" || APPROVAL_KEYS.has(it.key)));
}

export const activationPhrase = (code: string) => `ATTIVA ${code}`;
export const authorizationPhrase = (code: string) => `AUTORIZZO ${code}`;

// ---------------------------------------------------------------------------
// Transizioni di stato
// ---------------------------------------------------------------------------

export interface TransitionInput {
  to: CampaignStatus;
  confirm?: string;
  today: string;
  conflicts: SlotConflict[];
  globalAllowlist?: readonly string[];
}

export type TransitionResult = { ok: true } | { ok: false; errors: string[] };

export function checkTransition(ctx: CampaignContext, input: TransitionInput): TransitionResult {
  const c = ctx.campaign;
  const errors: string[] = [];
  if (!ALLOWED_TRANSITIONS[c.status].includes(input.to)) {
    return { ok: false, errors: [`transizione ${c.status} → ${input.to} non ammessa`] };
  }
  const items = evaluateChecklist(ctx, input.globalAllowlist ?? []);

  if (input.to === "pending_approval") {
    if (c.contract_type !== "exclusive_time") errors.push("campagne condivise/a impressioni non attivabili nell'MVP");
    if (ctx.placements.length === 0) errors.push("nessun posizionamento");
  }
  if (input.to === "approved") {
    for (const it of missingSteps(items, "approval")) errors.push(`passo ${it.step} mancante: ${it.label}${it.detail ? ` (${it.detail})` : ""}`);
    if (input.conflicts.length > 0) errors.push(`spazi già occupati: ${describeConflicts(input.conflicts)}`);
    if (input.today > c.ends_on) errors.push("periodo contrattuale già concluso");
  }
  if (input.to === "scheduled" || input.to === "active") {
    if (c.is_synthetic) errors.push("campagna sintetica: mai pubblicabile");
    if (c.contract_type !== "exclusive_time") errors.push("campagne condivise/a impressioni non attivabili nell'MVP");
    for (const it of missingSteps(items, "activation")) errors.push(`passo ${it.step} mancante: ${it.label}${it.detail ? ` (${it.detail})` : ""}`);
    if (input.conflicts.length > 0) errors.push(`spazi già occupati: ${describeConflicts(input.conflicts)}`);
    if (input.today > c.ends_on) errors.push("periodo contrattuale già concluso");
  }
  if (input.to === "active") {
    if (input.today < c.starts_on) errors.push(`la campagna inizia il ${c.starts_on}: usare "scheduled" fino ad allora`);
    if (input.confirm !== activationPhrase(c.code)) errors.push(`conferma esplicita richiesta: "${activationPhrase(c.code)}"`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

function describeConflicts(conflicts: SlotConflict[]): string {
  return conflicts
    .map((x) => `${x.article_slug}/${x.position_code} occupato da ${x.conflicting_campaign} (${x.occupied_from} → ${x.occupied_to})`)
    .join("; ");
}

/** Regole per registrare un passo della checklist (il timestamp lo imposta sempre il server). */
export function checkMark(
  ctx: CampaignContext,
  mark: ChecklistMark,
  input: { ref?: string; confirm?: string; conflicts: SlotConflict[]; globalAllowlist?: readonly string[] },
): TransitionResult {
  const c = ctx.campaign;
  if (TERMINAL_STATUSES.has(c.status)) return { ok: false, errors: [`campagna in stato finale (${c.status})`] };
  if (c.activation_authorized_at && mark !== "authorization") {
    return { ok: false, errors: ["checklist bloccata dopo l'autorizzazione all'attivazione"] };
  }
  const errors: string[] = [];
  if (mark === "written_confirmation") {
    if (!input.ref || input.ref.trim().length < 3) errors.push("riferimento della conferma scritta obbligatorio (es. id email/PDF)");
    if (ctx.advertiser.negotiation_status !== "confirmed") errors.push("l'inserzionista non risulta in stato \"confirmed\"");
  }
  if (mark === "commercial_terms" && c.price_cents === null) errors.push("prezzo concordato mancante");
  if (mark === "availability" && input.conflicts.length > 0) errors.push(`spazi già occupati: ${describeConflicts(input.conflicts)}`);
  if (mark === "authorization") {
    if (c.status !== "approved") errors.push("l'autorizzazione si registra solo su campagne approvate");
    if (c.is_synthetic) errors.push("campagna sintetica: mai pubblicabile");
    const pending = evaluateChecklist(ctx, input.globalAllowlist ?? []).filter((it) => !it.done && it.key !== "authorization");
    for (const it of pending) errors.push(`passo ${it.step} mancante: ${it.label}`);
    if (input.confirm !== authorizationPhrase(c.code)) errors.push(`conferma esplicita richiesta: "${authorizationPhrase(c.code)}"`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

// ---------------------------------------------------------------------------
// Idoneità alla pubblicazione
// ---------------------------------------------------------------------------

export type ServableResult = { servable: true } | { servable: false; reason: string };

/**
 * Un posizionamento è pubblicabile solo se TUTTO è in regola il giorno `today`.
 * `allowSynthetic` esiste solo per i test automatici: il codice di produzione non lo passa mai.
 */
export function isServable(
  bundle: PlacementBundle,
  today: string,
  options: { globalAllowlist?: readonly string[]; allowSynthetic?: boolean } = {},
): ServableResult {
  const { placement, campaign, creative, advertiser } = bundle;
  if (campaign.status !== "active") return { servable: false, reason: `stato ${campaign.status}` };
  if (campaign.is_synthetic && !options.allowSynthetic) return { servable: false, reason: "campagna sintetica" };
  if (advertiser.is_synthetic && !options.allowSynthetic) return { servable: false, reason: "inserzionista sintetico" };
  if (campaign.contract_type !== "exclusive_time") return { servable: false, reason: "modalità condivisa non attiva nell'MVP" };
  if (today < campaign.starts_on) return { servable: false, reason: "non ancora iniziata" };
  if (today > campaign.ends_on) return { servable: false, reason: "scaduta" };
  if (today < placement.starts_on || today > placement.ends_on) return { servable: false, reason: "posizionamento fuori periodo" };
  if (!(AD_POSITIONS as readonly string[]).includes(placement.position_code)) return { servable: false, reason: "posizione non abilitata" };
  const checklist = evaluateChecklist(
    { campaign, advertiser, creatives: creative ? [creative] : [], placements: [placement] },
    options.globalAllowlist ?? [],
  );
  const pending = checklist.filter((it) => !it.done);
  if (pending.length) return { servable: false, reason: `checklist incompleta (passo ${pending[0].step})` };
  if (!creative || (creative.image_path !== null && !isSafeImagePath(creative.image_path))) {
    return { servable: false, reason: "creatività non valida" };
  }
  return { servable: true };
}
