# WestX — Technical Plan

Engine and tooling facts were checked on 10 November 2026. Sources are at the bottom,
and anything I could not confirm first-hand is marked.

## 1. Engine

**Recommendation: Unreal Engine 5.8.** It is the only engine where a small team can
get near the visual bar you set, because the hard parts ship in the box.

| | Unreal Engine 5.8 | Godot 4.7 |
|---|---|---|
| Visual ceiling | Highest available: Nanite geometry, Lumen lighting, MegaLights | Good, short of big-budget realism |
| Open-world tools | Built in: World Partition streaming, procedural placement (PCG), automatic distant-detail meshes | Mostly build-your-own or community add-ons |
| Combat framework | Gameplay Ability System built in: meters, cooldowns, buffs, networking | Written from scratch |
| Free high-end assets | Megascans, MetaHuman, 500+ motion-capture animations | Fewer, with more conversion work |
| Cost | Free. 5% royalty on gross revenue above $1M per game | Free, open source, no royalty |
| Hardware | Needs a strong Windows PC | Runs on modest hardware |
| How much I can build from this cloud session | Code, data, config, editor scripts. I cannot run the editor here, and levels and Blueprints are binary files | Nearly everything is text, and I can run and test it here |

**Choose Godot instead if** you don't have a strong PC, you want me to do most of the
building end to end, or a stylized look is acceptable.

### Two things to know about Unreal right now

- **Unreal Engine 6 is coming.** Epic announced it in May 2026, with early access
  targeted for late 2027 and a full release after that. 5.8 is the last planned major
  UE5 release. UE6 makes a new language, Verse, the standard for gameplay scripting,
  and Epic has promised a migration path. Reports conflict on how long today's
  Blueprints and C++ gameplay framework stay supported. Start on 5.8 anyway, since
  UE6 is at least a year from being usable, and keep game rules in data and in the
  ability system so a later move is cheaper.
- **5.8 includes an experimental plugin that lets Claude drive the editor** on your
  own PC: placing objects, editing Blueprints, running procedural tools. That closes
  most of the gap in the table's last row. It is experimental and local-only, and one
  report says it needs a source build of the engine. Treat it as promising, not proven.

### Hardware

My rule of thumb for working comfortably on a UE5 open world, not an official spec:
8-core CPU, 32–64 GB RAM, a GPU with 12 GB or more of video memory, and 1 TB of fast
SSD storage.

## 2. How the work splits

| I can do from the repo | Needs you at the editor |
|---|---|
| C++ gameplay code: combat, abilities, AI, camera | Compiling and playtesting |
| Move lists, stats and bounties as data files | Level dressing and lighting |
| Editor scripts that build levels and place content procedurally | Importing and assigning art |
| Build scripts, tests, documentation | Judging feel |

With the editor plugin working, more of the right column moves left.

## 3. Architecture (Unreal)

### Code modules

| Module | Owns |
|---|---|
| `WestXCore` | Game modes, save data, settings |
| `WestXCombat` | Lock-on, hit detection, hit-stop, launch and knockback, clashes, duel camera |
| `WestXAbilities` | Meters, Slip pips, specials, awakenings, ultimates |
| `WestXWorld` | Bounties, factions, notoriety, stormfronts, trains |
| `WestXAI` | Rabble, Named duelists, Titans, posse partners |
| `WestXUI` | HUD, menus |

### Key decisions

- **Gameplay Ability System for everything combat.** Health, the three meters, Slip
  pips and the awakening gauge are attributes. Every move is an ability. State such
  as airborne, launched or armored is expressed as tags. It replicates over the
  network, which keeps co-op and PvP reachable.
- **Moves are data.** Each attack's timing, damage, launch angle and follow-ups live
  in tables in the repo. Tuning a combo means editing a row, and I can do that from
  here.
- **C++ for systems, Blueprints for content.** Rules in code, per-move visuals and
  timing in the editor.
- **Launches and knockback are scripted motion, not physics.** Fighters fly along
  authored curves so combos are reliable. Physics is for debris only.
- **Two camera modes:** over-the-shoulder for exploring and Rabble, lock-on for
  Duels, with a blended transition on draw.

### AI

- Rabble: simple group behaviors, tuned to be cut through.
- Named: a duelist AI that uses the same verbs as the player, including Slip.
- Titans: scripted phases with destructible parts.
- Partners: follow, assist on call, and stay out of your combo.

## 4. The world

### Building the map

1. **Start from real terrain.** U.S. Geological Survey elevation data is public
   domain, at about 10 m resolution nationwide and 1 m in many areas. Canyon country
   and salt flats are available as-is.
