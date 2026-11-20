import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { Inspector } from "@/components/studio/Inspector";
import { PreviewTester } from "@/components/studio/PreviewTester";
import { Stage } from "@/components/studio/Stage";
import { TemplateStrip } from "@/components/studio/TemplateStrip";
import { Wordmark } from "@/components/studio/Wordmark";
import { defaultState, type OGState } from "@/lib/og-types";
import { isLocalUrl, parseMeta, withScheme, type ScrapedMeta } from "@/lib/html-meta";
import { scrapeUrl } from "@/lib/scrape.functions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "OG Studio — Open Graph image generator" },
      {
        name: "description",
        content:
          "Paste any URL, pull its metadata, customize a template and export a 1200×630 social preview image.",
      },
      { property: "og:title", content: "OG Studio — Open Graph image generator" },
      {
        property: "og:description",
        content: "Fetch metadata from any URL and export a polished social preview image.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Index() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<OGState>(defaultState);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrape = useServerFn(scrapeUrl);

  const update = (patch: Partial<OGState>) => setState((s) => ({ ...s, ...patch }));

  const applyMeta = (meta: ScrapedMeta) => {
    update({
      title: meta.title || state.title,
      description: meta.description || state.description,
      badge: meta.siteName ? meta.siteName.toUpperCase().slice(0, 24) : state.badge,
      domain: meta.domain || state.domain,
      logoUrl: meta.logo ?? state.logoUrl,
      imageUrl: meta.image ?? state.imageUrl,
    });
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
                placeholder="Paste a page URL to import its title, description and image"
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
          <div className="ml-auto">
            <ExportDialog canvasRef={canvasRef} state={state} />
          </div>
        </div>
      </header>

      <main className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-10 lg:min-h-[calc(100dvh-4rem)] bg-stage px-5 pb-10 pt-6 lg:px-12">
          <Stage
            state={state}
            canvasRef={canvasRef}
            onPreset={(preset) => update({ preset })}
          />
          <TemplateStrip state={state} update={update} />
        </div>
        <aside
          aria-label="Edit image"
          className="border-hairline bg-paper lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:border-l"
        >
          <Inspector state={state} update={update} />
        </aside>
      </main>

      <PreviewTester />
    </>
  );
}
