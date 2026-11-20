import { describe, expect, it } from "vitest";
import { encodeShare } from "./design-codec";
import { defaultState, matchWeight, TEMPLATES, type OGState } from "./og-types";
import { isOgEndpoint, ogImageUrl, parseColor, stateFromParams } from "./og-url";
import { wrapLines } from "./text-wrap";

const parse = (query: string) => stateFromParams(new URLSearchParams(query));
const fromUrl = (url: string) => stateFromParams(new URL(url).searchParams);

describe("stateFromParams", () => {
  it("layers template, then share token, then individual params", () => {
    const paper = TEMPLATES.find((t) => t.id === "paper")!;
    const { token } = encodeShare({ ...defaultState, titleSize: 90, accent: "#ff0000" });
    const s = parse(`template=paper&d=${token}&accent=00ff00&title=Hello`);
    expect(s.bgFrom).toBe(paper.patch.bgFrom);
    expect(s.titleSize).toBe(90);
    expect(s.accent).toBe("#00ff00");
    expect(s.title).toBe("Hello");
  });

  it("shows a passed image as a cover unless the design places it", () => {
    expect(parse("image=https://x.test/a.png").imageMode).toBe("cover");
    expect(parse("image=https://x.test/a.png&imageMode=side").imageMode).toBe("side");
  });

  it("drops images and logos the server can't fetch", () => {
    const s = parse("image=data:image/png;base64,AAAA&logo=javascript:alert(1)");
    expect(s.imageUrl).toBeNull();
    expect(s.logoUrl).toBeNull();
  });

  it("caps text and clamps numbers smuggled in through the token", () => {
    const { token } = encodeShare({ ...defaultState, titleSize: 5000, overlay: -3 });
    const s = parse(`d=${token}&title=${"x".repeat(1000)}`);
    expect(s.title).toHaveLength(200);
    expect(s.titleSize).toBe(200);
    expect(s.overlay).toBe(0);
  });

  it("rejects colors and fonts the renderer can't use", () => {
    const { token } = encodeShare({ ...defaultState, textColor: "url(x)", font: "'Comic Sans'" });
    const s = parse(`d=${token}&accent=not;a-color`);
    expect(s.textColor).toBe(defaultState.textColor);
    expect(s.font).toBe(defaultState.font);
    expect(s.accent).toBe(defaultState.accent);
  });

  it("reads font family names and two-color backgrounds", () => {
    const s = parse("font=dm+sans&bg=111&bg2=222");
    expect(s.font).toContain("DM Sans");
    expect([s.bgMode, s.bgFrom, s.bgTo]).toEqual(["gradient", "#111", "#222"]);
    expect(parse("bg=111").bgMode).toBe("solid");
  });
});

describe("ogImageUrl", () => {
  it("round-trips a design with readable text params", () => {
    const state: OGState = {
      ...defaultState,
      title: "Ship it",
      titleSize: 88,
      imageMode: "side",
      imageUrl: "https://x.test/a.png",
    };
    const { url, droppedUploads } = ogImageUrl("https://ogee.app", state);
    expect(new URL(url).searchParams.get("title")).toBe("Ship it");
    expect(droppedUploads).toBe(false);
    expect(fromUrl(url)).toEqual(state);
  });

  it("leaves out uploads and the token for an all-default design", () => {
    const { url, droppedUploads } = ogImageUrl("https://ogee.app", {
      ...defaultState,
      imageMode: "cover",
      imageUrl: "data:image/png;base64,AAAA",
    });
    expect(droppedUploads).toBe(true);
    expect(new URL(url).searchParams.has("image")).toBe(false);
    expect(new URL(url).searchParams.has("d")).toBe(false);
    expect(fromUrl(url).imageMode).toBe("none");
  });
});

it("isOgEndpoint matches the endpoint path on any host", () => {
  expect(isOgEndpoint("https://a.test/api/og?title=x")).toBe(true);
  expect(isOgEndpoint("/api/og")).toBe(true);
  expect(isOgEndpoint("https://a.test/og.png")).toBe(false);
  expect(isOgEndpoint("")).toBe(false);
});

it("parseColor accepts hex with or without # and plain functions", () => {
  expect(parseColor("ff8800")).toBe("#ff8800");
  expect(parseColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  expect(parseColor("red;}")).toBeNull();
});

it("matchWeight falls back like CSS font matching", () => {
  expect(matchWeight([400, 700], 600)).toBe(700);
  expect(matchWeight([300, 700], 450)).toBe(300);
  expect(matchWeight([400, 500], 450)).toBe(500);
  expect(matchWeight([400, 700], 300)).toBe(400);
});

it("wrapLines ends a truncated last line with an ellipsis", () => {
  const measure = (s: string) => s.length;
  expect(wrapLines("aa bb cc", 5, 3, measure)).toEqual(["aa bb", "cc"]);
  expect(wrapLines("aa bb cc dd ee", 5, 2, measure)).toEqual(["aa bb", "cc d…"]);
});
