import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CircleCheck, Copy, Download, FileArchive, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { encodeCanvas, renderOG, saveBlob } from "@/lib/render-og";
import { PRESETS, type OGState, type Preset } from "@/lib/og-types";
import { exceededLimits, formatBytes } from "@/lib/platforms";
import { createZip } from "@/lib/zip";
import {
  FRAMEWORKS,
  PLACEMENT,
  buildSnippet,
  defaultImageUrl,
  defaultPageUrl,
  imageFileName,
  resolveTags,
  type FrameworkId,
  type SnippetOptions,
} from "@/lib/meta-snippets";
import { Segmented } from "./Segmented";

type Format = "png" | "jpeg" | "webp";

const FORMATS: { value: Format; label: string; title: string }[] = [
  { value: "png", label: "PNG", title: "Sharpest text, larger file" },
  { value: "jpeg", label: "JPG", title: "Smallest file, best for photos" },
  { value: "webp", label: "WebP", title: "Small and sharp; not every platform reads it" },
];

const fileName = imageFileName;

/**
 * Size of the file a download would produce right now. The rendered canvas is reused
 * across format/quality changes, so dragging the quality slider only re-encodes.
 */
function useEncodedSize(
  open: boolean,
  state: OGState,
  format: Format,
  quality: number | undefined,
  scale: number,
): number | null {
  const [bytes, setBytes] = useState<number | null>(null);
  const cache = useRef<{ state: OGState; scale: number; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        let canvas = cache.current?.state === state && cache.current.scale === scale
          ? cache.current.canvas
          : null;
        if (!canvas) {
          canvas = document.createElement("canvas");
          if (!(await renderOG(canvas, state, () => cancelled, { scale }))) return;
          cache.current = { state, scale, canvas };
        }
        const blob = await encodeCanvas(canvas, format, quality);
        if (!cancelled) setBytes(blob.size);
      } catch {
        if (!cancelled) setBytes(null);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, state, format, quality, scale]);

  return open ? bytes : null;
}

