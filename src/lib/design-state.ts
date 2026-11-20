import { useCallback, useEffect, useRef, useState } from "react";
import { defaultState, PRESETS, type OGState } from "./og-types";

const STORAGE_KEY = "ogee:design";
const SHARE_PARAM = "d";
const HISTORY_LIMIT = 100;
/** Edits to the same fields closer together than this collapse into one undo step. */
const COALESCE_MS = 600;

const ENUMS: Partial<Record<keyof OGState, readonly string[]>> = {
  preset: Object.keys(PRESETS),
  imageMode: ["none", "cover", "side"],
  bgMode: ["solid", "gradient"],
  align: ["left", "center"],
};
const NULLABLE = new Set<keyof OGState>(["logoUrl", "imageUrl"]);

/** Merges untrusted input (storage, links) over the defaults, keeping only well-typed fields. */
export function sanitizeState(raw: unknown): OGState {
  const out: Record<string, unknown> = { ...defaultState };
  if (!raw || typeof raw !== "object") return defaultState;
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

export function decodeShare(token: string): OGState | null {
  try {
    return sanitizeState(JSON.parse(fromBase64Url(token)));
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

function readHash(): OGState | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get(SHARE_PARAM);
  return token ? decodeShare(token) : null;
}

function readStorage(): OGState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

type History = { past: OGState[]; present: OGState; future: OGState[] };

/**
 * Design state with undo/redo, saved to localStorage and loadable from a `#d=` share link.
 * A link wins over the saved design, and is then removed from the address bar so later
 * edits don't sit under a stale URL.
 */
export function useDesign() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: defaultState,
    future: [],
  });
  const last = useRef<{ key: string; at: number } | null>(null);
  // State, not a ref: it must flip in the same render as the restored design, or a save
  // scheduled with the defaults could land first and overwrite what was stored.
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState<"link" | "storage" | null>(null);

  const commit = useCallback((next: (s: OGState) => OGState, coalesceKey?: string) => {
    const now = Date.now();
    const merge =
      coalesceKey !== undefined &&
      last.current?.key === coalesceKey &&
      now - last.current.at < COALESCE_MS;
    last.current = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
    setHistory((h) => {
      const present = next(h.present);
      if (present === h.present) return h;
      return merge
        ? { ...h, present, future: [] }
        : { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
    });
  }, []);

  /** Field edits; rapid changes to the same fields (typing, slider drags) form one step. */
  const update = useCallback(
    (patch: Partial<OGState>) =>
      commit((s) => ({ ...s, ...patch }), Object.keys(patch).sort().join()),
    [commit],
  );
  /** A discrete change that always gets its own undo step. */
  const apply = useCallback((fn: (s: OGState) => OGState) => commit(fn), [commit]);

  const undo = useCallback(() => {
    last.current = null;
    setHistory((h) => {
      const prev = h.past.at(-1);
      if (!prev) return h;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setHistory((h) => {
      const [next, ...future] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future };
    });
  }, []);

  useEffect(() => {
    const loadLink = () => {
      const linked = readHash();
      if (!linked) return false;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return linked;
    };
    const linked = loadLink();
    const initial = linked || readStorage();
    if (initial) setHistory({ past: [], present: initial, future: [] });
    setRestored(linked ? "link" : initial ? "storage" : null);
    setReady(true);

    const onHash = () => {
      const s = loadLink();
      if (s) {
        commit(() => s);
        setRestored("link");
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [commit]);

  const { present } = history;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(present));
      } catch {
        // Quota exceeded (large uploads) or storage disabled: keep working unsaved.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [present, ready]);

  return {
    state: present,
    update,
    apply,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    restored,
  };
}
