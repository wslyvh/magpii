import {
  BertTokenizer,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

export async function loadBundledTokenizer(
  modelRootUrl: string,
  readJson: (url: string) => Promise<unknown> = fetchJson,
): Promise<PreTrainedTokenizer> {
  const root = modelRootUrl.endsWith("/") ? modelRootUrl : `${modelRootUrl}/`;
  const [tokenizerJSON, tokenizerConfig] = await Promise.all([
    readJson(new URL("tokenizer.json", root).href),
    readJson(new URL("tokenizer_config.json", root).href),
  ]);

  if (!isObject(tokenizerJSON) || !isObject(tokenizerConfig)) {
    throw new Error("Bundled Rampart tokenizer files are missing or invalid.");
  }

  return new BertTokenizer(tokenizerJSON, tokenizerConfig);
}

export function requireTokenizer<T>(tokenizer: T | null | undefined): T {
  if (!tokenizer) {
    throw new Error("Rampart tokenizer failed to load from the local bundle.");
  }
  return tokenizer;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  return response.json();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
