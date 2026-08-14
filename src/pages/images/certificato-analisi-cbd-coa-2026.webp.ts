import { Buffer } from "node:buffer";
import c1 from "../../data/coa-hero/chunk-1";
import c2 from "../../data/coa-hero/chunk-2";
import c3 from "../../data/coa-hero/chunk-3";
import c4 from "../../data/coa-hero/chunk-4";
import c5 from "../../data/coa-hero/chunk-5";

export const prerender = true;

export async function GET() {
  const body = Buffer.from(c1 + c2 + c3 + c4 + c5, "base64");

  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
