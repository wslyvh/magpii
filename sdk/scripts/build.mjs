import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  await readFile(resolve(root, "assets/model-lock.json"), "utf8"),
);

for (const [file, checksum] of Object.entries(lock.files)) {
  const bytes = await readFile(resolve(root, "models/masker-mini", file));
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
    throw new Error(`Model checksum mismatch: ${file}`);
  }
}

await rm(resolve(root, "dist"), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  { cwd: root, stdio: "inherit" },
);

const output = resolve(root, "assets/browser");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["src/inference/masker.worker.ts"],
  outfile: resolve(output, "worker-v3.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
await cp(resolve(root, "models/masker-mini"), resolve(output, "models/masker-mini"), {
  recursive: true,
});
const runtimeSource = dirname(require.resolve("onnxruntime-web"));
await mkdir(resolve(output, "runtime"), { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  await copyFile(
    resolve(runtimeSource, file),
    resolve(output, "runtime", file),
  );
}
await copyFile(resolve(root, "NOTICE.txt"), resolve(output, "NOTICE.txt"));
console.log(`Browser bundle prepared with verified model ${lock.revision}.`);
