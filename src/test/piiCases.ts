import type { DetectionType } from '../core/types'

export type PiiCase = {
  name: string
  input: string
  expectedTypes: DetectionType[]
  mustPreserve: string[]
  note: string
}

export const DUTCH_PII_CASES: PiiCase[] = [
  {
    name: 'identity, address, date, and reference value',
    input:
      'Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. De vergadering blijft staan.',
    expectedTypes: ['PERSON', 'ADDRESS'],
    mustPreserve: ['14-03-1968', 'De vergadering blijft staan.'],
    note: 'Dates and ordinary reference values remain unchanged.',
  },
  {
    name: 'contact details in a message',
    input:
      'Stuur de uitslag naar jan.jansen@example.nl of bel 06-12345678. De afspraak blijft staan.',
    expectedTypes: ['EMAIL', 'PHONE'],
    mustPreserve: ['De afspraak blijft staan.'],
    note: 'Unrelated message content remains unchanged.',
  },
  {
    name: 'BSN in ordinary prose',
    input: 'BSN 111222333. Bewaar document versie 500 voor het archief.',
    expectedTypes: ['BSN'],
    mustPreserve: ['document versie 500'],
    note: 'The validated BSN is masked while ordinary numbers and prose stay intact.',
  },
  {
    name: 'financial identifiers',
    input:
      'Overboeking naar NL91 ABNA 0417 1643 00. Betaalkaart 4111 1111 1111 1111. Factuurbedrag €128,78.',
    expectedTypes: ['IBAN', 'CREDIT_CARD'],
    mustPreserve: ['Factuurbedrag €128,78'],
    note: 'Only checksum-valid financial identifiers are masked.',
  },
  {
    name: 'invalid structured lookalikes',
    input:
      'Controlewaarden: BSN 123456789, IBAN NL00 ABNA 0417 1643 00, kaart 4111 1111 1111 1112.',
    expectedTypes: [],
    mustPreserve: ['123456789', 'NL00 ABNA 0417 1643 00', '4111 1111 1111 1112'],
    note: 'Invalid checksums must not produce detections.',
  },
]
