import type { APIRoute } from "astro";
import { handleAdminAdvertisers } from "../../../../lib/ads/handlers";
import { runtimeAdsDeps } from "../../../../lib/ads/runtime";
import { extractClientIp } from "../../../../lib/rateLimit";

export const prerender = false;

const handler: APIRoute = ({ request }) => handleAdminAdvertisers(request, runtimeAdsDeps(extractClientIp(request)));
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
