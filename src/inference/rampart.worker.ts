/// <reference lib="webworker" />

import { env, LogLevel, pipeline } from '@huggingface/transformers'
import { detectWithRampart, type RampartRuntime } from './rampartEngine'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { ModelToken } from './tokenOffsets'

type RawClassifierResult = {
  word: string
  entity: string
  score: number
  index: number
}

type TokenClassifier = {
  tokenizer: {
    tokenize(text: string): string[]
  }
  (
    text: string,
    options: { ignore_labels: string[]; aggregation_strategy: 'none' },
  ): Promise<RawClassifierResult[]>
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope
let runtimePromise: Promise<RampartRuntime> | undefined

function configureLocalRuntime(): void {
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = new URL('/models/', workerScope.location.href).href
  env.useBrowserCache = false
  env.useFSCache = false
  env.useWasmCache = false
  env.logLevel = LogLevel.ERROR

  const wasm = env.backends.onnx.wasm
  if (!wasm) throw new Error('ONNX WASM runtime is unavailable.')
  wasm.wasmPaths = new URL('/runtime/', workerScope.location.href).href
  wasm.numThreads = 1
  wasm.proxy = false
}

async function loadRuntime(): Promise<RampartRuntime> {
  configureLocalRuntime()
  const loaded = (await pipeline('token-classification', 'rampart', {
    dtype: 'q4',
    device: 'wasm',
    local_files_only: true,
  })) as unknown as TokenClassifier

  return {
    tokenize: (text) => loaded.tokenizer.tokenize(text),
    classify: async (text): Promise<ModelToken[]> => {
      const output = await loaded(text, {
        ignore_labels: ['O'],
        aggregation_strategy: 'none',
      })
      return output.map(({ word, entity, score, index }) => ({ word, entity, score, index }))
    },
  }
}

function getRuntime(): Promise<RampartRuntime> {
  if (!runtimePromise) {
    const pending = loadRuntime()
    runtimePromise = pending
    void pending.catch(() => {
      if (runtimePromise === pending) runtimePromise = undefined
    })
  }
  return runtimePromise
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Local Rampart detection failed.'
}

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  void (async () => {
    try {
      const runtime = await getRuntime()
      const response: WorkerResponse =
        request.kind === 'warmup'
          ? { kind: 'ready', id: request.id }
          : {
              kind: 'result',
              id: request.id,
              detections: await detectWithRampart(request.text, runtime),
            }
      workerScope.postMessage(response)
    } catch (error) {
      const response: WorkerResponse = {
        kind: 'error',
        id: request.id,
        message: errorMessage(error),
      }
      workerScope.postMessage(response)
    }
  })()
})
