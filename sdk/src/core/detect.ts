import type { Detection } from "./types.js";
import { CONTEXTUAL_DETECTION_TYPES } from "./types.js";
import { detectStructured } from "./structured.js";
import { collectDetections } from "./spans.js";

export type ContextualDetector = { detect(text: string): Promise<Detection[]> };
export type StructuredDetector = (text: string) => readonly Detection[] | Promise<readonly Detection[]>;

export async function detectText(text: string, detector?: ContextualDetector,
  structuredDetector: StructuredDetector = detectStructured): Promise<Detection[]> {
  const [model, structured] = await Promise.all([detector?.detect(text) ?? [], structuredDetector(text)]);
  return collectDetections([
    ...model.filter(d => CONTEXTUAL_DETECTION_TYPES.includes(d.type)), ...structured,
  ], text.length);
}
