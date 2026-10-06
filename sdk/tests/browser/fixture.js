import { redactText } from "../../dist/index.js";
import { createBrowserDetector, isFullModelCached, clearFullModelCache } from "../../dist/browser.js";

window.magpii = { redactText, createBrowserDetector, isFullModelCached, clearFullModelCache };
