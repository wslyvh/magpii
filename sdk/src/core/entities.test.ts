import { describe, expect, it } from "vitest";
import { canonicalEntityType, DEFAULT_REDACTION_TYPES, detectText, redactText, type Detection } from "../index.js";
import { detectUrls } from "./structured.js";

describe("entity selection and ownership", () => {
  it("maps components without inventing a name part, full address, BSN or DOB", () => {
    expect(["GIVEN_NAME", "SURNAME", "STREET_NAME", "ZIP_CODE", "GOVERNMENT_ID", "DATE", "AGE", "PERSON"].map(canonicalEntityType)).toEqual(["GIVEN_NAME", "SURNAME", "STREET", "POSTAL_CODE", "GOVERNMENT_ID", "DATE", "AGE", "PERSON"]);
    expect(canonicalEntityType("DOB")).toBeUndefined();
    expect(canonicalEntityType("PASSWORD")).toBeUndefined();
    expect(canonicalEntityType("constructor")).toBeUndefined();
  });

  it("detects optional categories while redacting only selected categories", async () => {
    const text = "Ada 42 on 2026-10-05 https://example.com";
    const candidates: Detection[] = [
      { start: 0, end: 3, type: "GIVEN_NAME", source: "model" },
      { start: 4, end: 6, type: "AGE", source: "model" },
      { start: 10, end: 20, type: "DATE", source: "model" },
    ];
    const detector = { detect: async () => candidates };
    const result = await redactText(text, { detector });
    expect(result.redactedText).toBe("[GIVEN_NAME] 42 on 2026-10-05 https://example.com");
    expect(result.detections.map(d => d.type)).toEqual(["GIVEN_NAME", "AGE", "DATE", "URL"]);
    expect((await redactText(text, { detector, redactionTypes: [...DEFAULT_REDACTION_TYPES, "AGE", "DATE", "URL"] })).redactedText).toBe("[GIVEN_NAME] [AGE] on [DATE] [URL]");
    expect((await redactText(text, { detector, redactionTypes: [] })).redactedText).toBe(text);
  });

  it("does not let an unselected overlapping category suppress a selected entity", async () => {
    const detector = { detect: async (): Promise<Detection[]> => [
      { start: 0, end: 8, type: "DATE", source: "model" },
      { start: 0, end: 3, type: "PERSON", source: "model" },
    ] };
    expect((await redactText("Ada 2026", { detector })).redactedText).toBe("[PERSON] 2026");
    const urlResult = (await redactText("https://example.com/?contact=ada@example.com")).redactedText;
    expect(urlResult).toContain("[EMAIL]");
    expect(urlResult).not.toContain("ada@example.com");
    expect(urlResult).not.toContain("[URL]");
  });

  it("uses rules for structured categories and preserves generic government IDs separately", async () => {
    const detector = { detect: async (): Promise<Detection[]> => [
      { start: 0, end: 3, type: "EMAIL", source: "model" },
      { start: 4, end: 7, type: "PHONE", source: "model" },
      { start: 8, end: 11, type: "GOVERNMENT_ID", source: "model" },
    ] };
    expect(await detectText("one two ABC", detector)).toEqual([{ start: 8, end: 11, type: "GOVERNMENT_ID", source: "model" }]);
  });

  it("finds HTTP URLs without absorbing sentence punctuation and keeps exact offsets", () => {
    const text = "😀 (https://example.com/a(b)). See https://example.com/me, not https://. End.";
    expect(detectUrls(text).map(d => text.slice(d.start, d.end))).toEqual(["https://example.com/a(b)", "https://example.com/me"]);
  });
});
