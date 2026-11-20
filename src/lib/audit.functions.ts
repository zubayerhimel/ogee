import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { absUrl, attr, hostOf, pageTitle, readMetaTags, withScheme } from "./html-meta";
import { imageDimensions } from "./image-size";
import { fetchPage, readBody, safeFetch } from "./safe-fetch.server";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckGroup = "Open Graph" | "X / Twitter" | "Page" | "Image file";

export type Check = {
  key: string;
  label: string;
  value: string | null;
  status: CheckStatus;
  note: string;
  group: CheckGroup;
  /** Relative importance in the score; a missing og:image matters far more than og:type. */
  weight: number;
};

/** What we learned by actually downloading og:image. */
export type ImageProbe =
  | { ok: false; error: string }
  | {
      ok: true;
      type: string;
      bytes: number;
      /** Body exceeded the download cap, so `bytes` is a lower bound. */
      truncated: boolean;
      width: number | null;
      height: number | null;
      finalUrl: string;
    };

export type AuditResult = {
  url: string;
  finalUrl: string;
  domain: string;
  image: string | null;
  title: string;
  description: string;
  checks: Check[];
  score: number;
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PROBE_CAP_BYTES = 8 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function canonicalHref(html: string): string | null {
  const tag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) =>
    (attr(t, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"),
  );
  return tag ? attr(tag, "href") : null;
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

function lengthCheck(
  base: Omit<Check, "status" | "note" | "value">,
  value: string | null,
  max: number,
  missing: { status: CheckStatus; note: string },
): Check {
  if (!value) return { ...base, value, ...missing };
  return value.length > max
    ? {
        ...base,
        value,
        status: "warn",
        note: `${value.length} characters — over ${max}, so it may be truncated.`,
      }
    : { ...base, value, status: "pass", note: `${value.length} characters — a good length.` };
}

function imageChecks(probe: ImageProbe, imageUrl: string): Check[] {
  const group: CheckGroup = "Image file";
  if (!probe.ok) {
    return [
      {
        key: "image:loads",
        label: "Image loads",
        value: imageUrl,
        status: "fail",
        note: `${probe.error} — platforms will show no image.`,
        group,
        weight: 3,
      },
    ];
  }

  const checks: Check[] = [];
  const redirected = !sameUrl(probe.finalUrl, imageUrl);
  checks.push({
    key: "image:loads",
    label: "Image loads",
    value: redirected ? probe.finalUrl : null,
    status: redirected ? "warn" : "pass",
    note: redirected
      ? "Loads, but only after a redirect. Some crawlers don't follow them — link the final URL."
      : "Downloads successfully.",
    group,
    weight: 3,
  });

  const supported = SUPPORTED_TYPES.has(probe.type);
  checks.push({
    key: "image:type",
    label: "File type",
    value: probe.type,
    status: supported ? "pass" : probe.type === "image/svg+xml" ? "fail" : "warn",
    note: supported
      ? "Supported by all major platforms."
      : probe.type === "image/svg+xml"
        ? "SVG isn't supported by social platforms — use PNG or JPG."
        : "Not widely supported — use PNG, JPG or WebP.",
    group,
    weight: 1,
  });

  const tooBig = probe.truncated || probe.bytes > MAX_IMAGE_BYTES;
  checks.push({
    key: "image:size",
    label: "File size",
    value: probe.truncated ? `Over ${kb(PROBE_CAP_BYTES)}` : kb(probe.bytes),
    status: tooBig ? "fail" : "pass",
    note: tooBig
      ? `Over ${kb(MAX_IMAGE_BYTES)} — X and LinkedIn will drop it.`
      : `Under the ${kb(MAX_IMAGE_BYTES)} limit.`,
    group,
    weight: 1,
  });

  const { width, height } = probe;
  if (width && height) {
    const dims = `${width} × ${height}`;
    checks.push({
      key: "image:dimensions",
      label: "Dimensions",
      value: dims,
      status: width >= 1200 && height >= 630 ? "pass" : width >= 600 && height >= 315 ? "warn" : "fail",
      note:
        width >= 1200 && height >= 630
          ? "Meets the recommended 1200 × 630."
          : width >= 600 && height >= 315
            ? "Below the recommended 1200 × 630 — may look soft on high-density screens."
            : "Too small for a large preview — platforms may fall back to a small card.",
      group,
      weight: 2,
    });
    const ratio = width / height;
    const fits = ratio >= 1.75 && ratio <= 2.05;
    checks.push({
      key: "image:ratio",
      label: "Aspect ratio",
      value: `${ratio.toFixed(2)} : 1`,
      status: fits ? "pass" : "warn",
      note: fits
        ? "Close to 1.91 : 1 — shows without heavy cropping."
        : "Far from 1.91 : 1 — platforms will crop it noticeably.",
      group,
      weight: 1,
    });
  } else {
    checks.push({
      key: "image:dimensions",
      label: "Dimensions",
      value: null,
      status: "warn",
      note: "Couldn't read the image's dimensions.",
      group,
      weight: 2,
    });
  }
  return checks;
}

export function auditHtml(html: string, pageUrl: string, probe?: ImageProbe | null): AuditResult {
  const map = readMetaTags(html);
  const get = (k: string) => map.get(k) ?? null;
  const abs = (v: string | null) => absUrl(v, pageUrl);
  const host = hostOf(pageUrl);
  const titleTag = pageTitle(html);
  const og = (k: string) => get(`og:${k}`);

  const ogTitle = og("title") ?? titleTag;
  const ogDesc = og("description") ?? get("description");
  const ogImage = abs(og("image"));
  const twImage = abs(get("twitter:image"));
  const card = get("twitter:card");
  const canonical = abs(canonicalHref(html));
  const ogUrl = abs(og("url"));
  const declaredW = Number(og("image:width")) || null;
  const declaredH = Number(og("image:height")) || null;
  const actual = probe?.ok && probe.width && probe.height ? probe : null;

  const OG: CheckGroup = "Open Graph";
  const TW: CheckGroup = "X / Twitter";
  const PAGE: CheckGroup = "Page";

  const checks: Check[] = [
    lengthCheck({ key: "og:title", label: "og:title", group: OG, weight: 3 }, og("title"), 70, {
      status: titleTag ? "warn" : "fail",
      note: titleTag
        ? "Missing — platforms will fall back to <title>."
        : "Missing, and there is no <title> to fall back to.",
    }),
    lengthCheck(
      { key: "og:description", label: "og:description", group: OG, weight: 2 },
      og("description"),
      200,
      {
        status: get("description") ? "warn" : "fail",
        note: get("description")
          ? "Missing — some platforms fall back to the meta description."
          : "Missing — previews will show no summary text.",
      },
    ),
    {
      key: "og:image",
      label: "og:image",
      value: ogImage,
      status: ogImage ? (ogImage.startsWith("https://") ? "pass" : "warn") : "fail",
      note: ogImage
        ? ogImage.startsWith("https://")
          ? "Absolute HTTPS URL — good."
          : "Should be an absolute HTTPS URL."
        : "Missing — links will share as a plain text card.",
      group: OG,
      weight: 3,
    },
    {
      key: "og:image:size",
      label: "og:image:width / height",
      value: declaredW && declaredH ? `${declaredW} × ${declaredH}` : null,
      ...(declaredW && declaredH
        ? actual && (actual.width !== declaredW || actual.height !== declaredH)
          ? {
              status: "warn" as const,
              note: `Doesn't match the real image (${actual.width} × ${actual.height}).`,
            }
          : { status: "pass" as const, note: "Declared, so the first share renders right away." }
        : {
            status: "warn" as const,
            note: "Missing — some platforms skip the image on the very first share.",
          }),
      group: OG,
      weight: 1,
    },
    {
      key: "og:image:alt",
      label: "og:image:alt",
      value: og("image:alt"),
      status: og("image:alt") ? "pass" : "warn",
      note: og("image:alt")
        ? "Alt text provided for accessibility."
        : "Optional, but improves accessibility.",
      group: OG,
      weight: 1,
    },
    {
      key: "og:url",
      label: "og:url",
      value: og("url"),
      status: og("url") ? "pass" : "warn",
      note: og("url") ? "Canonical share URL declared." : "Missing — crawlers guess the canonical URL.",
      group: OG,
      weight: 1,
    },
    {
      key: "og:type",
      label: "og:type",
      value: og("type"),
      status: og("type") ? "pass" : "warn",
      note: og("type") ? "Declared." : 'Missing — defaults to "website".',
      group: OG,
      weight: 0.5,
    },
    {
      key: "og:site_name",
      label: "og:site_name",
      value: og("site_name"),
      status: og("site_name") ? "pass" : "warn",
      note: og("site_name") ? "Declared." : "Missing — brand name won't show.",
      group: OG,
      weight: 0.5,
    },
    {
      key: "twitter:card",
      label: "twitter:card",
      value: card,
      status: card ? (card === "summary_large_image" ? "pass" : "warn") : "fail",
      note: card
        ? card === "summary_large_image"
          ? "Large image card — best for social previews."
          : `Set to "${card}" — use summary_large_image for a big preview.`
        : "Missing — X/Twitter falls back to a small card.",
      group: TW,
      weight: 2,
    },
    {
      key: "twitter:title",
      label: "twitter:title",
      value: get("twitter:title"),
      // X reads og:title when twitter:title is absent, so that's a valid setup.
      status: get("twitter:title") || og("title") ? "pass" : "warn",
      note: get("twitter:title")
        ? "Present."
        : og("title")
          ? "Not set — X uses og:title, which is fine."
          : "Missing, and there is no og:title to fall back to.",
      group: TW,
      weight: 0.5,
    },
    {
      key: "twitter:description",
      label: "twitter:description",
      value: get("twitter:description"),
      status: get("twitter:description") || og("description") ? "pass" : "warn",
      note: get("twitter:description")
        ? "Present."
        : og("description")
          ? "Not set — X uses og:description, which is fine."
          : "Missing, and there is no og:description to fall back to.",
      group: TW,
      weight: 0.5,
    },
    {
      key: "twitter:image",
      label: "twitter:image",
      value: twImage,
      status: (twImage ?? ogImage) ? "pass" : "fail",
      note: twImage
        ? "Present."
        : ogImage
          ? "Not set — X uses og:image, which is fine."
          : "Missing, and there is no og:image to fall back to.",
      group: TW,
      weight: 1,
    },
    lengthCheck({ key: "title", label: "<title>", group: PAGE, weight: 1 }, titleTag, 60, {
      status: "fail",
      note: "Missing — browsers and search results show the bare URL.",
    }),
    lengthCheck(
      { key: "description", label: "meta description", group: PAGE, weight: 1 },
      get("description"),
      160,
      { status: "warn", note: "Missing — search engines will pick their own snippet." },
    ),
    {
      key: "canonical",
      label: 'link rel="canonical"',
      value: canonical,
      ...(canonical
        ? ogUrl && !sameUrl(ogUrl, canonical)
          ? { status: "warn" as const, note: "Differs from og:url — shares and search may split." }
          : { status: "pass" as const, note: "Declared." }
        : { status: "warn" as const, note: "Missing — duplicate URLs may split share counts." }),
      group: PAGE,
      weight: 1,
    },
  ];

  // og:image is what Facebook, LinkedIn, Slack and most others read; X falls back to it.
  const image = ogImage ?? twImage;
  if (!ogImage) {
    // Image metadata tags are meaningless without an image; og:image already fails.
    for (const key of ["og:image:size", "og:image:alt"]) {
      checks.splice(checks.findIndex((c) => c.key === key), 1);
    }
  }
  if (probe && image) checks.push(...imageChecks(probe, image));

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce(
    (a, c) => a + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0),
    0,
  );

  return {
    url: pageUrl,
    finalUrl: pageUrl,
    domain: host.replace(/^www\./, ""),
    image,
    title: ogTitle ?? "",
    description: ogDesc ?? "",
    checks,
    score: Math.round((earned / total) * 100),
  };
}

/** Downloads an image (up to a cap) to check that it loads and read its type, size and dimensions. */
export async function probeImage(url: string): Promise<ImageProbe> {
  try {
    const { response, url: final } = await safeFetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, error: `Responded with ${response.status}` };
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!type.startsWith("image/")) {
      await response.body?.cancel();
      return { ok: false, error: `Served as ${type || "an unknown type"}, not an image` };
    }
    const body = await readBody(response, PROBE_CAP_BYTES + 1, { truncate: true });
    const dims = imageDimensions(body);
    return {
      ok: true,
      type,
      bytes: body.byteLength,
      truncated: body.byteLength > PROBE_CAP_BYTES,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      finalUrl: final.toString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return {
      ok: false,
      error:
        msg === "LOCAL_URL"
          ? "Points at a private address"
          : err instanceof DOMException && err.name === "TimeoutError"
            ? "Timed out after 8 seconds"
            : msg || "Couldn't download it",
    };
  }
}

export const auditUrl = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ url: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<AuditResult> => {
    const { html, url } = await fetchPage(data.url);
    const image = auditHtml(html, url).image;
    const probe = image ? await probeImage(image) : null;
    return { ...auditHtml(html, url, probe), url: withScheme(data.url) };
  });
