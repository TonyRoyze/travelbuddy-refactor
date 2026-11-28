const inputTypes = ["image/jpeg", "image/png", "image/webp"];
const outputLimit = 1.8 * 1024 * 1024;
const fallbackLimit = 2 * 1024 * 1024;

export function computeTargetDimensions(
  width: number,
  height: number,
  maxDim: number,
) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function computeLumaVariance(
  lumaBytes: ArrayLike<number>,
  width: number,
  height: number,
) {
  // The Laplacian measures local contrast at edges, even across an unevenly lit photo.
  let sum = 0;
  let squares = 0;
  const count = (width - 2) * (height - 2);
  if (width < 3 || height < 3) return 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const edge =
        4 * lumaBytes[i] -
        lumaBytes[i - 1] -
        lumaBytes[i + 1] -
        lumaBytes[i - width] -
        lumaBytes[i + width];
      sum += edge;
      squares += edge * edge;
    }
  }
  return Math.max(0, squares / count - (sum / count) ** 2);
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Safari may support decoding the file through an HTML image instead.
    }
  }
  if (typeof Image === "undefined")
    throw new Error("Could not open this image. Select another photo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not open this image. Select another photo."));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function prepareApplicationImage(
  file: File,
): Promise<{ file: File; blurWarning: string | null }> {
  if (!inputTypes.includes(file.type) || file.size === 0) {
    throw new Error("Choose a valid JPG, PNG or WebP image.");
  }
  function useOriginal() {
    if (file.size > fallbackLimit)
      throw new Error(
        "This device could not compress the image. Choose a photo of 2 MB or smaller.",
      );
    return { file, blurWarning: null };
  }
  if (typeof createImageBitmap !== "function" && typeof Image === "undefined") {
    return useOriginal();
  }

  const decoded = await decodeImage(file);
  try {
    if (decoded.width < 640)
      throw new Error("Choose a photo at least 640 pixels wide.");
    if (typeof document === "undefined") return useOriginal();

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context || typeof canvas.toBlob !== "function") return useOriginal();

    const { width, height } = computeTargetDimensions(
      decoded.width,
      decoded.height,
      1920,
    );
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.image, 0, 0, width, height);

    const sample = document.createElement("canvas");
    const size = computeTargetDimensions(width, height, 160);
    sample.width = size.width;
    sample.height = size.height;
    let blurWarning = null;
    const sampleContext = sample.getContext("2d");
    if (sampleContext) {
      sampleContext.drawImage(canvas, 0, 0, size.width, size.height);
      const { data } = sampleContext.getImageData(
        0,
        0,
        size.width,
        size.height,
      );
      const luma = new Uint8Array(size.width * size.height);
      for (let i = 0; i < luma.length; i++) {
        luma[i] = Math.round(
          0.299 * data[4 * i] +
            0.587 * data[4 * i + 1] +
            0.114 * data[4 * i + 2],
        );
      }
      if (
        size.width >= 3 &&
        size.height >= 3 &&
        computeLumaVariance(luma, size.width, size.height) < 65
      ) {
        blurWarning =
          "This photo may be blurry. Check that the face or text is clear.";
      }
    }

    for (const quality of [0.88, 0.78, 0.68, 0.56]) {
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!jpeg || jpeg.type !== "image/jpeg") return useOriginal();
      if (jpeg.size <= outputLimit) {
        return {
          file: new File([jpeg], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
            type: jpeg.type,
          }),
          blurWarning,
        };
      }
    }
    throw new Error(
      "This photo is still too large after compression. Choose a smaller photo.",
    );
  } finally {
    decoded.release();
  }
}
