import { useEffect, useRef } from "react";
import { PRESETS, TEMPLATES, type OGState, type Template } from "@/lib/og-types";
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
      <span
        className={cn(
          "block overflow-hidden outline outline-1 -outline-offset-1 outline-black/10 transition-[outline-color,outline-offset]",
          "group-hover:outline-black/40",
          active && "outline-2 outline-offset-2 outline-ink group-hover:outline-ink",
        )}
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
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

export function TemplateStrip({
  state,
  update,
}: {
  state: OGState;
  update: (patch: Partial<OGState>) => void;
}) {
  return (
    <section aria-labelledby="templates-heading" className="w-full">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="templates-heading" className="text-[14px] font-semibold">
          Templates
        </h2>
        <p className="text-[13px] text-graphite">Rendered with your content. Click to apply.</p>
      </div>
      <div className="-mx-5 mt-3 flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 pt-1 lg:-mx-12 lg:scroll-px-12 lg:px-12">
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
    </section>
  );
}
