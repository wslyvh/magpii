import type { Detection, DetectionType } from '../core/types'

export const RAMPART_MIN_SCORE = 0.4

export type RampartSpan = {
  start: number
  end: number
  label: string
  score: number
}

type AddressKind = 'street' | 'coarse'
type PolicySpan = Detection & {
  addressKind?: AddressKind
  hasStreet?: boolean
}

const PERSON_LABELS = new Set(['GIVEN_NAME', 'SURNAME'])
const STREET_LABELS = new Set([
  'STREET_NAME',
  'BUILDING_NUMBER',
  'SECONDARY_ADDRESS',
])
const COARSE_ADDRESS_LABELS = new Set(['CITY', 'STATE', 'ZIP_CODE'])
const NAME_PARTICLES = new Set([
  'de',
  'den',
  'der',
  'van',
  'van de',
  'van den',
  'van der',
])

function baseLabel(label: string): string {
  return label.replace(/^[BI]-/, '')
}

function toPolicySpan(span: RampartSpan, textLength: number): PolicySpan | undefined {
  if (
    span.score < RAMPART_MIN_SCORE ||
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end <= span.start ||
    span.end > textLength
  ) {
    return undefined
  }

  const label = baseLabel(span.label)
  let type: DetectionType
  let addressKind: AddressKind | undefined

  if (PERSON_LABELS.has(label)) {
    type = 'PERSON'
  } else if (STREET_LABELS.has(label)) {
    type = 'ADDRESS'
    addressKind = 'street'
  } else if (COARSE_ADDRESS_LABELS.has(label)) {
    type = 'ADDRESS'
    addressKind = 'coarse'
  } else {
    return undefined
  }

  return {
    start: span.start,
    end: span.end,
    type,
    source: 'model',
    addressKind,
    hasStreet: addressKind === 'street',
  }
}

function canJoin(text: string, current: PolicySpan, next: PolicySpan): boolean {
  if (current.type !== next.type || next.start < current.end) return false
  const gap = text.slice(current.end, next.start)

  if (current.type === 'PERSON') {
    const normalized = gap.trim().toLowerCase().replace(/\s+/g, ' ')
    return /^[\s'-]*$/.test(gap) || NAME_PARTICLES.has(normalized)
  }

  if (/^[\s,]*$/.test(gap)) return true
  const connector = gap.trim().toLowerCase()
  return (
    current.hasStreet === true &&
    next.addressKind === 'coarse' &&
    (connector === 'in' || connector === 'te')
  )
}

export function mapRampartSpans(
  text: string,
  spans: readonly RampartSpan[],
): Detection[] {
  const mapped = spans
    .map((span) => toPolicySpan(span, text.length))
    .filter((span): span is PolicySpan => span !== undefined)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const joined: PolicySpan[] = []

  for (const span of mapped) {
    const current = joined.at(-1)
    if (current && canJoin(text, current, span)) {
      current.end = span.end
      current.hasStreet = current.hasStreet === true || span.hasStreet === true
      continue
    }
    joined.push({ ...span })
  }

  return joined.map(({ start, end, type, source }) => ({ start, end, type, source }))
}
