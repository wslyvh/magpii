import { describe, expect, it } from "vitest";
import {
  detectBsns,
  detectCreditCards,
  detectEmails,
  detectIbans,
  detectPhones,
  detectStructured,
} from "./structured.js";

function values(
  text: string,
  detections: ReturnType<typeof detectStructured>,
): string[] {
  return detections.map(({ start, end }) => text.slice(start, end));
}

describe("email detection", () => {
  it("detects a normal address without surrounding punctuation", () => {
    const text = "Mail de poli via zorg.team+west@example.nl.";
    const result = detectEmails(text);

    expect(result).toHaveLength(1);
    expect(values(text, result)).toEqual(["zorg.team+west@example.nl"]);
    expect(result[0]?.type).toBe("EMAIL");
  });

  it("rejects addresses without a dotted domain", () => {
    expect(detectEmails("Mail jan@localhost")).toEqual([]);
  });

  it("rejects leading, trailing, and consecutive dots in the local part", () => {
    const text =
      "Niet .jan@example.nl, jan.@example.nl of jan..piet@example.nl gebruiken.";
    expect(detectEmails(text)).toEqual([]);
  });
});

describe("phone detection", () => {
  it("detects valid Dutch national and international numbers", () => {
    const text = "Bel 06-12345678 of +44 20 7946 0018.";
    const result = detectPhones(text);

    expect(values(text, result)).toEqual(["06-12345678", "+44 20 7946 0018"]);
    expect(result.every(({ type }) => type === "PHONE")).toBe(true);
  });

  it("rejects an incomplete number", () => {
    expect(detectPhones("Bel 06-1234")).toEqual([]);
  });
});

describe("BSN detection", () => {
  it("accepts nine-digit and leading-zero eight-digit values that pass the 11-test", () => {
    const text = "BSN 111.222.333 en 10000021.";
    const result = detectBsns(text);

    expect(values(text, result)).toEqual(["111.222.333", "10000021"]);
  });

  it("rejects invalid and all-zero values", () => {
    expect(detectBsns("BSN 123456789 en 000000000.")).toEqual([]);
  });
});

describe("IBAN detection", () => {
  it("accepts an IBAN only when MOD-97 passes", () => {
    const text = "Declaraties naar NL91 ABNA 0417 1643 00 graag.";
    const result = detectIbans(text);

    expect(values(text, result)).toEqual(["NL91 ABNA 0417 1643 00"]);
    expect(result[0]?.type).toBe("IBAN");
  });

  it("rejects a bad checksum", () => {
    expect(detectIbans("Niet NL00 ABNA 0417 1643 00 gebruiken.")).toEqual([]);
  });
});

describe("credit-card detection", () => {
  it("accepts a Luhn-valid card and keeps separators in the span", () => {
    const text = "Kaart 4111 1111 1111 1111 is geregistreerd.";
    const result = detectCreditCards(text);

    expect(values(text, result)).toEqual(["4111 1111 1111 1111"]);
    expect(result[0]?.type).toBe("CREDIT_CARD");
  });

  it("rejects a failed checksum and an all-zero value", () => {
    expect(
      detectCreditCards("4111 1111 1111 1112 en 0000 0000 0000 0000"),
    ).toEqual([]);
  });
});

describe("combined structured detection", () => {
  it("emits only the five approved structured types with exact source offsets", () => {
    const text =
      "Mail arts@example.nl, bel 06-12345678, BSN 111222333, IBAN NL91 ABNA 0417 1643 00, kaart 4111 1111 1111 1111.";
    const result = detectStructured(text);

    expect(new Set(result.map(({ type }) => type))).toEqual(
      new Set(["EMAIL", "PHONE", "BSN", "IBAN", "CREDIT_CARD"]),
    );
    expect(result.every(({ source }) => source === "structured")).toBe(true);
    for (const detection of result) {
      expect(text.slice(detection.start, detection.end)).not.toBe("");
    }
  });
});


describe("numeric identifier context", () => {
  it.each([
    "We zijn geopend van 09.00 - 10.00.",
    "Opening hours: 08:30–17:45.",
    "The server address is 10.2.0.0.",
    "Server: 192.168.1.100.",
    "Geboortedatum: 31-01-2001.",
    "Date: 2001/01/31.",
    "De afspraak is op 2020-03-04.",
    "Invoice number: 123456782",
    "Factuurnummer: 123456782",
  ])("does not classify non-identifiers in %s as phone or BSN", text => {
    expect(detectPhones(text)).toEqual([]);
    expect(detectBsns(text)).toEqual([]);
  });

  it("keeps valid identifiers next to unrelated dates, IPs and invoice labels", () => {
    const text = "Invoice number: 123456782. Call +31 6 12345678 on 31-01-2001. Server 10.2.0.0. BSN: 123456782.";
    expect(values(text, detectPhones(text))).toEqual(["+31 6 12345678"]);
    expect(values(text, detectBsns(text))).toEqual(["123456782"]);
    expect(values("123456782", detectBsns("123456782"))).toEqual(["123456782"]);
  });
});
