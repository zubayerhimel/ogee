# OG Studio

Paste a URL, pull its Open Graph / Twitter metadata, customize a template on a live canvas, and
export a share-ready social image (1200×630 and other presets) along with copy-paste meta-tag
snippets for HTML, Vite, Next.js, TanStack Start, Nuxt, Astro, SvelteKit and Remix. A built-in
**social preview tester** audits any live page's OG/Twitter tags and scores them.

Built with TanStack Start, React 19, Tailwind CSS 4 and shadcn/ui; deploys to Cloudflare Workers
via Nitro.

### How it works

- `src/lib/scrape.functions.ts` / `audit.functions.ts` — server functions that fetch a page and
  parse its metadata (`src/lib/html-meta.ts`).
- `src/lib/safe-fetch.server.ts` — all server-side fetching goes through this. It blocks private,
  loopback and link-local targets (including via DNS and on every redirect hop) and caps body size.
- `src/routes/api/image.ts` — same-origin image proxy so remote images can be drawn to the canvas
  and exported (most sites don't send CORS headers).
- `src/lib/render-og.ts` — canvas renderer used for both the live preview and the export.
- Localhost URLs are fetched directly from the browser, so your dev server must allow CORS (or be
  exposed with a tunnel such as `npx localtunnel --port 3000`).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://structured-steps-now.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ffff6b0-2ef7-42fc-9852-1de4991dc72f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and [pnpm](https://pnpm.io).

```sh
git clone <this-repository-url>
cd <repository-name>
pnpm install
pnpm dev      # start the dev server
pnpm test     # run unit tests (Vitest)
pnpm build    # production build
```
