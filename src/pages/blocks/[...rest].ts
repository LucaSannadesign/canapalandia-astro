export const trailingSlash = "ignore";

export async function GET() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=0",
    },
  });
}