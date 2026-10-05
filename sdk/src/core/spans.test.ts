import { describe, expect, it } from "vitest";
import type { Detection } from "./types.js";
import { mergeDetections } from "./spans.js";

describe("mergeDetections", () => {
  it("rejects malformed and out-of-range spans", () => {
    const candidates = [
      { start: -1, end: 2, type: "PERSON", source: "model" },
      { start: 3, end: 3, type: "PERSON", source: "model" },
      { start: 2.5, end: 4, type: "PERSON", source: "model" },
      { start: 0, end: 20, type: "PERSON", source: "model" },
      { start: 1, end: 4, type: "PERSON", source: "model" },
    ] as Detection[];

    expect(mergeDetections(candidates, 10)).toEqual([
      { start: 1, end: 4, type: "PERSON", source: "model" },
    ]);
  });

  it("always prefers a structured span over an overlapping model span", () => {
    const candidates: Detection[] = [
      { start: 0, end: 18, type: "ADDRESS", source: "model" },
      { start: 5, end: 14, type: "PHONE", source: "structured" },
    ];

    expect(mergeDetections(candidates, 20)).toEqual([
      { ...candidates[0], end: 5 }, candidates[1], { ...candidates[0], start: 14 },
    ]);
  });

  it("keeps the longer overlapping span when sources match", () => {
    const candidates: Detection[] = [
      { start: 0, end: 3, type: "PERSON", source: "model" },
      { start: 0, end: 12, type: "PERSON", source: "model" },
    ];

    expect(mergeDetections(candidates, 12)).toEqual([candidates[1]]);
  });

  it("uses stable type precedence for equal structured spans", () => {
    const candidates: Detection[] = [
      { start: 0, end: 9, type: "PHONE", source: "structured" },
      { start: 0, end: 9, type: "BSN", source: "structured" },
    ];

    expect(mergeDetections(candidates, 9)).toEqual([candidates[1]]);
  });

  it("returns non-overlapping spans in document order", () => {
    const candidates: Detection[] = [
      { start: 10, end: 14, type: "EMAIL", source: "structured" },
      { start: 0, end: 4, type: "PERSON", source: "model" },
      { start: 10, end: 14, type: "EMAIL", source: "structured" },
    ];

    expect(mergeDetections(candidates, 14)).toEqual([
      candidates[1],
      candidates[0],
    ]);
  });
});
