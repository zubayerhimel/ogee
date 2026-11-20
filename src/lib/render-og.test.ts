import { describe, expect, it } from "vitest";
import { nearestWeight } from "./og-types";
import { coverOffset, seededRandom } from "./render-og";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed, so grain is stable across renders", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe("coverOffset", () => {
  it("centres by default and pins edges at 0 and 1 without exposing the frame", () => {
    // 1200px frame, image drawn 1800px wide: 600px to spare.
    expect(coverOffset(1200, 1800, 0.5)).toBe(-300);
    expect(coverOffset(1200, 1800, 0)).toBe(-0);
    expect(coverOffset(1200, 1800, 1)).toBe(-600);
    expect(coverOffset(1200, 1800, 3)).toBe(-600);
  });
});

describe("nearestWeight", () => {
  it("snaps to a weight the font actually ships", () => {
    expect(nearestWeight("'Inter'", 600)).toBe(600);
    expect(nearestWeight("'Space Mono'", 600)).toBe(700);
    expect(nearestWeight("'Anton'", 700)).toBe(400);
  });
});