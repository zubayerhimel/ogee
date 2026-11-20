import { useCallback, useEffect, useRef, useState } from "react";
import { decodeShare, sanitizeState, SHARE_PARAM } from "./design-codec";
import { loadDesign, saveDesign } from "./design-store";
import { defaultState, type OGState } from "./og-types";

export { decodeShare, encodeShare, sanitizeState, shareUrl } from "./design-codec";

const HISTORY_LIMIT = 100;
/** Edits to the same fields closer together than this collapse into one undo step. */
const COALESCE_MS = 600;

function readHash(): OGState | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get(SHARE_PARAM);
  return token ? decodeShare(token) : null;
}

async function readStorage(): Promise<OGState | null> {
  try {
    const saved = await loadDesign();
    return saved ? sanitizeState(saved) : null;
  } catch {
    return null;
  }
}

type History = { past: OGState[]; present: OGState; future: OGState[] };

/**
 * Design state with undo/redo, saved to IndexedDB and loadable from a `#d=` share link.
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
  /** Whether the user changed anything since the saved design started loading. */
  const edited = useRef(false);
  // State, not a ref: it must flip in the same render as the restored design, or a save
  // scheduled with the defaults could land first and overwrite what was stored.
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState<"link" | "storage" | null>(null);

  const commit = useCallback((next: (s: OGState) => OGState, coalesceKey?: string) => {
    const now = Date.now();
    edited.current = true;
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
    edited.current = true;
    setHistory((h) => {
      const prev = h.past.at(-1);
      if (!prev) return h;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    edited.current = true;
    setHistory((h) => {
      const [next, ...future] = h.future;
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLink = () => {
      const linked = readHash();
      if (!linked) return false;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return linked;
    };
    const restore = (initial: OGState | null, from: "link" | "storage") => {
      if (initial) setHistory({ past: [], present: initial, future: [] });
      setRestored(initial ? from : null);
      setReady(true);
    };

    const linked = loadLink();
    if (linked) restore(linked, "link");
    else {
      edited.current = false;
      void readStorage().then((saved) => {
        if (cancelled) return;
        // Someone already started editing while it loaded: keep their work.
        restore(edited.current ? null : saved, "storage");
      });
    }

    const onHash = () => {
      const s = loadLink();
      if (s) {
        commit(() => s);
        setRestored("link");
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
    };
  }, [commit]);

  const { present } = history;
  const pending = useRef<OGState | null>(null);
  useEffect(() => {
    if (!ready) return;
    pending.current = present;
    const t = setTimeout(() => {
      pending.current = null;
      // Storage disabled (private mode) or full: keep working unsaved.
      saveDesign(present).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [present, ready]);

  // Write any edit still inside the debounce window when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      saveDesign(pending.current).catch(() => {});
      pending.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
