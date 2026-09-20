import { describe, expect, it } from 'vitest'
import { mapRampartSpans, type RampartSpan } from './rampartPolicy'

function span(text: string, value: string, label: string, score = 0.9): RampartSpan {
  const start = text.indexOf(value)
  return { start, end: start + value.length, label, score }
}

describe('Rampart masking policy', () => {
  it('joins given and surname labels across a narrow Dutch surname particle', () => {
    const text = 'Jan van der Meer heeft een afspraak.'
    const result = mapRampartSpans(text, [
      span(text, 'Jan', 'B-GIVEN_NAME'),
      span(text, 'Meer', 'B-SURNAME'),
    ])

    expect(result).toEqual([
      { start: 0, end: 16, type: 'PERSON', source: 'model' },
    ])
  })

  it('does not join names across arbitrary prose', () => {
    const text = 'Jan sprak vandaag met Vries.'
    const result = mapRampartSpans(text, [
      span(text, 'Jan', 'B-GIVEN_NAME'),
      span(text, 'Vries', 'B-SURNAME'),
    ])

    expect(result).toHaveLength(2)
  })

  it('maps city and postcode to ADDRESS as Magpii policy', () => {
    const text = 'Haarlem 2011AA'
    const result = mapRampartSpans(text, [
      span(text, 'Haarlem', 'B-CITY'),
      span(text, '2011AA', 'B-ZIP_CODE'),
    ])

    expect(result).toEqual([
      { start: 0, end: text.length, type: 'ADDRESS', source: 'model' },
    ])
  })

  it('joins street-line components to a city only across the explicit connector in', () => {
    const text = 'de Zijlweg 12 in Haarlem'
    const result = mapRampartSpans(text, [
      span(text, 'Zijlweg', 'B-STREET_NAME'),
      span(text, '12', 'B-BUILDING_NUMBER'),
      span(text, 'Haarlem', 'B-CITY'),
    ])

    expect(result).toEqual([
      { start: 3, end: text.length, type: 'ADDRESS', source: 'model' },
    ])
  })

  it('keeps address highlights separate across surrounding prose', () => {
    const text = 'Zijlweg 12 en patiënt verhuist later naar Haarlem'
    const result = mapRampartSpans(text, [
      span(text, 'Zijlweg', 'B-STREET_NAME'),
      span(text, '12', 'B-BUILDING_NUMBER'),
      span(text, 'Haarlem', 'B-CITY'),
    ])

    const cityStart = text.indexOf('Haarlem')
    expect(result).toEqual([
      { start: 0, end: 10, type: 'ADDRESS', source: 'model' },
      { start: cityStart, end: cityStart + 'Haarlem'.length, type: 'ADDRESS', source: 'model' },
    ])
  })

  it('drops unsupported labels and spans below the fixed internal threshold', () => {
    const text = 'Jan werkt bij Zorg BV'
    const result = mapRampartSpans(text, [
      span(text, 'Jan', 'B-GIVEN_NAME', 0.39),
      span(text, 'Zorg BV', 'B-ORGANIZATION'),
    ])

    expect(result).toEqual([])
  })
})
