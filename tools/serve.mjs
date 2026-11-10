// Shared by the dev tools: a static file server and a headless browser.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

/** Serves a directory on a free local port. */
export async function serve(dir) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://x").pathname;
      const file = join(root, path === "/" ? "index.html" : path);
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}`, close: () => server.close() };
}

/** Headless Chromium with software WebGL, so it runs on machines with no graphics card. */
export async function launch() {
  // `require` finds a globally installed Playwright; a local devDependency works too.
  const { chromium } = createRequire(import.meta.url)("playwright");
  return chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}
