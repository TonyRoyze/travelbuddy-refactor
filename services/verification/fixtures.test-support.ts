import sharp from "sharp";
import type { ImageInspection } from "./image-qa";
import {
  extractionSchemas,
  type DocumentExtraction,
  type ExtractionBySlot,
} from "./providers/vision-ai";
import type { DocumentSlot, VerificationJob } from "./types";

export const accountId = "10000000-0000-4000-8000-000000000001";
export const sessionId = "10000000-0000-4000-8000-000000000002";
export const date = new Date("2026-11-28T10:00:00Z");
export const nic = "199006101234";
export const name = "Herath Mudiyanselage Kasun Silva";
export const job: VerificationJob = {
  jobId: "10000000-0000-4000-8000-000000000003",
  leaseId: "10000000-0000-4000-8000-000000000004",
  accountId,
  submittedAt: date.toISOString(),
  attempts: 1,
  recentSubmissions24h: 1,
  consecutiveSpoofFailures: 0,
  livenessSessionId: sessionId,
  details: {
    displayName: "Kasun",
    legalName: name,
    birthDate: "1990-03-01",
    phone: "+94770000000",
    documentType: "nic",
    nicNumber: nic,
    service: "local",
    homeBase: "Galle",
    intro: "",
    languages: "English",
    faceComparisonConsent: true,
  },
  images: {},
};
export const inspected: ImageInspection = {
  decodable: true,
  width: 800,
  height: 800,
  isTooSmall: false,
  sharpnessScore: 200,
  isBlurry: false,
  glareRatio: 0.01,
  hasHeavyGlare: false,
  normalizedJpegBase64: "AA==",
  normalizedJpegBuffer: Buffer.from([0]),
  originalBuffer: Buffer.from([0]),
};

export function extraction<K extends DocumentSlot>(
  slot: K,
  fields: ExtractionBySlot[K]["fields"],
  detectedDocumentType: DocumentExtraction["detectedDocumentType"] = slot ===
  "id-front"
    ? "nic-front"
    : slot === "id-back"
      ? "nic-back"
      : slot,
): ExtractionBySlot[K] {
  return extractionSchemas[slot].parse({
    detectedDocumentType,
    qualityFlags: [],
    fields,
    fieldConfidences: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        value === null ? 0 : 0.95,
      ]),
    ),
    overallConfidence: 0.95,
  }) as ExtractionBySlot[K];
}

export const idFront = extraction("id-front", {
  nicNumber: nic,
  fullName: name,
  birthDate: "1990-03-01",
  nicFormat: "smart",
});
export const idBack = extraction("id-back", {});
export const dlFront = extraction("driving-licence-front", {
  nicNumber: nic,
  fullName: "H.M. Kasun Silva",
  birthDate: "1990-03-01",
  licenceNumber: "TEST-LICENCE-123",
  issueDate: "2024-10-03",
  expiresAt: "2028-01-02",
});
export const dlBack = extraction("driving-licence-back", {
  licenceNumber: "TEST-LICENCE-123",
  classes: [{ category: "B", expiresAt: "2028-01-02" }],
});
export const registration = extraction("vehicle", {
  plate: "WP CAB-1234",
  chassisNumber: "TESTCHASSIS",
  engineNumber: "TESTENGINE",
  vehicleClass: "Motor Car",
  makeModel: null,
  manufactureYear: null,
  seatingCapacity: 5,
  grossWeightKg: 1450,
  ownerName: name,
  ownerNic: nic,
  absoluteOwner: "Example Bank PLC",
});
export const policy = extraction("insurance", {
  insurer: "Ceylinco General Insurance Ltd",
  policyNumber: null,
  plate: "CAB 1234",
  chassisNumber: "TESTCHASSIS",
  engineNumber: null,
  coverageType: "Comprehensive",
  usage: "hiring",
  startsAt: "2026-10-28",
  expiresAt: "2027-10-28",
  temporaryCoverNote: false,
});
export const revenue = extraction("revenue-licence", {
  plate: "CAB1234",
  expiresAt: "2027-10-28",
});

export async function patternedImage(width = 720, height = 680) {
  const raw = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      raw[y * width + x] =
        (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? 50 : 205;
  return sharp(raw, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}
