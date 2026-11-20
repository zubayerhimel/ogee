import { PRESETS, type OGState } from "@/lib/og-types";

export type FrameworkId =
  | "html"
  | "vite"
  | "nextjs"
  | "tanstack"
  | "nuxt"
  | "astro"
  | "sveltekit"
  | "remix";

export const FRAMEWORKS: { id: FrameworkId; label: string; hint: string }[] = [
  { id: "html", label: "HTML", hint: "Plain <head>" },
  { id: "vite", label: "Vite", hint: "index.html" },
  { id: "nextjs", label: "Next.js", hint: "App Router metadata" },
  { id: "tanstack", label: "TanStack Start", hint: "route head()" },
  { id: "nuxt", label: "Nuxt", hint: "useSeoMeta" },
  { id: "astro", label: "Astro", hint: "Layout head" },
  { id: "sveltekit", label: "SvelteKit", hint: "svelte:head" },
  { id: "remix", label: "Remix", hint: "meta export" },
];

export type ImageFormat = "png" | "jpeg" | "webp";

/** Where the page and image will live once published. Blank fields fall back to defaults. */
export type SnippetOptions = {
  pageUrl?: string;
  imageUrl?: string;
  siteName?: string;
  imageAlt?: string;
};

export const imageFileName = (format: ImageFormat) =>
  `og-image.${format === "jpeg" ? "jpg" : format}`;

function toAbsolute(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(t) ? t : `https://${t}`).toString();
  } catch {
    return null;
  }
}

/** Default page URL guessed from the domain shown on the image. */
export function defaultPageUrl(state: OGState): string {
  return toAbsolute(state.domain) ?? "https://your-site.com/";
}

export function defaultImageUrl(pageUrl: string, format: ImageFormat): string {
  const base = toAbsolute(pageUrl) ?? "https://your-site.com/";
  return new URL(`/${imageFileName(format)}`, base).toString();
}

type Tag = { attr: "name" | "property"; key: string; content: string };

export type ResolvedTags = {
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
  imageType: string;
  siteName: string;
  imageAlt: string;
  w: number;
  h: number;
  tags: Tag[];
};

