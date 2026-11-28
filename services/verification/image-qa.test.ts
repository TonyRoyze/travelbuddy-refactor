import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectApplicationImage } from "./image-qa";
import { patternedImage } from "./fixtures.test-support";

describe("inspectApplicationImage", () => {
  it("checks actual format, image width, and visual detail", async () => {
    const source = await patternedImage();
    const output = await inspectApplicationImage(
      source.toString("base64"),
      "image/png",
    );
    expect(output).toMatchObject({
      decodable: true,
      width: 720,
      height: 680,
      isTooSmall: false,
      isBlurry: false,
      hasHeavyGlare: false,
    });
    expect(output.sharpnessScore).toBeGreaterThan(0);
    expect(output.originalBuffer).toEqual(source);
    expect((await sharp(output.normalizedJpegBuffer!).metadata()).format).toBe(
      "jpeg",
    );
    expect(
      (await inspectApplicationImage(source.toString("base64"), "image/jpeg"))
        .decodable,
    ).toBe(false);
    expect(
      (await inspectApplicationImage("bm90IGFuIGltYWdl", "image/png"))
        .decodable,
    ).toBe(false);
  });

  it("auto-orients using EXIF before checking width and bounds the JPEG dimensions", async () => {
    const source = await sharp(await patternedImage(600, 2200))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const output = await inspectApplicationImage(
      source.toString("base64"),
      "image/jpeg",
    );
    expect(output).toMatchObject({
      width: 2200,
      height: 600,
      isTooSmall: false,
    });
    const normalized = await sharp(output.normalizedJpegBuffer!).metadata();
    expect(normalized.width).toBe(1920);
    expect(normalized.height).toBeLessThan(600);
    expect(normalized.orientation).toBeUndefined();
  });

  it("detects undersized, featureless, blown-out photos", async () => {
    const source = await sharp({
      create: { width: 639, height: 500, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect(
      await inspectApplicationImage(source.toString("base64"), "image/png"),
    ).toMatchObject({
      decodable: true,
      isTooSmall: true,
      isBlurry: true,
      glareRatio: 1,
      hasHeavyGlare: true,
    });
  });
});