2. **Convert** to a heightmap, checking the vertical scale.
3. **Remix** in a terrain tool: compress distances, exaggerate mesas, add erosion.
   The goal is believable, not a literal copy of a real place.
4. **Import** as a streamed landscape.
5. **Scatter procedurally** by biome: rock, scrub, trees, fences, roads.
6. **Hand-dress** towns and points of interest.

Unreal 5.8 also has a new Mesh Terrain system that allows overhangs and arches, which
would suit canyon country. It is experimental, so the plan uses the standard
landscape and revisits later.

### Size

Fast movement eats map. The plan grows in steps and keeps each one dense:

| Stage | Area | Content |
|---|---|---|
| Vertical slice | About 4 km² | One canyon, one town, finished to final quality |
| Early access | About 16 km² | Two regions |
| Full release | 36–64 km² | Four or five regions |

### Destruction budget

- Pre-fractured meshes for hero props and wooden buildings.
- Cheap swaps and decals for everything else.
- Craters as decals and small terrain patches, not true deformation.
- A hard cap on simultaneous debris.

## 5. Art and assets

| Need | Source | Notes |
|---|---|---|
| Rocks, ground, plants | Megascans on Fab | Whole library made free on 5 November 2026 |
| Human characters | MetaHuman | Included in the Unreal license |
| Walking, running, climbing | Epic's Game Animation Sample | 500+ free motion-captured animations, updated for 5.8 |
| Western buildings and props | Fab marketplace packs | Paid; check each license |
| Terrain shape | USGS elevation data | Public domain |
| Combat animation | Bespoke | See below |
| Effects | Bespoke | See below |

**Look:** realistic world and materials, stylized energy. Auras, hexes and impacts are
bold and readable against a naturalistic frontier. The storm on the horizon is the
landmark you can see from everywhere.

## 6. The two expensive parts

**Combat animation.** Anime combat needs a large set of hand-tuned moves per hero:
strings, enders, specials, hit reactions and cinematic ultimates. My rough estimate is
150–250 animations each. Free locomotion sets do not cover this. Options, cheapest
first: retargeted marketplace packs, markerless motion capture from video, a contract
animator for the signature moves.

**Effects.** Auras, beams, impacts and awakenings are what sell the fantasy. This is
skilled work and the first place to spend money.

## 7. Online

- Co-op is server-authoritative with client prediction, which the ability system
  supports directly.
- PvP at this speed is harder and may need its own networking model. It ships last.
- Even solo, combat runs on a fixed tick and avoids frame-dependent logic so it can
  go online later.

## 8. Performance targets

- 60 fps at 1440p on a mid-to-high-end PC, using upscaling.
- PC first. Consoles after early access. Handhelds are not a target.
- Budgets for streaming, debris and effects are set in the vertical slice and held.

## 9. Repository

```
WestX/
  WestX.uproject
  Source/      C++ modules
  Config/      engine and game settings
  Content/     binary assets, stored with Git LFS
  Data/        move tables, stats, bounties as text
  Tools/       editor and build scripts
  docs/        this plan
```

Binary assets go through Git LFS from the first commit. An Unreal project will
outgrow GitHub's free LFS allowance, so expect to pay for storage or move binaries to
a dedicated asset host.

## Sources

- [Unreal Engine 5 — Wikipedia](https://en.wikipedia.org/wiki/Unreal_Engine_5) (5.8 released 17 June 2026)
- [Unreal Engine 6 release date and timeline — Ludus](https://ludusengine.com/blog/unreal-engine-6-release-date) (secondary source)
- [Unreal Engine 6: release roadmap and tech overhaul — Playfront](https://playfront.de/en/unreal-engine-6-release-fahrplan-und-tech-umbau-stehen/) (secondary source)
- [Unreal Engine license](https://www.unrealengine.com/license)
- [Megascans are going free again — Quixel](https://quixel.com/news/update-megascans-are-going-free-again)
- [Game Animation Sample updated for UE 5.8 — Epic](https://www.unrealengine.com/tech-blog/download-the-latest-game-animation-sample-project-now-updated-for-ue-5-8)
- [MetaHuman license](https://www.metahuman.com/license)
- [Unreal MCP plugin: setup, limits, alternatives — Ludus](https://ludusengine.com/blog/unreal-mcp-plugin-ue5-8-setup) (secondary source)
- [Claude Desktop + Unreal Engine 5.8 via MCP — Epic forums](https://forums.unrealengine.com/t/community-tutorial-connection-tutorial-claude-desktop-unreal-engine-5-8-via-mcp/2831194)
- [Godot 4.7.2 download page](https://godotengine.org/download/archive/4.7.2-stable/)
- [USGS 1/3 arc-second elevation models — data.gov](https://catalog.data.gov/dataset/1-3rd-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-co)
