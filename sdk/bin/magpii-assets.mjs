#!/usr/bin/env node
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--out" || !args[1]) {
  console.error("Usage: magpii-assets --out <static-directory>");
  process.exit(1);
}
const source = fileURLToPath(new URL("../assets/browser/", import.meta.url));
const target = resolve(args[1]);
// Replace generated runtime/models and remove the superseded worker.
// Optional Full weights are hosted separately and never copied into a site build.
for (const name of ["runtime", "models", "worker-v2.js"]) {
  await rm(resolve(target, name), { recursive: true, force: true });
}
await cp(source, target, { recursive: true });
console.log(`Magpii browser assets installed in ${args[1]}.`);
