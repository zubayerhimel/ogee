import { describe, expect, it } from "vitest";
import { imageDimensions } from "./image-size";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("imageDimensions", () => {
  it("reads PNG", () => {
    const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", [
      0, 0, 0x04, 0xb0, 0, 0, 0x02, 0x76,
    ]);
    expect(imageDimensions(png)).toEqual({ width: 1200, height: 630 });
  });

  it("skips JPEG APP segments to reach the SOF frame", () => {
    const app0 = [0xff, 0xe0, 0, 6, 1, 2, 3, 4];
    const sof2 = [0xff, 0xc2, 0, 17, 8, 0x02, 0x76, 0x04, 0xb0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(imageDimensions(bytes([0xff, 0xd8], app0, sof2))).toEqual({ width: 1200, height: 630 });
  });

  it("reads GIF and WebP (VP8X)", () => {
    expect(imageDimensions(bytes("GIF89a", [0x58, 0x02, 0x3b, 0x01]))).toEqual({
      width: 600,
      height: 315,
    });
    const vp8x = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0, 0, 0, 0, 0], [
      0xaf, 0x04, 0x00, 0x75, 0x02, 0x00,
    ]);
    expect(imageDimensions(vp8x)).toEqual({ width: 1200, height: 630 });
  });

  it("returns null for unknown formats", () => {
    expect(imageDimensions(bytes("<svg xmlns"))).toBeNull();
  });
});
