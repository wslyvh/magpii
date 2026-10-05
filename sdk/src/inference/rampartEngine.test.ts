import { describe, expect, it, vi } from "vitest";
import { detectWithRampart, type RampartRuntime } from "./rampartEngine.js";

describe("detectWithRampart", () => {
  it("maps model tokens to Magpii detections with original offsets", async () => {
    const runtime: RampartRuntime = {
      tokenize: () => ["jan", "de", "vr", "##ies"],
      classify: async () => [
        { word: "jan", entity: "B-GIVEN_NAME", score: 0.9 },
        { word: "de", entity: "B-SURNAME", score: 0.9 },
        { word: "vr", entity: "I-SURNAME", score: 0.9 },
        { word: "##ies", entity: "I-SURNAME", score: 0.9 },
      ],
    };

    await expect(detectWithRampart("Jan de Vries", runtime)).resolves.toEqual([
      { start: 0, end: 12, type: "PERSON", source: "model" },
    ]);
  });

  it("uses overlapping tokenizer-aware chunks for input beyond 510 tokens", async () => {
    const text = Array.from({ length: 520 }, () => "a").join(" ");
    const classify = vi.fn(async () => []);
    const runtime: RampartRuntime = {
      tokenize: (input) => input.trim().split(/\s+/),
      classify,
    };

    await detectWithRampart(text, runtime);

    expect(classify).toHaveBeenCalledTimes(2);
    const calls = classify.mock.calls as unknown as Array<[string]>;
    const firstChunk = calls[0]![0];
    const secondChunk = calls[1]![0];
    expect(firstChunk.trim().split(/\s+/)).toHaveLength(510);
    expect(secondChunk.trim().split(/\s+/)).toHaveLength(74);
  });

  it("deduplicates model tokens emitted by overlapping chunks", async () => {
    const runtime: RampartRuntime = {
      tokenize: () => ["jan"],
      classify: async () => [
        { word: "jan", entity: "B-GIVEN_NAME", score: 0.8 },
        { word: "jan", entity: "B-GIVEN_NAME", score: 0.9 },
      ],
    };

    await expect(detectWithRampart("Jan", runtime)).resolves.toEqual([
      { start: 0, end: 3, type: "PERSON", source: "model" },
    ]);
  });
});
