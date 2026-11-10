// Turns the Vite build into a single page for hosts that wrap your HTML in their
// own document: the markup and styles inline, with the game script beside it.
// usage: node tools/build-page.mjs [out-dir]     (run `npm run build` first)
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist-page");
const html = await readFile("dist/index.html", "utf8");
const css = await readFile("dist/game.css", "utf8");

const pick = (re) => (html.match(re) ?? [""])[0];
const title = pick(/<title>[\s\S]*?<\/title>/);
const fitMeta = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/);
const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);
const style = pick(/<style>[\s\S]*?<\/style>/);
const body = (html.match(/<body>([\s\S]*?)<\/body>/) ?? ["", ""])[1].replace(/<script[\s\S]*?<\/script>/g, "").trim();
if (!title || !style || !body) throw new Error("dist/index.html is not in the expected shape");

const page = [title, fitMeta, fonts, style, `<style>\n${css}</style>`, body, '<script type="module" src="game.js"></script>', ""].join("\n");
await mkdir(out, { recursive: true });
await writeFile(join(out, "westx-duel-box.html"), page);
await copyFile("dist/game.js", join(out, "game.js"));
console.log(`wrote ${join(out, "westx-duel-box.html")} and game.js`);
