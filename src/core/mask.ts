import type { Detection, DetectionType } from './types'

export const PLACEHOLDERS: Record<DetectionType, string> = {
  PERSON: '[PERSON]',
  ADDRESS: '[ADDRESS]',
  EMAIL: '[EMAIL]',
  PHONE: '[PHONE]',
  BSN: '[BSN]',
  IBAN: '[IBAN]',
  CREDIT_CARD: '[CREDIT_CARD]',
}

export function maskText(text: string, detections: readonly Detection[]): string {
  return [...detections]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (masked, detection) =>
        masked.slice(0, detection.start) +
        PLACEHOLDERS[detection.type] +
        masked.slice(detection.end),
      text,
    )
}
