import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FRAME_RATIO, PRESETS, TEMPLATES, type OGState, type Template } from "@/lib/og-types";
import { renderOG } from "@/lib/render-og";
import { cn } from "@/lib/utils";

function isApplied(state: OGState, template: Template): boolean {
  return Object.entries(template.patch).every(
    ([key, value]) => state[key as keyof OGState] === value,
  );
}

function TemplateThumb({
  state,
  template,
  active,
  onApply,
}: {
  state: OGState;
  template: Template;
  active: boolean;
  onApply: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = PRESETS[state.preset];

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (canvas) void renderOG(canvas, { ...state, ...template.patch }, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [state, template]);

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onApply}
      className="group w-[152px] shrink-0 text-left sm:w-[176px]"
    >
      <span className="flex items-end" style={{ aspectRatio: FRAME_RATIO }}>
        <span
          className={cn(
            "block w-full overflow-hidden outline outline-1 -outline-offset-1 outline-black/10 transition-[outline-color,outline-offset]",
            "group-hover:outline-black/40",
            active && "outline-2 outline-offset-2 outline-ink group-hover:outline-ink",
          )}
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
        </span>
      </span>
      <span
        className={cn(
          "mt-2 block text-[13px] text-graphite group-hover:text-ink",
          active && "font-medium text-ink",
        )}
      >
        {template.name}
      </span>
    </button>
  );
}

const DRAG_THRESHOLD = 5;
const FLICK_VELOCITY = 0.3; // px/ms
const WHEEL_COOLDOWN = 450;
const FADE = "48px";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Metrics = { step: number; perPage: number; maxOffset: number };

/**
 * Paged slider: the track moves with a transform, so there is no scroll container
 * (and no scrollbar). Pages are as many whole thumbnails as fit in the viewport.
 */
function useSlider(count: number) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ step: 0, perPage: count, maxOffset: 0 });
  const [page, setPage] = useState(0);
  const suppressClick = useRef(false);

  const pages = metrics.maxOffset > 0 ? Math.ceil(count / metrics.perPage) : 1;
  const current = Math.min(page, pages - 1);
  const offsetFor = (p: number) => Math.min(p * metrics.perPage * metrics.step, metrics.maxOffset);
  const offset = offsetFor(current);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first.offsetWidth + gap;
    const width = track.clientWidth;
    setMetrics({
      step,
      perPage: Math.max(1, Math.floor((width + gap) / step)),
      maxOffset: Math.max(0, track.scrollWidth - width),
    });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  const go = useCallback(
    (p: number) => setPage(Math.max(0, Math.min(pages - 1, p))),
    [pages],
  );

  const transition = (on: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition =
      on && !prefersReducedMotion() ? "transform 420ms var(--ease-out)" : "none";
  };

  // Trackpad swipes turn a page instead of scrolling pixel by pixel.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || pages < 2) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (Math.abs(e.deltaX) < 12 || now - last < WHEEL_COOLDOWN) return;
      last = now;
      transition(true);
      setPage((p) => Math.max(0, Math.min(pages - 1, p + Math.sign(e.deltaX))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pages]);

  const goTo = (p: number) => {
    transition(true);
    go(p);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || pages < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startT = performance.now();
    let dragging = false;
    let dx = 0;

    const move = (ev: PointerEvent) => {
      dx = ev.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        // Mostly vertical: let the page scroll.
        if (Math.abs(ev.clientY - startY) > Math.abs(dx)) return cleanup();
        dragging = true;
        track.setPointerCapture(ev.pointerId);
        track.dataset["dragging"] = "";
        transition(false);
      }
      let x = offset - dx;
      // Rubber-band past either end instead of a hard stop.
      if (x < 0) x = x / 3;
      else if (x > metrics.maxOffset) x = metrics.maxOffset + (x - metrics.maxOffset) / 3;
      track.style.transform = `translate3d(${-x}px,0,0)`;
    };

    const up = () => {
      cleanup();
      if (!dragging) return;
      suppressClick.current = true;
      delete track.dataset["dragging"];
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - startT);
      const far = Math.abs(dx) > metrics.step / 2;
      const dir = far || velocity > FLICK_VELOCITY ? -Math.sign(dx) : 0;
      transition(true);
      track.style.transform = `translate3d(${-offsetFor(Math.max(0, Math.min(pages - 1, current + dir)))}px,0,0)`;
      go(current + dir);
    };

    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // A drag that ends over a thumbnail must not also apply it.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Tabbing to an off-page thumbnail brings its page into view.
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const index = [...track.children].findIndex((c) => c.contains(e.target));
    if (index < 0) return;
    const p = Math.floor(index / metrics.perPage);
    if (p !== current) goTo(p);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") goTo(current + 1);
    else if (e.key === "ArrowLeft") goTo(current - 1);
    else return;
    e.preventDefault();
  };

  return {
    viewportRef,
    trackRef,
    offset,
    page: current,
    pages,
    goTo,
    onPointerDown,
    onClickCapture,
    onFocus,
    onKeyDown,
  };
}

export function TemplateStrip({
  state,
  update,
}: {
  state: OGState;
  update: (patch: Partial<OGState>) => void;
}) {
  const listId = useId();
  const slider = useSlider(TEMPLATES.length);
  const { page, pages, goTo } = slider;
  const atStart = page === 0;
  const atEnd = page >= pages - 1;
  const paged = pages > 1;
  const mask = `linear-gradient(to right, ${atStart ? "#000" : "transparent"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${atEnd ? "#000" : "transparent"})`;

  return (
    <section aria-labelledby="templates-heading" aria-roledescription="carousel" className="w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 id="templates-heading" className="text-[14px] font-semibold">
            Templates
          </h2>
          <p className="hidden truncate text-[13px] text-graphite sm:block">
            Rendered with your content. Click to apply.
          </p>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5", !paged && "invisible")}>
          <span className="mr-2 font-mono text-[12px] tabular-nums text-graphite" aria-live="polite">
            {page + 1} / {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous templates"
            aria-controls={listId}
            disabled={atStart}
            onClick={() => goTo(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next templates"
            aria-controls={listId}
            disabled={atEnd}
            onClick={() => goTo(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={slider.viewportRef}
        className="-mx-5 mt-3 overflow-clip px-5 lg:-mx-12 lg:px-12"
        style={paged ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        onKeyDown={slider.onKeyDown}
      >
        <div
          id={listId}
          ref={slider.trackRef}
          onPointerDown={slider.onPointerDown}
          onClickCapture={slider.onClickCapture}
          onFocus={slider.onFocus}
          className="flex gap-4 py-1 select-none touch-pan-y will-change-transform data-[dragging]:cursor-grabbing data-[dragging]:[&_*]:cursor-grabbing"
          style={{ transform: `translate3d(${-slider.offset}px,0,0)` }}
        >
          {TEMPLATES.map((t) => (
            <TemplateThumb
              key={t.id}
              state={state}
              template={t}
              active={isApplied(state, t)}
              onApply={() => update(t.patch)}
            />
          ))}
        </div>
      </div>
      {paged && (
        <div className="mt-2 flex justify-center">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Templates page ${i + 1}`}
              aria-current={i === page ? "true" : undefined}
              onClick={() => goTo(i)}
              className="group grid h-6 w-6 place-items-center"
            >
              <span
                className={cn(
                  "block h-1.5 w-1.5 bg-hairline-strong transition-colors group-hover:bg-graphite",
                  i === page && "bg-ink group-hover:bg-ink",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}