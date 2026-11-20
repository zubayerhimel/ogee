/** Crop-mark glyph echoing the marks around the canvas on the stage. */
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
        <rect x="9.5" y="10" width="5" height="4" fill="var(--color-spec)" stroke="none" />
      </svg>
      <span className="text-[19px] font-semibold leading-none tracking-[-0.01em]">
        OG Studio
      </span>
    </span>
  );
}
