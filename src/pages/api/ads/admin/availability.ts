import type { APIRoute } from "astro";
import { handleAdminAvailability } from "../../../../lib/ads/handlers";
import { runtimeAdsDeps } from "../../../../lib/ads/runtime";
import { extractClientIp } from "../../../../lib/rateLimit";

export const prerender = false;

export const GET: APIRoute = ({ request }) => handleAdminAvailability(request, runtimeAdsDeps(extractClientIp(request)));
