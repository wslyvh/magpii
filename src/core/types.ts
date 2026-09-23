export const DETECTION_TYPES = [
  'PERSON',
  'ADDRESS',
  'EMAIL',
  'PHONE',
  'BSN',
  'IBAN',
  'CREDIT_CARD',
] as const

export type DetectionType = (typeof DETECTION_TYPES)[number]
export type DetectionSource = 'model' | 'structured'

export type Detection = {
  start: number
  end: number
  type: DetectionType
  source: DetectionSource
}
