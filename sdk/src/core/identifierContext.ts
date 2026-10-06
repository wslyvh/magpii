import type { Detection } from "./types.js";

const NUMERIC_TYPES = new Set(["PHONE", "BSN", "GOVERNMENT_ID"]);

function calendarDate(value: string): boolean {
  const parts = value.split(/[./-]/).map(Number);
  const [year, month, day] = value.match(/^\d{4}/) ? parts : [parts[2], parts[1], parts[0]];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Strong textual contradictions for numeric identifiers, independent of model predictions. */
export function hasIdentifierContext(text: string, detection: Pick<Detection, "start" | "end" | "type">): boolean {
  if (!NUMERIC_TYPES.has(detection.type)) return true;
  const { start, end } = detection;
  const before = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
  if (/\b(?:invoice|order|reference|booking|factuur|bestel|bestelling|referentie|reservering)(?:\s*(?:number|no\.?|nr\.?|nummer|id))\s*[:#=-]?\s*$/iu.test(before)) return false;
  if (detection.type === "PHONE" && /\b(?:bsn|burgerservicenummer)\s*[:#=-]?\s*$/iu.test(before)) return false;
  if (detection.type === "BSN" && /\b(?:phone|telephone|tel|telefoon)(?:nummer)?\s*[:#=-]?\s*$/iu.test(before)) return false;

  // A parser may return a fragment of a date/IP. Inspect the surrounding numeric token too.
  const left = Math.max(0, start - 32);
  const context = text.slice(left, Math.min(text.length, end + 32));
  const patterns: [RegExp, (value: string) => boolean][] = [
    [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\d|\.\d)/g, value => value.split(".").every(octet => Number(octet) <= 255)],
    [/(?<!\d)(?:\d{4}([./-])\d{1,2}\1\d{1,2}|\d{1,2}([./-])\d{1,2}\2\d{4})(?!\d)/g, calendarDate],
    [/(?<!\d)(?:[01]?\d|2[0-3])[:.][0-5]\d\s*[-–—]\s*(?:[01]?\d|2[0-3])[:.][0-5]\d(?!\d)/g, () => true],
  ];
  for (const [pattern, valid] of patterns) {
    for (const match of context.matchAll(pattern)) {
      const matchStart = left + match.index, matchEnd = matchStart + match[0].length;
      if (start >= matchStart && end <= matchEnd && valid(match[0])) return false;
    }
  }
  return true;
}
