import type { ContextualDetector } from "../core/detect.js";
import type { Detection } from "../core/types.js";
import type {
  BrowserAssets,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

export type BrowserDetectorOptions = {
  assetBaseUrl: string;
  model?: "mini" | "full";
  fullModelBaseUrl?: string;
  onProgress?: (progress: { loaded: number; total: number }) => void;
};

export type WorkerLike = {
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void;
  terminate(): void;
};

type PendingRequest = {
  resolve(value: Detection[] | undefined): void;
  reject(reason: Error): void;
};

type WorkerRequestWithoutId =
  { kind: "warmup" } | { kind: "detect"; text: string };

export class BrowserDetectorClient implements ContextualDetector {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private warmupPromise: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly worker: WorkerLike,
    private readonly assets: BrowserAssets = {
      modelBaseUrl: "/models/",
      wasmBaseUrl: "/runtime/",
    },
    private readonly onProgress?: BrowserDetectorOptions["onProgress"],
  ) {
    worker.addEventListener("message", this.handleMessage);
    worker.onerror = this.handleWorkerError;
    worker.onmessageerror = this.handleMessageError;
  }

  warmup(): Promise<void> {
    if (this.warmupPromise) return this.warmupPromise;
    const promise = this.send<void>({ kind: "warmup" });
    this.warmupPromise = promise;
    void promise.catch(() => {
      if (this.warmupPromise === promise) this.warmupPromise = undefined;
    });
    return promise;
  }

  detect(text: string): Promise<Detection[]> {
    return this.send<Detection[]>({ kind: "detect", text });
  }

  dispose(): void {
    this.close(new Error("Local detector worker was closed"));
  }

  private close(error: Error): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.warmupPromise = undefined;
  }

  private send<T>(request: WorkerRequestWithoutId): Promise<T> {
    if (this.disposed)
      return Promise.reject(new Error("Local detector worker was closed"));
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as PendingRequest["resolve"],
        reject,
      });
    });
    try {
      this.worker.postMessage({
        ...request,
        id,
        assets: this.assets,
      } as WorkerRequest);
    } catch (error) {
      const pending = this.pending.get(id);
      this.pending.delete(id);
      pending?.reject(
        error instanceof Error ? error : new Error("Worker request failed"),
      );
    }
    return promise;
  }

  private readonly handleMessage = (
    event: MessageEvent<WorkerResponse>,
  ): void => {
    const response = event.data;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.kind === "progress") {
      this.onProgress?.({ loaded: response.loaded, total: response.total });
      return;
    }
    this.pending.delete(response.id);

    if (response.kind === "error") {
      pending.reject(new Error(response.message));
    } else if (response.kind === "result") {
      pending.resolve(response.detections);
    } else {
      pending.resolve(undefined);
    }
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.close(
      new Error(event.message || "The local detector could not start."),
    );
  };

  private readonly handleMessageError = (): void => {
    this.close(
      new Error("The local detector returned an unreadable response."),
    );
  };
}

export function createBrowserDetector(
  options: BrowserDetectorOptions,
): BrowserDetectorClient {
  if (options.model === "full" && !options.fullModelBaseUrl) throw new Error("Full model assets must be configured explicitly.");
  const base = new URL(
    options.assetBaseUrl,
    globalThis.document?.baseURI ?? globalThis.location?.href,
  );
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  // Use a distinct worker URL for the optional-model protocol.
  const worker = new Worker(new URL("worker-v3.js", base).href, {
    type: "module",
    name: `magpii-masker-${options.model ?? "mini"}`,
  });
  return new BrowserDetectorClient(worker, {
    model: options.model,
    modelBaseUrl: options.model === "full" ? new URL(options.fullModelBaseUrl!, globalThis.document?.baseURI ?? globalThis.location.href).href : new URL("models/", base).href,
    wasmBaseUrl: new URL("runtime/", base).href,
  }, options.onProgress);
}
