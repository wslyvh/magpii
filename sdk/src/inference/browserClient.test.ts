import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserDetector,
  BrowserDetectorClient,
  type WorkerLike,
} from "./browserClient.js";
import type { WorkerResponse } from "./protocol.js";

class FakeWorker implements WorkerLike {
  onerror: WorkerLike["onerror"] = null;
  onmessageerror: WorkerLike["onmessageerror"] = null;
  messages: unknown[] = [];
  terminate = vi.fn();
  private listeners = new Set<(event: MessageEvent<WorkerResponse>) => void>();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener);
  }

  emit(data: WorkerResponse): void {
    for (const listener of this.listeners)
      listener({ data } as MessageEvent<WorkerResponse>);
  }
}

describe("BrowserDetectorClient", () => {
  it("rejects pending work when the browser fails to load a worker", async () => {
    const worker = new FakeWorker();
    const client = new BrowserDetectorClient(worker);
    const pending = client.warmup();
    worker.onerror?.({
      message: "Worker load failed",
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent);
    await expect(pending).rejects.toThrow("Worker load failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("passes application asset paths to the worker", async () => {
    const worker = new FakeWorker();
    const assets = {
      modelBaseUrl: "/magpii/models/",
      wasmBaseUrl: "/magpii/runtime/",
    };
    const client = new BrowserDetectorClient(worker, assets);
    const pending = client.warmup();
    expect(worker.messages[0]).toMatchObject({ assets });
    worker.emit({ kind: "ready", id: 1 });
    await pending;
  });
  it("shares one warmup request while model loading is in flight", async () => {
    const worker = new FakeWorker();
    const client = new BrowserDetectorClient(worker);

    const first = client.warmup();
    const second = client.warmup();

    expect(first).toBe(second);
    expect(worker.messages).toHaveLength(1);
    const request = worker.messages[0] as { id: number };
    worker.emit({ kind: "ready", id: request.id });
    await expect(first).resolves.toBeUndefined();
  });

  it("correlates concurrent detection results", async () => {
    const worker = new FakeWorker();
    const client = new BrowserDetectorClient(worker);

    const first = client.detect("Jan");
    const second = client.detect("Zijlweg");
    const [firstRequest, secondRequest] = worker.messages as Array<{
      id: number;
    }>;

    worker.emit({
      kind: "result",
      id: secondRequest!.id,
      detections: [{ start: 0, end: 7, type: "ADDRESS", source: "model" }],
    });
    worker.emit({
      kind: "result",
      id: firstRequest!.id,
      detections: [{ start: 0, end: 3, type: "PERSON", source: "model" }],
    });

    await expect(first).resolves.toEqual([
      { start: 0, end: 3, type: "PERSON", source: "model" },
    ]);
    await expect(second).resolves.toEqual([
      { start: 0, end: 7, type: "ADDRESS", source: "model" },
    ]);
  });

  it("clears a failed warmup so a later call can retry", async () => {
    const worker = new FakeWorker();
    const client = new BrowserDetectorClient(worker);

    const first = client.warmup();
    const firstRequest = worker.messages[0] as { id: number };
    worker.emit({ kind: "error", id: firstRequest.id, message: "load failed" });
    await expect(first).rejects.toThrow("load failed");

    const second = client.warmup();
    expect(worker.messages).toHaveLength(2);
    const secondRequest = worker.messages[1] as { id: number };
    worker.emit({ kind: "ready", id: secondRequest.id });
    await expect(second).resolves.toBeUndefined();
  });

  it("rejects pending work and terminates the worker on dispose", async () => {
    const worker = new FakeWorker();
    const client = new BrowserDetectorClient(worker);
    const pending = client.detect("Jan");

    client.dispose();

    await expect(pending).rejects.toThrow("Local detector worker was closed");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe("createBrowserDetector", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["magpii/", "https://example.test/tools/magpii/"],
    ["../magpii", "https://example.test/magpii/"],
    ["/magpii", "https://example.test/magpii/"],
    ["https://example.test/bundled/", "https://example.test/bundled/"],
  ])(
    "resolves %s once for the worker, model, and runtime",
    async (assetBaseUrl, base) => {
      vi.stubGlobal("document", { baseURI: "https://example.test/tools/" });
      const worker = new FakeWorker();
      const WorkerConstructor = vi.fn(function () {
        return worker;
      });
      vi.stubGlobal("Worker", WorkerConstructor);
      const detector = createBrowserDetector({ assetBaseUrl });
      expect(WorkerConstructor).toHaveBeenCalledWith(`${base}worker-v2.js`, {
        type: "module",
        name: "magpii-masker-mini",
      });
      const pending = detector.warmup();
      expect(worker.messages[0]).toMatchObject({
        assets: {
          modelBaseUrl: `${base}models/`,
          wasmBaseUrl: `${base}runtime/`,
        },
      });
      worker.emit({ kind: "ready", id: 1 });
      await pending;
      detector.dispose();
    },
  );
});
