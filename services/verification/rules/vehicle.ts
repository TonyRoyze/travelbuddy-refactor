import type { ExtractionBySlot } from "../providers/vision-ai";
import { requiredEvidence, rule } from "./evidence";
import { daysUntilColomboDate, normalizeNic } from "./nic";

const provinceCodes = "WP|CP|SP|NP|EP|NW|NC|UP|SG|SB";

function plateParts(value: string | null | undefined) {
  const text =
    value
      ?.normalize("NFKC")
      .toUpperCase()
      .replace(/[\s.\p{Pd}]/gu, "") ?? "";
  const match = text.match(
    new RegExp(
      `^(?:(${provinceCodes}))?([A-Z]{2,3}\\d{4}|\\d{2,3}\\d{4}|\\d{1,3}ශ්‍රී\\d{4})$`,
    ),
  );
  return match && { province: match[1], plate: match[2] };
}

export function normalizePlate(
  value: string | null | undefined,
): string | null {
  return plateParts(value)?.plate ?? null;
}

const insurers = [
  /^(?:SLIC(?: GENERAL)?|SRI LANKA(?: INSURANCE(?: CORP(?:ORATION)?)?)?(?: GENERAL)?)$/,
  /^CEYLINCO(?: GENERAL)?$/,
  /^FAIRFIRST$/,
  /^ALLIANZ(?: INSURANCE)?(?: LANKA)?$/,
  /^JANASHAKTHI(?: GENERAL)?$/,
  /^HNB GENERAL$/,
  /^LOLC(?: GENERAL)?$/,
  /^SOFTLOGIC(?: GENERAL)?$/,
  /^PEOPLES?$/,
  /^COOPERATIVE$/,
  /^SANASA(?: GENERAL)?$/,
  /^ORIENT$/,
  /^CONTINENTAL$/,
  /^AMANA TAKAFUL(?: GENERAL)?$/,
  /^MBSL$/,
];
function organizationName(value: string) {
  return value
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+(?:PLC|LTD|LIMITED|PVT LIMITED|PVT LTD|PRIVATE LIMITED)$/, "")
    .trim();
}

export function isLicensedSriLankanInsurer(value: string): boolean {
  const name = organizationName(value)
    .replace(/\s+INSURANCE(?: COMPANY| CO)?$/, "")
    .replace(/^CO OPERATIVE$/, "COOPERATIVE");
  return insurers.some((insurer) => insurer.test(name));
}

export function isLeasedBankOwner(value: string): boolean {
  const name = organizationName(value);
  return /\b(?:BANK|LEASING|FINANCE|FINANCIAL SERVICES)\b/.test(name);
}

function serial(value: string | undefined) {
  const normalized = value
    ?.normalize("NFKC")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return normalized &&
    /^[A-Z0-9]{4,40}$/.test(normalized) &&
    !/^(?:NONE|NULL|NILA|UNKNOWN|NOTAVAILABLE)$/.test(normalized)
    ? normalized
    : undefined;
}

