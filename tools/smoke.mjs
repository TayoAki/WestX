// Smoke test for the built game: it must boot without errors, run its demo
// fight, start a duel from the menu, land a strike from keyboard input, and
// then ride out into open country and walk.
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
if (!(await page.isVisible('[data-start="duel"]'))) await fail("the menu is not showing");

await page.click('[data-start="training"]');
if (!(await wait(() => window.__westx.mode === "training" && window.__westx.match.phase === "fight"))) await fail("the duel did not start");

// The lawman is played as the sheriff: her model must have loaded and be the body on screen.
if (!(await wait(() => !!window.__westx.rigs[0].body, null, 30000))) await fail("the sheriff's model did not load onto the lawman");

// A fight is watched from the side with the player on the left, so right is toward the rival.
await page.keyboard.down("KeyD");
const close = await wait(() => {
  const [a, b] = window.__westx.match.fighters;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 3;
});
await page.keyboard.up("KeyD");
if (!close) await fail("D did not move the lawman toward the rival");

let landed = false;
for (let i = 0; i < 40 && !landed; i++) {
  await page.keyboard.press("KeyJ", { delay: 40 });
  landed = await page.evaluate(() => window.__westx.match.fighters[1].hitsTaken > 0);
}
if (!landed) await fail("J did not land a strike");

await page.keyboard.press("Escape");
if (!(await wait(() => window.__westx.paused === true, null, 5000))) await fail("Escape did not pause");

// Up the screen circles the rival: after a moment of it, the two are still about as far apart.
const apart = () => page.evaluate(() => { const [a, b] = window.__westx.match.fighters; return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); });
await page.keyboard.press("Escape");
const from = await apart();
await page.keyboard.down("KeyW");
await page.waitForTimeout(900);
await page.keyboard.up("KeyW");
const to = await apart();
if (Math.abs(to - from) > 1.5) await fail(`W did not circle the rival: the gap went from ${from.toFixed(1)} to ${to.toFixed(1)}`);
await page.keyboard.press("Escape");

// Open country, as the witch: her model has to load too.
await page.click('[data-el="quit"]');
await page.click('[data-kit="witch"]');
await page.click('[data-start="roam"]');
if (!(await wait(() => window.__westx.mode === "roam" && window.__westx.match.phase === "fight"))) await fail("open country did not start");
if (!(await wait(() => !!window.__westx.rigs[0].body, null, 30000))) await fail("the witch's model did not load");
const cast = await page.evaluate(() => {
  const m = window.__westx.match;
  return { fighters: m.fighters.length, rigs: window.__westx.rigs.length, leaders: m.fighters.filter((f) => f.rank === "named").length };
});
if (cast.fighters < 10 || cast.rigs !== cast.fighters || cast.leaders !== 3) await fail(`open country has the wrong cast: ${JSON.stringify(cast)}`);
await page.keyboard.down("KeyW");
const walked = await wait(() => {
  const h = window.__westx.match.fighters[0];
  return Math.hypot(h.pos.x, h.pos.z) > 4;
});
await page.keyboard.up("KeyW");
if (!walked) await fail("W did not move the hero in open country");

if (errors.length) await fail("console errors");
console.log("smoke ok");
await browser.close();
site.close();
