# WestX

A 3D open-world weird-west action game for the browser. You ride a frontier as a
posse of three — a bounty hunter, a witch and an engineer — and every real fight
plays like an anime arena brawl.

**Status:** the combat prototype, with placeholder art. Three playable classes, and
two kinds of fight:

- **Open country.** One open field with three gangs camped in it. Walk into a camp
  and the fight starts where you stand: a crowd of rabble first, then their leader
  calls you out to a duel on the spot.
- **The arena.** One rival, one formal duel.

It exists to answer one question: does the fighting feel right?

The **Lawman** is played as the sheriff and the **Witch** as the hooded one: character
models generated in Tripo and prepared for the game. Everyone else is still drawn from
placeholder shapes.

A fight is watched from the side, so you see your own fighter and not their back.

| Class | What it owns |
|---|---|
| **Lawman** | The balance. Hard to move, strong at every range, with a brace that is shield and cannon |
| **Witch** | The ground, from far away. Area attacks that warn before they land |
| **Engineer** | Machines, up close. A sentry that shoots on its own, lightning that jumps from body to body, poison and shock |

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
| Move the way you see it. A fight is watched from the side: push toward your rival to close in, up or down the screen to circle | W A S D | Left stick |
| Strike | J | X |
| Shot; hold for the class's held shot | K | Y |
| Hold steady, chant or build pressure | Q | Left trigger |
| Dash | L | B |
| Jump | Space | A |
| Guard; tap while being hit to break out of a combo | Shift | Right trigger |
| Special | E | Right bumper |
| Ultimate, with a full meter | R | Left bumper |
| Awaken, when the gauge is full | F | Click a stick |
| Next target, in open country | T or Tab | Back |
| Pause | Esc | Start |

- **The third strike is the ender.** Hold W (up) to launch, S (down) to slam, or
  neither to blast them away. It spends meter.
- **Conditions.** Poison wears health down, shock stops a fighter, hex makes every
  hit hurt more. Two different ones on the same fighter overload.
- **Crowds.** One swing hits everyone in reach. Rabble fly further the more you
  have hurt them, the hit that finishes one throws them out of the fight, and a
  flying body knocks down whoever it lands on. Only two of a crew attack at once.
- **Each class has its own answer to a crowd:** the witch's circle catches an area,
  the engineer's tesla jumps through a cluster, the lawman's quickdraw goes through
  a line.
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

## Character models

A fighter can wear a real character model. The game keeps animating its own simple
rig and copies each pose onto the model's skeleton, so a new model needs no
animation files: it needs a humanoid skeleton and a T-pose.

To prepare a model from a generator (a `.glb` with a skeleton):

```bash
npm run model -- sheriff-from-tripo.glb src/assets/models/sheriff --keep tripo_part_17=gun --stiffen tripo_part_0=0.35 --stiffen tripo_part_1=0.35 --atlas 4096 --cell 2048
```

That is the command the sheriff was made with. It packs every part's texture into
one image, welds the parts into one mesh, and drops what cel shading does not use.
Hers went from 8.2 MB in 34 pieces to 2.4 MB in two. The witch arrived as one piece
and needed only `--atlas 3072 --cell 3072`. `--keep` leaves a part separate
so the game can hide it (her holstered gun); `--stiffen` hangs a long coat from the
hips so a wide stance does not tear it.

To look at a model in any of the game's poses, run `npm run dev` and open
`/viewer.html` for the prepared sheriff, `/viewer.html?model=witch` for the witch, or
`/viewer.html?file=path/to/raw.glb` for a file exactly as it came.

A new model is given to a class in one place: the table at the top of
`src/render/model.ts`. The models are bundled into the game's one script, which is
now about 10 MB. A third or fourth will need them shipped as separate files.

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
