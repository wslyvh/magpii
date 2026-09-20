import type { Detection, DetectionType, DisplaySegment } from './types'

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

export function toDisplaySegments(
  text: string,
  detections: readonly Detection[],
): DisplaySegment[] {
  const segments: DisplaySegment[] = []
  let cursor = 0

  for (const detection of detections) {
    if (detection.start > cursor) {
      segments.push({ text: text.slice(cursor, detection.start) })
    }
    segments.push({ text: text.slice(detection.start, detection.end), detection })
    cursor = detection.end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) })
  }

  return segments
}
