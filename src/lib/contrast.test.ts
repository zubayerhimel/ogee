import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, sampleContrast } from "./contrast";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it("parses short and long hex, rejects anything else", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("0b1020")).toEqual([11, 16, 32]);
    expect(parseHex("rebeccapurple")).toBeNull();
  });

  it("samples the pixels behind the text, blending translucent text", () => {
    // 8×8 image: left half black, right half white.
    const width = 8;
    const data = new Uint8ClampedArray(width * width * 4);
    for (let i = 0; i < width * width; i++) {
      const v = i % width < 4 ? 0 : 255;
      data.set([v, v, v, 255], i * 4);
    }
    const pixels = { data, width, height: width };
    const white: [number, number, number] = [255, 255, 255];
    expect(sampleContrast(pixels, [{ x: 0, y: 0, w: 4, h: 8 }], white)).toBeCloseTo(21, 5);
    // Text over the white half is invisible, and that worst case wins.
    expect(sampleContrast(pixels, [{ x: 0, y: 0, w: 8, h: 8 }], white)).toBeCloseTo(1, 5);
    // 50% white over black lands near mid-grey.
    const half = sampleContrast(pixels, [{ x: 0, y: 0, w: 4, h: 8 }], white, 0.5) ?? 0;
    expect(half).toBeGreaterThan(4);
    expect(half).toBeLessThan(6);
  });
});
