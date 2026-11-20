import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { absUrl, hostOf, pageTitle, readMetaTags, withScheme } from "./html-meta";
import { fetchPage } from "./safe-fetch.server";

export type CheckStatus = "pass" | "warn" | "fail";

export type Check = {
  key: string;
  label: string;
  value: string | null;
  status: CheckStatus;
  note: string;
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

export function auditHtml(html: string, pageUrl: string): AuditResult {
  const map = readMetaTags(html);
  const get = (k: string) => map.get(k) ?? null;
  const abs = (v: string | null) => absUrl(v, pageUrl);
  const host = hostOf(pageUrl);
  const titleTag = pageTitle(html);

  const ogTitle = get("og:title") ?? titleTag;
  const ogDesc = get("og:description") ?? get("description");
  const ogImage = abs(get("og:image"));
  const twImage = abs(get("twitter:image"));
  const card = get("twitter:card");

  const checks: Check[] = [
    {
      key: "og:title",
      label: "og:title",
      value: get("og:title"),
      status: get("og:title") ? (get("og:title")!.length > 70 ? "warn" : "pass") : "fail",
      note: get("og:title")
        ? get("og:title")!.length > 70
          ? "Longer than 70 characters — may be truncated."
          : "Present and a good length."
        : titleTag
          ? "Missing — platforms will fall back to <title>."
          : "Missing, and there is no <title> to fall back to.",
    },
    {
      key: "og:description",
      label: "og:description",
      value: get("og:description"),
      status: get("og:description")
        ? get("og:description")!.length > 200
          ? "warn"
          : "pass"
        : "fail",
      note: get("og:description")
        ? get("og:description")!.length > 200
          ? "Longer than 200 characters — will be cut off."
          : "Present and a good length."
        : "Missing — previews will show no summary text.",
    },
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
    },
    {
      key: "og:image:alt",
      label: "og:image:alt",
      value: get("og:image:alt"),
      status: get("og:image:alt") ? "pass" : "warn",
      note: get("og:image:alt")
        ? "Alt text provided for accessibility."
        : "Optional, but improves accessibility.",
    },
    {
      key: "og:url",
      label: "og:url",
      value: get("og:url"),
      status: get("og:url") ? "pass" : "warn",
      note: get("og:url")
        ? "Canonical share URL declared."
        : "Missing — crawlers guess the canonical URL.",
    },
    {
      key: "og:type",
      label: "og:type",
      value: get("og:type"),
      status: get("og:type") ? "pass" : "warn",
      note: get("og:type") ? "Declared." : 'Missing — defaults to "website".',
    },
    {
      key: "og:site_name",
      label: "og:site_name",
      value: get("og:site_name"),
      status: get("og:site_name") ? "pass" : "warn",
      note: get("og:site_name") ? "Declared." : "Missing — brand name won't show.",
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
    },
    {
      key: "twitter:title",
      label: "twitter:title",
      value: get("twitter:title"),
      status: get("twitter:title") ? "pass" : "warn",
      note: get("twitter:title") ? "Present." : "Missing — falls back to og:title.",
    },
    {
      key: "twitter:description",
      label: "twitter:description",
      value: get("twitter:description"),
      status: get("twitter:description") ? "pass" : "warn",
      note: get("twitter:description")
        ? "Present."
        : "Missing — falls back to og:description.",
    },
    {
      key: "twitter:image",
      label: "twitter:image",
      value: twImage,
      status: twImage ?? ogImage ? "pass" : "fail",
      note: twImage
        ? "Present."
        : ogImage
          ? "Missing — falls back to og:image."
          : "Missing, and there is no og:image to fall back to.",
    },
  ];

  const score = Math.round(
    (checks.reduce((a, c) => a + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0) /
      checks.length) *
      100,
  );

  return {
    url: pageUrl,
    finalUrl: pageUrl,
    domain: host.replace(/^www\./, ""),
    image: twImage ?? ogImage,
    title: ogTitle ?? "",
    description: ogDesc ?? "",
    checks,
    score,
  };
}

export const auditUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ url: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<AuditResult> => {
    const { html, url } = await fetchPage(data.url);
    return { ...auditHtml(html, url), url: withScheme(data.url) };
  });
