# WestX — Game Design

A first draft to react to. Names and lore are placeholders; the structure is the part
to argue about.

## 1. The pitch

**A grounded, cinematic frontier you ride through, where every real fight plays like
an anime arena brawl.**

You lead a posse of three: a bounty hunter, a witch and an engineer. Between fights
the game is slow and physical, with horses, weather, towns and long horizons. When a
fight starts, the rules change: dashes that cross a canyon, launches into the sky,
vanishing behind your attacker, beam clashes and cinematic finishers.

### Pillars

1. **Slow world, fast fights.** Exploration is grounded and combat is not. The
   contrast is the identity of the game, so neither half gets watered down.
2. **Three ways to be powerful.** Each class plays, travels and solves problems
   differently, and the three are stronger together.
3. **The bounty is the game.** Find them, track them, fight them, decide how to bring
   them in. Everything else feeds that loop.
4. **The world remembers the fight.** Craters, broken buildings and reputation persist.

### Reference points

| Want | Borrowed idea |
|---|---|
| Look and pace of the world | Realistic Western open worlds: natural lighting, horses, weather |
| Combat feel | 3D anime arena fighters: lock-on, dash, vanish, launch, ultimates, team assists |
| How the two join | Open-zone anime RPGs, where fights happen in the world you were just walking through |
| Proof that realism and anime-scale fights can share a screen | Realistic action games with giant, effects-heavy boss duels |

We borrow mechanics and genre, never characters, move names, maps or interface.

## 2. The world (draft)

**The Unsurveyed Territory, 1880s.** A storm has stood over the middle of the
frontier for twenty years without moving. Government maps mark everything beyond the
last rail line with an X.

Where the storm's lightning hits sand it leaves **fulgur**: glass that holds a
charge. (Lightning-fused glass is real and is called fulgurite. Ours stays live.)
Everyone in the Territory is defined by what they do with the storm:

- **Engineers harvest it.** Fulgur burned in a boiler drives machines far beyond
  ordinary steam.
- **Witches bargain with it.** The storm answers people who know how to ask, at a price.
- **Bounty hunters survived it.** The Struck were hit by its lightning and lived.
  What they carry now is called Grit.

### Factions

| Faction | What they want | Who they are to you |
|---|---|---|
| **Meridian Rail & Survey** | To push rail to the storm and own the fulgur | Employer, then problem |
| **The Warrant Office** | Order, paid for per head | Posts the bounties |
| **The Covens** | The storm left alone | Teachers and gatekeepers for witches |
| **The gangs** | Whatever is on the train | Rabble, and a source of Named bounties |

Your standing with each opens and closes content.

### Regions

Five are planned. Only the first is built for the vertical slice.

| Region | Look | Purpose |
|---|---|---|
| **Gallows Reach** | Red-rock canyons, a rail town | Starting region and vertical slice |
| **The Saltpan** | White salt flats, mirages, endless sightlines | Duel country |
| **Hollowpine** | High-country pine forest, fog | Coven territory |
| **Ironhead** | Company city, rail yards, foundries | The dense urban hub |
| **The Eye** | Under the storm: fulgur fields, constant lightning | Endgame |

### Story spine (placeholder)

A Meridian survey train vanishes inside the storm, and the company posts the largest
bounty in the Territory's history. Three people take the job for three different
reasons and find out what the company is building at the Eye.

## 3. The three classes

One hero per class at launch. The system allows more heroes per class later.

| | Bounty Hunter | Witch | Engineer |
|---|---|---|---|
| Combat role | Rushdown all-rounder | Ranged and air control | Setup, armor, area denial |
| Weapons | Twin revolvers, fulgur-wire lariat | Hexes, spirit familiars | Rivet gun, steam gauntlet, deployables |
| Meter | **Grit** — also fills on precise shots | **Hex** — fills fastest, shared with flight | **Pressure** — fills on its own, can overfill and overheat |
| Mobility | Lariat swing, best mounted fighter | Levitation and short flight | Jump-jet hops, steam cycle |
| Strong against | Witch (closes the gap) | Engineer (fights from the air) | Hunter (denies space, absorbs hits) |
| World skill | **Tracking**: reads trails, takes targets alive | **Witch-sight**: sees fulgur veins, hidden paths, speaks with the dead | **Salvage**: repairs, hacks and rebuilds machines |

### Bounty Hunter

- **Lariat:** grab at range. Pull them to you or yourself to them. The main combo extender.
- **Ricochet:** one shot that bounces between marked targets.
- **Warrant:** mark a target for bonus damage. The mark follows them through a vanish.
- **Dust Devil:** spinning aerial string that carries both fighters upward.
- **Awakening — Reckoning:** everything else slows down.
- **Ultimate — Last Word:** six shots, one cinematic.

### Witch

Three schools: **Dust** (wind and sand, moves enemies), **Bone** (curses and spectral
crows and coyotes), **Dusk** (shadow-steps and gravity).

- **Murder:** a homing swarm of crows.
- **Hangman's Knot:** suspends a target in the air for a free aerial combo.
- **Dust Wall:** blocks projectiles and breaks line of sight.
- **Shadow-step:** teleport to a placed mark.
- **Awakening — Witching Hour:** the sky darkens, flight is free, spells chain.
- **Ultimate — The Long Night.**
- Weakness: fragile up close, weak guard.

### Engineer

