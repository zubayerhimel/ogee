/** Longest edge kept for uploads; plenty for a 1200px card at 2× without bloating the saved design. */
const MAX_EDGE = 2400;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export function isImageFile(file: File | null | undefined): file is File {
  return !!file && file.type.startsWith("image/");
}

/** The first image among dropped or pasted items, if any. */
export function firstImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) if (isImageFile(file)) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (isImageFile(file)) return file;
    }
  }
  return null;
}

/**
 * Reads an image into a data URL, downscaling big photos so saved designs (and undo
 * history) stay small. SVGs and GIFs are kept as-is (re-encoding would rasterise or freeze them).
 */
export async function readImageFile(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (/svg|gif/.test(file.type) || typeof document === "undefined") return original;
  const img = new Image();
  img.src = original;
  try {
    await img.decode();
  } catch {
    return original;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < 1_500_000) return original;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.9);
  // Browsers without WebP encoding hand back PNG; JPEG keeps photos small there.
  const encoded = webp.startsWith("data:image/webp")
    ? webp
    : canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
  return scale < 1 || encoded.length < original.length ? encoded : original;
}
