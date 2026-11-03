import type { APIRoute } from "astro";
import { handleAdClick } from "../../../../lib/ads/handlers";
import { runtimeAdsDeps } from "../../../../lib/ads/runtime";
import { extractClientIp } from "../../../../lib/rateLimit";

export const prerender = false;

/** Redirect del clic verso la destinazione approvata salvata nel database. 404 se gli annunci sono spenti. */
export const GET: APIRoute = ({ params, request }) =>
  handleAdClick(String(params.placement ?? ""), request, runtimeAdsDeps(extractClientIp(request)));
