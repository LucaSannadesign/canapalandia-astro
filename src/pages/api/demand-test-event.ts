export const prerender = false;

import type { APIRoute } from "astro";
import {
  incrementDemandTestCounter,
  isAllowedDemandTestCampaign,
  isAllowedDemandTestEvent,
  normalizeDemandTestSource,
} from "../../lib/demandTestCounters";

function jsonResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;
    if (origin && origin !== requestOrigin) {
      return jsonResponse("Origine non consentita", 403);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse("Content-Type non supportato", 415);
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse("Payload non valido", 400);
    }

    const campaign = "campaign" in payload ? payload.campaign : null;
    const eventType = "eventType" in payload ? payload.eventType : null;
    const source = "source" in payload ? payload.source : null;

    if (!isAllowedDemandTestCampaign(campaign)) {
      return jsonResponse("Campagna non valida", 400);
    }
    if (!isAllowedDemandTestEvent(eventType)) {
      return jsonResponse("Evento non valido", 400);
    }

    await incrementDemandTestCounter(
      campaign,
      eventType,
      normalizeDemandTestSource(source),
    );

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[DemandTest] counter error", error);
    return jsonResponse("Contatore temporaneamente non disponibile", 503);
  }
};
