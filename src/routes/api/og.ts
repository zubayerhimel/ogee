import { createFileRoute } from "@tanstack/react-router";
import { renderOgImage } from "@/lib/og-image.server";
import { stateFromParams } from "@/lib/og-url";

// Renders a design to PNG from its URL, e.g. /api/og?template=midnight&title=Hello, so
// every page can point og:image here instead of exporting files by hand.
export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const state = stateFromParams(new URL(request.url).searchParams);
        try {
          const png = await renderOgImage(state);
          return new Response(png, {
            headers: {
              "content-type": "image/png",
              // The URL fully describes the image, so CDNs can keep it for a long time.
              "cache-control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
              "x-content-type-options": "nosniff",
              "access-control-allow-origin": "*",
            },
          });
        } catch (err) {
          console.error(err);
          return new Response("Couldn't render the image.", {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
