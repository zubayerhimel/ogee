import { describe, expect, it } from "vitest";
import { seededRandom } from "./render-og";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed, so grain is stable across renders", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});
