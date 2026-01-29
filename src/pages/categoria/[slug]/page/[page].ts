export async function GET({ params }: { params: { slug: string } }) {
  const { slug } = params;

  return new Response("", {
    status: 301,
    headers: {
      Location: `/categoria/${slug}/`,
      "cache-control": "public, max-age=86400",
    },
  });
}