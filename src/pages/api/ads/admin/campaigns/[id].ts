import type { APIRoute } from "astro";
import { handleAdminCampaign } from "../../../../../lib/ads/handlers";
import { runtimeAdsDeps } from "../../../../../lib/ads/runtime";
import { extractClientIp } from "../../../../../lib/rateLimit";

export const prerender = false;

const handler: APIRoute = ({ params, request }) =>
  handleAdminCampaign(String(params.id ?? ""), request, runtimeAdsDeps(extractClientIp(request)));
export const GET = handler;
export const POST = handler;
