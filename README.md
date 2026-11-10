# WestX

A 3D open-world weird-west action game for the browser. You ride a frontier as a
posse of three — a bounty hunter, a witch and an engineer — and every real fight
plays like an anime arena brawl.

**Status:** the combat prototype. Three playable classes duel in one arena, with
placeholder art. It exists to answer one question: does the fighting feel right?

| Class | What it owns |
|---|---|
| **Lawman** | The balance. Hard to move, strong at every range, with a brace that is shield and cannon |
| **Witch** | The ground. Area attacks that warn before they land |
| **Engineer** | Conditions. Poison wears you down, shock stops you |

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

The menu shows each class's full move list. These are shared:

| Action | Keyboard | Gamepad |
|---|---|---|
| Move: W closes in, S backs off, A and D circle | W A S D | Left stick |
| Strike | J | X |
| Shot; hold for the class's held shot | K | Y |
| Hold steady, chant or build pressure | Q | Left trigger |
| Dash | L | B |
| Jump | Space | A |
| Guard; tap while being hit to break out of a combo | Shift | Right trigger |
| Special | E | Right bumper |
| Ultimate, with a full meter | R | Left bumper |
| Awaken, when the gauge is full | F | Click a stick |
| Pause | Esc | Start |

- **The third strike is the ender.** Hold W (up) to launch, S (down) to slam, or
  neither to blast them away. It spends meter.
- **Conditions.** Poison wears health down, shock stops a fighter, hex makes every
  hit hurt more. Two different ones on the same fighter overload.
- **The standoff** opens every duel. Wait for the bell, then shoot first.
- **Dead or alive:** when the rival drops, Shot finishes it and Special ropes them
  for a bigger bounty.

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
| [The blueprint](docs/05-blueprint.md) | What the hit games have in common, and where WestX stands against each point |

WestX is inspired by the genre of *Bass X Machina* and uses none of its characters,
names or story.
