import { describe, expect, it } from "vitest";
import { cropLoss, describeCrop } from "./platforms";

describe("platform crops", () => {
  it("treats 1200×630 at 1.91:1 as uncropped", () => {
    expect(describeCrop(1200, 630, 1.91)).toBe("Shown in full");
  });

  it("trims top and bottom of taller images", () => {
    expect(cropLoss(1200, 675, 1.91)).toEqual({ x: 0, y: 23 });
  });

  it("trims the sides of wide banners", () => {
    expect(describeCrop(1500, 500, 1.91)).toBe("Crops 273 px from the left and right");
  });

  it("never crops platforms that keep the original shape", () => {
    expect(cropLoss(1500, 500, null)).toEqual({ x: 0, y: 0 });
  });
});
