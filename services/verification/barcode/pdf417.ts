import { readFileSync } from "node:fs";
import sharp from "sharp";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { isCalendarDate, normalizeNic } from "../rules/nic";

let initialized = false;

async function readPdf417(bytes: Buffer): Promise<string[]> {
  if (!initialized) {
    const wasm = new URL(
      import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"),
    );
    prepareZXingModule({ overrides: { wasmBinary: readFileSync(wasm) } });
    initialized = true;
  }
  const results = await readBarcodes(bytes, {
    formats: ["PDF417"],
    tryHarder: true,
    tryRotate: true,
  });
  return [
    ...new Set(
      results
        .filter((result) => result.isValid && result.text)
        .map((result) => result.text),
    ),
  ];
}

export async function decodeSmartNicPdf417(
  imageBuffer: Buffer,
): Promise<string | null> {
  const image = sharp(imageBuffer, { limitInputPixels: 24_000_000 }).timeout({
    seconds: 10,
  });
  const upright = image.autoOrient();
  const initial = await upright.clone().png().toBuffer();
  const payloads = await readPdf417(initial);
  if (payloads.length) return payloads.length === 1 ? payloads[0] : null;
  const enhanced = await readPdf417(
    await upright.greyscale().normalize().sharpen().png().toBuffer(),
  );
  return enhanced.length === 1 ? enhanced[0] : null;
}

export function parseSriLankanNicPdf417(
  rawText: string,
): { nicNumber: string; birthDate: string | null } | null {
  const matches = [
    ...rawText
      .toUpperCase()
      .matchAll(/(?<![\p{L}\d])(?:\d{12}|\d{9}[VX])(?![\p{L}\d])/gu),
  ];
  const numbers = new Set(
    matches
      .map(([value]) => normalizeNic(value))
      .filter((value): value is string => value !== null),
  );
  const nicNumber = numbers.values().next().value;
  if (numbers.size !== 1 || !nicNumber) return null;

  const labeled = [
    ...rawText.matchAll(
      /(?:\bDOB\b|date[ _-]?of[ _-]?birth|birth[ _-]?date)["']?\s*[:=]\s*["']?(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?!\d)/gi,
    ),
  ];
  const dates = labeled.length
    ? labeled.map(([, year, month, day]) => `${year}-${month}-${day}`)
    : [...rawText.matchAll(/(?<!\d)\d{4}[-/]\d{2}[-/]\d{2}(?!\d)/g)].map(
        ([value]) => value.replaceAll("/", "-"),
      );
  if (dates.some((date) => !isCalendarDate(date)) || new Set(dates).size > 1)
    return null;
  return { nicNumber, birthDate: dates[0] ?? null };
}
