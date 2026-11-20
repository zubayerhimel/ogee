import { useEffect, useState, type ReactNode } from "react";
import { PRESETS, type OGState } from "@/lib/og-types";
import { describeCrop, PLATFORMS, type PlatformId } from "@/lib/platforms";
import { renderOG } from "@/lib/render-og";
import { cn } from "@/lib/utils";

function useDesignImage(state: OGState): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    // Debounced: typing and slider drags shouldn't re-encode a PNG every frame.
    const t = setTimeout(async () => {
      const canvas = document.createElement("canvas");
      await renderOG(canvas, state, () => cancelled);
      if (cancelled) return;
      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
      // Revoke after the next image has replaced this one, so nothing flashes blank.
      if (url) {
        const old = url;
        setTimeout(() => URL.revokeObjectURL(old), 1000);
      }
    };
  }, [state]);
  return src;
}

function Img({ src, ratio, className }: { src: string | null; ratio: number; className?: string }) {
  return src ? (
    <img src={src} alt="" className={cn("block w-full object-cover", className)} style={{ aspectRatio: ratio }} />
  ) : (
    <div className={cn("w-full bg-black/10", className)} style={{ aspectRatio: ratio }} />
  );
}

const SYSTEM = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function Mockup({ platform, state, src }: { platform: PlatformId; state: OGState; src: string | null }) {
  const { w, h } = PRESETS[state.preset];
  const natural = w / h;
  const domain = state.domain.trim() || "your-site.com";
  const site = state.badge.trim() || domain;
  const title = state.title.trim() || "Untitled";
  const desc = state.description.trim();

  const frames: Record<PlatformId, ReactNode> = {
    x: (
      <div className="bg-white p-4 text-[#0f1419]">
        <div className="relative overflow-hidden rounded-2xl border border-[#cfd9de]">
          <Img src={src} ratio={1.91} />
          <span className="absolute bottom-3 left-3 rounded bg-black/75 px-1.5 py-0.5 text-[13px] text-white">
            {domain}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-[#536471]">From {domain}</p>
      </div>
    ),
    linkedin: (
      <div className="bg-[#f4f2ee] p-4">
        <div className="overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
          <Img src={src} ratio={1.91} />
          <div className="bg-[#eef3f8] px-3 py-2">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-black/90">{title}</p>
            <p className="mt-0.5 text-[12px] text-black/60">{domain}</p>
          </div>
        </div>
      </div>
    ),
    facebook: (
      <div className="bg-white p-4">
        <div className="overflow-hidden border border-[#dadde1]">
          <Img src={src} ratio={1.91} />
          <div className="border-t border-[#dadde1] bg-[#f0f2f5] px-3 py-2.5">
            <p className="truncate text-[12px] uppercase text-[#65676b]">{domain}</p>
            <p className="line-clamp-2 text-[16px] font-semibold leading-tight text-[#050505]">{title}</p>
            {desc ? <p className="mt-0.5 truncate text-[14px] text-[#65676b]">{desc}</p> : null}
          </div>
        </div>
      </div>
    ),
    slack: (
      <div className="bg-white p-4 text-[15px] text-[#1d1c1d]">
        <div className="flex gap-3 border-l-4 border-[#dddddd] pl-3">
          <div className="min-w-0">
            <p className="font-bold">{site}</p>
            <p className="font-bold text-[#1264a3]">{title}</p>
            {desc ? <p className="line-clamp-3 text-[#1d1c1d]">{desc}</p> : null}
            <div className="mt-2 max-w-[360px] overflow-hidden rounded-lg">
              <Img src={src} ratio={natural} />
            </div>
          </div>
        </div>
      </div>
    ),
    discord: (
      <div className="bg-[#313338] p-4">
        <div
          className="max-w-[432px] rounded border-l-4 bg-[#2b2d31] p-4 pr-4"
          style={{ borderLeftColor: state.accent }}
        >
          <p className="text-[12px] text-[#dbdee1]">{site}</p>
          <p className="mt-1 font-semibold text-[#00a8fc]">{title}</p>
          {desc ? <p className="mt-1 line-clamp-3 text-[14px] text-[#dbdee1]">{desc}</p> : null}
          <div className="mt-3 overflow-hidden rounded">
            <Img src={src} ratio={natural} />
          </div>
        </div>
      </div>
    ),
    imessage: (
      <div className="flex justify-end bg-white p-4">
        <div className="w-[78%] overflow-hidden rounded-[18px] bg-[#e9e9eb]">
          <Img src={src} ratio={1.91} />
          <div className="px-3 py-2">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-black">{title}</p>
            <p className="text-[13px] text-[#8e8e93]">{domain}</p>
          </div>
        </div>
      </div>
    ),
  };

  return (
    <div className="overflow-hidden" style={{ fontFamily: SYSTEM }}>
      {frames[platform]}
    </div>
  );
}

export function PlatformPreviews({ state }: { state: OGState }) {
  const [platform, setPlatform] = useState<PlatformId>("x");
  const src = useDesignImage(state);
  const { w, h } = PRESETS[state.preset];
  const current = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0]!;

  return (
    <section
      aria-labelledby="platforms-heading"
      className="border-t border-hairline bg-paper px-5 py-14 lg:px-12 lg:py-20"
    >
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 id="platforms-heading" className="text-[28px] font-semibold leading-tight tracking-[-0.015em]">
            Where it’s shared
          </h2>
          <p className="mt-2 max-w-[36ch] text-[15px] text-graphite">
            Your design as it unfurls on each platform, with the part each one crops. Layouts are
            approximate; platforms change them often.
          </p>
          <div
            role="group"
            aria-label="Platform"
            className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1"
          >
            {PLATFORMS.map((p) => {
              const active = p.id === platform;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPlatform(p.id)}
                  className={cn(
                    "flex items-baseline justify-between gap-3 px-3 py-2 text-left text-[14px] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-wash font-medium text-ink" : "text-graphite hover:bg-wash/60 hover:text-ink",
                  )}
                >
                  <span>{p.label}</span>
                  <span className="hidden text-[12px] font-normal text-graphite lg:inline">
                    {p.crop ? `${p.crop}:1` : "Original"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="max-w-[560px]">
            <div className="shadow-[var(--shadow-proof)]">
              <Mockup platform={platform} state={state} src={src} />
            </div>
            <p className="mt-4 text-[13px] text-ink">
              {describeCrop(w, h, current.crop)}
              <span className="text-graphite">
                {" "}
                · {current.crop ? `${current.crop}:1 frame` : "original shape"}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-graphite">{current.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}