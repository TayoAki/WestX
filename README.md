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
| Strike: a pistol-whip, a backhand with the brace, then the brace's blast | J | X |
| Brace up: walk behind it, bullets ring off. Tap while being hit to catch the blow | Shift | Right trigger |
| Thunderclap: strike from behind the brace. It goes through a guard | Shift + J | Right trigger + X |
| Shot; hold to fan the hammer | K | Y |
| Hold steady: builds Nerve and reloads. Shot from it is a quickdraw | Q | Left trigger |
| Shoulder charge. Two charges that return slowly | L | B |
| Jump | Space | A |
| Lariat; hold S to zip to them instead | E | Right bumper |
| Last Word, with full Nerve | R | Left bumper |
| Awaken, when the gauge is full | F | Click a stick |
| Pause | Esc | Start |

- **You are the wall.** The rival is faster and has more dashes. You are heavier, you
  hit harder, and the brace on your left arm is both shield and cannon. Its blast
  spends Nerve: on the third strike hold W (up) to launch, S (down) to slam, or
  neither to blast them away.
- **Time the brace.** Raise it just as a bullet lands and the shot goes back.
- **The cylinder holds six.** When it runs dry, press Shot as the marker crosses the
  gold for a fast reload.
- **The standoff** opens every duel and starts again whenever you both hold steady.
  Wait for the bell, then shoot first.
- **Dead or alive:** when the rival drops, Shot finishes it and Lariat ropes them for
  a bigger bounty.

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
