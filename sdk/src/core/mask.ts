import type { Detection, DetectionType } from "./types.js";
import { DETECTION_TYPES } from "./types.js";
import { mergeDetections } from "./spans.js";

export const PLACEHOLDERS = Object.fromEntries(DETECTION_TYPES.map(type => [type, `[${type}]`])) as Record<DetectionType, string>;

export function maskText(text: string, detections: readonly Detection[]): string {
  return mergeDetections(detections, text.length).sort((a, b) => b.start - a.start)
    .reduce((masked, d) => masked.slice(0, d.start) + PLACEHOLDERS[d.type] + masked.slice(d.end), text);
}
