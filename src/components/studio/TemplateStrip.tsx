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
      className="group w-[152px] shrink-0 snap-start text-left sm:w-[176px]"
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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Native scroll (so touch and trackpads feel right) with page buttons, mouse drag,
 * edge fades and a position indicator layered on top.
 */
function useCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const suppressClick = useRef(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const visible = el.scrollWidth ? el.clientWidth / el.scrollWidth : 1;
    const progress = max > 0 ? el.scrollLeft / max : 0;
    // Written straight to the element: scroll fires every frame, React needn't re-render.
    const thumb = thumbRef.current;
    if (thumb) {
      thumb.style.width = `${visible * 100}%`;
      thumb.style.transform = `translateX(${progress * (1 / visible - 1) * 100}%)`;
    }
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft >= max - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", sync);
    };
  }, [sync]);

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const pad = Number.parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    el.scrollBy({
      left: dir * (el.clientWidth - pad * 2),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  // Mouse-only drag; touch and pen already scroll natively.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    let dragging = false;
    let lastX = startX;
    let lastT = performance.now();
    let velocity = 0;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        el.setPointerCapture(ev.pointerId);
        el.style.scrollSnapType = "none";
        el.dataset["dragging"] = "";
      }
      const now = performance.now();
      velocity = (ev.clientX - lastX) / Math.max(1, now - lastT);
      lastX = ev.clientX;
      lastT = now;
      el.scrollLeft = startLeft - dx;
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) return;
      suppressClick.current = true;
      delete el.dataset["dragging"];
      // Carry a flick's momentum, then settle on the nearest template.
      const projected = el.scrollLeft - velocity * 180;
      const pad = Number.parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
      const items = [...el.children] as HTMLElement[];
      const target = items.reduce(
        (best, item) => {
          const left = item.offsetLeft - pad;
          return Math.abs(left - projected) < Math.abs(best - projected) ? left : best;
        },
        0,
      );
      const restoreSnap = () => {
        el.style.scrollSnapType = "";
      };
      el.addEventListener("scrollend", restoreSnap, { once: true });
      setTimeout(restoreSnap, 600);
      el.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };

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

  return { scrollerRef, thumbRef, edges, page, onPointerDown, onClickCapture };
}

const FADE = "48px";

export function TemplateStrip({
  state,
  update,
}: {
  state: OGState;
  update: (patch: Partial<OGState>) => void;
}) {
  const listId = useId();
  const { scrollerRef, thumbRef, edges, page, onPointerDown, onClickCapture } = useCarousel();
  const scrollable = !(edges.start && edges.end);
  const mask = `linear-gradient(to right, ${edges.start ? "#000" : "transparent"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.end ? "#000" : "transparent"})`;

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
        <div className={cn("flex shrink-0 gap-1.5", !scrollable && "invisible")}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous templates"
            aria-controls={listId}
            disabled={edges.start}
            onClick={() => page(-1)}
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
            disabled={edges.end}
            onClick={() => page(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        id={listId}
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        className="-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-1 pt-1 select-none [scrollbar-width:none] data-[dragging]:cursor-grabbing data-[dragging]:[&_*]:cursor-grabbing lg:-mx-12 lg:scroll-px-12 lg:px-12 [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
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
      <div
        aria-hidden="true"
        className={cn("relative mt-3 h-px overflow-hidden bg-hairline", !scrollable && "invisible")}
      >
        <span ref={thumbRef} className="absolute inset-y-0 left-0 bg-ink" />
      </div>
    </section>
  );
}
