import {
  DETECTION_TYPES,
  type Detection,
  type DetectionType,
} from "./types.js";

const TYPE_PRECEDENCE: readonly DetectionType[] = [
  "IBAN",
  "CREDIT_CARD",
  "BSN",
  "EMAIL",
  "PHONE",
  "PERSON",
  "ADDRESS",
];

function isValidDetection(detection: Detection, textLength: number): boolean {
  return (
    Number.isInteger(detection.start) &&
    Number.isInteger(detection.end) &&
    detection.start >= 0 &&
    detection.end > detection.start &&
    detection.end <= textLength &&
    DETECTION_TYPES.includes(detection.type)
  );
}

function overlaps(a: Detection, b: Detection): boolean {
  return a.start < b.end && b.start < a.end;
}

function rank(a: Detection, b: Detection): number {
  if (a.source !== b.source) return a.source === "structured" ? -1 : 1;

  const lengthDifference = b.end - b.start - (a.end - a.start);
  if (lengthDifference !== 0) return lengthDifference;

  const typeDifference =
    TYPE_PRECEDENCE.indexOf(a.type) - TYPE_PRECEDENCE.indexOf(b.type);
  if (typeDifference !== 0) return typeDifference;

  return a.start - b.start || a.end - b.end;
}

export function mergeDetections(
  candidates: readonly Detection[],
  textLength: number,
): Detection[] {
  const accepted: Detection[] = [];

  for (const candidate of candidates
    .filter((item) => isValidDetection(item, textLength))
    .sort(rank)) {
    if (!accepted.some((existing) => overlaps(candidate, existing))) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
}
