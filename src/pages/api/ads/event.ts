import type { APIRoute } from "astro";
import { handleAdEvent } from "../../../lib/ads/handlers";
import { runtimeAdsDeps } from "../../../lib/ads/runtime";
import { extractClientIp } from "../../../lib/rateLimit";

export const prerender = false;

/** Beacon di impressione. 404 finché ADS_ENABLED non è "true" e ADS_HASH_SECRET non è configurato. */
export const POST: APIRoute = ({ request }) => handleAdEvent(request, runtimeAdsDeps(extractClientIp(request)));
