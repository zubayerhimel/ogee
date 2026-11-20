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
import { download, renderOG } from "@/lib/render-og";
import { PRESETS, type OGState } from "@/lib/og-types";
import { FRAMEWORKS, PLACEMENT, buildSnippet, type FrameworkId } from "@/lib/meta-snippets";
import { Segmented } from "./Segmented";

type Format = "png" | "jpeg" | "webp";

const FORMATS: { value: Format; label: string; title: string }[] = [
  { value: "png", label: "PNG", title: "Sharpest text, larger file" },
  { value: "jpeg", label: "JPG", title: "Smallest file, best for photos" },
  { value: "webp", label: "WebP", title: "Small and sharp; not every platform reads it" },
];

const fileName = (format: Format) => `og-image.${format === "jpeg" ? "jpg" : format}`;

export function ExportDialog({ state }: { state: OGState }) {
  const [format, setFormat] = useState<Format>("png");
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [exporting, setExporting] = useState(false);
  const { w, h } = PRESETS[state.preset];
  const snippet = buildSnippet(framework, state, format);
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
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription className="text-[14px]">
            Download the {w} × {h} image, upload it to your site as{" "}
            <span className="text-ink">/{fileName(format)}</span>, then add the tags below.
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
