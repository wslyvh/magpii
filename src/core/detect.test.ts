import { describe, expect, it, vi } from 'vitest'
import type { ContextualDetector } from './detect'
import { detectText } from './detect'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('detectText', () => {
  it('starts contextual and structured paths before waiting for either result', async () => {
    const contextual = deferred<never[]>()
    const structured = deferred<never[]>()
    const detector: ContextualDetector = {
      detect: vi.fn(() => contextual.promise),
    }
    const structuredDetector = vi.fn(() => structured.promise)

    const result = detectText('tekst', detector, structuredDetector)

    expect(detector.detect).toHaveBeenCalledWith('tekst')
    expect(structuredDetector).toHaveBeenCalledWith('tekst')

    contextual.resolve([])
    structured.resolve([])
    await expect(result).resolves.toEqual([])
  })

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
