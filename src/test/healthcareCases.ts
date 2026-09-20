import type { DetectionType } from '../core/types'

export type HealthcareCase = {
  name: string
  input: string
  expectedTypes: DetectionType[]
  mustPreserve: string[]
  note: string
}

export const DUTCH_HEALTHCARE_CASES: HealthcareCase[] = [
  {
    name: 'patient identity, address, date, and lab value',
    input:
      'Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. HbA1c is 72 mmol/mol.',
    expectedTypes: ['PERSON', 'ADDRESS'],
    mustPreserve: ['14-03-1968', 'HbA1c 72 mmol/mol'],
    note: 'The date and lab value stay because DATE and clinical-value detection are outside the MVP.',
  },
  {
    name: 'care-team contact details',
    input:
      'Stuur de uitslag naar arts.jansen@zorgmail.nl of bel 06-12345678. Patiënt meldt misselijkheid.',
    expectedTypes: ['EMAIL', 'PHONE'],
    mustPreserve: ['misselijkheid'],
    note: 'The symptom remains unchanged.',
  },
  {
    name: 'BSN with medication instruction',
    input: 'BSN 111222333. Start metformine 500 mg tweemaal daags.',
    expectedTypes: ['BSN'],
    mustPreserve: ['metformine 500 mg'],
    note: 'The validated BSN is masked while medication and dose stay intact.',
  },
  {
    name: 'billing identifiers',
    input:
      'Vergoeding naar NL91 ABNA 0417 1643 00. Betaalkaart 4111 1111 1111 1111. Bloeddruk 128/78 mmHg.',
    expectedTypes: ['IBAN', 'CREDIT_CARD'],
    mustPreserve: ['Bloeddruk 128/78 mmHg'],
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
