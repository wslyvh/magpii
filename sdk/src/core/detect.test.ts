import { describe, expect, it } from "vitest";
import type { ContextualDetector } from "./detect.js";
import { detectText } from "./detect.js";

describe("detectText", () => {
  it("retains overlapping evidence until redaction selection", async () => {
    const detector: ContextualDetector = {
      detect: async () => [
        { start: 0, end: 12, type: "PERSON", source: "model" },
      ],
    };
    const structuredDetector = () => [
      { start: 4, end: 10, type: "BSN", source: "structured" } as const,
    ];

    await expect(
      detectText("123456789012", detector, structuredDetector),
    ).resolves.toEqual([
      { start: 0, end: 12, type: "PERSON", source: "model" },
      { start: 4, end: 10, type: "BSN", source: "structured" },
    ]);
  });
});
