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

const NEWS_CATEGORIES = new Set([
  "cannabis-news-it",
  "cannabis-news",
  "Attualità",
]);

const REVIEW_CATEGORIES = new Set([
  "Normativa",
  "salute-benessere",
  "cbd-alimentazione",
  "Ricerca",
  "medical-cannabis",
  "health-wellness",
  "cbd-and-nutrition",
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

export function getAutopilotPolicy(category?: unknown): AutopilotPolicy {
  const normalized = typeof category === "string" ? category.trim() : "";
  if (NEWS_CATEGORIES.has(normalized)) return NEWS_POLICY;
  if (REVIEW_CATEGORIES.has(normalized)) return REVIEW_POLICY;
  return SAFE_POLICY;
}

export function ageInDays(publishDate: unknown, now = new Date()): number {
  const date = publishDate instanceof Date
    ? publishDate
    : new Date(String(publishDate ?? ""));
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

export function getAutopilotState(
  policy: AutopilotPolicy,
  publishDate: unknown,
  now = new Date(),
): AutopilotState {
  const ageDays = ageInDays(publishDate, now);

  if (policy.contentClass === "news-temporal") return "blocked";
  if (ageDays > Math.min(180, policy.freshnessDays)) return "blocked";
  if (policy.requiresFreshnessCheck) return "review-required";
  return "eligible";
}

export function getBaseAutopilotScore(
  policy: AutopilotPolicy,
  publishDate: unknown,
  now = new Date(),
): number {
  const ageDays = ageInDays(publishDate, now);
  if (!Number.isFinite(ageDays)) return -999;

  // Favorisce contenuti che hanno avuto il tempo di uscire dalla fase di lancio,
  // senza far dominare semplicemente i più vecchi.
  const ageBonus = Math.min(ageDays, 60) * 0.5;
  return Math.round((policy.basePriority + ageBonus) * 10) / 10;
}
