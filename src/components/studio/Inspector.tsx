import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ImageUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CONTRAST_MIN, measureContrast, type ContrastResult } from "@/lib/contrast";
import { readImageFile } from "@/lib/image-file";
import {
  FONT_CATEGORIES,
  FONTS,
  fontWeights,
  nearestWeight,
  PRESETS,
  type OGState,
} from "@/lib/og-types";
import { ensureFontCss, imageSrc } from "@/lib/render-og";
import { cn } from "@/lib/utils";
import { Segmented } from "./Segmented";

type Update = (patch: Partial<OGState>) => void;

function useContrast(state: OGState): ContrastResult | null {
  const [result, setResult] = useState<ContrastResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void measureContrast(state, () => cancelled).then((r) => {
        if (!cancelled) setResult(r);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [state]);
  return result;
}

function ContrastReadout({ state }: { state: OGState }) {
  const result = useContrast(state);
  const rows = (
    [
      { key: "title", label: "Title", ratio: result?.title ?? null },
      { key: "description", label: "Description", ratio: result?.description ?? null },
    ] as const
  ).filter((r) => r.ratio !== null);
  if (!rows.length) return null;
  const low = rows.some((r) => (r.ratio ?? 0) < CONTRAST_MIN[r.key]);

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-graphite">Text contrast</p>
      <ul className="space-y-1" aria-live="polite">
        {rows.map((r) => {
          const ratio = r.ratio ?? 0;
          const min = CONTRAST_MIN[r.key];
          // AAA asks for 1.5× the AA ratio at both sizes (4.5 large, 7 body).
          const grade = ratio >= min * 1.5 ? "AAA" : ratio >= min ? "AA" : "Low";
          return (
            <li key={r.key} className="flex items-center justify-between text-[13px]">
              <span>{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{ratio.toFixed(1)}:1</span>
                <span
                  className={cn(
                    "w-10 py-0.5 text-center text-[11px] font-semibold",
                    grade === "Low" ? "bg-fail/10 text-fail" : "bg-pass/10 text-pass",
                  )}
                >
                  {grade}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {low ? (
        <p className="text-[12px] text-graphite">
          Hard to read once shrunk in a feed.{" "}
          {state.imageMode === "cover" && state.imageUrl
            ? "Darken the image more, or change the text colour."
            : "Pick a text colour further from the background."}
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-hairline px-5 py-6 last:border-b-0 lg:px-6">
      <h2 className="mb-4 text-[14px] font-semibold leading-none">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  value,
}: {
  label: string;
  children: (id: string) => ReactNode;
  value?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[12px] font-medium text-graphite">
          {label}
        </label>
        {value !== undefined ? (
          <span className="text-[13px] text-ink">{value}</span>
        ) : null}
      </div>
      {children(id)}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} value={`${value}${suffix}`}>
      {(id) => (
        <Slider
          id={id}
          aria-label={label}
          className="h-5"
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0] ?? value)}
        />
      )}
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex h-9 items-center gap-2 rounded-md bg-wash pl-1.5 pr-1 transition-colors focus-within:bg-paper focus-within:ring-1 focus-within:ring-ink">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} colour picker`}
            className="h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-none border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-none [&::-moz-color-swatch]:border-black/15 [&::-webkit-color-swatch]:rounded-none [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-black/15 [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="w-full min-w-0 bg-transparent text-[13px] uppercase outline-none focus-visible:outline-none"
          />
        </div>
      )}
    </Field>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-[14px]">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ImageSource({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (v: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploaded = value?.startsWith("data:") ?? false;

  const onFile = (file?: File) => {
    if (!file) return;
    readImageFile(file)
      .then(onChange)
      .catch(() => toast.error("Couldn't read that image"));
  };

  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <Input
            id={id}
            placeholder={uploaded ? "Using uploaded file" : placeholder}
            value={uploaded ? "" : (value ?? "")}
            onChange={(e) => onChange(e.target.value || null)}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 px-3"
            onClick={() => fileRef.current?.click()}
          >
            <ImageUp />
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      )}
    </Field>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Click or drag on the thumbnail to choose what stays in view when a background image
 * is cropped. The lit rectangle is the part of the image that makes it into the card.
 */
function FocalPoint({ state, update }: { state: OGState; update: Update }) {
  const src = state.imageUrl ? imageSrc(state.imageUrl) : null;
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const fx = state.imageFocusX;
  const fy = state.imageFocusY;

  const size = natural && natural.src === src ? natural : null;
  const frame = PRESETS[state.preset];
  const scale = size ? Math.max(frame.w / size.w, frame.h / size.h) : 1;
  const visW = size ? Math.min(1, frame.w / scale / size.w) : 1;
  const visH = size ? Math.min(1, frame.h / scale / size.h) : 1;
  // Nothing to choose when the image already has the card's exact shape.
  const croppable = visW < 0.995 || visH < 0.995;

  const setFrom = (e: React.PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    update({
      imageFocusX: round2(clamp01((e.clientX - rect.left) / rect.width)),
      imageFocusY: round2(clamp01((e.clientY - rect.top) / rect.height)),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    update({ imageFocusX: round2(clamp01(fx + move[0])), imageFocusY: round2(clamp01(fy + move[1])) });
  };

  if (!src || broken === src) return null;
  const centred = fx === 0.5 && fy === 0.5;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-graphite">Focal point</span>
        {croppable && !centred ? (
          <button
            type="button"
            className="text-[12px] text-graphite underline-offset-2 hover:text-ink hover:underline"
            onClick={() => update({ imageFocusX: 0.5, imageFocusY: 0.5 })}
          >
            Centre
          </button>
        ) : null}
      </div>
      <div className="flex justify-center bg-wash p-2">
        <div
          ref={boxRef}
          role="group"
          tabIndex={croppable ? 0 : -1}
          aria-label={`Focal point, ${Math.round(fx * 100)}% across, ${Math.round(fy * 100)}% down`}
          aria-describedby={hintId}
          onKeyDown={croppable ? onKeyDown : undefined}
          onPointerDown={(e) => {
            if (!croppable || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setFrom(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e);
          }}
          className={cn(
            "relative max-w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-wash",
            croppable && "cursor-crosshair",
          )}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            onError={() => setBroken(src)}
            onLoad={(e) =>
              setNatural({
                src,
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="block h-auto max-h-40 w-auto max-w-full"
          />
          {size && croppable ? (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute outline outline-1 outline-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                style={{
                  left: `${(1 - visW) * fx * 100}%`,
                  top: `${(1 - visH) * fy * 100}%`,
                  width: `${visW * 100}%`,
                  height: `${visH * 100}%`,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
              />
            </>
          ) : null}
        </div>
      </div>
      <p id={hintId} className="text-[12px] text-graphite">
        {!size
          ? "Loading image…"
          : croppable
            ? "Click or drag to choose what stays in frame. Arrow keys nudge it."
            : "This image already matches the card's shape, so nothing is cropped."}
      </p>
    </div>
  );
}

export function Inspector({ state, update }: { state: OGState; update: Update }) {
  return (
    <div>
      <Section title="Text">
        <Field label="Title">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={state.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          )}
        </Field>
        <Field label="Description">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={state.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label above title">
            {(id) => (
              <Input
                id={id}
                value={state.badge}
                onChange={(e) => update({ badge: e.target.value })}
              />
            )}
          </Field>
          <Field label="Domain">
            {(id) => (
              <Input
                id={id}
                value={state.domain}
                onChange={(e) => update({ domain: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Type">
        <Field label="Typeface">
          {(id) => (
            <Select
              value={state.font}
              onValueChange={(v) => update({ font: v })}
              onOpenChange={(open) => {
                // Load every family so each name previews in its own typeface.
                if (open) for (const f of FONTS) void ensureFontCss(f.value);
              }}
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))]">
                {FONT_CATEGORIES.map((category) => (
                  <SelectGroup key={category}>
                    <SelectLabel className="pt-3 text-[12px] font-medium text-graphite first:pt-1.5">
                      {category}
                    </SelectLabel>
                    {FONTS.filter((f) => f.category === category).map((f) => (
                      <SelectItem
                        key={f.value}
                        value={f.value}
                        className="text-[15px]"
                        style={{ fontFamily: `${f.value}, sans-serif` }}
                      >
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <SliderField
          label="Title size"
          value={state.titleSize}
          min={36}
          max={110}
          suffix=" px"
          onChange={(v) => update({ titleSize: v })}
        />
        {fontWeights(state.font).length > 1 ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12px] font-medium text-graphite">Title weight</span>
            <Segmented
              label="Title weight"
              value={String(nearestWeight(state.font, state.titleWeight))}
              onChange={(v) => update({ titleWeight: Number(v) })}
              options={fontWeights(state.font).map((w) => ({ value: String(w), label: String(w) }))}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <SliderField
            label="Letter spacing"
            value={Math.round(state.titleTracking * 1000) / 10}
            min={-6}
            max={20}
            step={0.5}
            suffix="%"
            onChange={(v) => update({ titleTracking: Math.round(v * 10) / 1000 })}
          />
          <SliderField
            label="Line height"
            value={state.titleLineHeight}
            min={0.9}
            max={1.6}
            step={0.02}
            onChange={(v) => update({ titleLineHeight: Math.round(v * 100) / 100 })}
          />
        </div>
        <SliderField
          label="Description size"
          value={state.descSize}
          min={16}
          max={48}
          suffix=" px"
          onChange={(v) => update({ descSize: v })}
        />
      </Section>

      <Section title="Colour">
        <Segmented
          label="Background fill"
          className="flex w-full"
          value={state.bgMode}
          onChange={(v) => update({ bgMode: v })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          {state.bgMode === "solid" ? (
            <div className="col-span-2">
              <ColorField
                label="Background"
                value={state.bgFrom}
                onChange={(v) => update({ bgFrom: v })}
              />
            </div>
          ) : (
            <>
              <ColorField
                label="Background start"
                value={state.bgFrom}
                onChange={(v) => update({ bgFrom: v })}
              />
              <ColorField
                label="Background end"
                value={state.bgTo}
                onChange={(v) => update({ bgTo: v })}
              />
            </>
          )}
          <ColorField
            label="Text"
            value={state.textColor}
            onChange={(v) => update({ textColor: v })}
          />
          <ColorField label="Accent" value={state.accent} onChange={(v) => update({ accent: v })} />
        </div>
        {state.bgMode === "gradient" ? (
          <SliderField
            label="Gradient angle"
            value={state.bgAngle}
            min={0}
            max={360}
            suffix="°"
            onChange={(v) => update({ bgAngle: v })}
          />
        ) : null}
        <ContrastReadout state={state} />
      </Section>

      <Section title="Layout">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px]">Alignment</span>
          <Segmented
            label="Alignment"
            value={state.align}
            onChange={(v) => update({ align: v })}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Centred" },
            ]}
          />
        </div>
        <SliderField
          label="Margin"
          value={state.padding}
          min={40}
          max={140}
          suffix=" px"
          onChange={(v) => update({ padding: v })}
        />
        <ToggleRow
          label="Accent bar"
          checked={state.showAccentBar}
          onChange={(v) => update({ showAccentBar: v })}
        />
        <ToggleRow
          label="Film grain"
          checked={state.showGrain}
          onChange={(v) => update({ showGrain: v })}
        />
      </Section>

      <Section title="Images">
        <Segmented
          label="Image placement"
          className="flex w-full"
          value={state.imageMode}
          onChange={(v) => update({ imageMode: v })}
          options={[
            { value: "none", label: "No image" },
            { value: "cover", label: "Background" },
            { value: "side", label: "Side panel" },
          ]}
        />
        <ImageSource
          label="Image"
          placeholder="https://…/photo.jpg"
          value={state.imageUrl}
          onChange={(v) =>
            update({
              imageUrl: v,
              imageFocusX: 0.5,
              imageFocusY: 0.5,
              ...(v && state.imageMode === "none" ? { imageMode: "cover" as const } : {}),
            })
          }
        />
        {state.imageMode === "cover" ? (
          <>
            {state.imageUrl ? <FocalPoint state={state} update={update} /> : null}
            <SliderField
              label="Darken image"
              value={Math.round(state.overlay * 100)}
              min={0}
              max={90}
              suffix="%"
              onChange={(v) => update({ overlay: v / 100 })}
            />
          </>
        ) : null}
        <ImageSource
          label="Logo"
          placeholder="https://…/logo.png"
          value={state.logoUrl}
          onChange={(v) => update({ logoUrl: v })}
        />
        {state.imageUrl || state.logoUrl ? (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3"
            onClick={() => update({ imageUrl: null, logoUrl: null, imageMode: "none" })}
          >
            Remove image and logo
          </Button>
        ) : null}
      </Section>
    </div>
  );
}