export function evaluateVehicleRules(input: {
  vehicle?: ExtractionBySlot["vehicle"];
  insurance?: ExtractionBySlot["insurance"];
  revenue?: ExtractionBySlot["revenue-licence"];
  authorization?: ExtractionBySlot["owner-authorization"];
  canonicalNic: string | null;
  thirdPartyVehicle?: boolean | null;
  duplicatePlate?: boolean;
  now: Date;
}) {
  const {
    vehicle,
    insurance,
    revenue,
    authorization,
    canonicalNic,
    thirdPartyVehicle,
    duplicatePlate,
    now,
  } = input;
  const plates = [
    plateParts(requiredEvidence(vehicle, "plate", vehicle?.fields.plate)),
    plateParts(requiredEvidence(insurance, "plate", insurance?.fields.plate)),
    plateParts(requiredEvidence(revenue, "plate", revenue?.fields.plate)),
  ];
  const knownPlates = new Set(
    plates.flatMap((plate) => (plate ? [plate.plate] : [])),
  );
  const provinces = new Set(
    plates.flatMap((plate) => (plate?.province ? [plate.province] : [])),
  );
  const plateStatus =
    knownPlates.size > 1 || provinces.size > 1
      ? "red"
      : plates.every(Boolean)
        ? "pass"
        : "amber";

  const comparisons = (["chassisNumber", "engineNumber"] as const).flatMap(
    (field) => {
      const cr = serial(
        requiredEvidence(vehicle, field, vehicle?.fields[field]),
      );
      const policy = serial(
        requiredEvidence(insurance, field, insurance?.fields[field]),
      );
      return cr && policy ? [cr === policy] : [];
    },
  );
  const serialStatus = comparisons.some((match) => !match)
    ? "red"
    : comparisons.length > 0
      ? "pass"
      : "amber";
  const insurer = requiredEvidence(
    insurance,
    "insurer",
    insurance?.fields.insurer,
  );
  const expiryDate = requiredEvidence(
    insurance,
    "expiresAt",
    insurance?.fields.expiresAt,
  );
  const expiry = expiryDate ? daysUntilColomboDate(expiryDate, now) : null;
  const startsAt = requiredEvidence(
    insurance,
    "startsAt",
    insurance?.fields.startsAt,
  );
  const startsIn = startsAt ? daysUntilColomboDate(startsAt, now) : null;
  const coverNote = requiredEvidence(
    insurance,
    "temporaryCoverNote",
    insurance?.fields.temporaryCoverNote,
  );
  const insuranceStatus =
    (expiry !== null && expiry <= 0) ||
    (insurer && !isLicensedSriLankanInsurer(insurer)) ||
    (startsIn !== null && startsIn > 0)
      ? "red"
      : expiry === null || !insurer || (expiry < 14 && coverNote !== false)
        ? "amber"
        : "pass";
  const usage = requiredEvidence(insurance, "usage", insurance?.fields.usage);
  const revenueDate = requiredEvidence(
    revenue,
    "expiresAt",
    revenue?.fields.expiresAt,
  );
  const revenueExpiry = revenueDate
    ? daysUntilColomboDate(revenueDate, now)
    : null;

  const owner = normalizeNic(
    requiredEvidence(vehicle, "ownerNic", vehicle?.fields.ownerNic),
  );
  const absoluteOwner = requiredEvidence(
    vehicle,
    "absoluteOwner",
    vehicle?.fields.absoluteOwner,
  );
  const ownershipPass = !!owner && owner === canonicalNic && !thirdPartyVehicle;
  const signed = requiredEvidence(
    authorization,
    "signed",
    authorization?.fields.signed,
  );
  const authorizationPlate = normalizePlate(
    requiredEvidence(authorization, "plate", authorization?.fields.plate),
  );
  const letterPresent =
    signed && authorizationPlate && authorizationPlate === plates[0]?.plate;
  const ownershipMessage =
    ownershipPass && absoluteOwner && isLeasedBankOwner(absoluteOwner)
      ? "Applicant is the registered owner of a leased vehicle."
      : ownershipPass
        ? "Registered vehicle owner matches the applicant."
        : letterPresent
          ? "Third-party authorization needs review."
          : "Registered owner or authorization needs review.";

  return [
    rule(
      "VEH-01",
      plateStatus,
      "Registration plates compared across the vehicle documents.",
      "vehicle",
      "Upload vehicle documents that show the same registration plate.",
    ),
    rule(
      "VEH-02",
      serialStatus,
      "Chassis and engine numbers compared with the insurance certificate.",
      "insurance",
      "Upload insurance for the vehicle in your registration certificate.",
    ),
    rule(
      "VEH-03",
      insuranceStatus,
      "Insurance provider and validity checked.",
      "insurance",
      insuranceStatus === "red"
        ? "Upload a current motor insurance certificate from a licensed Sri Lankan insurer."
        : undefined,
    ),
    rule(
      "VEH-04",
      usage === "commercial" || usage === "hiring" ? "pass" : "amber",
      "Insurance use classification checked.",
      "insurance",
    ),
    rule(
      "VEH-05",
      revenueExpiry === null ? "amber" : revenueExpiry <= 0 ? "red" : "pass",
      "Revenue licence validity checked.",
      "revenue-licence",
      "Upload a valid revenue licence for your vehicle.",
    ),
    rule(
      "VEH-06",
      ownershipPass ? "pass" : "amber",
      ownershipMessage,
      "owner-authorization",
      !ownershipPass && !letterPresent
        ? "Provide a signed authorization from the vehicle’s registered owner."
        : undefined,
    ),
    rule(
      "VEH-07",
      duplicatePlate === false ? "pass" : "amber",
      duplicatePlate
        ? "Vehicle plate is associated with another account."
        : "Vehicle duplicate check evaluated.",
      "vehicle",
    ),
  ];
}
