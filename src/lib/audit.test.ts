import { describe, expect, it } from "vitest";
import { auditHtml, type ImageProbe } from "./audit.functions";

const page = "https://example.com/post";
const head = (tags: string) => `<html><head><title>Post</title>${tags}</head></html>`;
const status = (html: string, key: string, probe?: ImageProbe) =>
  auditHtml(html, page, probe).checks.find((c) => c.key === key)?.status;

const goodProbe: ImageProbe = {
  ok: true,
  type: "image/png",
  bytes: 200_000,
  truncated: false,
  width: 1200,
  height: 630,
  finalUrl: "https://example.com/og.png",
};

describe("auditHtml", () => {
  it("passes twitter:title/description when og: equivalents exist", () => {
    const html = head(`<meta property="og:title" content="T"><meta property="og:description" content="D">`);
    expect(status(html, "twitter:title")).toBe("pass");
    expect(status(html, "twitter:description")).toBe("pass");
  });

  it("weights a missing og:image more heavily than a missing og:type", () => {
    const base = `<meta property="og:title" content="T"><meta property="og:image" content="/og.png"><meta property="og:type" content="website">`;
    const noImage = auditHtml(head(base.replace(/<meta property="og:image"[^>]*>/, "")), page);
    const noType = auditHtml(head(base.replace(/<meta property="og:type"[^>]*>/, "")), page);
    expect(noImage.score).toBeLessThan(noType.score);
  });

  it("flags a canonical link that disagrees with og:url", () => {
    const html = head(
      `<link rel="canonical" href="https://example.com/a"><meta property="og:url" content="https://example.com/b">`,
    );
    expect(status(html, "canonical")).toBe("warn");
  });

  it("checks the downloaded image and declared dimensions", () => {
    const html = head(
      `<meta property="og:image" content="/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="600">`,
    );
    expect(status(html, "image:loads", goodProbe)).toBe("pass");
    expect(status(html, "image:dimensions", goodProbe)).toBe("pass");
    expect(status(html, "og:image:size", goodProbe)).toBe("warn");
  });

  it("fails images that don't load, are too big, or are SVG", () => {
    const html = head(`<meta property="og:image" content="/og.png">`);
    expect(status(html, "image:loads", { ok: false, error: "Responded with 404" })).toBe("fail");
    expect(status(html, "image:size", { ...goodProbe, bytes: 6 * 1024 * 1024 })).toBe("fail");
    expect(status(html, "image:type", { ...goodProbe, type: "image/svg+xml" })).toBe("fail");
  });

  it("warns when the image is only reachable through a redirect", () => {
    const html = head(`<meta property="og:image" content="/og.png">`);
    const moved = { ...goodProbe, finalUrl: "https://cdn.example.com/og.png" };
    expect(status(html, "image:loads", moved)).toBe("warn");
  });
});
