import { describe, expect, it } from 'vitest'
import type { ContextualDetector } from './detect'
import { detectText } from './detect'

describe('detectText', () => {
  it('merges both paths with structured priority', async () => {
    const detector: ContextualDetector = {
      detect: async () => [
        { start: 0, end: 12, type: 'PERSON', source: 'model' },
      ],
    }
    const structuredDetector = () => [
      { start: 4, end: 10, type: 'BSN', source: 'structured' } as const,
    ]

    await expect(detectText('123456789012', detector, structuredDetector)).resolves.toEqual([
      { start: 4, end: 10, type: 'BSN', source: 'structured' },
    ])
  })
})
