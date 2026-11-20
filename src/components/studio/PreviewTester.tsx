import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { auditUrl, type AuditResult, type CheckStatus } from "@/lib/audit.functions";
import { cn } from "@/lib/utils";

const STATUS: Record<CheckStatus, { Icon: typeof CircleCheck; tone: string; label: string }> = {
  pass: { Icon: CircleCheck, tone: "text-pass", label: "Passes" },
  warn: { Icon: CircleAlert, tone: "text-warn", label: "Could be better" },
  fail: { Icon: CircleX, tone: "text-fail", label: "Missing" },
};

// Non-uniform stagger: gaps shrink as the list grows, so long lists don't drag.
const stagger = (i: number) => ({ animationDelay: `${Math.round(60 + 45 * Math.sqrt(i))}ms` });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function UnfurlCard({ result }: { result: AuditResult }) {
  return (
    <article className="overflow-hidden rounded-xl border border-hairline bg-paper">
      {result.image ? (
        <img
          src={result.image}
          alt=""
          className="aspect-[1.91/1] w-full bg-wash object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-[1.91/1] items-center justify-center bg-wash px-6 text-center text-[13px] text-graphite">
          No og:image, so this link shares as text only.
        </div>
      )}
      <div className="space-y-1 border-t border-hairline px-4 py-3">
        <p className="text-[12px] text-graphite">{result.domain}</p>
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">
          {result.title || "No title found"}
        </p>
        <p className="line-clamp-2 text-[13px] text-graphite">
          {result.description || "No description found"}
        </p>
      </div>
    </article>
  );
}

export function PreviewTester() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const audit = useServerFn(auditUrl);

  const run = async (target = url) => {
    if (!target.trim()) return;
    setLoading(true);
    try {
      setResult(await audit({ data: { url: target } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("LOCAL_URL")
          ? "Local addresses can't be checked"
          : "Couldn't check that page",
        {
          description: msg.includes("LOCAL_URL")
            ? "Publish the page or expose it with a tunnel, then check the public URL."
            : msg || "Check the URL and try again.",
        },
      );
    } finally {
      setLoading(false);
    }
  };

  const tryExample = () => {
    setUrl("github.com");
    void run("github.com");
  };

  const counts = result
    ? {
        fail: result.checks.filter((c) => c.status === "fail").length,
        warn: result.checks.filter((c) => c.status === "warn").length,
      }
    : null;

  return (
    <section
      aria-labelledby="tester-heading"
      className="border-t border-hairline bg-paper px-5 py-14 lg:px-12 lg:py-20"
    >
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 id="tester-heading" className="text-[28px] font-semibold leading-tight tracking-[-0.015em]">
            Check a live page
          </h2>
          <p className="mt-2 max-w-[36ch] text-[15px] text-graphite">
            See how a published URL unfurls when it’s shared, and which Open Graph and X tags it
            is missing.
          </p>
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="your-site.com/page"
              aria-label="Page URL to check"
              inputMode="url"
            />
            <Button type="submit" disabled={loading} className="w-[112px] shrink-0">
              {loading ? <Loader2 className="animate-spin" aria-label="Checking" /> : "Check tags"}
            </Button>
          </form>

          {result && counts ? (
            <div key={result.url} className="mt-8 animate-rise" aria-live="polite">
              <p className="flex items-baseline gap-2">
                <span className="condensed text-[56px] font-semibold leading-none tracking-[-0.02em]">
                  {result.score}
                </span>
                <span className="text-[14px] text-graphite">out of 100</span>
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-none bg-hairline" aria-hidden="true">
                <div
                  className={cn(
                    "h-full w-full origin-left animate-meter rounded-none",
                    result.score >= 85 ? "bg-pass" : result.score >= 60 ? "bg-warn" : "bg-fail",
                  )}
                  style={{ transform: `scaleX(${result.score / 100})` }}
                />
              </div>
              <p className="mt-3 text-[14px] text-graphite">
                {counts.fail === 0 && counts.warn === 0
                  ? "Every tag we look for is present."
                  : [
                      counts.fail ? `${plural(counts.fail, "tag")} missing` : null,
                      counts.warn ? `${plural(counts.warn, "tag")} could be better` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
              </p>
            </div>
          ) : null}
        </div>

        {result ? (
          <div key={result.url} className="grid gap-8 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="animate-rise space-y-2">
              <UnfurlCard result={result} />
              <p className="text-[12px] text-graphite">Approximate preview. Each platform crops slightly differently.</p>
            </div>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {result.checks.map((c, i) => {
                const { Icon, tone, label } = STATUS[c.status];
                return (
                  <li
                    key={c.key}
                    className="grid animate-rise grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-3"
                    style={stagger(i)}
                  >
                    <Icon className={cn("mt-0.5 h-[18px] w-[18px]", tone)} aria-label={label} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{c.label}</p>
                      {c.value ? (
                        <p className="truncate text-[13px] text-ink/80" title={c.value}>
                          {c.value}
                        </p>
                      ) : null}
                      <p className="text-[13px] text-graphite">{c.note}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-start justify-center rounded-xl border border-dashed border-hairline-strong px-8 py-10">
            <p className="max-w-[44ch] text-[15px] text-graphite">
              Results show the card people will see, a score, and each tag with what to fix.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={tryExample}
              disabled={loading}
            >
              Try it with github.com
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
