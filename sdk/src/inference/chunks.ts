export type TokenOffset = readonly [start: number, end: number];

export type TokenChunk = {
  start: number;
  end: number;
  tokenStart: number;
  tokenEnd: number;
};

export function planTokenChunks(
  offsets: readonly TokenOffset[],
  textLength: number,
  maxContentTokens = 510,
  overlapTokens = 64,
): TokenChunk[] {
  if (maxContentTokens <= overlapTokens) {
    throw new Error("Chunk size must be greater than overlap");
  }

  const contentOffsets = offsets.filter(([start, end]) => end > start);
  if (contentOffsets.length === 0) return [];

  const chunks: TokenChunk[] = [];
  const step = maxContentTokens - overlapTokens;

  for (
    let tokenStart = 0;
    tokenStart < contentOffsets.length;
    tokenStart += step
  ) {
    const tokenEnd = Math.min(
      tokenStart + maxContentTokens,
      contentOffsets.length,
    );
    const firstOffset = contentOffsets[tokenStart]!;
    const lastOffset = contentOffsets[tokenEnd - 1]!;

    chunks.push({
      start: tokenStart === 0 ? 0 : firstOffset[0],
      end: tokenEnd === contentOffsets.length ? textLength : lastOffset[1],
      tokenStart,
      tokenEnd,
    });

    if (tokenEnd === contentOffsets.length) break;
  }

  return chunks;
}
