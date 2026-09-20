import { mergeDetections } from '../core/spans'
import type { Detection } from '../core/types'
import { planTokenChunks } from './chunks'
import { mapRampartSpans, type RampartSpan } from './rampartPolicy'
import {
  assignTokenOffsets,
  tokenPiecesToOffsets,
  type ModelToken,
} from './tokenOffsets'

export type RampartRuntime = {
  tokenize(text: string): string[]
  classify(text: string): Promise<ModelToken[]>
}

function deduplicateSpans(spans: readonly RampartSpan[]): RampartSpan[] {
  const unique = new Map<string, RampartSpan>()

  for (const span of spans) {
    const key = `${span.start}:${span.end}:${span.label}`
    const existing = unique.get(key)
    if (!existing || span.score > existing.score) unique.set(key, span)
  }

  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end)
}

export async function detectWithRampart(
  text: string,
  runtime: RampartRuntime,
): Promise<Detection[]> {
  if (text.length === 0) return []

  const pieces = runtime.tokenize(text)
  const offsets = tokenPiecesToOffsets(text, pieces)
  const chunks = planTokenChunks(offsets, text.length)
  const rawSpans: RampartSpan[] = []

  for (const chunk of chunks) {
    const chunkText = text.slice(chunk.start, chunk.end)
    const tokens = await runtime.classify(chunkText)
    const chunkOffsets = tokenPiecesToOffsets(chunkText, runtime.tokenize(chunkText))
    for (const span of assignTokenOffsets(chunkText, tokens, chunkOffsets)) {
      rawSpans.push({
        ...span,
        start: span.start + chunk.start,
        end: span.end + chunk.start,
      })
    }
  }

  const detections = mapRampartSpans(text, deduplicateSpans(rawSpans))
  return mergeDetections(detections, text.length)
}
