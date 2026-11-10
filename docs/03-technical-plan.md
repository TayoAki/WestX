# WestX — Technical Plan

Decided 10 November 2026: WestX is a browser game with a cel-shaded look, built and
tested from a cloud session. This replaces the earlier Unreal Engine recommendation.

## 1. Stack

| Piece | Choice | Why |
|---|---|---|
| 3D engine | Babylon.js 9.35 | Runs in any modern browser, includes animation, physics and lighting, and can be built and tested without a graphics card |
| Language | TypeScript | Catches mistakes before the game runs |
| Build | Vite | One command produces static files |
| Rule tests | Vitest | The combat rules run without a browser |
| Browser test | Playwright | Boots the built game in headless Chromium |
| Renderer | WebGL 2 today | Works everywhere now. WebGPU is the upgrade path when the open world needs it |
| Physics engine | None yet | Fighter motion is scripted so combos are reliable. A physics engine arrives with the open world |
| Hosting | Static files | No server, no per-player cost |

## 2. Why not Unreal

- This cloud machine has no graphics card, 15 GB of memory and 31 GB of free disk.
  The Unreal editor cannot run here.
- Unreal has no official browser export. Its browser route is Pixel Streaming, which
  runs the game on a cloud graphics server per player and sends video.
- Godot exports to the browser, but only with its older renderer.

The cost of this choice is visual ceiling and map size. A browser game can look good.
It cannot look like Red Dead.

## 3. Architecture

The code is split in two, and the split is the most important decision in the project.

| Layer | Folder | Knows about |
|---|---|---|
| **Simulation** | `src/sim/` | Rules only. No browser, no 3D engine. |
| **Presentation** | `src/render/`, `src/ui/`, `src/audio/`, `src/input/` | How it looks, sounds and is controlled |

The simulation is one function: the match state plus two players' inputs go in, and
the next state plus a list of events comes out. Everything else reacts to those events.

What that buys:

- **Testable rules.** Combos, guard, Slip, meter and the ultimate are checked by
  automated tests in milliseconds.
- **A fair AI.** The rival plays through the same inputs a person does, so it cannot
  break rules the player has to follow.
- **A path to online play.** A match is fully described by its seed and its inputs.
- **Replaceable art.** New characters or a new renderer do not touch the rules.

Other decisions:

- **Fixed 60-per-second tick.** Rendering runs at the display's rate and interpolates.
- **Moves are data.** Every attack's timing, damage and effect is a row in
  `src/sim/moves.ts`. Tuning a combo means editing numbers.
- **No asset files yet.** Characters, arena, effects and sound are all generated in
  code. That keeps the download near 450 KB compressed while the design is still moving.

### Source map

```
src/sim/      match.ts (the rules), moves.ts (move data), ai.ts, types.ts, vec.ts, rng.ts
src/render/   stage.ts (arena), rig.ts + poses.ts (fighters), fx.ts (effects),
              cameraRig.ts, propsView.ts, toon.ts (cel shader)
src/ui/       hud.ts, hud.css
src/input/    input.ts (keyboard, gamepad, touch)
src/audio/    sfx.ts (synthesised sound)
src/game.ts   the loop that ties them together
tests/        sim.test.ts
tools/        smoke.mjs, shot.mjs, build-page.mjs
```

## 4. What is verified, and what is not

| Checked here | How |
|---|---|
| Every combat rule, for duels and for crowds | 119 automated tests |
| Whole duels run to a knockout with no broken state | 72 AI-versus-AI duels per test run |
| The open field can be played through, start to finish, by every class | 9 AI runs per test run; the AI hero clears 5 of them |
| The built game boots, starts a duel, takes keyboard input, then starts open country and walks | Headless-browser smoke test |
| Layout on desktop and phone sizes | Screenshots reviewed by me |

| Not checkable from here | Why |
|---|---|
| Frame rate on real hardware | No graphics card; the test browser renders in software. There, open country with all fifteen rabble on screen costs about a third more per frame than the arena |
| How the fight feels | Needs a person playing it |
| Sound | The test browser has no audio output; I have not heard it |
| Touch controls on a real phone | Emulated only |
| A physical gamepad | None attached |

These are the things to report back from playing it.

## 5. The open world in a browser

Not built yet. The plan:

1. **Terrain** from public-domain U.S. Geological Survey elevation data, remixed and
   cut into tiles.
2. **Streaming:** load tiles around the player, drop distant ones, and use simpler
   versions far away.
3. **Scattering:** rocks, scrub and props placed by rules per region, not by hand.
4. **Hand-built** towns and landmarks.
5. **Budgets** for download size, memory and draw calls, set in the vertical slice
   and held.
6. **WebGPU** if the slice needs more than WebGL 2 gives.

Map size is limited by download and memory, not by build effort:

| Stage | Area |
|---|---|
| Vertical slice | 1–2 km² |
| Early access | 6–9 km² |
| Full release | 16–25 km² |

## 6. Characters and animation

- **Now:** fighters are built from simple shapes and animated by easing between key
  poses defined in code.
- **Next:** rigged characters in glTF format with the same cel shader. The pose
  system is replaced by authored animation clips; the move data stays.
- **Still the expensive part:** each hero needs a large set of hand-tuned combat
  animations. This is where money goes first.

## 7. Online

- Co-op and duels can be built on the simulation as it stands: send inputs, run the
  same match on both sides.
- One known gap: the simulation uses the browser's built-in trigonometry, which is
  not guaranteed to give identical results in every browser. That has to be replaced
  with a fixed implementation before two different browsers can stay in sync.
- Online still ships after the solo game.

## 8. Commands

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run smoke
```

```bash
npm run build:page
```

`dev` serves the game locally. `build` writes static files to `dist/`. `smoke` and
`tools/shot.mjs` need Playwright with Chromium. `build:page` produces a single page
plus one script, for hosts that wrap your HTML in their own document.

## Sources

- [Unreal Engine HTML5 export status — Summer Engine](https://www.summerengine.com/make-great-games/unreal-engine-html5-export)
- [Pixel Streaming vs WebGL vs WebGPU — Vagon](https://vagon.io/blog/pixel-streaming-vs-webgl-vs-webgpu-the-best-solution-for-unreal-engine-web-deployment)
- [Overview of renderers — Godot 4.7 docs](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html)
- [Babylon.js specifications](https://babylonjs.com/specifications/)
- [WebGPU + Three.js migration guide — Utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) (browser support for WebGPU)
- [USGS 1/3 arc-second elevation models — data.gov](https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co)
