/** Crop marks with an ogee (S-shaped) curve joining two corners of the trim box. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 text-ink">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path d="M2 7h5V2M17 2v5h5M22 17h-5v5M7 22v-5H2" />
        <path d="M7 17C12 17 12 7 17 7" stroke="var(--color-spec)" strokeWidth="2.25" />
      </svg>
      <span className="text-[19px] font-semibold leading-none tracking-[-0.01em]">OGee</span>
    </span>
  );
}
