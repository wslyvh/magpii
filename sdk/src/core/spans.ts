import { DETECTION_TYPES, type Detection, type DetectionType } from "./types.js";

const precedence: readonly DetectionType[] = [
  "IBAN", "CREDIT_CARD", "BSN", "EMAIL", "PHONE", "URL", "GOVERNMENT_ID",
  "GIVEN_NAME", "SURNAME", "STREET", "BUILDING_NUMBER", "POSTAL_CODE", "CITY", "PERSON", "ADDRESS", "DATE", "AGE",
];

// Keep overlapping evidence until the caller has selected what to redact.
export function collectDetections(candidates: readonly Detection[], length: number): Detection[] {
  const unique = new Map<string, Detection>();
  for (const d of candidates) {
    if (!Number.isInteger(d.start) || !Number.isInteger(d.end) || d.start < 0 || d.end <= d.start || d.end > length ||
      !DETECTION_TYPES.includes(d.type) || !["model", "structured"].includes(d.source)) continue;
    unique.set(`${d.start}:${d.end}:${d.type}:${d.source}`, { ...d });
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end || precedence.indexOf(a.type) - precedence.indexOf(b.type));
}

// Resolve selected spans without losing the uncovered part of an overlapping entity.
export function mergeDetections(candidates: readonly Detection[], length: number): Detection[] {
  const ranked = collectDetections(candidates, length).sort((a, b) =>
    (a.source === b.source ? 0 : a.source === "structured" ? -1 : 1) ||
    (b.end - b.start) - (a.end - a.start) || precedence.indexOf(a.type) - precedence.indexOf(b.type) || a.start - b.start);
  const accepted: Detection[] = [];
  for (const candidate of ranked) {
    let fragments = [candidate];
    for (const existing of accepted) {
      fragments = fragments.flatMap(d => {
        if (d.start >= existing.end || d.end <= existing.start) return [d];
        return [
          ...(d.start < existing.start ? [{ ...d, end: existing.start }] : []),
          ...(d.end > existing.end ? [{ ...d, start: existing.end }] : []),
        ];
      });
    }
    accepted.push(...fragments);
  }
  return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
}
