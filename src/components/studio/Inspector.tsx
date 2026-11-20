import { useId, useRef, type ReactNode } from "react";
import { ImageUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FONTS, type OGState } from "@/lib/og-types";
import { Segmented } from "./Segmented";

type Update = (patch: Partial<OGState>) => void;

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
          <span className="condensed text-[13px] text-ink">{value}</span>
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
            className="condensed w-full min-w-0 bg-transparent text-[13px] uppercase outline-none focus-visible:outline-none"
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
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
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
            <Select value={state.font} onValueChange={(v) => update({ font: v })}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </SelectItem>
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
        <div className="grid grid-cols-2 gap-3">
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
          <ColorField
            label="Text"
            value={state.textColor}
            onChange={(v) => update({ textColor: v })}
          />
          <ColorField
            label="Accent"
            value={state.accent}
            onChange={(v) => update({ accent: v })}
          />
        </div>
        <SliderField
          label="Gradient angle"
          value={state.bgAngle}
          min={0}
          max={360}
          suffix="°"
          onChange={(v) => update({ bgAngle: v })}
        />
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
              ...(v && state.imageMode === "none" ? { imageMode: "cover" as const } : {}),
            })
          }
        />
        {state.imageMode === "cover" ? (
          <SliderField
            label="Darken image"
            value={Math.round(state.overlay * 100)}
            min={0}
            max={90}
            suffix="%"
            onChange={(v) => update({ overlay: v / 100 })}
          />
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
