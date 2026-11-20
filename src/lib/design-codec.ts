import { defaultState, PRESETS, type OGState } from "./og-types";

export const SHARE_PARAM = "d";

const ENUMS: Partial<Record<keyof OGState, readonly string[]>> = {
  preset: Object.keys(PRESETS),
  imageMode: ["none", "cover", "side"],
  bgMode: ["solid", "gradient"],
  align: ["left", "center"],
};
const NULLABLE = new Set<keyof OGState>(["logoUrl", "imageUrl"]);

/**
 * Merges untrusted input (storage, links) over `base` (the defaults unless given),
 * keeping only well-typed fields.
 */
export function sanitizeState(raw: unknown, base: OGState = defaultState): OGState {
  const out: Record<string, unknown> = { ...base };
  if (!raw || typeof raw !== "object") return base;
  for (const [key, value] of Object.entries(raw)) {
    const k = key as keyof OGState;
    if (!(k in defaultState)) continue;
    const allowed = ENUMS[k];
    if (allowed) {
      if (typeof value === "string" && allowed.includes(value)) out[k] = value;
    } else if (NULLABLE.has(k)) {
      if (value === null || typeof value === "string") out[k] = value || null;
    } else if (typeof value === typeof defaultState[k]) {
      if (typeof value !== "number" || Number.isFinite(value)) out[k] = value;
    }
  }
  return out as OGState;
}

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Encodes only the fields that differ from the defaults. Uploaded images (data URLs)
 * are far too large for a link, so they're dropped and reported.
 */
export function encodeShare(state: OGState): { token: string; droppedUploads: boolean } {
  const diff: Record<string, unknown> = {};
  let droppedUploads = false;
  for (const k of Object.keys(state) as (keyof OGState)[]) {
    let v = state[k];
    if (typeof v === "string" && v.startsWith("data:")) {
      droppedUploads = true;
      v = null as never;
    }
    if (v !== defaultState[k]) diff[k] = v;
  }
  return { token: toBase64Url(JSON.stringify(diff)), droppedUploads };
}

export function decodeShare(token: string, base: OGState = defaultState): OGState | null {
  try {
    return sanitizeState(JSON.parse(fromBase64Url(token)), base);
  } catch {
    return null;
  }
}

export function shareUrl(state: OGState, base: string) {
  const { token, droppedUploads } = encodeShare(state);
  const url = new URL(base);
  url.hash = `${SHARE_PARAM}=${token}`;
  return { url: url.toString(), droppedUploads };
}
