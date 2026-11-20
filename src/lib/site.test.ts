import { describe, expect, it } from "vitest";
import { auditHtml } from "./audit.functions";
import { siteMeta } from "./site";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

describe("siteMeta", () => {
  it("scores 100 in the app's own tag checker", () => {
    const origin = "https://ogee.example";
    const tags = [...siteMeta(origin), { property: "og:url", content: `${origin}/` }]
      .map((m) =>
        "title" in m
          ? `<title>${esc(m.title)}</title>`
          : "property" in m
            ? `<meta property="${m.property}" content="${esc(m.content)}">`
            : `<meta name="${m.name}" content="${esc(m.content)}">`,
      )
      .join("");
    const result = auditHtml(`<html><head>${tags}</head></html>`, `${origin}/`);

    expect(result.checks.filter((c) => c.status !== "pass")).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.image).toBe(`${origin}/og.png`);
  });
});
