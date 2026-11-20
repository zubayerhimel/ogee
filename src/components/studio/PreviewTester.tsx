import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, CircleCheck, CircleX, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { auditUrl, type AuditResult, type Check, type CheckStatus } from "@/lib/audit.functions";
import { cn } from "@/lib/utils";

const SEVERITY: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

const STATUS: Record<CheckStatus, { Icon: typeof CircleCheck; tone: string; label: string }> = {
  pass: { Icon: CircleCheck, tone: "text-pass", label: "Passes" },
  warn: { Icon: CircleAlert, tone: "text-warn", label: "Could be better" },
  fail: { Icon: CircleX, tone: "text-fail", label: "Missing" },
};

// Non-uniform stagger: gaps shrink as the list grows, so long lists don't drag.
const stagger = (i: number) => ({ animationDelay: `${Math.round(60 + 45 * Math.sqrt(i))}ms` });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const DISCLOSURE =
  "flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden";
const CHEVRON =
  "h-4 w-4 shrink-0 text-graphite transition-transform duration-200 ease-out group-open:rotate-90 motion-reduce:transition-none";

/** Compact issue row; when the tag has a value it opens to show it. */
function IssueRow({ check, index }: { check: Check; index: number }) {
  const { Icon, tone, label } = STATUS[check.status];
  const body = (
    <>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-label={label} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{check.label}</span>
        <span className="line-clamp-2 text-[13px] text-graphite">{check.note}</span>
      </span>
    </>
  );
  return (
    <li className="animate-rise" style={stagger(index)}>
      {check.value ? (
        <details className="group">
          <summary
            className={cn(
              DISCLOSURE,
              "items-start py-2.5 transition-colors hover:bg-wash/60 focus-visible:outline-offset-[-2px]",
            )}
          >
            {body}
            <ChevronRight className={cn(CHEVRON, "mt-0.5")} aria-hidden="true" />
          </summary>
          <p className="break-all pb-3 pl-7 pr-7 text-[13px] text-ink/80">{check.value}</p>
        </details>
      ) : (
        <div className="flex items-start gap-3 py-2.5 pr-7">{body}</div>
      )}
    </li>
  );
}

const ISSUE_PREVIEW = 5;

function ResultChecks({ checks }: { checks: Check[] }) {
  const [showAll, setShowAll] = useState(false);
  const issues = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.weight - a.weight);
  const passed = checks.filter((c) => c.status === "pass");
  // Issues are sorted by impact, so the first few are the ones worth fixing first.
  const hidden = showAll ? 0 : Math.max(0, issues.length - ISSUE_PREVIEW);
  const visibleIssues = hidden ? issues.slice(0, ISSUE_PREVIEW) : issues;

  return (
    <div className="space-y-4">
      {issues.length ? (
        <div>
          <h3 className="mb-1 text-[12px] font-medium text-graphite">
            To fix <span className="text-ink">{issues.length}</span>
          </h3>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {visibleIssues.map((c, i) => (
              <IssueRow key={c.key} check={c} index={i} />
            ))}
          </ul>
          {hidden ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 mt-1"
              onClick={() => setShowAll(true)}
            >
              Show {hidden} more
            </Button>
          ) : null}
        </div>
      ) : null}

      {passed.length ? (
        // Passing checks are reassurance, not work — keep them folded unless nothing needs fixing.
        <details className="group animate-rise" open={issues.length === 0}>
          <summary className={cn(DISCLOSURE, "py-1 text-[13px] text-graphite hover:text-ink")}>
            <CircleCheck className="h-4 w-4 shrink-0 text-pass" aria-hidden="true" />
            <span>{plural(passed.length, "check")} passed</span>
            <ChevronRight className={CHEVRON} aria-hidden="true" />
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5 pl-7">
            {passed.map((c) => (
              <li
                key={c.key}
                title={c.value ? `${c.note}\n${c.value}` : c.note}
                className="bg-wash px-2 py-1 text-[12px] text-ink/80"
              >
                {c.label}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

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
            See how a published URL unfurls when it’s shared, which Open Graph and X tags it is
            missing, and whether its image actually loads at the right size.
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
                <span className="text-[56px] font-semibold leading-none tracking-[-0.02em]">
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
                  ? "Every check passes."
                  : [
                      counts.fail ? `${plural(counts.fail, "problem")} to fix` : null,
                      counts.warn ? `${plural(counts.warn, "item")} could be better` : null,
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
            <div className="min-w-0">
              <ResultChecks key={result.url} checks={result.checks} />
            </div>
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
