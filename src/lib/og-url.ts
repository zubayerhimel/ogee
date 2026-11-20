import { decodeShare, encodeShare, SHARE_PARAM } from "./design-codec";
import { defaultState, FONTS, PRESETS, TEMPLATES, type OGState } from "./og-types";

/** Server route that renders a design to PNG on request. */
export const OG_ENDPOINT = "/api/og";

const TEXT_LIMITS = { title: 200, description: 400, badge: 40, domain: 80 } as const;
type TextKey = keyof typeof TEXT_LIMITS;
const TEXT_KEYS = Object.keys(TEXT_LIMITS) as TextKey[];

/** Ranges wide enough for anything the editor produces; anything else is clamped. */
const NUMBER_RANGES: Partial<Record<keyof OGState, [number, number]>> = {
  titleSize: [12, 200],
  titleWeight: [100, 900],
  titleTracking: [-0.2, 0.5],
  titleLineHeight: [0.7, 2.5],
  descSize: [8, 96],
  padding: [0, 240],
  overlay: [0, 1],
  imageFocusX: [0, 1],
  imageFocusY: [0, 1],
  bgAngle: [-360, 720],
};

const COLOR_KEYS = ["bgFrom", "bgTo", "textColor", "accent"] as const;
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(rgb|hsl)a?\([\d.,%\s/deg-]+\)$/i;

/** A color the renderer can trust, or null. Bare hex digits ("ff8800") get a "#". */
export function parseColor(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (HEX.test(v)) return `#${v.replace(/^#/, "")}`;
  if (FUNCTIONAL.test(v) || /^[a-z]{3,20}$/i.test(v)) return v;
  return null;
}

/** An absolute http(s) URL, or null. Uploads (data:, blob:) can't be fetched by the server. */
export function httpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Accepts a family name ("Inter", "dm sans") or a stored value ("'Inter'"). */
export function fontFromParam(raw: string | null): string | null {
  const name = raw?.replace(/['"+]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!name) return null;
  return FONTS.find((f) => f.family.toLowerCase() === name)?.value ?? null;
}

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n));

/**
 * Builds a design from `/api/og` query parameters. Layers, later winning:
 * defaults → `template` → `d` (a share token) → individual parameters.
 */
export function stateFromParams(params: URLSearchParams): OGState {
  let state: OGState = { ...defaultState };
  const template = TEMPLATES.find((t) => t.id === params.get("template")?.trim().toLowerCase());
  if (template) state = { ...state, ...template.patch };
  const token = params.get(SHARE_PARAM);
  if (token) state = decodeShare(token, state) ?? state;
  const s: OGState = { ...state };

  for (const key of TEXT_KEYS) {
    const v = params.get(key);
    if (v !== null) s[key] = v.slice(0, TEXT_LIMITS[key]);
  }
  for (const key of TEXT_KEYS) s[key] = s[key].slice(0, TEXT_LIMITS[key]);

  const image = params.get("image");
  if (image !== null) {
    s.imageUrl = httpUrl(image);
    // Passing an image means "show it"; templates without one default to a full-bleed cover.
    if (s.imageUrl && s.imageMode === "none") s.imageMode = "cover";
  }
  const logo = params.get("logo");
  if (logo !== null) s.logoUrl = httpUrl(logo);
  s.imageUrl = httpUrl(s.imageUrl);
  s.logoUrl = httpUrl(s.logoUrl);

  const imageMode = params.get("imageMode");
  if (imageMode === "none" || imageMode === "cover" || imageMode === "side") s.imageMode = imageMode;
  const preset = params.get("preset");
  if (preset && preset in PRESETS) s.preset = preset as OGState["preset"];
  const align = params.get("align");
  if (align === "left" || align === "center") s.align = align;
  const font = fontFromParam(params.get("font"));
  if (font) s.font = font;

  const accent = parseColor(params.get("accent"));
  if (accent) s.accent = accent;
  const color = parseColor(params.get("color"));
  if (color) s.textColor = color;
  const bg = parseColor(params.get("bg"));
  const bg2 = parseColor(params.get("bg2"));
  if (bg) {
    s.bgFrom = bg;
    s.bgMode = bg2 ? "gradient" : "solid";
  }
  if (bg2) {
    s.bgTo = bg2;
    s.bgMode = "gradient";
  }

  // Tokens are untrusted: never hand the renderer a color or size it can't handle.
  for (const key of COLOR_KEYS) s[key] = parseColor(s[key]) ?? defaultState[key];
  if (!FONTS.some((f) => f.value === s.font)) s.font = defaultState.font;
  for (const [key, range] of Object.entries(NUMBER_RANGES) as [keyof OGState, [number, number]][]) {
    (s as Record<string, unknown>)[key] = clamp(s[key] as number, range);
  }
  return s;
}

/** True when `url` points at the image endpoint (on any host). */
export function isOgEndpoint(url: string): boolean {
  try {
    return new URL(url, "http://x").pathname === OG_ENDPOINT;
  } catch {
    return false;
  }
}

/**
 * An `/api/og` URL that renders `state`. The text and images stay readable query
 * parameters, so a site can swap them per page; the rest of the look rides in `d`.
 */
export function ogImageUrl(origin: string, state: OGState): { url: string; droppedUploads: boolean } {
  const imageShown = state.imageMode !== "none" && !!state.imageUrl;
  const image = imageShown ? httpUrl(state.imageUrl) : null;
  const logo = httpUrl(state.logoUrl);
  const droppedUploads = (imageShown && !image) || (!!state.logoUrl && !logo);

  const { token } = encodeShare({
    ...state,
    title: defaultState.title,
    description: defaultState.description,
    badge: defaultState.badge,
    domain: defaultState.domain,
    imageUrl: null,
    logoUrl: null,
    // Without its image the design falls back to no image at all.
    imageMode: image ? state.imageMode : "none",
  });

  const url = new URL(OG_ENDPOINT, origin);
  for (const key of TEXT_KEYS) url.searchParams.set(key, state[key]);
  if (image) url.searchParams.set("image", image);
  if (logo) url.searchParams.set("logo", logo);
  // "e30" is "{}": the design is all defaults.
  if (token !== "e30") url.searchParams.set(SHARE_PARAM, token);
  return { url: url.toString(), droppedUploads };
}
