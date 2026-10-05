import { expect, test } from "@playwright/test";

async function redact(page, text, assetBaseUrl = "/magpii/") {
  return page.evaluate(
    async ({ input, assetBaseUrl }) => {
      const detector = window.magpii.createBrowserDetector({
        assetBaseUrl,
      });
      try {
        await detector.warmup();
        return await window.magpii.redactText(input, { detector });
      } finally {
        detector.dispose();
      }
    },
    { input: text, assetBaseUrl },
  );
}

test("the compiled browser bundle preserves components and opt-in dates without uploading text", async ({
  page,
  context,
}) => {
  const input =
    "Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. Mail jan@example.nl, bel 06-12345678, BSN 111222333, IBAN NL91 ABNA 0417 1643 00, kaart 4111 1111 1111 1111. De vergadering blijft staan.";
  const requests = [];
  const errors = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  const result = await redact(page, input, "magpii/");
  expect(result.redactedText).toBe(
    "[GIVEN_NAME] [SURNAME], geboren op 14-03-1968, woont aan de [STREET] [BUILDING_NUMBER] in [CITY]. Mail [EMAIL], bel [PHONE], BSN [BSN], IBAN [IBAN], kaart [CREDIT_CARD]. De vergadering blijft staan.",
  );
  expect(new Set(result.detections.map(({ type }) => type))).toEqual(
    new Set([
      "GIVEN_NAME", "SURNAME", "STREET", "BUILDING_NUMBER", "CITY", "DATE", "GOVERNMENT_ID",
      "EMAIL",
      "PHONE",
      "BSN",
      "IBAN",
      "CREDIT_CARD",
    ]),
  );
  expect(
    requests.every(
      ({ url, method, body }) =>
        url.startsWith("http://127.0.0.1:3110/") &&
        method === "GET" &&
        body === null &&
        !url.includes("jan@example.nl"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("missing assets reject detection, and a new detector can retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  await page.route("**/magpii/models/**", (route) => route.abort());
  await expect(redact(page, "jan@example.nl")).rejects.toThrow();
  await page.unroute("**/magpii/models/**");
  expect((await redact(page, "jan@example.nl")).redactedText).toBe("[EMAIL]");
});


test("long text and Unicode retain original offsets beyond the first model window", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  const text = "😀 " + "The meeting notes are ready. ".repeat(120) + "Jan de Vries lives in Haarlem. Email jan@example.nl.";
  const result = await redact(page, text);
  expect(result.redactedText.startsWith("😀 The meeting notes")).toBe(true);
  expect(result.redactedText).toContain("[EMAIL]");
  const names = result.detections.filter(d => d.type === "GIVEN_NAME" || d.type === "SURNAME");
  expect(names.map(d => text.slice(d.start, d.end))).toEqual(["Jan", "de Vries"]);
  expect(result.redactedText).not.toContain("Jan de Vries");
});

test("boundary formatting marks do not prevent structured redaction in the real worker", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  const results = await page.evaluate(async () => {
    const detector = window.magpii.createBrowserDetector({ assetBaseUrl: "/magpii/" });
    try {
      const results = [];
      for (const input of ["\u200bEmail alex@example.com.", "Email alex@example.com.\u200e", " \t\u200cEmail alex@example.com.\u200b \n", "\u200b"]) {
        results.push({ input, ...(await window.magpii.redactText(input, { detector })) });
      }
      return results;
    } finally {
      detector.dispose();
    }
  });
  expect(results.map(result => result.redactedText)).toEqual([
    "\u200bEmail [EMAIL].",
    "Email [EMAIL].\u200e",
    " \t\u200cEmail [EMAIL].\u200b \n",
    "\u200b",
  ]);
  for (const result of results.slice(0, 3)) {
    const email = result.detections.find(d => d.type === "EMAIL");
    expect(result.input.slice(email.start, email.end)).toBe("alex@example.com");
  }
});
