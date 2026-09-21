import { describe, expect, it } from 'vitest'
import { DETECTION_TYPES } from '../core/types'
import { DUTCH_PII_CASES } from './piiCases'

describe('Dutch PII test fixtures', () => {
  it('cover every supported output type', () => {
    const covered = new Set(DUTCH_PII_CASES.flatMap((testCase) => testCase.expectedTypes))
    expect(covered).toEqual(new Set(DETECTION_TYPES))
  })

  it('state which unsupported and ordinary values must remain unchanged', () => {
    const preserved = DUTCH_PII_CASES.flatMap((testCase) => testCase.mustPreserve)
    expect(preserved).toEqual(
      expect.arrayContaining(['14-03-1968', 'De vergadering blijft staan.', 'document versie 500']),
    )
  })
})
