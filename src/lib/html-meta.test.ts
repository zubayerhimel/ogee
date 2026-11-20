import { describe, expect, it } from "vitest";
import { decode, isLocalUrl, parseMeta, withScheme } from "./html-meta";

describe("parseMeta", () => {
  it("falls back to the first <h1> when there is no title", () => {
    expect(parseMeta("<h1 class='x'>Hello <b>World</b></h1>", "https://x.com").title).toBe(
      "Hello World",
    );
  });

  it("does not confuse data-* attributes with real ones", () => {
    const html = `<meta data-name="x" name="og:title" content="Real">`;
    expect(parseMeta(html, "https://x.com").title).toBe("Real");
  });

  it("reads attributes in any order and unquoted values", () => {
    const html = `<meta content="Desc" property="og:description"><meta property=og:image content=/a.png>`;
    const meta = parseMeta(html, "https://x.com/page");
    expect(meta.description).toBe("Desc");
    expect(meta.image).toBe("https://x.com/a.png");
  });
});

describe("decode", () => {
  it("decodes numeric entities and does not double-decode &amp;", () => {
    expect(decode("Tom&#8217;s &#x26; &amp;lt;tag&amp;gt;")).toBe("Tom’s & &lt;tag&gt;");
  });
});

describe("withScheme / isLocalUrl", () => {
  it("doesn't treat domains starting with 'http' as having a scheme", () => {
    expect(withScheme("httpbin.org")).toBe("https://httpbin.org");
    expect(withScheme("localhost:3000", "http")).toBe("http://localhost:3000");
  });

  it("flags local targets only", () => {
    expect(isLocalUrl("localhost:3000")).toBe(true);
    expect(isLocalUrl("https://github.com")).toBe(false);
  });
});
