import { isLocalUrl } from "./html-meta";
import { FONTS, fontMaxWeight, fontStylesheetUrl, PRESETS, type OGState } from "./og-types";

// Failed loads are cached too, so slider drags don't re-request broken URLs.
const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Remote images go through the same-origin proxy so the canvas stays untainted. */
export function imageSrc(src: string): string {
  if (!/^https?:\/\//i.test(src) || isLocalUrl(src)) return src;
  return `/api/image?url=${encodeURIComponent(src)}`;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = imageSrc(src);
    });
    imageCache.set(src, pending);
  }
  return pending;
}

const fontCss = new Map<string, Promise<void>>();

/** Injects a font's Google Fonts stylesheet once; font files download only when used. */
export function ensureFontCss(font: string): Promise<void> {
  const def = FONTS.find((f) => f.value === font);
  if (typeof document === "undefined" || !def) return Promise.resolve();
  let pending = fontCss.get(font);
  if (!pending) {
    pending = new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontStylesheetUrl(def);
      link.onload = () => resolve();
      link.onerror = () => {
        // Allow a retry later; the canvas falls back to sans-serif meanwhile.
        fontCss.delete(font);
        link.remove();
        resolve();
      };
      document.head.appendChild(link);
    });
    fontCss.set(font, pending);
  }
  return pending;
}

async function loadFonts(font: string, weights: number[], text: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await ensureFontCss(font);
  // Passing the real text pulls in every unicode-range subset it needs (Cyrillic, Greek, ...).
  await Promise.all(
    [...new Set(weights)].map((w) =>
      document.fonts.load(`${w} 32px ${font}`, text).catch(() => []),
    ),
  );
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1] ?? "";
    const joined = lines.join(" ");
    if (joined.length < text.length) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
  }
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * Loads images/fonts first, then draws synchronously so overlapping renders can't
 * interleave. `isStale` lets the caller drop renders superseded by newer state.
 */
export async function renderOG(
  canvas: HTMLCanvasElement,
  state: OGState,
  isStale: () => boolean = () => false,
): Promise<void> {
  const maxWeight = fontMaxWeight(state.font);
  const weight = (n: number) => Math.min(n, maxWeight);
  const [image, logo] = await Promise.all([
    state.imageUrl && state.imageMode !== "none"
      ? loadImage(state.imageUrl).catch(() => null)
      : null,
    state.logoUrl ? loadImage(state.logoUrl).catch(() => null) : null,
    loadFonts(
      state.font,
      [400, 500, 600, 700].map(weight),
      `${state.badge.toUpperCase()} ${state.title} ${state.description} ${state.domain}`,
    ),
  ]);
  if (isStale()) return;
  draw(canvas, state, image, logo, weight);
}

