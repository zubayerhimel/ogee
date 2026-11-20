/// <reference types="node" />
import { Resvg } from "@resvg/resvg-js";
import * as opentype from "opentype.js";
import satori from "satori";
import { imageDimensions } from "./image-size";
import { defaultState, FONTS, matchWeight, nearestWeight, PRESETS, type FontDef, type OGState } from "./og-types";
import { DESCRIPTION_ALPHA, GRAIN_SEED, seededRandom } from "./render-og";
import { readBody, safeFetch } from "./safe-fetch.server";
import { wrapLines } from "./text-wrap";

/*
 * Server-side twin of render-og.ts: the same layout, drawn with Satori (SVG) and
 * rasterised with resvg. Lines are wrapped here with the real font metrics and placed on
 * the same baselines as the canvas, so a URL-rendered image matches the editor.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT = 6000;

type LoadedFont = { data: ArrayBuffer; font: opentype.Font; weight: number };

// Fonts are immutable, so they're cached for the life of the server instance.
const fontCache = new Map<string, Promise<LoadedFont>>();

function fontCssUrl(def: FontDef, weight: number): string {
  const family = def.family.replace(/ /g, "+");
  const single = def.weights.length === 1 && def.weights[0] === 400;
  return `https://fonts.googleapis.com/css2?family=${single ? family : `${family}:wght@${weight}`}`;
}

/** Google serves TrueType to clients that don't announce WOFF2 support, which Satori needs. */
async function fetchFontFiles(cssUrl: string): Promise<{ weight: number; data: ArrayBuffer }[]> {
  const res = await fetch(cssUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Google Fonts responded with ${res.status}`);
  const css = await res.text();
  const faces = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
  if (!faces.length) throw new Error("No font files in stylesheet");
  return Promise.all(
    faces.map(async ([, weight, url]) => {
      const file = await fetch(url!, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!file.ok) throw new Error(`Font file responded with ${file.status}`);
      return { weight: Number(weight), data: await file.arrayBuffer() };
    }),
  );
}

function loadFont(def: FontDef, weight: number): Promise<LoadedFont> {
  const key = `${def.family}:${weight}`;
  let pending = fontCache.get(key);
  if (!pending) {
    pending = fetchFontFiles(fontCssUrl(def, weight)).then(([file]) => ({
      data: file!.data,
      font: opentype.parse(file!.data),
      weight,
    }));
    // Don't cache failures; the next request retries.
    pending.catch(() => fontCache.delete(key));
    fontCache.set(key, pending);
  }
  return pending;
}

// Satori asks for these when the design's font lacks glyphs for a script.
const FALLBACK_FAMILIES: Record<string, string> = {
  "ja-JP": "Noto Sans JP",
  "ko-KR": "Noto Sans KR",
  "zh-CN": "Noto Sans SC",
  "zh-TW": "Noto Sans TC",
  "zh-HK": "Noto Sans HK",
  "th-TH": "Noto Sans Thai",
  "bn-IN": "Noto Sans Bengali",
  "ar-AR": "Noto Sans Arabic",
  "ta-IN": "Noto Sans Tamil",
  "ml-IN": "Noto Sans Malayalam",
  "he-IL": "Noto Sans Hebrew",
  "te-IN": "Noto Sans Telugu",
  devanagari: "Noto Sans Devanagari",
  kannada: "Noto Sans Kannada",
  symbol: "Noto Sans Symbols 2",
  math: "Noto Sans Math",
  unknown: "Noto Sans",
};

const assetCache = new Map<string, Promise<unknown>>();

function cachedAsset<T>(key: string, load: () => Promise<T>): Promise<T> {
  let pending = assetCache.get(key) as Promise<T> | undefined;
  if (!pending) {
    if (assetCache.size > 500) assetCache.clear();
    pending = load();
    pending.catch(() => assetCache.delete(key));
    assetCache.set(key, pending);
  }
  return pending;
}

async function fallbackFonts(code: string, text: string) {
  const family = FALLBACK_FAMILIES[code] ?? FALLBACK_FAMILIES["unknown"]!;
  const base = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}`;
  const subset = `&text=${encodeURIComponent(text)}`;
  // Some fallback families only come in one weight; Google rejects weights they lack.
  const files = await fetchFontFiles(`${base}:wght@400;700${subset}`).catch(() =>
    fetchFontFiles(`${base}${subset}`),
  );
  return files.map((f) => ({
    name: `${family} fallback`,
    data: f.data,
    weight: f.weight as 400 | 700,
    style: "normal" as const,
  }));
}

/** Twemoji code point name: "1f469-200d-1f4bb"; FE0F is dropped unless it's a ZWJ sequence. */
export function emojiCode(segment: string): string {
  const points = [...segment].map((c) => c.codePointAt(0)!.toString(16));
  return (segment.includes("\u200d") ? points : points.filter((p) => p !== "fe0f")).join("-");
}

async function emojiImage(segment: string): Promise<string> {
  const res = await fetch(
    `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${emojiCode(segment)}.svg`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
  );
  if (!res.ok) throw new Error("No emoji image");
  return `data:image/svg+xml;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

async function loadAdditionalAsset(code: string, segment: string) {
  if (code === "emoji") {
    return cachedAsset(`emoji:${segment}`, () => emojiImage(segment)).catch(() => segment);
  }
  return cachedAsset(`${code}:${segment}`, () => fallbackFonts(code, segment)).catch(() => []);
}

type FetchedImage = { src: string; width: number; height: number };

/**
 * Fetches a public raster image (never a private address) as a data URL plus its size.
 * resvg can't decode WebP, so it isn't requested and is skipped if a server sends it anyway.
 */
async function fetchImage(url: string | null): Promise<FetchedImage | null> {
  if (!url) return null;
  try {
    const { response } = await safeFetch(url, {
      headers: { Accept: "image/png,image/jpeg,image/gif" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!response.ok || !/^image\/(png|jpeg|gif)$/.test(type)) {
      await response.body?.cancel();
      return null;
    }
    const body = await readBody(response, MAX_IMAGE_BYTES);
    const size = imageDimensions(body);
    if (!size?.width || !size.height) return null;
    return { src: `data:${type};base64,${Buffer.from(body).toString("base64")}`, ...size };
  } catch {
    return null;
  }
}

type Style = Record<string, string | number>;

/**
 * Glyph advances plus pair kerning. opentype.js's full shaper throws on some fonts'
 * substitution tables, and widths are all line wrapping needs.
 */
function advanceWidth(font: opentype.Font, text: string, size: number): number {
  let units = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    units += glyph.advanceWidth ?? 0;
    if (prev) {
      try {
        units += font.getKerningValue(prev, glyph);
      } catch {
        // Unsupported kerning table: unkerned widths are close enough.
      }
    }
    prev = glyph;
  }
  return (units * size) / font.unitsPerEm;
}
type Node = { type: string; props: { style?: Style; children?: unknown; [k: string]: unknown } };

const div = (style: Style, children?: unknown): Node => ({ type: "div", props: { style, children } });
const img = (src: string, style: Style): Node => ({
  type: "img",
  props: { src, width: style["width"], height: style["height"], style },
});

function grainSvg(w: number, h: number, color: string): string {
  const rand = seededRandom(GRAIN_SEED);
  let rects = "";
  for (let i = 0; i < 1400; i++) {
    rects += `<rect x="${(rand() * w).toFixed(1)}" y="${(rand() * h).toFixed(1)}" width="1.5" height="1.5"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="${color}" fill-opacity="0.05">${rects}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Renders a design to PNG bytes. Images that fail to load are left out, like the editor does. */
export async function renderOgImage(state: OGState): Promise<Uint8Array<ArrayBuffer>> {
  const def = FONTS.find((f) => f.value === state.font) ?? FONTS.find((f) => f.value === defaultState.font)!;
  const capped = (n: number) => matchWeight(def.weights, Math.min(n, def.maxWeight));
  const weights = {
    badge: capped(600),
    title: nearestWeight(def.value, state.titleWeight),
    desc: capped(400),
    domain: capped(500),
  };
  const [image, logo, ...loaded] = await Promise.all([
    state.imageMode !== "none" ? fetchImage(state.imageUrl) : null,
    fetchImage(state.logoUrl),
    ...[...new Set(Object.values(weights))].map((w) => loadFont(def, w)),
  ]);
  const fontFor = (weight: number) => loaded.find((f) => f.weight === weight)!;

  const { w, h } = PRESETS[state.preset];
  const family = def.family;
  const children: Node[] = [];

  const pad = state.padding;
  let textWidth = w - pad * 2;
  let side = false;

  if (image && state.imageMode === "cover") {
    const full = { position: "absolute", left: 0, top: 0, width: w, height: h } as const;
    children.push(
      img(image.src, {
        ...full,
        objectFit: "cover",
        objectPosition: `${state.imageFocusX * 100}% ${state.imageFocusY * 100}%`,
      }),
      div({ ...full, backgroundColor: `rgba(0,0,0,${state.overlay})` }),
      div({ ...full, backgroundImage: "linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0))" }),
    );
  } else if (image && state.imageMode === "side") {
    side = true;
    const boxW = Math.round(w * 0.4);
    const boxH = h - pad;
    const scale = Math.min(boxW / image.width, boxH / image.height);
    const iw = Math.round(image.width * scale);
    const ih = Math.round(image.height * scale);
    const ix = w - pad / 2 - iw;
    children.push(img(image.src, { position: "absolute", left: ix, top: Math.round((h - ih) / 2), width: iw, height: ih }));
    textWidth = ix - pad - 40;
  }

  if (state.showGrain) {
    children.push(img(grainSvg(w, h, state.textColor), { position: "absolute", left: 0, top: 0, width: w, height: h }));
  }

  const centered = state.align === "center" && !side;
  const originX = centered ? w / 2 : pad;

  /** One line of text whose alphabetic baseline sits at `baseline`, like canvas fillText. */
  const line = (
    text: string,
    x: number,
    baseline: number,
    size: number,
    weight: number,
    style: Style & { align?: "left" | "center" } = {},
  ): Node => {
    const { font } = fontFor(weight);
    const ascent = font.ascender / font.unitsPerEm;
    const descent = -font.descender / font.unitsPerEm;
    const lh = Math.round(size * 1.3);
    const { align = centered ? "center" : "left", ...rest } = style;
    const top = baseline - ((lh - (ascent + descent) * size) / 2 + ascent * size);
    return div(
      {
        position: "absolute",
        top,
        ...(align === "center" ? { left: x - w / 2, width: w, textAlign: "center" } : { left: x, width: w * 2, textAlign: "left" }),
        fontFamily: family,
        fontWeight: weight,
        fontSize: size,
        lineHeight: `${lh}px`,
        whiteSpace: "pre",
        color: state.textColor,
        ...rest,
      },
      text,
    );
  };
  const measure = (weight: number, size: number, tracking = 0) => (s: string) =>
    advanceWidth(fontFor(weight).font, s, size) + tracking * [...s].length;

  if (state.showAccentBar && !centered) {
    children.push(div({ position: "absolute", left: pad, top: pad, width: 76, height: 8, borderRadius: 4, backgroundColor: state.accent }));
  }

  let y = pad + (state.showAccentBar && !centered ? 76 : 24);

  if (state.badge.trim()) {
    children.push(
      line(state.badge.toUpperCase(), originX, y + state.descSize * 0.6, Math.round(state.descSize * 0.72), weights.badge, {
        color: state.accent,
      }),
    );
    y += state.descSize * 1.5;
  }

  const tracking = state.titleTracking * state.titleSize;
  const titleLines = wrapLines(state.title, textWidth, 3, measure(weights.title, state.titleSize, tracking));
  const titleLh = state.titleSize * state.titleLineHeight;
  y += state.titleSize * 1.14 * 0.8;
  // Canvas adds tracking after the last glyph too; nudge centred lines back by half of it.
  const titleX = centered ? originX + tracking / 2 : originX;
  for (const text of titleLines) {
    children.push(line(text, titleX, y, state.titleSize, weights.title, { letterSpacing: tracking }));
    y += titleLh;
  }

  const footerY = h - pad;
  const logoSize = 46;
  const domainSize = Math.round(state.descSize * 0.78);
  const footerTop = logo ? footerY - logoSize + 4 : state.domain.trim() ? footerY - domainSize : h - pad / 2;
  if (state.description.trim()) {
    const descLh = state.descSize * 1.4;
    y += descLh * 0.35;
    const room = footerTop - 24 - state.descSize * 0.25 - y;
    const maxLines = Math.min(3, Math.floor(room / descLh) + 1);
    const descLines = maxLines > 0 ? wrapLines(state.description, textWidth, maxLines, measure(weights.desc, state.descSize)) : [];
    for (const text of descLines) {
      children.push(line(text, originX, y, state.descSize, weights.desc, { opacity: DESCRIPTION_ALPHA }));
      y += descLh;
    }
  }

  let fx = originX;
  let domainAlign: "left" | "center" = centered ? "center" : "left";
  if (logo) {
    const domainWidth = measure(weights.domain, domainSize)(state.domain);
    const lx = centered ? w / 2 - (logoSize + 16 + domainWidth) / 2 : pad;
    children.push(
      img(logo.src, {
        position: "absolute",
        left: lx,
        top: footerY - logoSize + 4,
        width: logoSize,
        height: logoSize,
        borderRadius: 12,
        objectFit: "cover",
      }),
    );
    fx = lx + logoSize + 16;
    domainAlign = "left";
  }
  if (state.domain.trim()) {
    children.push(line(state.domain, fx, footerY, domainSize, weights.domain, { opacity: 0.7, align: domainAlign }));
  }

  const root = div(
    {
      display: "flex",
      position: "relative",
      width: w,
      height: h,
      overflow: "hidden",
      ...(state.bgMode === "solid"
        ? { backgroundColor: state.bgFrom }
        : // Canvas angles point along (cos, sin); CSS measures from "to top", a quarter turn back.
          { backgroundImage: `linear-gradient(${state.bgAngle + 90}deg, ${state.bgFrom}, ${state.bgTo})` }),
    },
    children,
  );

  const svg = await satori(root as Parameters<typeof satori>[0], {
    width: w,
    height: h,
    fonts: loaded.map((f) => ({ name: family, data: f.data, weight: f.weight as 400, style: "normal" as const })),
    loadAdditionalAsset,
  });
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  return Uint8Array.from(png);
}
