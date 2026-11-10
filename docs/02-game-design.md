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
| Pace of the world | Western open worlds: horses, weather, long rides between towns |
| Look | Cel-shaded anime rendering: flat tones, ink outlines, bold effects |
| Combat feel | 3D anime arena fighters: lock-on, dash, vanish, launch, ultimates, team assists |
| How the two join | Open-zone anime RPGs, where fights happen in the world you were just walking through |

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
  What they carry now is called Nerve.

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
| Combat role | A wall that walks: heavy, deliberate, hard to move | Ranged and air control | Setup, armor, area denial |
| Weapons | Revolver, storm brace, fulgur-wire lariat | Hexes, spirit familiars | Rivet gun, steam gauntlet, deployables |
| Meter | **Nerve** — builds while holding steady | **Hex** — fills fastest, shared with flight | **Pressure** — fills on its own, can overfill and overheat |
| Mobility | Lariat swing, best mounted fighter | Levitation and short flight | Jump-jet hops, steam cycle |
| Strong against | Witch (closes the gap) | Engineer (fights from the air) | Hunter (denies space, absorbs hits) |
| World skill | **Tracking**: reads trails, takes targets alive | **Witch-sight**: sees fulgur veins, hidden paths, speaks with the dead | **Salvage**: repairs, hacks and rebuilds machines |

### Bounty Hunter

The hunter is the one you play, and the only class built so far. The feeling to aim
for is a lawman who does not dance: he walks in, takes what is thrown at him, and
ends it in a few heavy blows. Everything about the kit is limited on purpose.

**The brace.** His left forearm was struck by the storm and is bound in a brass brace
with a strip of fulgur glass down it. It is his shield and his heaviest weapon, and
it runs on Nerve.

- **Brace up (guard):** he can walk behind it. Light shots ring off for no damage.
  Raise it at the last instant and the shot goes back at the shooter.
- **Catch:** mid-combo, he does not vanish. He catches the blow, stays where he is,
  and the attacker is the one left open. Three charges.
- **String:** three blows, not four. A pistol-whip, a backhand with the brace, then
  the brace discharges. The blast spends Nerve; without it the blow lands flat.
- **Thunderclap:** strike from behind the brace. Slow to wind up, and it goes
  straight through a guard.
- **Shoulder charge:** his dash. It hits whoever it reaches, and he has two.
- **Limits:** one launch and one chase per combo, and no double jump.

**The revolver.** His right hand, and his reach.

- **The cylinder:** six rounds. When it empties, a marker sweeps a gauge: hit the gold
  zone for a fast reload and two hot rounds, or miss and wait longer.
- **Fan the hammer:** hold the trigger to empty the cylinder in one burst.
- **Steady:** holster and stand still. Nerve builds, rounds slide back in, and the
  quickdraw arms.
- **Quickdraw:** one shot from the holster. It hits harder the longer you waited, and
  it goes through cover.

**The rest.**

- **Lariat:** rope them and pull them in, or zip yourself to them.
- **Awakening — Reckoning:** everything else slows down.
- **Ultimate — Last Word:** six shots, one cinematic. It leaves the cylinder empty.

### The outlaw (the rival)

The rival plays the opposite way, so the hunter's weight is felt against something.
The outlaw is faster, has three dashes that return quickly, a double jump, a four-hit
string whose ender fires a round, two launches and two chases per combo, and vanishes
behind you instead of catching. He has less health and hits lighter. He has no brace:
bullets hurt him, and he cannot walk through them.

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
| **Charge** | Hold to fill your meter. You are exposed while doing it. For the hunter this is holding steady: holstered, still and quiet. |
| **Chase** | A homing dash to your target, used to close distance and to follow an enemy you just blasted away. It spends a dash charge, and charges return slowly. |
| **Guard** | Blocks. Guard at the last instant for a **Perfect Guard** and a counter window. Guards can be broken. |
| **Slip** | While being hit, spend a pip to vanish and reappear behind the attacker. Slow to refill. The hunter's version is the catch: he stays put and the attacker is thrown off. |
| **Specials** | Four equipped moves that cost meter. |
| **Awakening** | A temporary powered-up form, available at low health or a full gauge. |
| **Ultimate** | A full-meter cinematic finisher. |
| **Standoff** | Both fighters freeze and wait for a bell. The first clean draw wins. Drawing early makes your hand slow. |
| **Verdict** | The winner decides how it ends: dead, or roped and alive for a bigger bounty. |

Slip pips are the heart of duel mind-games: every combo is a question of whether the
defender will spend one, and running out is how fights are lost.

### Why dashes and combos are limited

Unlimited dashing and long juggles make every fighter an acrobat, and every fight
looks the same. Limits are what give a character a shape. The hunter gets two dashes
and three-hit strings so that each one is a decision, and so that standing your
ground behind the brace is the strong choice it should be. The outlaw gets more of
both, and pays for it in health and weight.

### Western beats

A western is stillness, then one sudden moment. An anime fighter is constant motion.
WestX keeps the anime speed and makes the western moments into rules:

| Beat | How it plays |
|---|---|
| **The standoff** | Opens every duel, and happens again whenever both fighters hold steady. A bell, then a reaction contest. |
| **The quickdraw** | Standing still is a threat, not a rest. The longer the wait, the harder the shot. |
| **Six rounds** | Ammunition is the resource that decides what you can do next, and reloading is a timed risk. |
| **Dead or alive** | A beaten rival drops to their knees. The winner shoots, or ropes them for double the bounty. |

Still to come in this direction: a town street to fight through, powder barrels and
dynamite to shoot, and a whistle that sends your horse charging through.

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
