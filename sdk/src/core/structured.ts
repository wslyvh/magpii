import { findPhoneNumbersInText } from "libphonenumber-js";
import type { Detection, DetectionType } from "./types.js";

function matchDetection(
  start: number,
  end: number,
  type: DetectionType,
): Detection {
  return { start, end, type, source: "structured" };
}

export function detectEmails(text: string): Detection[] {
  const pattern =
    /(?<![A-Z0-9.!#$%&'*+/=?^_`{|}~-])[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+(?![A-Z0-9-])/giu;
  return [...text.matchAll(pattern)].map((match) =>
    matchDetection(match.index, match.index + match[0].length, "EMAIL"),
  );
}

export function detectPhones(text: string): Detection[] {
  return findPhoneNumbersInText(text, "NL")
    .filter(({ number }) => number.isValid())
    .map(({ startsAt, endsAt }) => matchDetection(startsAt, endsAt, "PHONE"));
}

function passesDutchElevenTest(value: string): boolean {
  const digits = value.padStart(9, "0").split("").map(Number);
  if (digits.length !== 9 || digits.every((digit) => digit === 0)) return false;

  const weighted = digits
    .slice(0, 8)
    .reduce((sum, digit, index) => sum + digit * (9 - index), 0);
  const result = weighted - digits[8]!;
  return result > 0 && result % 11 === 0;
}

export function detectBsns(text: string): Detection[] {
  const pattern = /(?<!\d)(?:\d[ .-]?){7,8}\d(?!\d)/g;
  const detections: Detection[] = [];

  for (const match of text.matchAll(pattern)) {
    const normalized = match[0].replace(/\D/g, "");
    if (
      (normalized.length === 8 || normalized.length === 9) &&
      passesDutchElevenTest(normalized)
    ) {
      detections.push(
        matchDetection(match.index, match.index + match[0].length, "BSN"),
      );
    }
  }

  return detections;
}

function mod97(value: string): number {
  let remainder = 0;
  for (const character of value) {
    const expanded = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

function passesIbanChecksum(normalized: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return false;
  return mod97(normalized.slice(4) + normalized.slice(0, 4)) === 1;
}

export function detectIbans(text: string): Detection[] {
  const detections: Detection[] = [];
  const starts = text.matchAll(/\b[A-Z]{2}\d{2}/giu);

  for (const startMatch of starts) {
    const start = startMatch.index;
    let alphanumericCount = 0;
    let normalized = "";
    let validEnd: number | undefined;

    for (let cursor = start; cursor < text.length; cursor += 1) {
      const character = text[cursor]!;
      if (/[A-Z0-9]/i.test(character)) {
        normalized += character.toUpperCase();
        alphanumericCount += 1;
        if (alphanumericCount > 34) break;

        const next = text[cursor + 1];
        const atCandidateBoundary =
          next === undefined || !/[A-Z0-9]/i.test(next);
        if (
          validEnd === undefined &&
          alphanumericCount >= 15 &&
          atCandidateBoundary &&
          passesIbanChecksum(normalized)
        ) {
          validEnd = cursor + 1;
        }
      } else if (character !== " ") {
        break;
      }
    }

    if (validEnd !== undefined) {
      detections.push(matchDetection(start, validEnd, "IBAN"));
    }
  }

  return detections;
}

function passesLuhn(value: string): boolean {
  let sum = 0;
  let doubleDigit = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

export function detectCreditCards(text: string): Detection[] {
  const pattern = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
  const detections: Detection[] = [];

  for (const match of text.matchAll(pattern)) {
    const normalized = match[0].replace(/\D/g, "");
    if (
      normalized.length >= 13 &&
      normalized.length <= 19 &&
      !/^0+$/.test(normalized) &&
      passesLuhn(normalized)
    ) {
      detections.push(
        matchDetection(
          match.index,
          match.index + match[0].length,
          "CREDIT_CARD",
        ),
      );
    }
  }

  return detections;
}

export function detectStructured(text: string): Detection[] {
  return [
    ...detectEmails(text),
    ...detectPhones(text),
    ...detectBsns(text),
    ...detectIbans(text),
    ...detectCreditCards(text),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
}
