import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: ReactNode; title?: string };

/** Single-choice segmented control with radio semantics and arrow-key navigation. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-md bg-[oklch(0_0_0/0.06)] p-0.5", className)}
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
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "h-7 flex-1 whitespace-nowrap rounded-none px-3 text-[13px] font-medium text-graphite transition-colors hover:text-ink",
              checked && "bg-paper text-ink shadow-[0_1px_2px_oklch(0_0_0/0.14)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
