/// <reference lib="webworker" />
import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import { createMaskerTokenizer } from "./maskerTokenizer.js";
import { detectWithMasker, type MaskerRuntime } from "./maskerEngine.js";
import type { BrowserAssets, WorkerRequest, WorkerResponse } from "./protocol.js";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<MaskerRuntime> | undefined;

function localUrl(path: string): string {
  const url = new URL(path, scope.location.href);
  if (url.origin !== scope.location.origin) throw new Error("Model and runtime assets must be hosted by this application.");
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

async function json(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Local model asset could not be loaded.");
  return response.json();
}

async function loadRuntime(assets: BrowserAssets): Promise<MaskerRuntime> {
  env.wasm.wasmPaths = localUrl(assets.wasmBaseUrl);
  env.wasm.numThreads = 1; env.wasm.proxy = false; env.logLevel = "error";
  const root = new URL("masker-mini/", localUrl(assets.modelBaseUrl)).href;
  const [tokenizerJson, tokenizerConfig, config] = await Promise.all([
    json(root + "tokenizer.json"), json(root + "tokenizer_config.json"), json(root + "config.json"),
  ]);
  const tokenizer = createMaskerTokenizer(tokenizerJson, tokenizerConfig);
  const response = await fetch(root + "onnx/model_int4.onnx");
  if (!response.ok) throw new Error("Local model weights could not be loaded.");
  const session = await InferenceSession.create(await response.arrayBuffer(), { executionProviders: ["wasm"] });
  return {
    maximumTokens: config.max_position_embeddings, ...tokenizer,
    async classify(ids) {
      const feeds: Record<string, Tensor> = {};
      for (const input of session.inputNames) {
        const values = input === "input_ids" ? ids : input === "attention_mask" ? ids.map(() => 1)
          : input === "token_type_ids" ? ids.map(() => 0) : undefined;
        if (!values) throw new Error("Unsupported model input.");
        feeds[input] = new Tensor("int64", BigInt64Array.from(values, BigInt), [1, ids.length]);
      }
      const { logits } = await session.run(feeds);
      const [batch, tokens, classes] = logits.dims;
      if (batch !== 1 || tokens !== ids.length || classes !== Object.keys(config.id2label).length) throw new Error("Unexpected model output shape.");
      const labels: string[] = [];
      for (let token = 0; token < tokens; token++) {
        let best = 0;
        for (let label = 1; label < classes; label++) {
          if (Number(logits.data[token * classes + label]) > Number(logits.data[token * classes + best])) best = label;
        }
        labels.push(config.id2label[best]);
      }
      return labels;
    },
  };
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (!runtimePromise) {
        const pending = loadRuntime(request.assets); runtimePromise = pending;
        void pending.catch(() => { if (runtimePromise === pending) runtimePromise = undefined; });
      }
      const runtime = await runtimePromise;
      const response: WorkerResponse = request.kind === "warmup" ? { kind: "ready", id: request.id }
        : { kind: "result", id: request.id, detections: await detectWithMasker(request.text, runtime) };
      scope.postMessage(response);
    } catch {
      scope.postMessage({ kind: "error", id: request.id, message: "Local Masker detection failed. Check the bundled assets and retry." } satisfies WorkerResponse);
    }
  })();
});