function draw(
  canvas: HTMLCanvasElement,
  state: OGState,
  image: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  weight: (n: number) => number,
): void {
  const { w, h } = PRESETS[state.preset];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  // Background gradient
  const rad = (state.bgAngle * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const grad = ctx.createLinearGradient(
    cx - (Math.cos(rad) * len) / 2,
    cy - (Math.sin(rad) * len) / 2,
    cx + (Math.cos(rad) * len) / 2,
    cy + (Math.sin(rad) * len) / 2,
  );
  grad.addColorStop(0, state.bgFrom);
  grad.addColorStop(1, state.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const pad = state.padding;
  let textWidth = w - pad * 2;
  let sideImage: HTMLImageElement | null = null;

  if (image && state.imageMode === "cover") {
    drawCover(ctx, image, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${state.overlay})`;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createLinearGradient(0, 0, w, 0);
    g2.addColorStop(0, "rgba(0,0,0,0.55)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  } else if (image && state.imageMode === "side") {
    sideImage = image;
  }

  if (sideImage) {
    // Fit the whole image inside the panel (no cropping), right-aligned and vertically centred.
    const boxW = Math.round(w * 0.4);
    const boxH = h - pad;
    const scale = Math.min(boxW / sideImage.width, boxH / sideImage.height);
    const iw = Math.round(sideImage.width * scale);
    const ih = Math.round(sideImage.height * scale);
    const ix = w - pad / 2 - iw;
    const iy = Math.round((h - ih) / 2);
    ctx.drawImage(sideImage, ix, iy, iw, ih);
    textWidth = ix - pad - 40;
  }

  if (state.showGrain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = state.textColor;
    for (let i = 0; i < 1400; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.restore();
  }

  const centered = state.align === "center" && !sideImage;
  const originX = centered ? w / 2 : pad;
  ctx.textAlign = centered ? "center" : "left";
  ctx.textBaseline = "alphabetic";

  // Accent bar
  if (state.showAccentBar && !centered) {
    ctx.fillStyle = state.accent;
    roundRect(ctx, pad, pad, 76, 8, 4);
    ctx.fill();
  }

  let y = pad + (state.showAccentBar && !centered ? 76 : 24);

  // Badge row
  if (state.badge.trim()) {
    ctx.font = `${weight(600)} ${Math.round(state.descSize * 0.72)}px ${state.font}, sans-serif`;
    ctx.fillStyle = state.accent;
    ctx.fillText(state.badge.toUpperCase(), originX, y + state.descSize * 0.6);
    y += state.descSize * 1.5;
  }

  // Title
  ctx.font = `${weight(700)} ${state.titleSize}px ${state.font}, sans-serif`;
  ctx.fillStyle = state.textColor;
  const titleLines = wrap(ctx, state.title, textWidth, 3);
  const titleLh = state.titleSize * 1.14;
  y += titleLh * 0.8;
  for (const line of titleLines) {
    ctx.fillText(line, originX, y);
    y += titleLh;
  }

  // Description: only as many lines (max 3) as fit above the footer.
  const footerY = h - pad;
  const logoSize = 46;
  const domainSize = Math.round(state.descSize * 0.78);
  const footerTop = logo
    ? footerY - logoSize + 4
    : state.domain.trim()
      ? footerY - domainSize
      : h - pad / 2;
  if (state.description.trim()) {
    ctx.font = `400 ${state.descSize}px ${state.font}, sans-serif`;
    ctx.globalAlpha = 0.82;
    const descLh = state.descSize * 1.4;
    y += descLh * 0.35;
    const room = footerTop - 24 - state.descSize * 0.25 - y;
    const maxLines = Math.min(3, Math.floor(room / descLh) + 1);
    const descLines = maxLines > 0 ? wrap(ctx, state.description, textWidth, maxLines) : [];
    for (const line of descLines) {
      ctx.fillText(line, originX, y);
      y += descLh;
    }
    ctx.globalAlpha = 1;
  }

  // Footer: logo + domain
  let fx = originX;
  const domainFont = `${weight(500)} ${domainSize}px ${state.font}, sans-serif`;
  ctx.font = domainFont;
  if (logo) {
    const lx = centered ? w / 2 - (logoSize + 16 + ctx.measureText(state.domain).width) / 2 : pad;
    ctx.save();
    roundRect(ctx, lx, footerY - logoSize + 4, logoSize, logoSize, 12);
    ctx.clip();
    drawCover(ctx, logo, lx, footerY - logoSize + 4, logoSize, logoSize);
    ctx.restore();
    fx = lx + logoSize + 16;
    ctx.textAlign = "left";
  }
  if (state.domain.trim()) {
    ctx.font = domainFont;
    ctx.fillStyle = state.textColor;
    ctx.globalAlpha = 0.7;
    ctx.fillText(state.domain, fx, footerY);
    ctx.globalAlpha = 1;
  }
}

export function download(canvas: HTMLCanvasElement, format: "png" | "jpeg" | "webp") {
  const mime = `image/${format}`;
  const url = canvas.toDataURL(mime, 0.92);
  const a = document.createElement("a");
  a.href = url;
  a.download = `og-image.${format === "jpeg" ? "jpg" : format}`;
  a.click();
}
