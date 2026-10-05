#!/usr/bin/env node
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--out" || !args[1]) {
  console.error("Usage: magpii-assets --out <static-directory>");
  process.exit(1);
}
const source = fileURLToPath(new URL("../assets/browser/", import.meta.url));
await cp(source, resolve(args[1]), { recursive: true });
console.log(`Magpii browser assets installed in ${args[1]}.`);
