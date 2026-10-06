export {
  createBrowserDetector,
  BrowserDetectorClient,
  type BrowserDetectorOptions,
  type WorkerLike,
} from "./inference/browserClient.js";

export { isFullModelCached, clearFullModelCache, FULL_MODEL_DOWNLOAD_BYTES } from "./inference/modelCache.js";
