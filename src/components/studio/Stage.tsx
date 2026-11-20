import { useEffect, useState, type CSSProperties } from "react";
import { Frame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FRAME_RATIO, PRESETS, type OGState, type Preset } from "@/lib/og-types";
import { cropLoss } from "@/lib/platforms";
import { renderOG } from "@/lib/render-og";
import { cn } from "@/lib/utils";
import { Segmented } from "./Segmented";

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "og", label: "Open Graph" },
  { value: "twitter", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "banner", label: "Banner" },
];

const MARK = "absolute bg-ink";

function CropMarks() {
  // Each corner gets one horizontal and one vertical tick, offset outside the trim edge.
  const corners = [
    { v: "top-0", h: "left-0", dx: "-", dy: "-" },
    { v: "top-0", h: "right-0", dx: "+", dy: "-" },
    { v: "bottom-0", h: "left-0", dx: "-", dy: "+" },
    { v: "bottom-0", h: "right-0", dx: "+", dy: "+" },
  ] as const;
  return (
    <>
      {corners.map((c) => (
        <span key={`${c.v}${c.h}`} aria-hidden="true">
          <span
            className={`${MARK} ${c.v} ${c.h} h-px w-4`}
            style={{ translate: `${c.dx === "-" ? "-24px" : "24px"} 0` }}
          />
          <span
            className={`${MARK} ${c.v} ${c.h} h-4 w-px`}
            style={{ translate: `0 ${c.dy === "-" ? "-24px" : "24px"}` }}
          />
        </span>
      ))}
    </>
  );
}

function Redline({ axis, value }: { axis: "x" | "y"; value: number }) {
  const horizontal = axis === "x";
  return (
    <div
      aria-hidden="true"
      className={
        horizontal
          ? "absolute inset-x-0 -bottom-10 flex h-3 items-center"
          : "absolute inset-y-0 -right-10 flex w-3 flex-col items-center"
      }
    >
      <span className={horizontal ? "h-3 w-px bg-spec" : "h-px w-3 bg-spec"} />
      <span className={horizontal ? "h-px flex-1 bg-spec" : "w-px flex-1 bg-spec"} />
      <span className="bg-stage px-1.5 py-1 text-[12px] font-medium leading-none text-spec">
        {value}
      </span>
      <span className={horizontal ? "h-px flex-1 bg-spec" : "w-px flex-1 bg-spec"} />
      <span className={horizontal ? "h-3 w-px bg-spec" : "h-px w-3 bg-spec"} />
    </div>
  );
}

function Zone({
  box,
  label,
  labelAt,
  className,
}: {
  box: CSSProperties;
  label: string;
  labelAt: "tl" | "tr" | "bl";
  className: string;
}) {
  return (
    <div className={cn("absolute", className)} style={box}>
      <span
        className={cn(
          "absolute whitespace-nowrap bg-spec px-1 py-px text-[10px] font-medium leading-tight text-white",
          labelAt === "tl" && "left-0 top-0",
          labelAt === "tr" && "right-0 top-0",
          labelAt === "bl" && "bottom-0 left-0",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Margin, the 1.91:1 crop most link cards use, and the centre square small cards use. */
function SafeZones({ state }: { state: OGState }) {
  const { w, h } = PRESETS[state.preset];
  const x = (v: number) => `${(v / w) * 100}%`;
  const y = (v: number) => `${(v / h) * 100}%`;
  const pad = state.padding;
  const crop = cropLoss(w, h, 1.91);
  const cropped = crop.x > 2 || crop.y > 2;
  const square = (w - h) / 2;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {cropped ? (
        <Zone
          label="1.91:1 crop"
          labelAt="tr"
          className="border border-spec shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          box={{ left: x(crop.x), right: x(crop.x), top: y(crop.y), bottom: y(crop.y) }}
        />
      ) : null}
      {square > 0 ? (
        <Zone
          label="Square crop"
          labelAt="bl"
          className="border border-dotted border-spec"
          box={{ left: x(square), right: x(square), top: 0, bottom: 0 }}
        />
      ) : null}
      <Zone
        label="Margin"
        labelAt="tl"
        className="border border-dashed border-spec"
        box={{ left: x(pad), right: x(pad), top: y(pad), bottom: y(pad) }}
      />
    </div>
  );
}

export function Stage({
  state,
  canvasRef,
  onPreset,
}: {
  state: OGState;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onPreset: (preset: Preset) => void;
}) {
  const { w, h } = PRESETS[state.preset];
  const [guides, setGuides] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (canvas) void renderOG(canvas, state, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [state, canvasRef]);

  return (
    <figure className="flex flex-col items-center">
      <div className="w-full px-12 pb-14 pt-8 sm:px-14">
        <div
          className="mx-auto flex items-center"
          style={{
            aspectRatio: FRAME_RATIO,
            maxWidth: `calc((100dvh - 19rem) * ${FRAME_RATIO})`,
          }}
        >
          <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
            <CropMarks />
            <canvas
              ref={canvasRef}
              className="block h-full w-full bg-paper shadow-[var(--shadow-proof)]"
              role="img"
              aria-label={`Social image preview: ${state.title}`}
            />
            {guides ? <SafeZones state={state} /> : null}
            <Redline axis="x" value={w} />
            <Redline axis="y" value={h} />
          </div>
        </div>
      </div>
      <figcaption className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Segmented
          label="Image size"
          value={state.preset}
          options={PRESET_OPTIONS}
          onChange={onPreset}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={guides}
          title="Show margins and platform crops"
          onClick={() => setGuides((g) => !g)}
          className={cn("h-8", guides && "bg-wash text-ink")}
        >
          <Frame />
          Guides
        </Button>
      </figcaption>
    </figure>
  );
}
