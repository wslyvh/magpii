import { describe, expect, it } from "vitest";
import { detectText, maskText, redactText } from "../index.js";

describe("the public redaction API", () => {
  it("runs in Node without a browser or contextual model", async () => {
    const result = await redactText(
      "Email me at jan@example.nl. Document 500.",
    );
    expect(result.redactedText).toBe("Email me at [EMAIL]. Document 500.");
    expect(result.detections).toEqual([
      { start: 12, end: 26, type: "EMAIL", source: "structured" },
    ]);
    expect(await detectText("No personal identifiers here.")).toEqual([]);
  });

  it("accepts a contextual detector from another platform", async () => {
    const result = await redactText("Jan: jan@example.nl", {
      detector: {
        detect: async () => [
          { start: 0, end: 3, type: "PERSON", source: "model" },
        ],
      },
    });
    expect(result.redactedText).toBe("[PERSON]: [EMAIL]");
    expect(result.detections).toHaveLength(2);
  });

  it("validates offsets and resolves overlap before public masking", () => {
    expect(
      maskText("jan@example.nl", [
        { start: -1, end: 100, type: "PERSON", source: "model" },
        { start: 0, end: 3, type: "PERSON", source: "model" },
        { start: 0, end: 14, type: "EMAIL", source: "structured" },
      ]),
    ).toBe("[EMAIL]");
  });
});
