import { describe, expect, it } from 'vitest'
import { DETECTION_TYPES } from '../core/types'
import { DUTCH_HEALTHCARE_CASES } from './healthcareCases'

describe('Dutch healthcare test fixtures', () => {
  it('cover every supported output type', () => {
    const covered = new Set(DUTCH_HEALTHCARE_CASES.flatMap((testCase) => testCase.expectedTypes))
    expect(covered).toEqual(new Set(DETECTION_TYPES))
  })

  it('state which clinical facts and unsupported values must remain unchanged', () => {
    const preserved = DUTCH_HEALTHCARE_CASES.flatMap((testCase) => testCase.mustPreserve)
    expect(preserved).toEqual(
      expect.arrayContaining(['14-03-1968', 'HbA1c 72 mmol/mol', 'metformine 500 mg']),
    )
  })
})
