import { useEffect } from "react";
import { FRAME_RATIO, PRESETS, type OGState, type Preset } from "@/lib/og-types";
import { renderOG } from "@/lib/render-og";
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
      <span className="condensed bg-stage px-1.5 py-1 text-[12px] font-medium leading-none text-spec">
        {value}
      </span>
      <span className={horizontal ? "h-px flex-1 bg-spec" : "w-px flex-1 bg-spec"} />
      <span className={horizontal ? "h-3 w-px bg-spec" : "h-px w-3 bg-spec"} />
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
      </figcaption>
    </figure>
  );
}