export function resolveTags(
  state: OGState,
  format: ImageFormat,
  opts: SnippetOptions = {},
): ResolvedTags {
  const { w, h } = PRESETS[state.preset];
  const pageUrl = toAbsolute(opts.pageUrl ?? "") ?? defaultPageUrl(state);
  const imageUrl = toAbsolute(opts.imageUrl ?? "") ?? defaultImageUrl(pageUrl, format);
  const siteName = opts.siteName?.trim() ?? "";
  const imageAlt = opts.imageAlt?.trim() || state.title;
  const imageType = `image/${format}`;
  const { title, description } = state;

  const tags: Tag[] = [
    { attr: "name", key: "description", content: description },
    { attr: "property", key: "og:type", content: "website" },
    { attr: "property", key: "og:url", content: pageUrl },
    ...(siteName ? [{ attr: "property" as const, key: "og:site_name", content: siteName }] : []),
    { attr: "property", key: "og:title", content: title },
    { attr: "property", key: "og:description", content: description },
    { attr: "property", key: "og:image", content: imageUrl },
    { attr: "property", key: "og:image:type", content: imageType },
    { attr: "property", key: "og:image:width", content: String(w) },
    { attr: "property", key: "og:image:height", content: String(h) },
    { attr: "property", key: "og:image:alt", content: imageAlt },
    { attr: "name", key: "twitter:card", content: "summary_large_image" },
    { attr: "name", key: "twitter:title", content: title },
    { attr: "name", key: "twitter:description", content: description },
    { attr: "name", key: "twitter:image", content: imageUrl },
    { attr: "name", key: "twitter:image:alt", content: imageAlt },
  ];

  return { title, description, pageUrl, imageUrl, imageType, siteName, imageAlt, w, h, tags };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const js = (s: string) => JSON.stringify(s);

const htmlTags = (t: ResolvedTags, indent = "") =>
  [
    `${indent}<title>${esc(t.title)}</title>`,
    `${indent}<link rel="canonical" href="${esc(t.pageUrl)}" />`,
    ...t.tags.map((m) => `${indent}<meta ${m.attr}="${m.key}" content="${esc(m.content)}" />`),
  ].join("\n");

const objectTags = (t: ResolvedTags, indent: string) =>
  [
    `${indent}{ title: ${js(t.title)} },`,
    ...t.tags.map((m) => `${indent}{ ${m.attr}: ${js(m.key)}, content: ${js(m.content)} },`),
  ].join("\n");

export function buildSnippet(
  framework: FrameworkId,
  state: OGState,
  format: ImageFormat,
  opts: SnippetOptions = {},
): string {
  const t = resolveTags(state, format, opts);

  switch (framework) {
    case "html":
    case "vite":
    case "astro":
      return htmlTags(t);

    case "sveltekit":
      return `<svelte:head>\n${htmlTags(t, "  ")}\n</svelte:head>`;

    case "nextjs":
      return `// app/layout.tsx (or app/page.tsx)
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(${js(new URL(t.pageUrl).origin)}),
  title: ${js(t.title)},
  description: ${js(t.description)},
  alternates: { canonical: ${js(t.pageUrl)} },
  openGraph: {
    type: "website",
    url: ${js(t.pageUrl)},${t.siteName ? `\n    siteName: ${js(t.siteName)},` : ""}
    title: ${js(t.title)},
    description: ${js(t.description)},
    images: [
      {
        url: ${js(t.imageUrl)},
        width: ${t.w},
        height: ${t.h},
        alt: ${js(t.imageAlt)},
        type: ${js(t.imageType)},
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ${js(t.title)},
    description: ${js(t.description)},
    images: [{ url: ${js(t.imageUrl)}, alt: ${js(t.imageAlt)} }],
  },
};`;

    case "tanstack":
      return `// src/routes/index.tsx
export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
${objectTags(t, "      ")}
    ],
    links: [{ rel: "canonical", href: ${js(t.pageUrl)} }],
  }),
});`;

    case "remix":
      return `// app/routes/_index.tsx
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
${objectTags(t, "  ")}
  { tagName: "link", rel: "canonical", href: ${js(t.pageUrl)} },
];`;

    case "nuxt":
      return `<script setup lang="ts">
useHead({ link: [{ rel: "canonical", href: ${js(t.pageUrl)} }] });
useSeoMeta({
  title: ${js(t.title)},
  description: ${js(t.description)},
  ogType: "website",
  ogUrl: ${js(t.pageUrl)},${t.siteName ? `\n  ogSiteName: ${js(t.siteName)},` : ""}
  ogTitle: ${js(t.title)},
  ogDescription: ${js(t.description)},
  ogImage: ${js(t.imageUrl)},
  ogImageType: ${js(t.imageType)},
  ogImageWidth: ${t.w},
  ogImageHeight: ${t.h},
  ogImageAlt: ${js(t.imageAlt)},
  twitterCard: "summary_large_image",
  twitterTitle: ${js(t.title)},
  twitterDescription: ${js(t.description)},
  twitterImage: ${js(t.imageUrl)},
  twitterImageAlt: ${js(t.imageAlt)},
});
</script>`;
  }
}

export const PLACEMENT: Record<FrameworkId, string> = {
  html: "Paste inside <head> of your page.",
  vite: "Paste inside <head> of index.html.",
  nextjs: "Export from app/layout.tsx or a page for per-page tags.",
  tanstack: "Add to the route's head() option.",
  nuxt: "Place in the page's <script setup> block.",
  astro: "Paste inside <head> of your layout .astro file.",
  sveltekit: "Add to the top level of your +page.svelte.",
  remix: "Export a meta function from the route module.",
};
