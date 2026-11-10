// Dev helper: screenshots the built game in headless Chromium.
// usage: node tools/shot.mjs <out.png> [url-suffix] [width] [height] [waitMs] [script.mjs]
// A script module's default export receives (page, out) and can drive the game.
// Set MOBILE=1 to emulate a touch device.
import { resolve } from "node:path";
import { launch, serve } from "./serve.mjs";

const [out = "shot.png", suffix = "", w = "1280", h = "720", wait = "2500", script] = process.argv.slice(2);
const site = await serve("dist");
const browser = await launch();
const mobile = !!process.env.MOBILE;
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${site.url}/${suffix}`);
await page.waitForTimeout(+wait);
if (script) await (await import(resolve(script))).default(page, out);
else await page.screenshot({ path: out });
console.log(logs.slice(0, 25).join("\n") || "no console errors");
await browser.close();
site.close();
