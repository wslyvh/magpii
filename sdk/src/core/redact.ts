import { detectText, type ContextualDetector } from "./detect.js";
import { maskText } from "./mask.js";
import type { Detection } from "./types.js";

export type RedactOptions = {
  detector?: ContextualDetector;
};

export type RedactResult = {
  redactedText: string;
  detections: Detection[];
};

export async function redactText(
  text: string,
  options: RedactOptions = {},
): Promise<RedactResult> {
  const detections = await detectText(text, options.detector);

  return {
    redactedText: maskText(text, detections),
    detections,
  };
}
