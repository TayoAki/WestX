// Smoke test for the built game: it must boot without errors, run its demo
// fight, start a duel from the menu, and land a strike from keyboard input.
// Run `npm run build` first. Needs Playwright with Chromium available.
import { launch, serve } from "./serve.mjs";

const site = await serve("dist");
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

const fail = async (why) => {
  console.error(`SMOKE FAIL: ${why}`);
  if (errors.length) console.error(errors.join("\n"));
  await browser.close();
  site.close();
  process.exit(1);
};
const wait = (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: "raf" }).then(() => true, () => false);

await page.goto(`${site.url}/?lowres`);
if (!(await wait(() => window.__westx?.match?.tick > 30))) await fail("the demo fight did not start");
if (!(await page.isVisible('[data-start="normal"]'))) await fail("the menu is not showing");

await page.click('[data-start="training"]');
if (!(await wait(() => window.__westx.mode === "training" && window.__westx.match.phase === "fight"))) await fail("the duel did not start");

await page.keyboard.down("KeyW");
const close = await wait(() => {
  const [a, b] = window.__westx.match.fighters;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 3;
});
await page.keyboard.up("KeyW");
if (!close) await fail("W did not move the hunter toward the rival");

let landed = false;
for (let i = 0; i < 40 && !landed; i++) {
  await page.keyboard.press("KeyJ", { delay: 40 });
  landed = await page.evaluate(() => window.__westx.match.fighters[1].hitsTaken > 0);
}
if (!landed) await fail("J did not land a strike");

await page.keyboard.press("Escape");
if (!(await wait(() => window.__westx.paused === true, null, 5000))) await fail("Escape did not pause");

if (errors.length) await fail("console errors");
console.log("smoke ok");
await browser.close();
site.close();
