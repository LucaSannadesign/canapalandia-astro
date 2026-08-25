export type SocialContentClass =
  | "evergreen-safe"
  | "evergreen-review"
  | "news-temporal";

export type AutopilotState = "eligible" | "review-required" | "blocked";

export type AutopilotPolicy = {
  contentClass: SocialContentClass;
  freshnessDays: number;
  cooldownDays: number;
  maxRepostsSixMonths: number;
  requiresFreshnessCheck: boolean;
  basePriority: number;
  allowedAngles: string[];
};

type PolicyInput = {
  slug?: unknown;
  title?: unknown;
  category?: unknown;
  tags?: unknown;
};

const REVIEW_CATEGORIES = new Set([
  "Normativa",
  "salute-benessere",
  "cbd-alimentazione",
  "Ricerca",
  "medical-cannabis",
  "health-wellness",
  "cbd-and-nutrition",
]);

const REVIEW_TAGS = new Set([
  "cbd",
  "cannabis-terapeutica",
  "medical-cannabis",
  "cannabinoidi",
  "coa",
  "claim",
  "efsa",
  "novel-food",
  "epilessia",
  "oncologia",
  "autismo",
  "gravidanza",
  "controlli",
  "decreto-sicurezza",
  "decreto-sicurezza-2025",
  "corte-di-cassazione",
  "sentenze-ue",
  "tar",
]);

// Override espliciti: alcune categorie del blog sono molto ampie e non bastano
// da sole per stabilire se un contenuto sia stabile o temporale.
const SAFE_SLUG_OVERRIDES = new Set([
  "canapa-made-in-italy-filiera-agricola-identita-territoriale",
  "canapa-microimprese-artigiani-agricoltori-brand",
  "canapa-turismo-rurale-borghi-aziende-agricole",
  "cannabis-light-informazione-parole-sbagliate",
]);

const TEMPORAL_SLUG_OVERRIDES = new Set([
  "autoflower-world-cup-2026-fast-buds",
  "cannabis-light-fondi-pac-europa-canapa",
]);

const SAFE_POLICY: AutopilotPolicy = {
  contentClass: "evergreen-safe",
  freshnessDays: 180,
  cooldownDays: 21,
  maxRepostsSixMonths: 3,
  requiresFreshnessCheck: false,
  basePriority: 60,
  allowedAngles: ["insight", "question", "checklist", "myth"],
};

const REVIEW_POLICY: AutopilotPolicy = {
  contentClass: "evergreen-review",
  freshnessDays: 60,
  cooldownDays: 30,
  maxRepostsSixMonths: 2,
  requiresFreshnessCheck: true,
  basePriority: 35,
  allowedAngles: ["context", "question", "checklist"],
};

const NEWS_POLICY: AutopilotPolicy = {
  contentClass: "news-temporal",
  freshnessDays: 14,
  cooldownDays: 999,
  maxRepostsSixMonths: 0,
  requiresFreshnessCheck: true,
  basePriority: 0,
  allowedAngles: [],
};

function normalizeSlug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^blog\//, "");
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function getAutopilotPolicy(input: PolicyInput): AutopilotPolicy {
  const slug = normalizeSlug(input.slug);
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const tags = normalizeTags(input.tags);

  if (TEMPORAL_SLUG_OVERRIDES.has(slug)) return NEWS_POLICY;
  if (SAFE_SLUG_OVERRIDES.has(slug)) return SAFE_POLICY;
  if (REVIEW_CATEGORIES.has(category)) return REVIEW_POLICY;
  if (tags.some((tag) => REVIEW_TAGS.has(tag))) return REVIEW_POLICY;

  // Le categorie news sono troppo ampie per essere bloccate in blocco: se un
  // contenuto è marcato socialEvergreen resta candidato, ma richiede controllo
  // di freschezza prima del riuso automatico.
  if (
    category === "cannabis-news-it" ||
    category === "cannabis-news" ||
    category === "Attualità"
  ) {
    return REVIEW_POLICY;
  }

  return SAFE_POLICY;
}

export function getEffectiveContentDate(
  publishDate: unknown,
  updatedDate?: unknown,
): Date | null {
  const dates = [publishDate, updatedDate]
    .map((value) =>
      value instanceof Date ? value : new Date(String(value ?? "")),
    )
    .filter((date) => !Number.isNaN(date.getTime()));

  if (!dates.length) return null;
  return dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

export function ageInDays(value: unknown, now = new Date()): number {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 86_400_000),
  );
}

export function getAutopilotState(
  policy: AutopilotPolicy,
  effectiveDate: unknown,
  now = new Date(),
): AutopilotState {
  const ageDays = ageInDays(effectiveDate, now);

  if (policy.contentClass === "news-temporal") return "blocked";
  if (ageDays > Math.min(180, policy.freshnessDays)) return "blocked";
  if (policy.requiresFreshnessCheck) return "review-required";
  return "eligible";
}

export function getBaseAutopilotScore(
  policy: AutopilotPolicy,
  effectiveDate: unknown,
  now = new Date(),
): number {
  const ageDays = ageInDays(effectiveDate, now);
  if (!Number.isFinite(ageDays)) return -999;

  // Favorisce contenuti che hanno avuto il tempo di uscire dalla fase di lancio,
  // senza far dominare semplicemente i più vecchi.
  const ageBonus = Math.min(ageDays, 60) * 0.5;
  return Math.round((policy.basePriority + ageBonus) * 10) / 10;
}
