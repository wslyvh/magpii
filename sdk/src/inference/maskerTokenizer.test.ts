import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMaskerTokenizer } from "./maskerTokenizer.js";
import { contextualSpans, decodeModelSpans } from "./modelSpans.js";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../../models/masker-mini/${file}`, import.meta.url), "utf8"));
const tokenizer = createMaskerTokenizer(read("tokenizer.json"), read("tokenizer_config.json"));

describe("Masker original-text alignment", () => {
  it("matches pinned native token IDs and retains Dutch name components", () => {
    const text = "Jan de Vries woont op Oak Street 12.";
    const encoding = tokenizer.encode(text);
    expect(encoding.ids).toEqual([1575, 270, 423, 3778, 20063, 271, 553, 16945, 4025, 3226]);
    const spans = contextualSpans(text, decodeModelSpans(encoding.offsets, ["S-GIVEN_NAME", "B-SURNAME", "I-SURNAME", "E-SURNAME", "O", "O", "O", "B-STREET_NAME", "E-STREET_NAME", "S-BUILDING_NUMBER"]));
    expect(spans.map(d => [text.slice(d.start, d.end), d.type])).toEqual([["Jan", "GIVEN_NAME"], ["de Vries", "SURNAME"], ["Oak Street", "STREET"], ["12.", "BUILDING_NUMBER"]]);
  });

  it("maps emoji, repeated words, combining marks and compatibility characters to UTF-16 source offsets", () => {
    const text = "😀 Jan, Jan";
    const encoding = tokenizer.encode(text);
    expect(encoding.ids).toEqual([260, 3, 1575, 262, 1575]);
    expect(contextualSpans(text, decodeModelSpans(encoding.offsets, ["O", "O", "S-GIVEN_NAME", "O", "S-GIVEN_NAME"])).map(d => [d.start, d.end])).toEqual([[3, 6], [8, 11]]);
    const unicode = "José Jose\u0301\nＡＢＣ Straße ﬁ";
    const aligned = tokenizer.encode(unicode);
    expect(aligned.ids).toEqual([260, 6693, 260, 6693, 18508, 32474, 932]);
    expect(contextualSpans(unicode, decodeModelSpans(aligned.offsets, ["O", "S-GIVEN_NAME", "O", "S-GIVEN_NAME", "S-SURNAME", "O", "O"])).map(d => unicode.slice(d.start, d.end))).toEqual(["José", "Jose\u0301", "ＡＢＣ"]);
  });

  it("accepts whitespace, pasted placeholders and literal model special tokens", () => {
    for (const text of ["   Jan\tde  Vries", "hello [EMAIL] and [MASK] Jan", "[CLS]Jan[SEP]", "a\u0000b", "Jan ▁ test"]) {
      const encoding = tokenizer.encode(text);
      expect(encoding.offsets.length).toBe(encoding.ids.length);
      for (const [start, end] of encoding.offsets) expect(start >= 0 && end >= start && end <= text.length).toBe(true);
    }
    expect(tokenizer.encode("  ")).toEqual({ ids: [], offsets: [] });
  });

  it.each(["\u200b", "\u200c", "\u200e", "▁", "\ufffd"])("aligns formatting mark %j at source boundaries", (mark) => {
    expect(tokenizer.encode(`${mark}Jan`)).toEqual({ ids: [1575], offsets: [[0, 4]] });
    // ZWNJ belongs to the preceding grapheme; both token offsets retain it.
    const trailingNameEnd = mark === "\u200c" ? 4 : 3;
    const trailingSpaceStart = mark === "\u200c" ? 2 : 3;
    expect(tokenizer.encode(`Jan${mark}`)).toEqual({ ids: [1575, 260], offsets: [[0, trailingNameEnd], [trailingSpaceStart, 4]] });
    expect(tokenizer.encode(` \t${mark}Jan${mark} \n`)).toEqual({ ids: [1575, 260], offsets: [[2, 3 + trailingNameEnd], [3 + trailingSpaceStart, 7]] });
    expect(tokenizer.encode(mark)).toEqual({ ids: [260], offsets: [[0, 1]] });
  });

  it("aligns boundary formatting marks around literal special tokens", () => {
    expect(tokenizer.encode("\u200b[MASK] Jan\u200e")).toEqual({
      ids: [260, 63895, 1575, 260],
      offsets: [[0, 1], [1, 7], [7, 11], [11, 12]],
    });
  });
});
