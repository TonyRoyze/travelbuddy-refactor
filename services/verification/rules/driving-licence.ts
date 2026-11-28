import type { ExtractionBySlot } from "../providers/vision-ai";
import { requiredEvidence, rule } from "./evidence";
import { compareSriLankanNames } from "./names";
import { daysUntilColomboDate, normalizeNic } from "./nic";

const coverage = {
  A: ["A1", "G1"],
  A1: ["G1"],
  B: ["G1"],
  B1: ["G1"],
  C1: ["B", "G1"],
  C: ["C1", "B", "J", "G", "G1"],
  CE: ["C", "C1", "B", "B1", "G", "G1", "J"],
  D1: ["C1", "B", "B1", "G", "G1"],
  D: ["D1", "C", "C1", "B", "B1", "G", "G1", "J"],
  DE: ["D", "D1", "CE", "C", "C1", "B", "B1", "G", "G1", "J"],
  G: ["G1"],
  G1: [],
  J: ["G1"],
} as const;
type Category = keyof typeof coverage;

export function normalizeVehicleCategory(
  value: string | null | undefined,
  seats?: number | null,
  grossWeightKg?: number | null,
): Category | null {
  const code = value?.normalize("NFKC").trim().toUpperCase() ?? "";
  const compact = code.replace(/[\s-]/g, "");
  if (Object.hasOwn(coverage, compact)) return compact as Category;

  if (
    /^(?:MOTOR )?TRICYCLE(?: VAN)?$|^THREE[ -]WHEELER$|^TUK[ -]?TUK$/.test(code)
  )
    return "B1";
  if (/^LIGHT MOTOR ?CYCLE$/.test(code)) return "A1";
  if (/^(?:MOTOR ?CYCLE|MOTOR ?BIKE)$/.test(code)) return "A";
  if (/^(?:MOTOR )?CAR$/.test(code)) return seats && seats > 9 ? null : "B";
  if (/^DUAL[ -]PURPOSE(?: MOTOR VEHICLE)?$/.test(code))
    return (!seats || seats <= 9) &&
      typeof grossWeightKg === "number" &&
      grossWeightKg <= 3500
      ? "B"
      : null;
  if (/^(?:PASSENGER )?VAN$/.test(code) && seats)
    return seats <= 9 ? "B" : seats <= 33 ? "D1" : "D";
  if (/^LIGHT MOTOR (?:COACH|BUS)$/.test(code)) return "D1";
  if (/^(?:MOTOR )?(?:COACH|BUS)$/.test(code)) return "D";
  if (/^LIGHT MOTOR LORRY$/.test(code)) return "C1";
  if (/^HEAVY MOTOR LORRY$/.test(code)) return "CE";
  if (/^(?:MOTOR )?LORRY$/.test(code)) return "C";
  return null;
}

function normalizeLicenceNumber(value: string | null | undefined): string | null {
  const normalized =
    value?.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "") ?? "";
  return normalized || null;
}

export function dlCoversVehicleClass(
  licenceClasses: readonly string[],
  vehicleClass: string,
): boolean {
  const target = normalizeVehicleCategory(vehicleClass);
  return (
    !!target &&
    licenceClasses.some((value) => {
      const category = normalizeVehicleCategory(value);
      return (
        !!category &&
        (category === target ||
          (coverage[category] as readonly string[]).includes(target))
      );
    })
  );
}

export function evaluateDrivingLicenceRules(input: {
  front?: ExtractionBySlot["driving-licence-front"];
  back?: ExtractionBySlot["driving-licence-back"];
  canonicalNic: string | null;
  birthDate: string;
  legalName: string;
  nicName?: string;
  vehicleClass: Category | null;
  now: Date;
}) {
  const {
    front,
    back,
    canonicalNic,
    birthDate,
    legalName,
    nicName,
    vehicleClass,
    now,
  } = input;
  const readNic = normalizeNic(
    requiredEvidence(front, "nicNumber", front?.fields.nicNumber),
  );
  const readDob = requiredEvidence(front, "birthDate", front?.fields.birthDate);
  const identity =
    !readNic || !canonicalNic || !readDob
      ? "amber"
      : readNic === canonicalNic && readDob === birthDate
        ? "pass"
        : "red";
  const expiryDate = requiredEvidence(
    front,
    "expiresAt",
    front?.fields.expiresAt,
  );
  const expiry = expiryDate ? daysUntilColomboDate(expiryDate, now) : null;
  const expiryStatus =
    expiry === null || (expiry > 0 && expiry <= 30)
      ? "amber"
      : expiry <= 0
        ? "red"
        : "pass";
  const classes = requiredEvidence(back, "classes", back?.fields.classes);
  const classesKnown =
    !!classes?.length &&
    classes.every(
      ({ category, expiresAt }) =>
        normalizeVehicleCategory(category) &&
        (!expiresAt || daysUntilColomboDate(expiresAt, now) !== null),
    );
  const active =
    classes
      ?.filter(
        ({ expiresAt }) =>
          !expiresAt || (daysUntilColomboDate(expiresAt, now) ?? -1) > 0,
      )
      .map(({ category }) => category) ?? [];
  const frontLicence = normalizeLicenceNumber(
    requiredEvidence(front, "licenceNumber", front?.fields.licenceNumber),
  );
  const backLicence = normalizeLicenceNumber(
    requiredEvidence(back, "licenceNumber", back?.fields.licenceNumber),
  );
  const licenceMismatch =
    !!frontLicence && !!backLicence && frontLicence !== backLicence;
  const licenceLinked =
    !!frontLicence && !!backLicence && frontLicence === backLicence;
  const covered =
    classesKnown && vehicleClass
      ? dlCoversVehicleClass(active, vehicleClass)
      : null;
  const classStatus =
    licenceMismatch || covered === false
      ? "red"
      : !licenceLinked || covered !== true
        ? "amber"
        : "pass";
  const name = requiredEvidence(front, "fullName", front?.fields.fullName);
  const nameMatches =
    !!name &&
    !!nicName &&
    compareSriLankanNames(legalName, nicName) &&
    compareSriLankanNames(legalName, name) &&
    compareSriLankanNames(nicName, name);

  return [
    rule(
      "DL-01",
      identity,
      "Driving licence identity fields checked.",
      "driving-licence-front",
      "Upload the front of your own driving licence and check the details you entered.",
    ),
    rule(
      "DL-02",
      expiryStatus,
      "Driving licence expiry checked.",
      "driving-licence-front",
      expiryStatus === "red"
        ? "Upload a current driving licence."
        : expiry !== null && expiryStatus === "amber"
          ? "Your driving licence expires soon. Renew it before it expires."
          : undefined,
    ),
    rule(
      "DL-03",
      classStatus,
      "Active driving licence classes checked against the vehicle.",
      "driving-licence-back",
      licenceMismatch
        ? "Upload the front and back of the same driving licence."
        : "Upload a driving licence that covers the vehicle you plan to use.",
    ),
    rule(
      "DL-04",
      nameMatches ? "pass" : "amber",
      "Names compared across the application and identity documents.",
      "driving-licence-front",
    ),
  ];
}
