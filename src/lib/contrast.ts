import type { OGState } from "./og-types";
import { DESCRIPTION_ALPHA, renderOG, type Rect } from "./render-og";

type RGB = [number, number, number];

export function parseHex(color: string): RGB | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

/** WCAG 2 relative luminance of an sRGB colour (0–255 channels). */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Large text (the title) needs 3:1; body-size text needs 4.5:1 (WCAG AA). */
export const CONTRAST_MIN = { title: 3, description: 4.5 } as const;

type Pixels = { data: ArrayLike<number>; width: number; height: number };

/**
 * Contrast of text over the pixels behind it. Uses the 10th-percentile sample rather
 * than the minimum, so a few stray grain specks or photo highlights don't dominate.
 */
export function sampleContrast(pixels: Pixels, rects: Rect[], text: RGB, alpha = 1): number | null {
  const ratios: number[] = [];
  const step = 4;
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(pixels.width, Math.ceil(r.x + r.w));
    const y1 = Math.min(pixels.height, Math.ceil(r.y + r.h));
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const i = (y * pixels.width + x) * 4;
        const bg: RGB = [pixels.data[i] ?? 0, pixels.data[i + 1] ?? 0, pixels.data[i + 2] ?? 0];
        // Text drawn with partial opacity blends with what's behind it.
        const fg = text.map((c, k) => c * alpha + (bg[k] ?? 0) * (1 - alpha)) as RGB;
        ratios.push(contrastRatio(fg, bg));
      }
    }
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length * 0.1)] ?? null;
}

export type ContrastResult = { title: number | null; description: number | null };

/** Renders the design without text and measures contrast where the text would sit. */
export async function measureContrast(
  state: OGState,
  isStale: () => boolean = () => false,
): Promise<ContrastResult | null> {
  const text = parseHex(state.textColor);
  if (!text) return null;
  const canvas = document.createElement("canvas");
  const layout = await renderOG(canvas, state, isStale, { skipText: true });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!layout || !ctx) return null;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    title: sampleContrast(pixels, layout.title, text),
    description: sampleContrast(pixels, layout.description, text, DESCRIPTION_ALPHA),
  };
}
