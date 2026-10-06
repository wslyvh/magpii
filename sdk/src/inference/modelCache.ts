import fullLock from "../../assets/full-model-lock.json" with { type: "json" };
import miniLock from "../../assets/model-lock.json" with { type: "json" };
export const MINI_CACHE_NAME = "magpii-mini-v3-int4-" + miniLock.revision.slice(0, 12);
export const FULL_CACHE_PREFIX = "magpii-full-v2-int4-";
const files = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/full-int4.onnx", "onnx/full-int4.onnx.data"] as const;
export const FULL_CACHE_NAME = FULL_CACHE_PREFIX + fullLock.files["onnx/full-int4.onnx"].slice(0, 8) + "-" + fullLock.files["onnx/full-int4.onnx.data"].slice(0, 8);

export async function isFullModelCached(baseUrl: string): Promise<boolean> {
  if (!globalThis.caches) return false;
  const root = new URL(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/", globalThis.location.href);
  try {
    for (const name of await caches.keys()) {
      if (name !== FULL_CACHE_NAME) continue;
      const cache = await caches.open(name);
      if ((await Promise.all(files.map(file => cache.match(new URL(file, root))))).every(Boolean)) return true;
    }
  } catch { /* Storage can be unavailable. Detection still works without caching. */ }
  return false;
}

export async function clearFullModelCache(): Promise<void> {
  if (!globalThis.caches) return;
  await Promise.all((await caches.keys()).filter(name => name.startsWith(FULL_CACHE_PREFIX)).map(name => caches.delete(name)));
}

export const FULL_MODEL_DOWNLOAD_BYTES = files.reduce((sum, file) => sum + fullLock.sizes[file], 0);
