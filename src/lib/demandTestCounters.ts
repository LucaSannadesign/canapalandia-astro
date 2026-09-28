import { getSupabaseServer } from "./supabaseServer";

export type DemandTestEventType = "view" | "interest_click" | "signup";
export type DemandTestSource =
  | "direct"
  | "internal"
  | "search"
  | "social"
  | "newsletter"
  | "ai"
  | "referral"
  | "unknown";

const ALLOWED_CAMPAIGNS = new Set(["hemp-food-001"]);
const ALLOWED_EVENTS = new Set<DemandTestEventType>(["view", "interest_click", "signup"]);
const ALLOWED_SOURCES = new Set<DemandTestSource>([
  "direct",
  "internal",
  "search",
  "social",
  "newsletter",
  "ai",
  "referral",
  "unknown",
]);

export function isAllowedDemandTestCampaign(value: unknown): value is string {
  return typeof value === "string" && ALLOWED_CAMPAIGNS.has(value);
}

export function isAllowedDemandTestEvent(value: unknown): value is DemandTestEventType {
  return typeof value === "string" && ALLOWED_EVENTS.has(value as DemandTestEventType);
}

export function normalizeDemandTestSource(value: unknown): DemandTestSource {
  if (typeof value !== "string") return "unknown";
  return ALLOWED_SOURCES.has(value as DemandTestSource)
    ? (value as DemandTestSource)
    : "unknown";
}

export async function incrementDemandTestCounter(
  campaign: string,
  eventType: DemandTestEventType,
  source: DemandTestSource,
): Promise<void> {
  if (!isAllowedDemandTestCampaign(campaign)) {
    throw new Error(`Campagna demand test non consentita: ${campaign}`);
  }
  if (!isAllowedDemandTestEvent(eventType)) {
    throw new Error(`Evento demand test non consentito: ${eventType}`);
  }

  const supabase = getSupabaseServer();
  const { error } = await supabase.rpc("increment_demand_test_counter", {
    p_campaign: campaign,
    p_event_type: eventType,
    p_source: normalizeDemandTestSource(source),
  });

  if (error) {
    throw new Error(`Impossibile incrementare il contatore demand test: ${error.message}`);
  }
}
