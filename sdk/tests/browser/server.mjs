import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { build } from "esbuild";

const assets = resolve("assets/browser");
const fullAssets = resolve("models/masker-full");
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
      path === "/fixture.js" ? fixture
        : path.startsWith("/full/") ? resolve(fullAssets, path.slice("/full/".length))
        : resolve(assets, path.slice("/magpii/".length));
    if (
      file !== fixture &&
      (!(path.startsWith("/magpii/") && file.startsWith(`${assets}/`)) && !(path.startsWith("/full/") && file.startsWith(`${fullAssets}/`)))
    ) {
      response.writeHead(404).end();
      return;
    }
    const size = (await stat(file)).size;
    response.writeHead(200, {
      "Content-Length": size,
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
}).listen(3110, "127.0.0.1");
