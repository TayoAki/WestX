# WestX

A 3D open-world weird-west action game for the browser. You ride a frontier as a
posse of three — a bounty hunter, a witch and an engineer — and every real fight
plays like an anime arena brawl.

**Status:** Phase 1, the combat prototype. One arena, one hunter, one rival, and
placeholder art. It exists to answer one question: does the fighting feel right?

## Play it

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints. To build static files for any web host:

```bash
npm run build
```

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move: W closes in, S backs off, A and D circle | W A S D | Left stick |
| Strike; four presses make a string | J | X |
| Shot; hold then release for a heavy shot | K | Y |
| Dash; chases your rival from range | L | B |
| Jump, and again in the air | Space | A |
| Guard; tap while being hit to Slip behind them | Shift | Right trigger |
| Charge Grit | Q | Left trigger |
| Lariat; hold S to zip to them instead | E | Right bumper |
| Last Word, with full Grit | R | Left bumper |
| Awaken, when the gauge is full | F | Click a stick |
| Pause | Esc | Start |

The fourth strike is the ender: hold W (up) to launch, S (down) to slam, or neither
to blast them away. After a blast, dash to chase. After a launch, jump to follow.

Touch controls appear on phones.

## Checks

```bash
npm test
```

```bash
npm run smoke
```

`test` runs the combat rules without a browser. `smoke` boots the built game in
headless Chromium and needs Playwright; run `npm run build` first.

## The plan

| Doc | What's in it |
|---|---|
| [Research: Bass X Machina](docs/01-research-bass-x-machina.md) | The show's world and characters, and what WestX takes from it |
| [Game design](docs/02-game-design.md) | World, the three classes, combat, open world, progression |
| [Technical plan](docs/03-technical-plan.md) | Stack, architecture, what is verified, the open-world plan |
| [Roadmap](docs/04-roadmap.md) | Phases, what is built, risks, open questions |

WestX is inspired by the genre of *Bass X Machina* and uses none of its characters,
names or story.
