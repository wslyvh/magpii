import type { Detection } from "../core/types.js";

export type BrowserAssets = {
  modelBaseUrl: string;
  wasmBaseUrl: string;
};

export type WarmupRequest = {
  kind: "warmup";
  id: number;
  assets: BrowserAssets;
};

export type DetectRequest = {
  kind: "detect";
  id: number;
  text: string;
  assets: BrowserAssets;
};

export type WorkerRequest = WarmupRequest | DetectRequest;

export type WorkerResponse =
  | { kind: "ready"; id: number }
  | { kind: "result"; id: number; detections: Detection[] }
  | { kind: "error"; id: number; message: string };
