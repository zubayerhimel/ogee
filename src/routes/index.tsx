import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, Redo2, Share2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { Inspector } from "@/components/studio/Inspector";
import { PlatformPreviews } from "@/components/studio/PlatformPreviews";
import { PreviewTester } from "@/components/studio/PreviewTester";
import { Stage } from "@/components/studio/Stage";
import { TemplateStrip } from "@/components/studio/TemplateStrip";
import { ThemeSwitcher } from "@/components/studio/ThemeSwitcher";
import { Wordmark } from "@/components/studio/Wordmark";
import { defaultState } from "@/lib/og-types";
import { shareUrl, useDesign } from "@/lib/design-state";
import { firstImageFile, readImageFile } from "@/lib/image-file";
import { isLocalUrl, parseMeta, withScheme, type ScrapedMeta } from "@/lib/html-meta";
import { scrapeUrl } from "@/lib/scrape.functions";
import { getSiteOrigin } from "@/lib/site-origin";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => {
    const url = `${getSiteOrigin()}/`;
    return {
      meta: [{ property: "og:url", content: url }],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function Index() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { state, update, apply, undo, redo, canUndo, canRedo, restored } = useDesign();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrape = useServerFn(scrapeUrl);

  useEffect(() => {
    if (restored === "link") toast.success("Opened a shared design");
  }, [restored]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isRedo = (key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey);
      if (key !== "z" && !isRedo) return;
      // Fields outside the editor (URL boxes, dialogs) keep their own text undo.
      const field = (e.target as Element | null)?.closest?.("input, textarea, [contenteditable]");
      if (field && !field.closest("[data-design-scope]")) return;
      e.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const addImageFile = (file: File) => {
    readImageFile(file)
      .then((imageUrl) => {
        apply((s) => ({
          ...s,
          imageUrl,
          imageMode: s.imageMode === "none" ? "cover" : s.imageMode,
          imageFocusX: 0.5,
          imageFocusY: 0.5,
        }));
        toast.success("Image added", { action: { label: "Undo", onClick: undo } });
      })
      .catch(() => toast.error("Couldn't read that image"));
  };
  const addImageRef = useRef(addImageFile);
  addImageRef.current = addImageFile;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Text fields keep normal paste; anywhere else an image on the clipboard becomes the background.
      const target = e.target as Element | null;
      if (target?.closest?.("input, textarea, [contenteditable]")) return;
      const file = firstImageFile(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      addImageRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const share = async () => {
    const { url, droppedUploads } = shareUrl(state, window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", {
        description: droppedUploads
          ? "Uploaded images aren't included in links. Use an image URL to share them."
          : "Anyone with the link opens this design.",
      });
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const [mod, setMod] = useState("Ctrl+");
  useEffect(() => {
    if (/Mac|iP(hone|ad)/.test(navigator.platform)) setMod("⌘");
  }, []);

  const applyMeta = (meta: ScrapedMeta) => {
    // Functional update so edits made while the import was in flight aren't overwritten.
    apply((s) => ({
      ...s,
      title: meta.title || s.title,
      description: meta.description || s.description,
      badge: meta.siteName ? meta.siteName.toUpperCase().slice(0, 24) : s.badge,
      domain: meta.domain || s.domain,
      logoUrl: meta.logo ?? s.logoUrl,
      imageUrl: meta.image ?? s.imageUrl,
    }));
    toast.success(`Imported from ${meta.domain}`);
  };

  const fetchLocally = async (raw: string) => {
    const target = withScheme(raw, "http");
    const res = await fetch(target, { mode: "cors" });
    const html = await res.text();
    applyMeta(parseMeta(html, target));
  };

  const handleFetch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      if (isLocalUrl(url)) {
        await fetchLocally(url).catch(() => {
          throw new Error("CORS");
        });
      } else {
        applyMeta(await scrape({ data: { url } }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("LOCAL_URL") || msg === "CORS") {
        toast.error("Your local server blocked the request", {
          description:
            "Allow CORS on your dev server (Access-Control-Allow-Origin: *), or expose it with `npx localtunnel --port 3000` and paste the public URL.",
          duration: 9000,
        });
      } else {
        toast.error("Couldn't import that page", {
          description: msg
            ? `${msg}. You can still type the details in the panel.`
            : "Check the URL, or type the details in the panel.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Toaster position="bottom-center" />
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 lg:h-16 lg:flex-nowrap lg:px-6 lg:py-0">
          <Wordmark />
          <form
            onSubmit={handleFetch}
            className="order-last flex w-full gap-2 lg:order-none lg:max-w-[620px] lg:flex-1"
          >
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite"
                aria-hidden="true"
              />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a page URL"
                className="pl-9"
                aria-label="Page URL to import"
                inputMode="url"
                autoComplete="url"
              />
            </div>
            <Button type="submit" variant="outline" disabled={loading} className="w-[92px]">
              {loading ? <Loader2 className="animate-spin" aria-label="Importing" /> : "Import"}
            </Button>
          </form>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Undo"
                title={`Undo (${mod}Z)`}
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Redo"
                title={`Redo (${mod === "⌘" ? "⌘⇧Z" : "Ctrl+Y"})`}
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 />
              </Button>
            </div>
            <Button variant="outline" onClick={share} aria-label="Copy share link" className="px-2.5 xl:px-4">
              <Share2 />
              <span className="hidden xl:inline">Share</span>
            </Button>
            <ThemeSwitcher />
            <ExportDialog state={state} />
          </div>
        </div>
      </header>

      <main className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col bg-stage px-5 pb-10 pt-6 lg:min-h-[calc(100dvh-4rem)] lg:px-12">
          <div className="flex flex-col gap-10">
            <Stage
              state={state}
              canvasRef={canvasRef}
              onPreset={(preset) => update({ preset })}
              onImageFile={addImageFile}
            />
            <TemplateStrip state={state} update={(patch) => apply((s) => ({ ...s, ...patch }))} />
          </div>
        </div>
        <aside
          aria-label="Edit image"
          data-design-scope
          className="border-hairline bg-paper lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:border-l"
        >
          <Inspector state={state} update={update} />
          <div className="border-t border-hairline px-5 py-4 lg:px-6">
            <Button
              variant="ghost"
              className="-ml-3"
              onClick={() => {
                apply(() => defaultState);
                toast("Design reset", { action: { label: "Undo", onClick: undo } });
              }}
            >
              Reset design
            </Button>
          </div>
        </aside>
      </main>

      <PlatformPreviews state={state} />
      <PreviewTester />
    </>
  );
}
