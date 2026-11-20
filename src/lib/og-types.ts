export type Preset = "og" | "linkedin" | "twitter" | "banner";

export const PRESETS: Record<Preset, { label: string; w: number; h: number }> = {
  og: { label: "Open Graph 1200×630", w: 1200, h: 630 },
  linkedin: { label: "LinkedIn 1200×628", w: 1200, h: 628 },
  twitter: { label: "Twitter large 1200×675", w: 1200, h: 675 },
  banner: { label: "Banner 1500×500", w: 1500, h: 500 },
};

/** Ratio of the tallest preset. Preview frames use it so switching presets doesn't shift the layout. */
export const FRAME_RATIO = Math.min(...Object.values(PRESETS).map((p) => p.w / p.h));

export type Align = "left" | "center";

export type BgMode = "solid" | "gradient";

export type OGState = {
  title: string;
  description: string;
  badge: string;
  domain: string;
  logoUrl: string | null;
  imageUrl: string | null;
  imageMode: "none" | "cover" | "side";
  bgMode: BgMode;
  bgFrom: string;
  bgTo: string;
  bgAngle: number;
  textColor: string;
  accent: string;
  font: string;
  titleSize: number;
  descSize: number;
  align: Align;
  padding: number;
  showGrain: boolean;
  showAccentBar: boolean;
  overlay: number;
  preset: Preset;
};

export type FontCategory = "Sans" | "Serif" | "Display" | "Mono";
export const FONT_CATEGORIES: FontCategory[] = ["Sans", "Serif", "Display", "Mono"];

export type FontDef = {
  label: string;
  /** CSS font-family value stored in OGState.font. */
  value: string;
  family: string;
  category: FontCategory;
  /** Exact Google Fonts weights; Google rejects weights a family doesn't have. */
  weights: number[];
  /** Heaviest loaded weight; anything heavier would be faux-bolded by the browser. */
  maxWeight: number;
};

const font = (family: string, category: FontCategory, weights = [400, 500, 600, 700]): FontDef => ({
  label: family,
  value: `'${family}'`,
  family,
  category,
  weights,
  maxWeight: Math.max(...weights),
});

export const FONTS: FontDef[] = [
  font("Space Grotesk", "Sans"),
  font("DM Sans", "Sans"),
  font("Inter", "Sans"),
  font("Geist", "Sans"),
  font("Manrope", "Sans"),
  font("Plus Jakarta Sans", "Sans"),
  font("Outfit", "Sans"),
  font("Sora", "Sans"),
  font("Archivo", "Sans"),
  font("Schibsted Grotesk", "Sans"),
  font("Bricolage Grotesque", "Sans"),
  font("Instrument Serif", "Serif", [400]),
  font("Fraunces", "Serif"),
  font("Playfair Display", "Serif"),
  font("DM Serif Display", "Serif", [400]),
  font("Newsreader", "Serif"),
  font("Lora", "Serif"),
  font("EB Garamond", "Serif"),
  font("Bebas Neue", "Display", [400]),
  font("Anton", "Display", [400]),
  font("Archivo Black", "Display", [400]),
  font("Syne", "Display"),
  font("Unbounded", "Display"),
  font("JetBrains Mono", "Mono"),
  font("IBM Plex Mono", "Mono"),
  font("Space Mono", "Mono", [400, 700]),
  font("Geist Mono", "Mono"),
];

export function fontStylesheetUrl(f: FontDef): string {
  const family = f.family.replace(/ /g, "+");
  const spec =
    f.weights.length === 1 && f.weights[0] === 400
      ? family
      : `${family}:wght@${f.weights.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
}

export function fontMaxWeight(font: string): number {
  return FONTS.find((f) => f.value === font)?.maxWeight ?? 700;
}

export const defaultState: OGState = {
  title: "Design social previews that actually get clicked",
  description:
    "Paste a URL, pull the metadata, and export a pixel-perfect 1200×630 image in seconds.",
  badge: "OGEE",
  domain: "ogee.app",
  logoUrl: null,
  imageUrl: null,
  imageMode: "none",
  bgMode: "solid",
  bgFrom: "#0b1020",
  bgTo: "#1d2a4d",
  bgAngle: 135,
  textColor: "#f5f7ff",
  accent: "#7ce8c0",
  font: "'Space Grotesk'",
  titleSize: 74,
  descSize: 30,
  align: "left",
  padding: 80,
  showGrain: true,
  showAccentBar: true,
  overlay: 0.55,
  preset: "og",
};

export type Template = { id: string; name: string; patch: Partial<OGState> };

export const TEMPLATES: Template[] = [
  {
    id: "midnight",
    name: "Midnight",
    patch: {
      bgMode: "gradient",
      bgFrom: "#0b1020",
      bgTo: "#1d2a4d",
      textColor: "#f5f7ff",
      accent: "#7ce8c0",
      font: "'Space Grotesk'",
      align: "left",
      showAccentBar: true,
      imageMode: "none",
    },
  },
  {
    id: "paper",
    name: "Paper",
    patch: {
      bgMode: "gradient",
      bgFrom: "#faf7f0",
      bgTo: "#efe7d8",
      textColor: "#1b1a17",
      accent: "#c2410c",
      font: "'Instrument Serif'",
      align: "left",
      titleSize: 82,
      showAccentBar: false,
    },
  },
  {
    id: "terminal",
    name: "Terminal",
    patch: {
      bgMode: "gradient",
      bgFrom: "#04140f",
      bgTo: "#062b1e",
      textColor: "#d6ffe9",
      accent: "#39ff9e",
      font: "'JetBrains Mono'",
      titleSize: 62,
      descSize: 26,
      align: "left",
      showAccentBar: true,
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    patch: {
      bgMode: "gradient",
      bgFrom: "#3b0d2e",
      bgTo: "#f0682f",
      textColor: "#fff6ec",
      accent: "#ffd166",
      font: "'DM Sans'",
      align: "left",
      bgAngle: 115,
    },
  },
  {
    id: "centered",
    name: "Centered",
    patch: {
      bgMode: "gradient",
      bgFrom: "#101014",
      bgTo: "#26262e",
      textColor: "#ffffff",
      accent: "#8ab4ff",
      font: "'DM Sans'",
      align: "center",
      titleSize: 68,
      showAccentBar: false,
    },
  },
  {
    id: "hero",
    name: "Hero shot",
    patch: {
      imageMode: "cover",
      overlay: 0.62,
      textColor: "#ffffff",
      accent: "#ffffff",
      font: "'Space Grotesk'",
      align: "left",
      showAccentBar: false,
    },
  },
  {
    id: "split",
    name: "Split",
    patch: {
      imageMode: "side",
      bgMode: "gradient",
      bgFrom: "#0f172a",
      bgTo: "#111827",
      textColor: "#eef2ff",
      accent: "#a78bfa",
      titleSize: 58,
      descSize: 26,
      align: "left",
    },
  },
  {
    id: "mint",
    name: "Mint",
    patch: {
      bgMode: "gradient",
      bgFrom: "#e8fff6",
      bgTo: "#c8f4e2",
      textColor: "#04231a",
      accent: "#0f766e",
      font: "'Space Grotesk'",
      align: "left",
      showAccentBar: true,
    },
  },
];
