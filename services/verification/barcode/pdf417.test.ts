import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import sharp from "sharp";
import { decodeSmartNicPdf417, parseSriLankanNicPdf417 } from "./pdf417";
import { nic } from "../fixtures.test-support";

async function testBarcode(payload: string) {
  prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        new URL(import.meta.resolve("zxing-wasm/writer/zxing_writer.wasm")),
      ),
    },
  });
  const result = await writeBarcode(payload, { format: "PDF417", scale: 4 });
  if (!result.image) throw new Error("Could not generate test barcode.");
  return Buffer.from(await result.image.arrayBuffer());
}

describe("Smart NIC PDF417", () => {
  it("decodes a real rotated PDF417 image with the packaged Node WASM", async () => {
    const payload = JSON.stringify({ nic, dob: "1990-03-01" });
    const rotated = await sharp(await testBarcode(payload))
      .rotate(90)
      .png()
      .toBuffer();
    expect(await decodeSmartNicPdf417(rotated)).toBe(payload);
    expect(parseSriLankanNicPdf417(payload)).toEqual({
      nicNumber: nic,
      birthDate: "1990-03-01",
    });
  });

  it("returns null for a valid image without PDF417", async () => {
    const blank = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect(await decodeSmartNicPdf417(blank)).toBeNull();
  });

  it("recognizes old and unlabeled numbers and rejects ambiguous payloads", () => {
    expect(parseSriLankanNicPdf417("NIC=900611234v; DOB=19900301")).toEqual({
      nicNumber: nic,
      birthDate: "1990-03-01",
    });
    expect(parseSriLankanNicPdf417(nic)).toEqual({
      nicNumber: nic,
      birthDate: null,
    });
    expect(
      parseSriLankanNicPdf417(`NIC=${nic}; DOB=1990-03-01; ISSUED=2024-05-02`),
    ).toEqual({
      nicNumber: nic,
      birthDate: "1990-03-01",
    });
    expect(parseSriLankanNicPdf417(`${nic}|${nic.slice(0, -1)}5`)).toBeNull();
    expect(parseSriLankanNicPdf417(`${nic}|1990-02-30`)).toBeNull();
    expect(parseSriLankanNicPdf417(`A${nic}B`)).toBeNull();
  });
});
