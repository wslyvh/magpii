import { describe, expect, it } from "vitest";
import type { Detection } from "./types.js";
import { maskText } from "./mask.js";

describe("maskText", () => {
  it("replaces detections with exact typed placeholders and preserves other text", () => {
    const text =
      "Jan de Vries, geboren op 14-03-1968, werkt aan project 72-A en gebruikt document 500.";
    const name = "Jan de Vries";
    const detections: Detection[] = [
      {
        start: text.indexOf(name),
        end: text.indexOf(name) + name.length,
        type: "PERSON",
        source: "model",
      },
    ];

    expect(maskText(text, detections)).toBe(
      "[PERSON], geboren op 14-03-1968, werkt aan project 72-A en gebruikt document 500.",
    );
  });

  it("replaces from right to left so original offsets remain valid", () => {
    const text = "Mail jan@example.nl or call +31 6 12345678.";
    const email = "jan@example.nl";
    const phone = "+31 6 12345678";
    const detections: Detection[] = [
      {
        start: text.indexOf(email),
        end: text.indexOf(email) + email.length,
        type: "EMAIL",
        source: "structured",
      },
      {
        start: text.indexOf(phone),
        end: text.indexOf(phone) + phone.length,
        type: "PHONE",
        source: "structured",
      },
    ];

    expect(maskText(text, detections)).toBe("Mail [EMAIL] or call [PHONE].");
  });
});
