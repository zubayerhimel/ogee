# OGee

Paste a URL, pull its Open Graph / Twitter metadata, customize a template on a live canvas, and
export a share-ready social image (1200×630 and other presets) along with copy-paste meta-tag
snippets for HTML, Vite, Next.js, TanStack Start, Nuxt, Astro, SvelteKit and Remix. A built-in
**social preview tester** audits any live page's OG/Twitter tags and scores them.

Built with TanStack Start, React 19, Tailwind CSS 4 and shadcn/ui; deploys to Vercel via Nitro.

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

### Dynamic images (`/api/og`)

`src/routes/api/og.ts` renders a design to a PNG on request, using Satori and resvg
(`src/lib/og-image.server.ts`). Point `og:image` at it and swap the text per page, so every post
gets its own image without exporting anything:

```html
<meta property="og:image" content="https://your-ogee-host/api/og?template=midnight&title=Hello%20world" />
```

The editor's **Export → Or render it on request** builds this URL for the current design.

| Param | Meaning |
| --- | --- |
| `template` | Starting template id (`midnight`, `paper`, `hero`, …) |
| `title`, `description`, `badge`, `domain` | Text (capped at 200 / 400 / 40 / 80 characters) |
| `image`, `logo` | Public `http(s)` PNG, JPEG or GIF URLs (WebP isn't supported by resvg) |
| `imageMode` | `cover`, `side` or `none` (passing `image` alone means `cover`) |
| `preset` | `og` (1200×630, default), `linkedin`, `twitter` or `banner` |
| `font` | Family name, e.g. `Inter` or `DM Sans` |
| `align` | `left` or `center` |
| `accent`, `color`, `bg`, `bg2` | Colors (hex with or without `#`); `bg2` makes a gradient |
| `d` | A full design token, as used in share links |

Layers apply in order: defaults → `template` → `d` → individual params. Responses are cached for a
day in browsers and for a year on CDNs. Fonts come from Google Fonts and emoji from Twemoji at render
time, so the server needs outbound internet access.

## Development

You need Node.js and [pnpm](https://pnpm.io).

```sh
git clone <this-repository-url>
cd <repository-name>
pnpm install
pnpm dev      # start the dev server
pnpm test     # run unit tests (Vitest)
pnpm build    # production build (writes .vercel/output)
```

## Deploying

Import the repository in Vercel and keep the detected defaults (install with pnpm, build with
`pnpm build`). Nitro writes Vercel's Build Output API to `.vercel/output`, which Vercel serves as
static assets plus one Node.js function. To target another host, set `NITRO_PRESET` (for example
`cloudflare-module` or `node-server`) when building.
