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

test("Mini survives a fresh visit without model requests and repairs corrupt saved weights", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  const first = await redact(page, "Jan de Vries lives in Haarlem. Email jan@example.nl.");
  expect(first.redactedText).not.toContain("Jan de Vries");
  await page.close();

  const nextVisit = await context.newPage();
  await nextVisit.goto("/");
  await nextVisit.waitForFunction(() => Boolean(window.magpii));
  const requests = [];
  context.on("request", request => {
    if (request.url().includes("/models/masker-mini/")) requests.push(request.url());
  });
  await nextVisit.route("**/magpii/models/**", route => route.abort());
  expect(await redact(nextVisit, "Jan de Vries lives in Haarlem. Email jan@example.nl.")).toEqual(first);
  expect(requests).toEqual([]);
  await nextVisit.unroute("**/magpii/models/**");

  await nextVisit.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith("magpii-mini-v3-int4-"));
    const cache = await caches.open(name);
    await cache.put("/magpii/models/masker-mini/onnx/model_int4.onnx", new Response("corrupt model"));
  });
  expect(await redact(nextVisit, "Jan de Vries lives in Haarlem. Email jan@example.nl.")).toEqual(first);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain("onnx/model_int4.onnx");
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


test("optional Full uses verified cached assets and repairs corrupt metadata", async ({ page, context }) => {
  test.skip(!process.env.MAGPII_FULL_MODEL_TEST, "Opt in after exporting Full assets.");
  const requests = [];
  context.on("request", request => requests.push(request));
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  async function run() {
    return page.evaluate(async () => {
      const progress = [];
      const detector = window.magpii.createBrowserDetector({ assetBaseUrl: "/magpii/", model: "full", fullModelBaseUrl: "/full/", onProgress: value => progress.push(value) });
      try {
        await detector.warmup();
        const result = await window.magpii.redactText("Beste Jan de Vries, uw afspraak is bevestigd. Tot volgende week Jan.", { detector });
        const longText = "😀 " + "The meeting notes are ready. ".repeat(120) + "Jan de Vries lives in Haarlem. Email jan@example.nl.";
        const longResult = await window.magpii.redactText(longText, { detector });
        if (longResult.redactedText.includes("jan@example.nl") || !longResult.detections.some(d => d.source === "model" && d.start > 3000)) throw new Error("Full windowed inference failed");
        return { result, progress, cached: await window.magpii.isFullModelCached("/full/") };
      } finally { detector.dispose(); }
    });
  }
  await page.evaluate(() => window.magpii.clearFullModelCache());
  const first = await run();
  expect(first.cached).toBe(true);
  expect(first.result.redactedText).not.toContain("Jan");
  expect(first.progress.at(-1).loaded).toBe(first.progress.at(-1).total);
  await page.close();
  page = await context.newPage();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.magpii));
  requests.length = 0;
  const reused = await run();
  expect(reused.result).toEqual(first.result);
  expect(reused.progress).toEqual([]);
  expect(requests.filter(request => request.url().includes("/full/"))).toHaveLength(0);

  await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith("magpii-full-v2-int4-"));
    const cache = await caches.open(name);
    const response = await cache.match("/full/config.json");
    const corrupted = (await response.text()).replace('"hidden_size": 768', '"hidden_size": 769');
    await cache.put("/full/config.json", new Response(corrupted));
  });
  requests.length = 0;
  expect((await run()).result).toEqual(first.result);
  expect(requests.filter(request => request.url().endsWith("/full/config.json"))).toHaveLength(1);
  expect(requests.every(request => request.method() === "GET" && request.postData() === null)).toBe(true);
  await page.evaluate(() => window.magpii.clearFullModelCache());
  expect(await page.evaluate(() => window.magpii.isFullModelCached("/full/"))).toBe(false);
});
