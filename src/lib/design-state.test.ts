import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, sanitizeState, shareUrl } from "./design-state";
import { defaultState } from "./og-types";

describe("sanitizeState", () => {
  it("drops unknown keys, wrong types and invalid enum values", () => {
    const s = sanitizeState({
      title: "Hi",
      titleSize: "huge",
      preset: "poster",
      padding: Number.NaN,
      evil: "<script>",
      imageUrl: "",
    });
    expect(s.title).toBe("Hi");
    expect(s.titleSize).toBe(defaultState.titleSize);
    expect(s.preset).toBe(defaultState.preset);
    expect(s.padding).toBe(defaultState.padding);
    expect(s.imageUrl).toBeNull();
    expect(s).not.toHaveProperty("evil");
  });
});

describe("share links", () => {
  it("round-trips a design, including non-ASCII text", () => {
    const state = { ...defaultState, title: "Grüße — 你好 🚀", preset: "banner" as const };
    const { token } = encodeShare(state);
    expect(token).toMatch(/^[\w-]+$/);
    expect(decodeShare(token)).toEqual(state);
  });

  it("leaves uploaded images out of the link", () => {
    const { url, droppedUploads } = shareUrl(
      { ...defaultState, logoUrl: "data:image/png;base64,AAAA" },
      "https://ogee.app/?x=1#old",
    );
    expect(droppedUploads).toBe(true);
    expect(url).toMatch(/^https:\/\/ogee\.app\/\?x=1#d=/);
    expect(decodeShare(new URL(url).hash.slice(3))?.logoUrl).toBeNull();
  });

  it("rejects garbage tokens", () => {
    expect(decodeShare("%%%")).toBeNull();
  });
});
