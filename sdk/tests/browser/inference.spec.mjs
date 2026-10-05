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

test("the compiled browser bundle redacts all categories without uploading text", async ({
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
    "[PERSON], geboren op 14-03-1968, woont aan de [ADDRESS]. Mail [EMAIL], bel [PHONE], BSN [BSN], IBAN [IBAN], kaart [CREDIT_CARD]. De vergadering blijft staan.",
  );
  expect(new Set(result.detections.map(({ type }) => type))).toEqual(
    new Set([
      "PERSON",
      "ADDRESS",
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
