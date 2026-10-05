import { Tokenizer } from "@huggingface/tokenizers";

export type Encoding = { ids: number[]; offsets: [number, number][] };
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function createMaskerTokenizer(json: object, config: object) {
  const tokenizer = new Tokenizer(json, config);
  const sequence = tokenizer.normalizer as { normalizers?: ({ normalize(text: string): string } | null)[] } | null;
  const normalizer = sequence?.normalizers?.[1];
  if (!normalizer) throw new Error("Unsupported model normalization.");
  const cls = tokenizer.token_to_id("[CLS]");
  const sep = tokenizer.token_to_id("[SEP]");
  if (cls === undefined || sep === undefined) throw new Error("Missing model special tokens.");
  return {
    cls, sep,
    encode(text: string): Encoding {
      const encoding = tokenizer.encode(text, { add_special_tokens: false });
      let normalized = "";
      const starts: number[] = [], ends: number[] = [];
      // Normalize complete graphemes, retaining a map back to original UTF-16.
      for (const { segment, index } of segmenter.segment(text)) {
        for (const character of normalizer.normalize(segment)) {
          if (/\s/u.test(character)) {
            if (!normalized || normalized.endsWith(" ")) continue;
            normalized += " "; starts.push(index); ends.push(index + segment.length);
          } else {
            normalized += character;
            for (let i = 0; i < character.length; i++) { starts.push(index); ends.push(index + segment.length); }
          }
        }
      }
      if (normalized.endsWith(" ")) { normalized = normalized.slice(0, -1); starts.pop(); ends.pop(); }
      if (normalized !== tokenizer.normalizer?.normalize(text)) throw new Error("Tokenizer normalization could not be aligned.");
      const offsets: [number, number][] = [];
      let cursor = 0;
      for (const token of encoding.tokens) {
        let piece = token.replaceAll("▁", " ");
        // Added tokens split normalization into segments. Only whitespace and
        // an artificial Metaspace prefix may be skipped at their boundaries.
        while (normalized[cursor] === " " && !piece.startsWith(" ")) cursor++;
        if (normalized[cursor] !== " " && piece.startsWith(" ")) piece = piece.slice(1);
        if (!normalized.startsWith(piece, cursor)) throw new Error("Tokenizer offsets could not be aligned.");
        const end = cursor + piece.length;
        offsets.push(piece.length ? [starts[cursor], ends[end - 1]] : [0, 0]);
        cursor = end;
      }
      if (cursor !== normalized.length) throw new Error("Tokenizer input was not completely aligned.");
      return { ids: encoding.ids, offsets };
    },
  };
}
