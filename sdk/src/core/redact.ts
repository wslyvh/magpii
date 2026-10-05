import { detectText, type ContextualDetector } from "./detect.js";
import { maskText } from "./mask.js";
import { DEFAULT_REDACTION_TYPES, type Detection, type DetectionType } from "./types.js";

export type RedactOptions = { detector?: ContextualDetector; redactionTypes?: readonly DetectionType[] };
export type RedactResult = { redactedText: string; detections: Detection[] };

export async function redactText(text: string, options: RedactOptions = {}): Promise<RedactResult> {
  const detections = await detectText(text, options.detector);
  const selected = options.redactionTypes ?? DEFAULT_REDACTION_TYPES;
  return { detections, redactedText: maskText(text, detections.filter(d => selected.includes(d.type))) };
}
