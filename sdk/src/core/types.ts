export const DETECTION_TYPES = [
  "GIVEN_NAME", "SURNAME", "PERSON",
  "STREET", "BUILDING_NUMBER", "POSTAL_CODE", "CITY", "ADDRESS",
  "EMAIL", "PHONE", "URL", "IBAN", "CREDIT_CARD", "BSN", "GOVERNMENT_ID",
  "DATE", "AGE",
] as const;

export type DetectionType = typeof DETECTION_TYPES[number];
export type DetectionSource = "model" | "structured";
export type Detection = { start: number; end: number; type: DetectionType; source: DetectionSource };

export const CONTEXTUAL_DETECTION_TYPES: readonly DetectionType[] = [
  "GIVEN_NAME", "SURNAME", "PERSON", "STREET", "BUILDING_NUMBER", "POSTAL_CODE", "CITY", "ADDRESS",
  "GOVERNMENT_ID", "DATE", "AGE",
];

export const DEFAULT_REDACTION_TYPES: readonly DetectionType[] = DETECTION_TYPES.filter(
  type => type !== "DATE" && type !== "AGE" && type !== "URL",
);

const aliases: Record<string, DetectionType> = {
  STREET_NAME: "STREET", ZIP_CODE: "POSTAL_CODE", POSTCODE: "POSTAL_CODE",
  EMAIL_ADDRESS: "EMAIL", PHONE_NUMBER: "PHONE", IBAN_CODE: "IBAN", PAYMENT_CARD: "CREDIT_CARD",
  LOCATION: "ADDRESS", SECONDARY_ADDRESS: "ADDRESS", STATE: "ADDRESS", DATE_TIME: "DATE",
};

export function canonicalEntityType(label: string): DetectionType | undefined {
  if ((DETECTION_TYPES as readonly string[]).includes(label)) return label as DetectionType;
  return Object.hasOwn(aliases, label) ? aliases[label] : undefined;
}
