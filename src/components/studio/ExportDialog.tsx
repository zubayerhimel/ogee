import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  Loader2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  FRAMEWORKS,
  PLACEMENT,
  buildSnippet,
  defaultImageUrl,
  defaultPageUrl,
  imageFileName,
  type FrameworkId,
  type SnippetOptions,
} from "@/lib/meta-snippets";
import { Segmented } from "./Segmented";
import { isOgEndpoint, ogImageUrl } from "@/lib/og-url";

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

function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  return [copied, copy] as const;
}

type Tab = "download" | "link" | "tags";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "download", label: "Download", hint: "Save the image, then upload it with your site." },
  {
    id: "link",
    label: "Image link",
    hint: "A URL that renders this design whenever it's loaded.",
  },
  { id: "tags", label: "Meta tags", hint: "Paste these into your page so platforms find the image." },
];

function TabBar({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label="Export options" className="flex gap-5 border-b border-hairline px-6">
      {TABS.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`export-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`export-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = (i + step + TABS.length) % TABS.length;
              onChange(TABS[next]!.id);
              refs.current[next]?.focus();
            }}
            className={cn(
              "-mb-px cursor-pointer border-b-2 pb-2.5 pt-1 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-ink text-ink" : "border-transparent text-graphite hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-graphite">{label}</p>
      {children}
    </div>
  );
}

export function ExportDialog({ state }: { state: OGState }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("download");
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState<1 | 2>(1);
  const [quality, setQuality] = useState(90);
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [imageSource, setImageSource] = useState<"file" | "link">("file");
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
  const bytes = useEncodedSize(open && tab === "download", state, format, q, scale);
  const dynamic = open ? ogImageUrl(window.location.origin, state) : null;

  const tagImageUrl = imageSource === "link" && dynamic ? dynamic.url : opts.imageUrl;
  // The endpoint always serves a 1× PNG, whatever the download settings are.
  const tagsFromEndpoint = isOgEndpoint(tagImageUrl);
  const tagFormat = tagsFromEndpoint ? "png" : format;
  const tagOpts = { ...opts, imageUrl: tagImageUrl, scale: tagsFromEndpoint ? 1 : scale };
  const snippet = buildSnippet(framework, state, tagFormat, tagOpts);
  const defaultPage = defaultPageUrl(state);
  const [snippetCopied, copySnippet] = useCopy();
  const [linkCopied, copyLink] = useCopy();
  const activeTab = TABS.find((t) => t.id === tab)!;

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

  const nextStep = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="sm" className="-ml-2 text-graphite" onClick={onClick}>
      {label}
      <ArrowRight />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Download />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(640px,calc(100dvh-2rem))] max-w-[600px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 px-6 pb-4 pt-6">
          <DialogTitle>Export</DialogTitle>
          <DialogDescription className="text-[14px]">{activeTab.hint}</DialogDescription>
        </DialogHeader>
        <TabBar value={tab} onChange={setTab} />

        <div
          role="tabpanel"
          id={`export-panel-${tab}`}
          aria-labelledby={`export-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          {tab === "download" ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <Field label="Format">
                  <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
                </Field>
                <Field label="Resolution">
                  <Segmented
                    label="Resolution"
                    value={String(scale) as "1" | "2"}
                    onChange={(v) => setScale(v === "2" ? 2 : 1)}
                    options={[
                      { value: "1", label: "1×", title: "Standard size every platform expects" },
                      { value: "2", label: "2×", title: "Crisper on high-density screens; larger file" },
                    ]}
                  />
                </Field>
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

              {nextStep("Next: meta tags", () => {
                setImageSource("file");
                setTab("tags");
              })}
            </div>
          ) : tab === "link" ? (
            <div className="space-y-6">
              <Field label="Image URL · PNG, 1200×630">
                <div className="flex gap-2">
                  <Input
                    aria-label="Dynamic image URL"
                    readOnly
                    value={dynamic?.url ?? ""}
                    spellCheck={false}
                    className="min-w-0 flex-1 font-mono text-[12px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    title="Copy URL"
                    aria-label="Copy dynamic image URL"
                    onClick={() => dynamic && copyLink(dynamic.url)}
                  >
                    {linkCopied ? <Check className="text-pass" /> : <Copy />}
                  </Button>
                  <Button variant="outline" size="icon" asChild title="Open in a new tab">
                    <a href={dynamic?.url} target="_blank" rel="noreferrer" aria-label="Open dynamic image">
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </Field>

              {dynamic?.droppedUploads ? (
                <p className="flex items-start gap-1.5 text-[13px] text-warn">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Uploaded images live only in this browser, so the link leaves them out. Use an
                  image URL instead.
                </p>
              ) : null}

              <div className="bg-wash px-4 py-3 text-[13px] leading-relaxed text-graphite">
                <p className="font-medium text-ink">One design, an image for every page</p>
                <p className="mt-1">
                  Change <code className="text-ink">title</code>,{" "}
                  <code className="text-ink">description</code> or{" "}
                  <code className="text-ink">image</code> in the URL for each post. The rest of the
                  design stays the same.
                </p>
              </div>

              {nextStep("Use it in the meta tags", () => {
                setImageSource("link");
                setTab("tags");
              })}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <Field label="Image">
                  <Segmented
                    label="Image source"
                    value={imageSource}
                    onChange={setImageSource}
                    options={[
                      { value: "file", label: "Uploaded file", title: "The file from the Download tab" },
                      { value: "link", label: "Image link", title: "Rendered on request by OGee" },
                    ]}
                  />
                </Field>
                {imageSource === "file" ? (
                  <LinkField
                    id="export-image-url"
                    label={`Where the file is served · ${tagFormat === "jpeg" ? "JPG" : tagFormat.toUpperCase()}, ${Math.round(PRESETS[state.preset].w * tagOpts.scale)}×${Math.round(PRESETS[state.preset].h * tagOpts.scale)}`}
                    value={opts.imageUrl}
                    placeholder={defaultImageUrl(opts.pageUrl || defaultPage, format, state.title)}
                    onChange={setOpt("imageUrl")}
                  />
                ) : null}
                <LinkField
                  id="export-page-url"
                  label="Page URL"
                  value={opts.pageUrl}
                  placeholder={defaultPage}
                  onChange={setOpt("pageUrl")}
                />
                <details className="group">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-graphite hover:text-ink [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
                    Site name and alt text
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                </details>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Select value={framework} onValueChange={(v) => setFramework(v as FrameworkId)}>
                    <SelectTrigger aria-label="Meta tags for" className="w-[200px]">
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
                  <Button variant="outline" onClick={() => copySnippet(snippet)}>
                    {snippetCopied ? <Check className="text-pass" /> : <Copy />}
                    <span aria-live="polite">{snippetCopied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <p className="text-[13px] text-graphite">{PLACEMENT[framework]}</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-wash p-4 font-mono text-[12px] leading-relaxed text-ink">
                  {snippet}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
