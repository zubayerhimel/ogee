import { isPrivateHostname } from "./net-guard";

export type ScrapedMeta = {
  title: string;
  description: string;
  image: string | null;
  logo: string | null;
  siteName: string;
  domain: string;
  themeColor: string | null;
};

/** Adds a scheme to bare inputs like `example.com` or `localhost:3000`. */
export function withScheme(raw: string, scheme: "http" | "https" = "https"): string {
  const t = raw.trim();
  return /^[a-z][a-z\d+.-]*:\/\//i.test(t) ? t : `${scheme}://${t}`;
}

export function isLocalUrl(raw: string): boolean {
  try {
    return isPrivateHostname(new URL(withScheme(raw)).hostname);
  } catch {
    return false;
  }
}

/** Reads an attribute from a single tag. Requires whitespace before the name so `data-name` never matches `name`. */
export function attr(tag: string, name: string): string | null {
  const m = tag.match(
    new RegExp(`[\\s/]${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i"),
  );
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function codePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function decode(s: string): string {
  return s
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&(lt|gt|quot|apos|nbsp);/g, (_, name: string) => NAMED[name] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function readMetaTags(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content) meta.set(key, decode(content));
  }
  return meta;
}

export function pageTitle(html: string): string | null {
  const raw = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return raw ? decode(raw) || null : null;
}

export function absUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

export function hostOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).host;
  } catch {
    return pageUrl;
  }
}

export function parseMeta(html: string, pageUrl: string): ScrapedMeta {
  const meta = readMetaTags(html);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const iconTag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) =>
    /icon/i.test(attr(t, "rel") ?? ""),
  );
  const host = hostOf(pageUrl);

  return {
    title:
      meta.get("og:title") ||
      meta.get("twitter:title") ||
      pageTitle(html) ||
      (h1 ? decode(h1.replace(/<[^>]+>/g, " ")) : ""),
    description:
      meta.get("og:description") ||
      meta.get("twitter:description") ||
      meta.get("description") ||
      "",
    image: absUrl(meta.get("og:image") ?? meta.get("twitter:image"), pageUrl),
    logo: absUrl(iconTag ? attr(iconTag, "href") : "/favicon.ico", pageUrl),
    siteName: meta.get("og:site_name") ?? host,
    domain: host.replace(/^www\./, ""),
    themeColor: meta.get("theme-color") ?? null,
  };
}
