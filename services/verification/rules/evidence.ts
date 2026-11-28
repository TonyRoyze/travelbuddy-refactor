import type { RuleOutcome } from "../types";
import type { DocumentExtraction } from "../providers/vision-ai";

export function rule(
  code: RuleOutcome["code"],
  status: RuleOutcome["status"],
  message: string,
  field?: string,
  applicantMessage?: string,
): RuleOutcome {
  return {
    code,
    status,
    message,
    ...(field && { field }),
    ...(applicantMessage && { applicantMessage }),
  };
}

export function reliableField(
  document: DocumentExtraction | undefined,
  field: string,
) {
  return (
    !!document &&
    document.overallConfidence >= 0.8 &&
    (document.fieldConfidences[field] ?? 0) >= 0.8
  );
}

export function requiredEvidence<T>(
  document: DocumentExtraction | undefined,
  field: string,
  value: T | null | undefined,
): T | undefined {
  return reliableField(document, field) &&
    value !== null &&
    value !== undefined &&
    value !== ""
    ? value
    : undefined;
}
