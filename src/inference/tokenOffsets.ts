import type { RampartSpan } from './rampartPolicy'

export type ModelToken = {
  word: string
  entity: string
  score: number
  index?: number
}

export type NormalizedText = {
  normalized: string
  starts: number[]
  ends: number[]
}

const COMBINING_MARK = /\p{M}/u

export function normalizeWithMap(text: string): NormalizedText {
  let normalized = ''
  const starts: number[] = []
  const ends: number[] = []

  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index)!
    const character = String.fromCodePoint(codePoint)
    const originalEnd = index + character.length
    const folded = character.normalize('NFD').toLowerCase()

    for (const foldedCharacter of folded) {
      if (COMBINING_MARK.test(foldedCharacter)) continue
      normalized += foldedCharacter
      for (let unit = 0; unit < foldedCharacter.length; unit += 1) {
        starts.push(index)
        ends.push(originalEnd)
      }
    }

    index = originalEnd
  }

  return { normalized, starts, ends }
}

function normalizeToken(word: string): string {
  return word
    .replace(/^##/, '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
}

function offsetAlignmentError(): never {
  throw new Error('Tokenizer offsets could not be aligned.')
}

export function tokenPiecesToOffsets(
  text: string,
  pieces: readonly string[],
): Array<readonly [number, number]> {
  const { normalized, starts, ends } = normalizeWithMap(text)
  const offsets: Array<readonly [number, number]> = []
  let cursor = 0

  for (let tokenIndex = 0; tokenIndex < pieces.length; tokenIndex += 1) {
    const token = pieces[tokenIndex]!
    if (/^\[UNK\]$/i.test(token)) {
      let found = cursor
      while (found < normalized.length && /\s/u.test(normalized[found]!)) found += 1
      if (found >= normalized.length) offsetAlignmentError()

      let unknownEnd = found
      while (unknownEnd < normalized.length && !/\s/u.test(normalized[unknownEnd]!)) {
        unknownEnd += 1
      }

      for (let nextIndex = tokenIndex + 1; nextIndex < pieces.length; nextIndex += 1) {
        const nextToken = pieces[nextIndex]!
        if (/^\[UNK\]$/i.test(nextToken)) continue
        const nextPiece = normalizeToken(nextToken)
        const isPunctuation = /^[\p{P}\p{S}]+$/u.test(nextPiece)
        const nextFound = normalized.indexOf(nextPiece, isPunctuation ? found : unknownEnd)
        if (nextFound !== -1) {
          unknownEnd = Math.min(unknownEnd, nextFound)
          break
        }
      }

      const start = starts[found]
      const end = ends[unknownEnd - 1]
      if (start !== undefined && end !== undefined) {
        offsets.push([start, end])
        cursor = unknownEnd
      } else offsetAlignmentError()
      continue
    }
    const piece = normalizeToken(token)
    if (piece.length === 0) offsetAlignmentError()

    const found = normalized.indexOf(piece, cursor)
    if (found === -1) offsetAlignmentError()
    const start = starts[found]
    const end = ends[found + piece.length - 1]
    if (start !== undefined && end !== undefined) {
      offsets.push([start, end])
      cursor = found + piece.length
    } else offsetAlignmentError()
  }

  return offsets
}

export function assignTokenOffsets(
  text: string,
  tokens: readonly ModelToken[],
  tokenOffsets?: ReadonlyArray<readonly [number, number]>,
): RampartSpan[] {
  const { normalized, starts, ends } = normalizeWithMap(text)
  const spans: RampartSpan[] = []
  let cursor = 0

  for (const token of tokens) {
    if (/^\[(?:CLS|SEP|PAD|UNK|MASK)\]$/i.test(token.word)) continue

    if (token.index !== undefined && tokenOffsets) {
      const indexedOffset = tokenOffsets[token.index - 1]
      if (!indexedOffset) continue
      spans.push({
        start: indexedOffset[0],
        end: indexedOffset[1],
        label: token.entity,
        score: token.score,
      })
      continue
    }

    const piece = normalizeToken(token.word)
    if (piece.length === 0) continue

    const found = normalized.indexOf(piece, cursor)
    if (found === -1) continue

    const start = starts[found]
    const end = ends[found + piece.length - 1]
    if (start !== undefined && end !== undefined) {
      spans.push({ start, end, label: token.entity, score: token.score })
      cursor = found + piece.length
    }
  }

  return spans
}