- **Sentry:** a deployable turret.
- **Rail Spike:** a charged piercing shot that pins targets to walls.
- **Steam Vent:** area burst that breaks guards and spends Pressure.
- **Magnet Mine:** drags enemies and loose metal to a point.
- **Awakening — Ironclad:** calls in a walking frame and fights from inside it with a new moveset.
- **Ultimate — Redline.**
- Weakness: slow, and overheating leaves a punish window.

### The posse

- You control one hero and the other two fight beside you under AI control.
- Out of combat, swap freely. In combat, **tag** a partner in or call an **assist**.
- When all three meters are full, the **Posse Ultimate** is available.
- In co-op, each player takes a hero.

## 4. Combat

### Universal verbs

Every hero shares these. Class kits change what they look like and how they're tuned.

| Verb | What it does |
|---|---|
| **Strike** | One-button melee string. Stick direction on the last hit picks the ender: launch up, blast away or slam down. |
| **Shot** | Ranged attack usable while moving or airborne. Hold for a heavy shot. |
| **Charge** | Hold to fill your meter with a visible aura. You are exposed while charging. |
| **Chase** | Meter-fuelled homing dash to your target. Used to close distance and to follow an enemy you just blasted away. |
| **Guard** | Blocks. Guard at the last instant for a **Perfect Guard** and a counter window. Guards can be broken. |
| **Slip** | While being hit, spend a pip to vanish and reappear behind the attacker. Four pips, slow to refill. |
| **Specials** | Four equipped moves that cost meter. |
| **Awakening** | A temporary powered-up form, available at low health or a full gauge. |
| **Ultimate** | A full-meter cinematic finisher. |
| **Clash** | When two big attacks collide, both players fight a short struggle and the loser takes both. |

Slip pips are the heart of duel mind-games: every combo is a question of whether the
defender will spend one, and running out is how fights are lost.

### Three kinds of fight

| Tier | Enemies | Camera | Feel |
|---|---|---|---|
| **Rabble** | Gang gunmen, feral automata, in groups | Over the shoulder | You tear through them |
| **Named** | Bounties, rival hunters, coven witches | **Duel**: lock-on, soft arena | A full one-on-one with all the verbs on both sides |
| **Titans** | War machines, storm-beasts | Pulled-back cinematic | Multi-phase, breakable parts, scripted beats |

**Soft arena:** a Duel does not load a separate level. The fight happens where you
stand, the world stays live, and a wide invisible boundary keeps both fighters in the
same area.

**Drawing:** weapons stay holstered while exploring. Drawing ignites your aura and
switches movement to combat rules. That one action is the line between the two halves
of the game.

### Destruction

- Breakable props, fences, wagons and wooden buildings.
- Blast-away enders carry enemies through whatever is behind them.
- Heavy impacts leave craters and scorch marks that persist for the session.
- Stone landmarks and story-critical buildings do not break.

### Feel targets

Numbers to tune toward, not promises.

| Target | Value |
|---|---|
| Frame rate | 60 fps minimum on target hardware |
| Chase dash | About 40 m in under half a second |
| Blast-away distance | 30–60 m |
| Hit-stop | 3–8 frames, scaling with hit strength |
| Vertical space used | Ground to about 50 m |
| Named duel length | 2–4 minutes |

## 5. The open world

### Core loop

1. **Find work:** a bounty board, a rumor, or trouble on the road.
2. **Track:** each class reads the trail its own way, so the posse always has a lead.
3. **Fight:** Rabble on the way in, a Named duel at the end.
4. **Bring them in:** dead is easy. Alive pays more and needs a non-lethal finish.
5. **Spend:** techniques, gear, camp upgrades.
6. **Move on:** reputation opens the next town, coven or region.

### Activities

| Activity | What it is |
|---|---|
| **Bounties** | The main loop. Handcrafted Named targets plus generated lesser ones. |
| **Train jobs** | Stop a robbery or commit one. Fighting on a moving train is the signature set piece. |
| **Stormfronts** | Roaming storms. Everything inside is stronger and drops more fulgur. |
| **Titan hunts** | Tracked, prepared-for boss fights in the open world. |
| **Class trials** | Coven trials, workshop contracts and hunter warrants. They teach and unlock techniques. |
| **Showdowns** | Formal duels with rules and stakes. Also the door into PvP. |
| **Notoriety** | Your own bounty rises as you do. Rival hunters come looking for you. |

### Travel

- Horses for everyone, with the hunter best in the saddle.
- Trains as fast travel you can also fight on.
- Flight and jets cost meter outside combat. Fast movement makes a world feel small,
  so the frontier stays big by keeping power expensive.

## 6. Progression

- **Technique trees** per class: new specials, string enders and awakening tiers.
- **Gear:** revolver frames and ammunition, charms and focuses, rig modules.
- **Posse bond:** unlocks team moves and assist upgrades.
- **Currencies:** bounty cash, fulgur for crafting, faction reputation.
- Difficulty comes from the region you're in. Enemies do not scale to your level.

## 7. Multiplayer

Built in this order:

1. **Solo** with two AI partners. Ships first.
2. **Posse co-op:** up to three players in one world.
3. **Showdown PvP:** one-on-one duels, then three-on-three tag.

The combat code is written for online play from day one, even though online ships later.

## 8. Not in the first version

- Fishing, card games and other minigames
- Character creator (three fixed heroes instead)
- Base building
- More than one region
- A large shared-world server

Each can come back once the core is fun.
