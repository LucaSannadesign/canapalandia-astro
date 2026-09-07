import type { APIRoute } from "astro";
import { Buffer } from "node:buffer";
import p01 from "../../data/can260908-hero/part01.txt?raw";
import p02 from "../../data/can260908-hero/part02.txt?raw";
import p03 from "../../data/can260908-hero/part03.txt?raw";
import p04 from "../../data/can260908-hero/part04.txt?raw";
import p05 from "../../data/can260908-hero/part05.txt?raw";
import p06 from "../../data/can260908-hero/part06.txt?raw";
import p07 from "../../data/can260908-hero/part07.txt?raw";
import p08 from "../../data/can260908-hero/part08.txt?raw";

export const prerender = true;

export const GET: APIRoute = () => {
  const bytes = Buffer.from([p01, p02, p03, p04, p05, p06, p07, p08].join(""), "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.byteLength),
    },
  });
};
