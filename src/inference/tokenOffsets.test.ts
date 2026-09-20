import { describe, expect, it } from 'vitest'
import { assignTokenOffsets, normalizeWithMap, tokenPiecesToOffsets } from './tokenOffsets'

describe('normalizeWithMap', () => {
  it('lowercases and strips accents while preserving original UTF-16 offsets', () => {
    const result = normalizeWithMap('José 😊')

    expect(result.normalized).toBe('jose 😊')
    expect(result.starts.slice(0, 4)).toEqual([0, 1, 2, 3])
    expect(result.ends.at(-1)).toBe(7)
  })
})

describe('assignTokenOffsets', () => {
  it('assigns exact original offsets to accented and WordPiece tokens', () => {
    const text = 'José woont aan de Zijlweg.'
    const tokens = [
      { word: 'jose', entity: 'B-GIVEN_NAME', score: 0.97 },
      { word: 'zijl', entity: 'B-STREET_NAME', score: 0.96 },
      { word: '##weg', entity: 'I-STREET_NAME', score: 0.95 },
    ]

    expect(assignTokenOffsets(text, tokens)).toEqual([
      { start: 0, end: 4, label: 'B-GIVEN_NAME', score: 0.97 },
      { start: 18, end: 22, label: 'B-STREET_NAME', score: 0.96 },
      { start: 22, end: 25, label: 'I-STREET_NAME', score: 0.95 },
    ])
  })

  it('drops model tokens that cannot be located instead of inventing offsets', () => {
    expect(
      assignTokenOffsets('Jan de Vries', [
        { word: 'missing', entity: 'B-GIVEN_NAME', score: 0.9 },
      ]),
    ).toEqual([])
  })

  it('uses the model token index when repeated words would make search ambiguous', () => {
    const text = 'Jan zag Jan'
    const offsets = tokenPiecesToOffsets(text, ['jan', 'zag', 'jan'])

    expect(
      assignTokenOffsets(
        text,
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 3 }],
        offsets,
      ),
    ).toEqual([
      { start: 8, end: 11, label: 'B-GIVEN_NAME', score: 0.9 },
    ])
  })

  it('drops an indexed model token when its tokenizer offset is unavailable', () => {
    expect(
      assignTokenOffsets(
        'Jan zag Jan',
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 3 }],
        [[0, 3]],
      ),
    ).toEqual([])
  })
})

describe('tokenPiecesToOffsets', () => {
  it('turns the real BERT WordPiece shape into original-text offsets', () => {
    expect(tokenPiecesToOffsets('Zijlweg 12', ['z', '##ij', '##l', '##we', '##g', '12'])).toEqual([
      [0, 1],
      [1, 3],
      [3, 4],
      [4, 6],
      [6, 7],
      [8, 10],
    ])
  })

  it('preserves an offset slot for unknown tokens so later token indexes stay aligned', () => {
    const text = '😊 Jan'
    const offsets = tokenPiecesToOffsets(text, ['[UNK]', 'jan'])

    expect(offsets).toEqual([
      [0, 2],
      [3, 6],
    ])
    expect(
      assignTokenOffsets(
        text,
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 2 }],
        offsets,
      ),
    ).toEqual([
      { start: 3, end: 6, label: 'B-GIVEN_NAME', score: 0.9 },
    ])
  })

  it('ends an unknown token at adjacent known punctuation without shifting repeated words', () => {
    const text = '😊, Jan zag Jan'
    const offsets = tokenPiecesToOffsets(text, ['[UNK]', ',', 'jan', 'zag', 'jan'])

    expect(offsets).toEqual([
      [0, 2],
      [2, 3],
      [4, 7],
      [8, 11],
      [12, 15],
    ])
    expect(
      assignTokenOffsets(
        text,
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 5 }],
        offsets,
      ),
    ).toEqual([
      { start: 12, end: 15, label: 'B-GIVEN_NAME', score: 0.9 },
    ])
  })

  it('does not anchor a later word inside an unknown non-whitespace token', () => {
    const text = '😊Jan Jan'
    const offsets = tokenPiecesToOffsets(text, ['[UNK]', 'jan'])

    expect(offsets).toEqual([
      [0, 5],
      [6, 9],
    ])
    expect(
      assignTokenOffsets(
        text,
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 2 }],
        offsets,
      ),
    ).toEqual([
      { start: 6, end: 9, label: 'B-GIVEN_NAME', score: 0.9 },
    ])
  })

  it('keeps literal tokenizer special tokens aligned as user-text content', () => {
    const text = 'Jan [MASK] zag Jan'
    const offsets = tokenPiecesToOffsets(text, ['jan', '[MASK]', 'zag', 'jan'])

    expect(offsets).toEqual([
      [0, 3],
      [4, 10],
      [11, 14],
      [15, 18],
    ])
    expect(
      assignTokenOffsets(
        text,
        [{ word: 'jan', entity: 'B-GIVEN_NAME', score: 0.9, index: 4 }],
        offsets,
      ),
    ).toEqual([
      { start: 15, end: 18, label: 'B-GIVEN_NAME', score: 0.9 },
    ])
  })

  it('fails closed instead of shortening the index table when a token cannot be aligned', () => {
    expect(() => tokenPiecesToOffsets('Jan', ['missing'])).toThrow(
      'Tokenizer offsets could not be aligned.',
    )
  })
})
