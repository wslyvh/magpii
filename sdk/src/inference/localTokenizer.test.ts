import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadBundledTokenizer, requireTokenizer } from "./localTokenizer.js";

const rampartRoot = new URL("../../models/rampart/", import.meta.url).href;

async function readBundledJson(url: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(url), "utf8"));
}

describe("loadBundledTokenizer", () => {
  it("tokenizes Dutch name pieces from the bundled WordPiece files", async () => {
    const tokenizer = await loadBundledTokenizer(rampartRoot, readBundledJson);

    expect(tokenizer.tokenize("Jan de Vries")).toEqual([
      "jan",
      "de",
      "vr",
      "##ies",
    ]);
  });

  it("rejects missing tokenizer JSON", async () => {
    await expect(
      loadBundledTokenizer(rampartRoot, async (url) => {
        if (url.endsWith("tokenizer.json")) return null;
        return readBundledJson(url);
      }),
    ).rejects.toThrow("missing or invalid");
  });
});

describe("requireTokenizer", () => {
  it("fails closed when Transformers.js skipped the tokenizer", () => {
    expect(() => requireTokenizer(null)).toThrow("failed to load");
  });
});
