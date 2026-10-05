import { describe, expect, it } from "vitest";
import { contextualSpans, decodeModelSpans, tokenWindows } from "./modelSpans.js";
import { detectWithMasker } from "./maskerEngine.js";

describe("shared model decoding", () => {
  it("preserves components and whole-span fallbacks for BIO and BIOES", () => {
    const offsets: [number, number][] = [[0, 3], [4, 6], [7, 12], [13, 16], [17, 19], [20, 24]];
    for (const labels of [
      ["B-GIVEN_NAME", "B-SURNAME", "I-SURNAME", "B-STREET_NAME", "B-BUILDING_NUMBER", "B-ZIP_CODE"],
      ["S-GIVEN_NAME", "B-SURNAME", "E-SURNAME", "S-STREET_NAME", "S-BUILDING_NUMBER", "S-ZIP_CODE"],
    ]) {
      expect(decodeModelSpans(offsets, labels).map(d => [d.start, d.end, d.type])).toEqual([
        [0, 3, "GIVEN_NAME"], [4, 12, "SURNAME"], [13, 16, "STREET"], [17, 19, "BUILDING_NUMBER"], [20, 24, "POSTAL_CODE"],
      ]);
    }
    expect(decodeModelSpans([[0, 3], [4, 7]], ["B-PERSON", "B-LOCATION"]).map(d => d.type)).toEqual(["PERSON", "ADDRESS"]);
  });

  it("keeps native labels in solo output and filters structured labels from contextual output", () => {
    const spans = decodeModelSpans([[0, 3], [4, 7], [8, 11], [12, 15]], ["S-GOVERNMENT_ID", "S-AGE", "S-EMAIL", "S-PASSWORD"]);
    expect(spans.map(d => d.type)).toEqual(["GOVERNMENT_ID", "AGE", "EMAIL", "PASSWORD"]);
    expect(contextualSpans("123 456 789 012", spans).map(d => d.type)).toEqual(["GOVERNMENT_ID", "AGE"]);
    expect(() => decodeModelSpans([[0, 1]], [])).toThrow(/length mismatch/);
  });

  it("runs the same token IDs in bounded windows and deduplicates overlap", async () => {
    const text = "x".repeat(1025);
    const seen: number[][] = [];
    const detections = await detectWithMasker(text, {
      maximumTokens: 512, cls: -1, sep: -2,
      encode: () => ({ ids: Array.from({ length: text.length }, (_, i) => i), offsets: Array.from({ length: text.length }, (_, i) => [i, i + 1]) }),
      classify: async ids => { seen.push(ids); return ids.map(id => [500, 1000].includes(id) ? "S-GIVEN_NAME" : "O"); },
    });
    expect(seen.every(ids => ids.length <= 512 && ids[0] === -1 && ids.at(-1) === -2)).toBe(true);
    expect(new Set(seen.flat().filter(id => id >= 0)).size).toBe(1025);
    expect(detections.map(d => [d.start, d.end])).toEqual([[500, 501], [1000, 1001]]);
    expect(tokenWindows(511, 512)).toEqual([[0, 510], [446, 511]]);
    expect(tokenWindows(0, 512)).toEqual([]);
  });
});
