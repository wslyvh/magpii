import type { Detection } from '../core/types'

export type WarmupRequest = {
  kind: 'warmup'
  id: number
}

export type DetectRequest = {
  kind: 'detect'
  id: number
  text: string
}

export type WorkerRequest = WarmupRequest | DetectRequest

export type WorkerResponse =
  | { kind: 'ready'; id: number }
  | { kind: 'result'; id: number; detections: Detection[] }
  | { kind: 'error'; id: number; message: string }
