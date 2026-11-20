import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { download, renderOG } from "@/lib/render-og";
import { PRESETS, type OGState } from "@/lib/og-types";
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
  const [format, setFormat] = useState<Format>("png");
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [exporting, setExporting] = useState(false);
  const [opts, setOpts] = useState<Required<SnippetOptions>>({
    pageUrl: "",
    imageUrl: "",
    siteName: "",
    imageAlt: "",
  });
  const setOpt = (key: keyof SnippetOptions) => (v: string) => setOpts((o) => ({ ...o, [key]: v }));
  const { w, h } = PRESETS[state.preset];
  const snippet = buildSnippet(framework, state, format, opts);
  const resolved = resolveTags(state, format, opts);
  const defaultPage = defaultPageUrl(state);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  return (
    <Dialog>
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
            Download the {w} × {h} image, upload it so it's served at{" "}
            <span className="break-all text-ink">{resolved.imageUrl}</span>, then add the tags
            below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-graphite">
              Format
            </p>
            <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
          </div>
          <Button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                // Render fresh so the file never captures a frame still waiting on fonts/images.
                const canvas = document.createElement("canvas");
                await renderOG(canvas, state);
                download(canvas, format);
                toast.success(`Downloaded ${fileName(format)}`);
              } catch {
                toast.error("Couldn't export the image");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Download {format === "jpeg" ? "JPG" : format.toUpperCase()}
          </Button>
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
              placeholder={defaultImageUrl(opts.pageUrl || defaultPage, format)}
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
