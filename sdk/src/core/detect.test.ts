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


describe("hybrid candidate validation", () => {
  it("rejects the model and rule interpretation of an explicit invoice ID", async () => {
    const text = "Invoice number: 123456782";
    const detector = { detect: async () => [
      { start: 16, end: 25, type: "GOVERNMENT_ID", source: "model" } as const,
      { start: 16, end: 25, type: "PHONE", source: "model" } as const,
    ] };
    expect(await detectText(text, detector)).toEqual([]);
  });

  it("validates model structured candidates without requiring model/rule agreement", async () => {
    const text = "alex@example.com";
    const detector = { detect: async () => [{ start: 0, end: text.length, type: "EMAIL", source: "model" } as const] };
    expect(await detectText(text, detector, () => [])).toEqual([{ start: 0, end: text.length, type: "EMAIL", source: "model" }]);
    expect(await detectText(text, detector)).toEqual([{ start: 0, end: text.length, type: "EMAIL", source: "structured" }]);
    expect(await detectText(text)).toEqual([{ start: 0, end: text.length, type: "EMAIL", source: "structured" }]);
  });

  it("rejects malformed native structured candidates and keeps generic IDs", async () => {
    const text = "one two ABC";
    const detector = { detect: async () => [
      { start: 0, end: 3, type: "EMAIL", source: "model" } as const,
      { start: 4, end: 7, type: "PHONE", source: "model" } as const,
      { start: 8, end: 11, type: "GOVERNMENT_ID", source: "model" } as const,
    ] };
    expect(await detectText(text, detector)).toEqual([{ start: 8, end: 11, type: "GOVERNMENT_ID", source: "model" }]);
  });
});
