import { describe, expect, it } from 'vitest'
import { DETECTION_TYPES, type Detection } from './types'
import { maskText, toDisplaySegments } from './mask'

describe('core detection contract', () => {
  it('contains only the seven MVP output types', () => {
    expect(DETECTION_TYPES).toEqual([
      'PERSON',
      'ADDRESS',
      'EMAIL',
      'PHONE',
      'BSN',
      'IBAN',
      'CREDIT_CARD',
    ])
  })
})

describe('maskText', () => {
  it('replaces detections with exact typed placeholders and preserves clinical text', () => {
    const text =
      'Jan de Vries, geboren op 14-03-1968, heeft HbA1c 72 mmol/mol en gebruikt metformine.'
    const name = 'Jan de Vries'
    const detections: Detection[] = [
      { start: text.indexOf(name), end: text.indexOf(name) + name.length, type: 'PERSON', source: 'model' },
    ]

    expect(maskText(text, detections)).toBe(
      '[PERSON], geboren op 14-03-1968, heeft HbA1c 72 mmol/mol en gebruikt metformine.',
    )
  })

  it('replaces from right to left so original offsets remain valid', () => {
    const text = 'Mail jan@example.nl or call +31 6 12345678.'
    const email = 'jan@example.nl'
    const phone = '+31 6 12345678'
    const detections: Detection[] = [
      { start: text.indexOf(email), end: text.indexOf(email) + email.length, type: 'EMAIL', source: 'structured' },
      { start: text.indexOf(phone), end: text.indexOf(phone) + phone.length, type: 'PHONE', source: 'structured' },
    ]

    expect(maskText(text, detections)).toBe('Mail [EMAIL] or call [PHONE].')
  })
})

describe('toDisplaySegments', () => {
  it('splits untouched and detected text without losing punctuation', () => {
    const text = 'Patiënt: Jan de Vries.'
    const name = 'Jan de Vries'
    const detections: Detection[] = [
      { start: text.indexOf(name), end: text.indexOf(name) + name.length, type: 'PERSON', source: 'model' },
    ]

    expect(toDisplaySegments(text, detections)).toEqual([
      { text: 'Patiënt: ' },
      { text: 'Jan de Vries', detection: detections[0] },
      { text: '.' },
    ])
  })
})
