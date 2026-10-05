import { canonicalEntityType, CONTEXTUAL_DETECTION_TYPES, type Detection } from "../core/types.js";

export type ModelSpan = { start: number; end: number; type: string; source: "model" };

export function tokenWindows(length: number, maximumTokens: number, overlap = 64): [number, number][] {
  const content = maximumTokens - 2;
  if (!Number.isInteger(maximumTokens) || content <= overlap) throw new Error("Invalid model context limit.");
  const windows: [number, number][] = [];
  for (let start = 0; start < length; start += content - overlap) {
    const end = Math.min(start + content, length);
    windows.push([start, end]);
    if (end === length) break;
  }
  return windows;
}

// Pure BIO/BIOES decoding. Preserve native categories when no SDK mapping exists.
export function decodeModelSpans(offsets: readonly (readonly [number, number])[], labels: readonly string[]): ModelSpan[] {
  if (offsets.length !== labels.length) throw new Error("Model/tokenizer output length mismatch.");
  const spans: ModelSpan[] = [];
  let active: { label: string; span: ModelSpan } | undefined;
  for (let i = 0; i < labels.length; i++) {
    const match = labels[i].match(/^([BIES])-(.+)$/);
    const [start, end] = offsets[i];
    if (!match || end <= start) { active = undefined; continue; }
    const [, prefix, label] = match;
    if (active?.label === label && (prefix === "I" || prefix === "E")) active.span.end = end;
    else {
      const span: ModelSpan = { start, end, type: canonicalEntityType(label) ?? label, source: "model" };
      spans.push(span);
      active = { label, span };
    }
    if (prefix === "S" || prefix === "E") active = undefined;
  }
  return spans;
}

export function contextualSpans(text: string, spans: readonly ModelSpan[]): Detection[] {
  const unique = new Map<string, Detection>();
  for (const span of spans) {
    const type = canonicalEntityType(span.type);
    if (!type || !CONTEXTUAL_DETECTION_TYPES.includes(type)) continue;
    let { start, end } = span;
    while (start < end && /\s/u.test(text[start])) start++;
    while (end > start && /\s/u.test(text[end - 1])) end--;
    if (start >= end) continue;
    const d: Detection = { start, end, type, source: "model" };
    unique.set(`${start}:${end}:${type}`, d);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}