function SizeReadout({
  name,
  w,
  h,
  bytes,
}: {
  name: string;
  w: number;
  h: number;
  bytes: number | null;
}) {
  const over = bytes === null ? [] : exceededLimits(bytes);
  const hard = over.filter((l) => l.hard);
  const soft = over.filter((l) => !l.hard);
  return (
    <div className="bg-wash px-3 py-2.5 text-[13px]" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 truncate text-ink" title={name}>
          {name}
        </span>
        <span className="shrink-0 tabular-nums text-graphite">
          {w} × {h} ·{" "}
          <span className="text-ink">{bytes === null ? "…" : formatBytes(bytes)}</span>
        </span>
      </div>
      {bytes === null ? null : over.length === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-graphite">
          <CircleCheck className="size-3.5 text-pass" />
          Small enough for every major platform
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {hard.length ? (
            <li className="flex items-start gap-1.5 text-fail">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Over the limit for {hard.map((l) => `${l.name} (${formatBytes(l.bytes)})`).join(", ")}.
              They won't show the image.
            </li>
          ) : null}
          {soft.length ? (
            <li className="flex items-start gap-1.5 text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {soft.map((l) => l.name).join(", ")} often skip images over{" "}
              {formatBytes(soft[0]!.bytes)}. JPG or a lower quality will shrink it.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function LinkField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-graphite">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ExportDialog({ state }: { state: OGState }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState<1 | 2>(1);
  const [quality, setQuality] = useState(90);
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [exporting, setExporting] = useState<"single" | "all" | null>(null);
  const [opts, setOpts] = useState<Required<Omit<SnippetOptions, "scale">>>({
    pageUrl: "",
    imageUrl: "",
    siteName: "",
    imageAlt: "",
  });
  const setOpt = (key: keyof typeof opts) => (v: string) => setOpts((o) => ({ ...o, [key]: v }));
  const lossy = format !== "png";
  const q = lossy ? quality / 100 : undefined;
  const pixelW = Math.round(PRESETS[state.preset].w * scale);
  const pixelH = Math.round(PRESETS[state.preset].h * scale);
  const name = fileName(format, state.title);
  const bytes = useEncodedSize(open, state, format, q, scale);
  const snippet = buildSnippet(framework, state, format, { ...opts, scale });
  const resolved = resolveTags(state, format, { ...opts, scale });
  const defaultPage = defaultPageUrl(state);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const downloadOne = async () => {
    setExporting("single");
    try {
      // Render fresh so the file never captures a frame still waiting on fonts/images.
      const canvas = document.createElement("canvas");
      await renderOG(canvas, state, undefined, { scale });
      saveBlob(await encodeCanvas(canvas, format, q), name);
      toast.success(`Downloaded ${name}`);
    } catch {
      toast.error("Couldn't export the image");
    } finally {
      setExporting(null);
    }
  };

  const downloadAll = async () => {
    setExporting("all");
    try {
      const entries = [];
      for (const preset of Object.keys(PRESETS) as Preset[]) {
        const canvas = document.createElement("canvas");
        await renderOG(canvas, { ...state, preset }, undefined, { scale });
        const blob = await encodeCanvas(canvas, format, q);
        entries.push({
          name: fileName(format, state.title, `-${canvas.width}x${canvas.height}`),
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      const zipName = `${name.replace(/\.\w+$/, "")}-all-sizes.zip`;
      saveBlob(new Blob([createZip(entries)], { type: "application/zip" }), zipName);
      toast.success(`Downloaded ${zipName}`, {
        description: `${entries.length} images: ${entries.map((e) => e.name.match(/\d+x\d+/)?.[0]).join(", ")}`,
      });
    } catch {
      toast.error("Couldn't export the images");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Download />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription className="text-[14px]">
            Download the image, upload it so it's served at{" "}
            <span className="break-all text-ink">{resolved.imageUrl}</span>, then add the tags
            below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-graphite">Format</p>
              <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-graphite">Resolution</p>
              <Segmented
                label="Resolution"
                value={String(scale) as "1" | "2"}
                onChange={(v) => setScale(v === "2" ? 2 : 1)}
                options={[
                  { value: "1", label: "1×", title: "Standard size every platform expects" },
                  { value: "2", label: "2×", title: "Crisper on high-density screens; larger file" },
                ]}
              />
            </div>
            {lossy ? (
              <div className="min-w-[160px] flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="export-quality" className="text-[12px] font-medium text-graphite">
                    Quality
                  </label>
                  <span className="text-[13px] text-ink">{quality}%</span>
                </div>
                <Slider
                  id="export-quality"
                  aria-label="Quality"
                  className="h-9"
                  value={[quality]}
                  min={40}
                  max={100}
                  step={1}
                  onValueChange={(v) => setQuality(v[0] ?? quality)}
                />
              </div>
            ) : null}
          </div>

          <SizeReadout name={name} w={pixelW} h={pixelH} bytes={bytes} />

          <div className="flex flex-wrap gap-2">
            <Button disabled={exporting !== null} onClick={downloadOne}>
              {exporting === "single" ? <Loader2 className="animate-spin" /> : <Download />}
              Download {format === "jpeg" ? "JPG" : format.toUpperCase()}
            </Button>
            <Button
              variant="outline"
              disabled={exporting !== null}
              onClick={downloadAll}
              title={`Every size (${Object.values(PRESETS)
                .map((p) => `${p.w * scale}×${p.h * scale}`)
                .join(", ")}) in one ZIP`}
            >
              {exporting === "all" ? <Loader2 className="animate-spin" /> : <FileArchive />}
              All sizes (.zip)
            </Button>
          </div>
        </div>

        <div className="border-t border-hairline pt-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <LinkField
              id="export-page-url"
              label="Page URL"
              value={opts.pageUrl}
              placeholder={defaultPage}
              onChange={setOpt("pageUrl")}
            />
            <LinkField
              id="export-image-url"
              label="Image URL"
              value={opts.imageUrl}
              placeholder={defaultImageUrl(opts.pageUrl || defaultPage, format, state.title)}
              onChange={setOpt("imageUrl")}
            />
            <LinkField
              id="export-site-name"
              label="Site name"
              value={opts.siteName}
              placeholder="Optional"
              onChange={setOpt("siteName")}
            />
            <LinkField
              id="export-image-alt"
              label="Image alt text"
              value={opts.imageAlt}
              placeholder="Defaults to the title"
              onChange={setOpt("imageAlt")}
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-[200px] space-y-1.5">
              <label htmlFor="framework" className="text-[12px] font-medium text-graphite">
                Meta tags for
              </label>
              <Select value={framework} onValueChange={(v) => setFramework(v as FrameworkId)}>
                <SelectTrigger id="framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAMEWORKS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(snippet);
                setCopied(true);
                clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="text-pass" /> : <Copy />}
              <span aria-live="polite">{copied ? "Copied" : "Copy meta tags"}</span>
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-graphite">{PLACEMENT[framework]}</p>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-wash p-4 font-mono text-[12px] leading-relaxed text-ink">
            {snippet}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
