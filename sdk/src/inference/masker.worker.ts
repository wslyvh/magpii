/// <reference lib="webworker" />
import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import fullLock from "../../assets/full-model-lock.json" with { type: "json" };
import miniLock from "../../assets/model-lock.json" with { type: "json" };
import { createMaskerTokenizer } from "./maskerTokenizer.js";
import { detectWithMasker, type MaskerRuntime } from "./maskerEngine.js";
import { FULL_CACHE_NAME, MINI_CACHE_NAME } from "./modelCache.js";
import type { BrowserAssets, WorkerRequest, WorkerResponse } from "./protocol.js";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<MaskerRuntime> | undefined;
function baseUrl(path: string, ownOrigin = false): string {
  const url = new URL(path, scope.location.href);
  if (ownOrigin && url.origin !== scope.location.origin) throw new Error("Runtime assets must be hosted by this application.");
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported model asset URL.");
  return url.href.endsWith("/") ? url.href : url.href + "/";
}
async function loadRuntime(assets: BrowserAssets, progress: (loaded: number, total: number) => void): Promise<MaskerRuntime> {
  env.wasm.wasmPaths = baseUrl(assets.wasmBaseUrl, true);
  env.wasm.numThreads = 1; env.wasm.proxy = false; env.logLevel = "error";
  const full = assets.model === "full";
  const root = full ? baseUrl(assets.modelBaseUrl) : new URL("masker-mini/", baseUrl(assets.modelBaseUrl, true)).href;
  let cache: Cache | undefined;
  if (globalThis.caches) {
    try { cache = await caches.open(full ? FULL_CACHE_NAME : MINI_CACHE_NAME); } catch { /* Optional storage. */ }
  }
  const names = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/full-int4.onnx", "onnx/full-int4.onnx.data"] as const;
  const total = full ? names.reduce((sum, name) => sum + fullLock.sizes[name], 0) : 0;
  const checksums: Record<string, string> = full ? fullLock.files : miniLock.files;
  const sizes: Record<string, number> | undefined = full ? fullLock.sizes : undefined;
  let loaded = 0;
  function reportProgress(bytes: number) {
    if (full) { loaded += bytes; progress(loaded, total); }
  }
  async function download(file: string): Promise<ArrayBuffer> {
    const url = root + file;
    const cached = await cache?.match(url).catch(() => undefined);
    if (cached) {
      const bytes = await cached.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
      if ((!sizes || bytes.byteLength === sizes[file]) && hash === checksums[file]) { if (full) loaded += bytes.byteLength; return bytes; }
      await cache?.delete(url).catch(() => false);
    }
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error("Model asset could not be loaded.");
    const reader = response.body.getReader();
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
      const result = await reader.read();
      if (result.done) controller.close();
      else { reportProgress(result.value.byteLength); controller.enqueue(result.value); }
    }, cancel: reason => reader.cancel(reason) });
    const bytes = await new Response(stream).arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if ((sizes && bytes.byteLength !== sizes[file]) || digest !== checksums[file]) throw new Error("Model asset checksum mismatch.");
    try { await cache?.put(url, new Response(bytes)); } catch { /* Quota/persistence failures do not prevent inference. */ }
    return bytes;
  }
  const metadata = await Promise.all(names.slice(0, 3).map(async file => JSON.parse(new TextDecoder().decode(await download(file)))));
  const [config, tokenizerJson, tokenizerConfig] = metadata;
  const tokenizer = createMaskerTokenizer(tokenizerJson, tokenizerConfig);
  let session: InferenceSession;
  if (full) {
    const graph = await download("onnx/full-int4.onnx");
    const data = await download("onnx/full-int4.onnx.data");
    session = await InferenceSession.create(graph, { executionProviders: ["wasm"], externalData: [{ path: "full-int4.onnx.data", data: new Uint8Array(data) }] });
  } else {
    session = await InferenceSession.create(await download("onnx/model_int4.onnx"), { executionProviders: ["wasm"] });
  }
  return { maximumTokens: config.max_position_embeddings, ...tokenizer, async classify(ids) {
    const feeds: Record<string, Tensor> = {};
    for (const input of session.inputNames) {
      const values = input === "input_ids" ? ids : input === "attention_mask" ? ids.map(() => 1) : input === "token_type_ids" ? ids.map(() => 0) : undefined;
      if (!values) throw new Error("Unsupported model input.");
      feeds[input] = new Tensor("int64", BigInt64Array.from(values, BigInt), [1, ids.length]);
    }
    const { logits } = await session.run(feeds);
    const [batch, tokens, classes] = logits.dims;
    if (batch !== 1 || tokens !== ids.length || classes !== Object.keys(config.id2label).length) throw new Error("Unexpected model output shape.");
    return ids.map((_, token) => {
      let best = 0;
      for (let label = 1; label < classes; label++) if (Number(logits.data[token * classes + label]) > Number(logits.data[token * classes + best])) best = label;
      return config.id2label[best];
    });
  } };
}
scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (!runtimePromise) {
        const pending = loadRuntime(request.assets, (loaded, total) => scope.postMessage({ kind: "progress", id: request.id, loaded, total } satisfies WorkerResponse));
        runtimePromise = pending;
        void pending.catch(() => { if (runtimePromise === pending) runtimePromise = undefined; });
      }
      const runtime = await runtimePromise;
      scope.postMessage(request.kind === "warmup" ? { kind: "ready", id: request.id } : { kind: "result", id: request.id, detections: await detectWithMasker(request.text, runtime) });
    } catch {
      scope.postMessage({ kind: "error", id: request.id, message: "Local Masker detection failed. Check model assets and retry." } satisfies WorkerResponse);
    }
  })();
});
