import type { ContextualDetector } from '../core/detect'
import type { Detection } from '../core/types'
import type { WorkerRequest, WorkerResponse } from './protocol'

export type WorkerLike = {
  postMessage(message: WorkerRequest): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void
  terminate(): void
}

type PendingRequest = {
  resolve(value: Detection[] | undefined): void
  reject(reason: Error): void
}

type WorkerRequestWithoutId =
  | { kind: 'warmup' }
  | { kind: 'detect'; text: string }

export class RampartClient implements ContextualDetector {
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private warmupPromise: Promise<void> | undefined
  private disposed = false

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener('message', this.handleMessage)
  }

  warmup(): Promise<void> {
    if (this.warmupPromise) return this.warmupPromise
    const promise = this.send<void>({ kind: 'warmup' })
    this.warmupPromise = promise
    void promise.catch(() => {
      if (this.warmupPromise === promise) this.warmupPromise = undefined
    })
    return promise
  }

  detect(text: string): Promise<Detection[]> {
    return this.send<Detection[]>({ kind: 'detect', text })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.terminate()
    const error = new Error('Rampart worker was closed')
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
    this.warmupPromise = undefined
  }

  private send<T>(request: WorkerRequestWithoutId): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Rampart worker was closed'))
    const id = this.nextId
    this.nextId += 1

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as PendingRequest['resolve'],
        reject,
      })
    })
    this.worker.postMessage({ ...request, id } as WorkerRequest)
    return promise
  }

  private readonly handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)

    if (response.kind === 'error') {
      pending.reject(new Error(response.message))
    } else if (response.kind === 'result') {
      pending.resolve(response.detections)
    } else {
      pending.resolve(undefined)
    }
  }
}

export function createRampartClient(): RampartClient {
  const worker = new Worker(new URL('./rampart.worker.ts', import.meta.url), {
    type: 'module',
    name: 'magpii-rampart',
  })
  return new RampartClient(worker)
}
