import { createFileRoute } from "@tanstack/react-router";
import { readBody, safeFetch } from "@/lib/safe-fetch.server";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const plain = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

// Same-origin image proxy so remote og:images/favicons can be drawn to (and exported from)
// the canvas — most sites don't send CORS headers on their images.
export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target) return plain(400, "Missing url parameter.");
        try {
          const { response } = await safeFetch(target, {
            headers: { Accept: "image/*" },
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) {
            await response.body?.cancel();
            return plain(502, `Upstream responded with ${response.status}.`);
          }
          const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
          if (!type.toLowerCase().startsWith("image/")) {
            await response.body?.cancel();
            return plain(415, "URL is not an image.");
          }
          const body = await readBody(response, MAX_IMAGE_BYTES);
          return new Response(body, {
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=86400",
              "x-content-type-options": "nosniff",
              // SVGs are served from our origin — never let them run script.
              "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Fetch failed.";
          return message === "LOCAL_URL"
            ? plain(403, "Private addresses can't be proxied.")
            : plain(502, message);
        }
      },
    },
  },
});
