import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeLumaVariance,
  computeTargetDimensions,
  prepareApplicationImage,
} from "./image-compress";

afterEach(() => vi.unstubAllGlobals());

describe("computeTargetDimensions", () => {
  it.each([
    [4032, 3024, 1920, 1440],
    [3024, 4032, 1440, 1920],
    [640, 400, 640, 400],
    [1920, 1920, 1920, 1920],
    [4000, 1, 1920, 1],
  ])(
    "scales %d × %d to %d × %d",
    (width, height, expectedWidth, expectedHeight) => {
      expect(computeTargetDimensions(width, height, 1920)).toEqual({
        width: expectedWidth,
        height: expectedHeight,
      });
    },
  );
});

describe("computeLumaVariance", () => {
  it("reports zero for a flat field or a linear gradient", () => {
    expect(computeLumaVariance(new Uint8Array(16).fill(40), 4, 4)).toBe(0);
    expect(
      computeLumaVariance(
        [0, 5, 10, 15, 0, 5, 10, 15, 0, 5, 10, 15, 0, 5, 10, 15],
        4,
        4,
      ),
    ).toBe(0);
  });

  it("reports larger variance for pronounced edges", () => {
    const luma = Uint8Array.from({ length: 16 }, (_, i) =>
      ((i % 4) + Math.floor(i / 4)) % 2 ? 255 : 0,
    );
    expect(computeLumaVariance(luma, 4, 4)).toBe(1020 ** 2);
  });

  it("handles samples too narrow to measure edges", () => {
    expect(computeLumaVariance([0, 255], 2, 1)).toBe(0);
  });
});

describe("prepareApplicationImage", () => {
  it("validates MIME type and size when image decoding is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", undefined);
    const original = new File(["photo"], "id.png", { type: "image/png" });
    await expect(prepareApplicationImage(original)).resolves.toEqual({
      file: original,
      blurWarning: null,
    });
    await expect(
      prepareApplicationImage(
        new File(["photo"], "id.gif", { type: "image/gif" }),
      ),
    ).rejects.toThrow("JPG, PNG or WebP");
    await expect(
      prepareApplicationImage(
        new File([new ArrayBuffer(2 * 1024 * 1024 + 1)], "id.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toThrow("2 MB");
  });

  it("rejects a decoded photo under 640 pixels wide and releases the bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 639, height: 1000, close }),
    );
    await expect(
      prepareApplicationImage(
        new File(["photo"], "id.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("640 pixels wide");
    expect(close).toHaveBeenCalledOnce();
  });

  it("compresses large originals until they fit and returns a non-blocking blur hint", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4032, height: 3024, close }),
    );
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(
        (_x: number, _y: number, width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
      ),
    };
    const qualities: number[] = [];
    const canvas = {
      getContext: () => context,
      toBlob(callback: (result: Blob) => void, type: string, quality: number) {
        qualities.push(quality);
        callback(
          new Blob(
            [new ArrayBuffer(quality === 0.88 ? 2 * 1024 * 1024 : 50_000)],
            { type },
          ),
        );
      },
    };
    vi.stubGlobal("document", { createElement: () => ({ ...canvas }) });
    const result = await prepareApplicationImage(
      new File([new ArrayBuffer(4 * 1024 * 1024)], "photo.webp", {
        type: "image/webp",
      }),
    );
    expect(qualities).toEqual([0.88, 0.78]);
    expect(result.file).toMatchObject({
      name: "photo.jpg",
      type: "image/jpeg",
      size: 50_000,
    });
    expect(result.blurWarning).toContain("blurry");
    expect(close).toHaveBeenCalledOnce();
  });
});
