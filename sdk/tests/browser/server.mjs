import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build } from "esbuild";

const assets = resolve("assets/browser");
const fixture = resolve("test-results/fixture.js");
await build({
  entryPoints: ["tests/browser/fixture.js"],
  outfile: fixture,
  bundle: true,
  platform: "browser",
  format: "esm",
});
const types = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        '<!doctype html><script type="module" src="/fixture.js"></script>',
      );
      return;
    }
    const file =
      path === "/fixture.js"
        ? fixture
        : resolve(assets, path.slice("/magpii/".length));
    if (
      file !== fixture &&
      (!path.startsWith("/magpii/") || !file.startsWith(`${assets}/`))
    ) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    response.end(await readFile(file));
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
}).listen(3110, "127.0.0.1");
