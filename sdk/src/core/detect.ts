import type { Detection } from "./types.js";
import { CONTEXTUAL_DETECTION_TYPES } from "./types.js";
import { detectStructured } from "./structured.js";
import { collectDetections } from "./spans.js";
import { hasIdentifierContext } from "./identifierContext.js";

export type ContextualDetector = { detect(text: string): Promise<Detection[]> };
export type StructuredDetector = (text: string) => readonly Detection[] | Promise<readonly Detection[]>;

export async function detectText(text: string, detector?: ContextualDetector,
  structuredDetector: StructuredDetector = detectStructured): Promise<Detection[]> {
  const [model, structured] = await Promise.all([detector?.detect(text) ?? [], structuredDetector(text)]);
  const candidates = collectDetections(model, text.length).filter(d => {
    if (!hasIdentifierContext(text, d)) return false;
    if (CONTEXTUAL_DETECTION_TYPES.includes(d.type)) return true;
    if (structured.some(rule => rule.start === d.start && rule.end === d.end && rule.type === d.type)) return false;
    // Native structured candidates must pass the same validators as rule candidates.
    // Prefer an identical rule match; otherwise preserve the validated model source.
    const value = text.slice(d.start, d.end);
    return detectStructured(value).some(valid => valid.type === d.type && valid.start === 0 && valid.end === value.length);
  });
  return collectDetections([...candidates, ...structured], text.length);
}
