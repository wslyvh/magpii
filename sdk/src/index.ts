export {
  detectText,
  type ContextualDetector,
  type StructuredDetector,
} from "./core/detect.js";
export { maskText, PLACEHOLDERS } from "./core/mask.js";
export {
  redactText,
  type RedactOptions,
  type RedactResult,
} from "./core/redact.js";
export { mergeDetections } from "./core/spans.js";
export { detectStructured } from "./core/structured.js";
export {
  DETECTION_TYPES,
  type Detection,
  type DetectionType,
  type DetectionSource,
} from "./core/types.js";
