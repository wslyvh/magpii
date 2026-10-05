/// <reference lib="webworker" />

import { env, LogLevel, pipeline } from "@huggingface/transformers";
import { detectWithRampart, type RampartRuntime } from "./rampartEngine.js";
import { loadBundledTokenizer, requireTokenizer } from "./localTokenizer.js";
import type {
  BrowserAssets,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";
import type { ModelToken } from "./tokenOffsets.js";

type RawClassifierResult = {
  word: string;
  entity: string;
  score: number;
  index: number;
};

type TokenClassifier = {
  tokenizer: {
    tokenize(text: string): string[];
  };
  (
    text: string,
    options: { ignore_labels: string[]; aggregation_strategy: "none" },
  ): Promise<RawClassifierResult[]>;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<RampartRuntime> | undefined;

function localAssetUrl(path: string): string {
  const url = new URL(path, workerScope.location.href);
  if (url.origin !== workerScope.location.origin) {
    throw new Error(
      "Model and runtime assets must be hosted by this application.",
    );
  }
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

function configureLocalRuntime(assets: BrowserAssets): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = localAssetUrl(assets.modelBaseUrl);
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useWasmCache = false;
  env.logLevel = LogLevel.ERROR;

  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw new Error("ONNX WASM runtime is unavailable.");
  wasm.wasmPaths = localAssetUrl(assets.wasmBaseUrl);
  wasm.numThreads = 1;
  wasm.proxy = false;
}

async function loadRuntime(assets: BrowserAssets): Promise<RampartRuntime> {
  configureLocalRuntime(assets);
  const modelRoot = new URL("rampart/", env.localModelPath).href;
  const [tokenizer, loaded] = await Promise.all([
    loadBundledTokenizer(modelRoot),
    pipeline("token-classification", "rampart", {
      dtype: "q4",
      device: "wasm",
      local_files_only: true,
    }) as Promise<TokenClassifier>,
  ]);
  loaded.tokenizer = requireTokenizer(tokenizer);

  return {
    tokenize: (text) => loaded.tokenizer.tokenize(text),
    classify: async (text): Promise<ModelToken[]> => {
      const output = await loaded(text, {
        ignore_labels: ["O"],
        aggregation_strategy: "none",
      });
      return output.map(({ word, entity, score, index }) => ({
        word,
        entity,
        score,
        index,
      }));
    },
  };
}

function getRuntime(assets: BrowserAssets): Promise<RampartRuntime> {
  if (!runtimePromise) {
    const pending = loadRuntime(assets);
    runtimePromise = pending;
    void pending.catch(() => {
      if (runtimePromise === pending) runtimePromise = undefined;
    });
  }
  return runtimePromise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Local Rampart detection failed.";
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    void (async () => {
      try {
        const runtime = await getRuntime(request.assets);
        const response: WorkerResponse =
          request.kind === "warmup"
            ? { kind: "ready", id: request.id }
            : {
                kind: "result",
                id: request.id,
                detections: await detectWithRampart(request.text, runtime),
              };
        workerScope.postMessage(response);
      } catch (error) {
        const response: WorkerResponse = {
          kind: "error",
          id: request.id,
          message: errorMessage(error),
        };
        workerScope.postMessage(response);
      }
    })();
  },
);
