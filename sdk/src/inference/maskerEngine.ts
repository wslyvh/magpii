import { contextualSpans, decodeModelSpans, tokenWindows, type ModelSpan } from "./modelSpans.js";
import type { Detection } from "../core/types.js";
import type { Encoding } from "./maskerTokenizer.js";

export type MaskerRuntime = {
  maximumTokens: number;
  cls: number;
  sep: number;
  encode(text: string): Encoding;
  classify(ids: number[]): Promise<string[]>;
};

export async function detectWithMasker(text: string, runtime: MaskerRuntime): Promise<Detection[]> {
  const { ids, offsets } = runtime.encode(text);
  const spans: ModelSpan[] = [];
  for (const [start, end] of tokenWindows(ids.length, runtime.maximumTokens)) {
    const input = [runtime.cls, ...ids.slice(start, end), runtime.sep];
    const labels = await runtime.classify(input);
    if (labels.length !== input.length) throw new Error("Unexpected model output length.");
    spans.push(...decodeModelSpans(offsets.slice(start, end), labels.slice(1, -1)));
  }
  return contextualSpans(text, spans);
}
