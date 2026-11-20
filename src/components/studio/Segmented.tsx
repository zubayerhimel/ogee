import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: ReactNode; title?: string };

const SEGMENT = "h-7 flex-1 whitespace-nowrap px-3 text-[13px] font-medium";

/**
 * Single-choice segmented control with radio semantics and arrow-key navigation.
 * The active state is an aria-hidden copy of the options, clipped to the selected one,
 * so background and text colour slide together.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  segmentClassName,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  /** Applied to each option and its highlighted copy alike, so both stay the same size. */
  segmentClassName?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [clip, setClip] = useState<string | null>(null);
  // Only pointer selections slide; first paint, resizes and arrow keys snap.
  const [animate, setAnimate] = useState(false);

  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const btn = refs.current[index];
      if (!btn) return setClip(null);
      const right = list.clientWidth - btn.offsetLeft - btn.offsetWidth;
      const bottom = list.clientHeight - btn.offsetTop - btn.offsetHeight;
      setClip(`inset(${btn.offsetTop}px ${right}px ${bottom}px ${btn.offsetLeft}px)`);
    };
    measure();
    let size = `${list.clientWidth}x${list.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${list.clientWidth}x${list.clientHeight}`;
      if (next === size) return;
      size = next;
      setAnimate(false);
      measure();
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [index]);

  const select = (next: T, slide: boolean) => {
    setAnimate(slide);
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    select(option.value, false);
    refs.current[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={label}
      className={cn("relative inline-flex bg-ink/[0.06] p-0.5", className)}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={o.title}
            onClick={() => select(o.value, true)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              SEGMENT,
              segmentClassName,
              "text-graphite transition-colors hover:text-ink",
              checked && !clip && "bg-raised text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
      {clip ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 flex bg-raised p-0.5 text-ink",
            animate &&
              "transition-[clip-path] duration-250 ease-in-out motion-reduce:transition-none",
          )}
          style={{ clipPath: clip }}
        >
          {options.map((o) => (
            <span
              key={o.value}
              className={cn(SEGMENT, "flex items-center justify-center", segmentClassName)}
            >
              {o.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
