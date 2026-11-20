import { describe, expect, it } from "vitest";
import { FRAMEWORKS, buildSnippet, imageFileName, resolveTags } from "./meta-snippets";
import { defaultState } from "./og-types";

const state = { ...defaultState, title: 'Say "hi" <now>', domain: "example.com" };

describe("resolveTags", () => {
  it("uses the given page and image URLs instead of the display domain", () => {
    const t = resolveTags(state, "png", {
      pageUrl: "https://blog.example.com/posts/hello",
      imageUrl: "cdn.example.com/hello.png",
    });
    expect(t.pageUrl).toBe("https://blog.example.com/posts/hello");
    expect(t.imageUrl).toBe("https://cdn.example.com/hello.png");
  });

  it("derives the image URL from the page origin and title when left blank", () => {
    const t = resolveTags(state, "jpeg", { pageUrl: "https://x.dev/a/b" });
    expect(t.imageUrl).toBe("https://x.dev/say-hi-now.jpg");
  });

  it("reports the real pixel size of a 2× export", () => {
    const t = resolveTags(state, "png", { scale: 2 });
    expect([t.w, t.h]).toEqual([2400, 1260]);
  });
});

describe("imageFileName", () => {
  it("slugs the title, keeping whole words and falling back when empty", () => {
    expect(imageFileName("png", "Crème brûlée & Co.")).toBe("creme-brulee-and-co.png");
    expect(imageFileName("jpeg", "  !!! ")).toBe("og-image.jpg");
    expect(imageFileName("webp", "Hi", "-1200x630")).toBe("hi-1200x630.webp");
    const long = imageFileName("png", "word ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^(word-)*word\.png$/);
  });
});

describe("buildSnippet", () => {
  it("emits the full tag set for every framework", () => {
    for (const { id } of FRAMEWORKS) {
      const s = buildSnippet(id, state, "png", { siteName: "Example" });
      for (const key of ["twitter:title", "twitter:description", "og:image:alt", "og:site_name"]) {
        const camel = key.replace(/[:_](\w)/g, (_, c: string) => c.toUpperCase());
        const named = id === "nextjs" ? null : id === "nuxt" ? camel : key;
        if (named) expect(s, `${id} missing ${key}`).toContain(named);
      }
    }
  });

  it("escapes HTML in attribute values", () => {
    const s = buildSnippet("html", state, "png");
    expect(s).toContain('content="Say &quot;hi&quot; &lt;now&gt;"');
  });
});
