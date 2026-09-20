import { describe, expect, it } from 'vitest'
import { planTokenChunks } from './chunks'

describe('planTokenChunks', () => {
  it('keeps every chunk within 510 content tokens and overlaps by 64 tokens', () => {
    const offsets = Array.from({ length: 600 }, (_, index) =>
      [index * 2, index * 2 + 1] as const,
    )

    const chunks = planTokenChunks(offsets, 1_200)

    expect(chunks).toEqual([
      { start: 0, end: 1019, tokenStart: 0, tokenEnd: 510 },
      { start: 892, end: 1200, tokenStart: 446, tokenEnd: 600 },
    ])
    expect(chunks.every((chunk) => chunk.tokenEnd - chunk.tokenStart <= 510)).toBe(true)
  })

  it('returns one exact chunk for short input and ignores special-token offsets', () => {
    const offsets = [
      [0, 0],
      [0, 4],
      [5, 11],
      [0, 0],
    ] as const

    expect(planTokenChunks(offsets, 11)).toEqual([
      { start: 0, end: 11, tokenStart: 0, tokenEnd: 2 },
    ])
  })

  it('validates overlap and chunk-size configuration', () => {
    expect(() => planTokenChunks([[0, 1]], 1, 64, 64)).toThrow(
      'Chunk size must be greater than overlap',
    )
  })
})
