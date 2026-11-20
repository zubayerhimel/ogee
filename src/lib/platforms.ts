export type PlatformId = "x" | "linkedin" | "facebook" | "slack" | "discord" | "imessage";

export type Platform = {
  id: PlatformId;
  label: string;
  /** Width / height the platform crops to; null shows the image uncropped. */
  crop: number | null;
  note: string;
};

export const PLATFORMS: Platform[] = [
  { id: "x", label: "X", crop: 1.91, note: "Large card. Only the domain is shown, over the image." },
  { id: "linkedin", label: "LinkedIn", crop: 1.91, note: "Title and domain under the image." },
  {
    id: "facebook",
    label: "Facebook",
    crop: 1.91,
    note: "Domain, title and one line of description.",
  },
  { id: "slack", label: "Slack", crop: null, note: "Image keeps its shape, up to 360 px wide." },
  {
    id: "discord",
    label: "Discord",
    crop: null,
    note: "Image keeps its shape. The bar uses theme-color.",
  },
  { id: "imessage", label: "iMessage", crop: 1.91, note: "Title and domain in the bubble." },
];

/** Pixels of the source image a platform's crop removes from each side. */
export function cropLoss(w: number, h: number, ratio: number | null) {
  if (!ratio) return { x: 0, y: 0 };
  return w / h > ratio
    ? { x: Math.round((w - h * ratio) / 2), y: 0 }
    : { x: 0, y: Math.round((h - w / ratio) / 2) };
}

export function describeCrop(w: number, h: number, ratio: number | null): string {
  const { x, y } = cropLoss(w, h, ratio);
  if (x <= 2 && y <= 2) return "Shown in full";
  return x ? `Crops ${x} px from the left and right` : `Crops ${y} px from the top and bottom`;
}
