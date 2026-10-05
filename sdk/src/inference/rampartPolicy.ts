import type { Detection, DetectionType } from "../core/types.js";

export const RAMPART_MIN_SCORE = 0.4;

export type RampartSpan = {
  start: number;
  end: number;
  label: string;
  score: number;
};

type AddressKind = "street" | "coarse";
type PolicySpan = Detection & {
  addressKind?: AddressKind;
  hasStreet?: boolean;
};

const PERSON_LABELS = new Set(["GIVEN_NAME", "SURNAME"]);
const STREET_LABELS = new Set([
  "STREET_NAME",
  "BUILDING_NUMBER",
  "SECONDARY_ADDRESS",
]);
const COARSE_ADDRESS_LABELS = new Set(["CITY", "STATE", "ZIP_CODE"]);
const NAME_PARTICLES = new Set([
  "de",
  "den",
  "der",
  "van",
  "van de",
  "van den",
  "van der",
]);
const NAME_PARTICLE_ALTERNATION = "van der|van den|van de|van|den|der|de";
const PERSON_PREFIX_RE = new RegExp(
  `(?:^|[^\\p{L}'’-])((?:([\\p{Lu}\\p{Lt}][\\p{L}'’-]*)\\s+)?(?:${NAME_PARTICLE_ALTERNATION})\\s+)$`,
  "iu",
);
const UNLIKELY_GIVEN_NAMES = new Set([
  "aan",
  "als",
  "bel",
  "beste",
  "bij",
  "dag",
  "dat",
  "de",
  "deze",
  "die",
  "dit",
  "dus",
  "een",
  "en",
  "geachte",
  "hallo",
  "het",
  "hoi",
  "in",
  "maar",
  "mail",
  "met",
  "na",
  "naar",
  "of",
  "op",
  "over",
  "stuur",
  "te",
  "tot",
  "tussen",
  "uit",
  "van",
  "volgens",
  "voor",
  "want",
]);

function baseLabel(label: string): string {
  return label.replace(/^[BI]-/, "");
}

function toPolicySpan(
  span: RampartSpan,
  textLength: number,
): PolicySpan | undefined {
  if (
    span.score < RAMPART_MIN_SCORE ||
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end <= span.start ||
    span.end > textLength
  ) {
    return undefined;
  }

  const label = baseLabel(span.label);
  let type: DetectionType;
  let addressKind: AddressKind | undefined;

  if (PERSON_LABELS.has(label)) {
    type = "PERSON";
  } else if (STREET_LABELS.has(label)) {
    type = "ADDRESS";
    addressKind = "street";
  } else if (COARSE_ADDRESS_LABELS.has(label)) {
    type = "ADDRESS";
    addressKind = "coarse";
  } else {
    return undefined;
  }

  return {
    start: span.start,
    end: span.end,
    type,
    source: "model",
    addressKind,
    hasStreet: addressKind === "street",
  };
}

function canJoin(text: string, current: PolicySpan, next: PolicySpan): boolean {
  if (current.type !== next.type || next.start < current.end) return false;
  const gap = text.slice(current.end, next.start);

  if (current.type === "PERSON") {
    const normalized = gap.trim().toLowerCase().replace(/\s+/g, " ");
    return /^[\s'-]*$/.test(gap) || NAME_PARTICLES.has(normalized);
  }

  if (/^[\s,]*$/.test(gap)) return true;
  const connector = gap.trim().toLowerCase();
  return (
    current.hasStreet === true &&
    next.addressKind === "coarse" &&
    (connector === "in" || connector === "te")
  );
}

function joinSpans(text: string, spans: readonly PolicySpan[]): PolicySpan[] {
  const joined: PolicySpan[] = [];

  for (const span of spans) {
    const current = joined.at(-1);
    if (current && canJoin(text, current, span)) {
      current.end = span.end;
      current.hasStreet = current.hasStreet === true || span.hasStreet === true;
      continue;
    }
    joined.push({ ...span });
  }

  return joined;
}

function expandPersonPrefix(
  text: string,
  span: PolicySpan,
  limit: number,
): PolicySpan {
  if (span.type !== "PERSON") return span;

  const match = text.slice(limit, span.start).match(PERSON_PREFIX_RE);
  const matched = match?.[1];
  if (!match || !matched) return span;

  const given = match[2];
  let extra = matched.length;
  if (given && UNLIKELY_GIVEN_NAMES.has(given.toLowerCase())) {
    extra = matched.length - given.length;
  }

  let start = span.start - extra;
  while (start < span.start && /\s/.test(text[start] ?? "")) start += 1;
  return start === span.start ? span : { ...span, start };
}

export function mapRampartSpans(
  text: string,
  spans: readonly RampartSpan[],
): Detection[] {
  const mapped = spans
    .map((span) => toPolicySpan(span, text.length))
    .filter((span): span is PolicySpan => span !== undefined)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const joined = joinSpans(text, mapped);
  const expanded = joined.map((span, index) =>
    expandPersonPrefix(text, span, index > 0 ? joined[index - 1]!.end : 0),
  );

  return joinSpans(text, expanded).map(({ start, end, type, source }) => ({
    start,
    end,
    type,
    source,
  }));
}
