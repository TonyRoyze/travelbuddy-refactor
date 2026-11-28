import sharp from "sharp";

const formats = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
type Mime = keyof typeof formats;

export interface ImageInspection {
  decodable: boolean;
  width: number;
  height: number;
  isTooSmall: boolean;
  sharpnessScore: number;
  isBlurry: boolean;
  glareRatio: number;
  hasHeavyGlare: boolean;
  normalizedJpegBase64: string | null;
  normalizedJpegBuffer: Buffer | null;
  originalBuffer: Buffer;
}

export async function inspectApplicationImage(
  base64: string,
  mimeType: string,
): Promise<ImageInspection> {
  const originalBuffer = Buffer.from(base64, "base64");
  const invalid: ImageInspection = {
    decodable: false,
    width: 0,
    height: 0,
    isTooSmall: true,
    sharpnessScore: 0,
    isBlurry: false,
    glareRatio: 0,
    hasHeavyGlare: false,
    normalizedJpegBase64: null,
    normalizedJpegBuffer: null,
    originalBuffer,
  };
  if (
    !Object.hasOwn(formats, mimeType) ||
    !originalBuffer.length ||
    originalBuffer.length > 5 * 1024 * 1024
  )
    return invalid;

  try {
    const image = sharp(originalBuffer, {
      limitInputPixels: 24_000_000,
    }).timeout({ seconds: 10 });
    const metadata = await image.metadata();
    if (
      metadata.format !== formats[mimeType as Mime] ||
      (metadata.pages ?? 1) !== 1
    )
      return invalid;
    const { width, height } = metadata.autoOrient;
    const jpeg = await image
      .autoOrient()
      .flatten({ background: "white" })
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const gray = await sharp(jpeg)
      .resize(384, 384, { fit: "inside", withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = gray.info;
    let sum = 0,
      squaredSum = 0,
      highlights = 0;
    for (const pixel of gray.data) if (pixel >= 250) highlights++;
    for (let row = 1; row < h - 1; row++) {
      for (let col = 1; col < w - 1; col++) {
        const i = row * w + col;
        const laplacian =
          gray.data[i - 1] +
          gray.data[i + 1] +
          gray.data[i - w] +
          gray.data[i + w] -
          4 * gray.data[i];
        sum += laplacian;
        squaredSum += laplacian ** 2;
      }
    }
    const samples = Math.max(1, (w - 2) * (h - 2));
    const sharpnessScore = Math.max(
      0,
      squaredSum / samples - (sum / samples) ** 2,
    );
    const glareRatio = highlights / gray.data.length;
    return {
      decodable: true,
      width,
      height,
      isTooSmall: width < 640,
      sharpnessScore,
      isBlurry: sharpnessScore < 45,
      glareRatio,
      hasHeavyGlare: glareRatio >= 0.4,
      normalizedJpegBase64: jpeg.toString("base64"),
      normalizedJpegBuffer: jpeg,
      originalBuffer,
    };
  } catch {
    return invalid;
  }
}
