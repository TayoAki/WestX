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

All three are playable. Each is defined by what it owns, and by what it cannot do
alone. The reasoning comes from the [blueprint](05-blueprint.md).

| | Lawman | Witch | Engineer |
|---|---|---|---|
| Owns | The balance: solid at every range, no setup needed | The ground, from far away: area attacks | Machines, up close: a sentry, and lightning that jumps |
| Combat role | A wall that walks: heavy, deliberate, hard to move | Keeps distance and makes you cross her circles | Sets a machine down and fights beside it |
| Weapons | Revolver, storm brace, fulgur-wire lariat | Staff, hexes | Rivet gun, steam gauntlet, sentry |
| Against a crowd | The quickdraw goes through a line of them | A circle catches an area of them | Tesla jumps through a cluster of them |
| Meter | **Nerve** | **Hex** | **Pressure** |
| Health | Most | Least | Middle |
| Mobility | Two shoulder charges, no double jump | Three blinks, a double jump, and a slow float down | Two jet dashes, a double jump |
| Escape from a combo | Catches the blow and stays put | Vanishes behind the attacker | Plating shocks the attacker |
| World skill | **Tracking**: reads trails, takes targets alive | **Witch-sight**: sees fulgur veins, hidden paths, speaks with the dead | **Salvage**: repairs, hacks and rebuilds machines |

### Conditions

Three conditions, each with one job:

| Condition | Job | Who applies it |
|---|---|---|
| **Poison** | Wears health down for five seconds | Engineer: rivets, his own and the sentry's |
| **Shock** | Stops a fighter where they stand, then slows them and holds their dashes | Engineer: the prod, tesla, shock plating |
| **Hex** | Every hit against them hurts more | Witch: novas, circles, the storm, the knot |

**Overload:** two different conditions on one fighter burn off together in a single
burst, and the burst catches anyone standing beside them. The engineer can do it alone. Once all three classes share a fight, one
class's condition becomes another's overload, and that is what makes them a team.

### Lawman

The lawman is the balance between the other two. The feeling to aim
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

She does not aim. Her attacks are areas, and an area shows where it will land before
it does.

- **Hex pulse:** her strike hits everything around her, in every direction. Two
  pulses, then a nova that blasts, launches or slams and leaves the target hexed.
  There is no getting behind her.
- **Hex bolt:** her shot bends toward its target. She has no gun and nothing to
  reload, only a short wait between casts.
- **Circle:** hold the shot to draw a circle under the target. The ground is marked,
  the mark fills, and then it goes off. It lingers, and a lingering circle cannot be
  blocked.
- **Chant, then storm:** her version of holding steady and the quickdraw. The longer
  the chant, the harder the storm lands on wherever they are standing.
- **Hangman's knot:** rope the target and hang them in the air, hexed.
- **Blink:** three short teleports that return quickly.
- **Awakening — Witching Hour. Ultimate — The Long Night.**
- **Weakness:** the least health, a rooted guard, and a slow fall that makes her a target.

### Engineer

He builds, and he fights close. Where the witch stands off and owns the ground, he
sets a machine down and steps in beside it. An earlier version gave him a gas cloud;
it played like the witch's circle in another colour, so it was cut.

- **Sentry:** a turret he sets down a stride ahead. It picks its own target, the
  nearest enemy in range, and fires poisoned rivets for eight seconds. One at a time.
- **Wrench, gauntlet, prod:** a three-hit string ending in the prod, which shocks.
  With the sentry's poison already on the target, that is an overload.
- **Rivet gun:** six rivets, and every one poisons. Same cylinder and timed reload
  as the lawman's revolver.
- **Pressure, then tesla:** his version of holding steady and the quickdraw. The
  lightning shocks whoever it hits, then jumps to the nearest body within reach, up
  to three times, for half the damage each jump.
- **Shock plating:** caught mid-combo, his armor shocks the attacker.
- **Jet dash:** two, returning slowly.
- **Awakening — Overpressure. Ultimate — Redline.**
- **Weakness:** his damage arrives late, and the sentry stays where he put it. Rush
  him, or fight him somewhere else.

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

**What is built:** rabble and named. Titans are not.

**Crowd rules.** These are what make a group fight a brawl and not a queue:

- One swing hits everyone in its reach, once each, and a combo through a crowd does
  not hit softer with each body the way a long combo on one fighter does.
- Rabble fly further the more they have been hurt. Under half health, any solid hit
  takes them off their feet.
- The hit that finishes one throws them clean out of the fight. There is no verdict
  for rabble.
- A body sent flying knocks down any of its own side it lands on.
- Rabble take turns. Two may attack at once, turns are handed out a beat apart, and
  the one who has waited longest goes next. A crew member without a turn cannot swing.

**Gangs.** A gang is a leader and four to six crew, asleep at a camp until the hero
comes within 20 m or hits one of them. The hero can pick a target from further out
and open the fight on their own terms.

- Beat the crew and the leader, untouched, strides in and **calls the hero out**: a
  standoff, then a duel, where they stand.
- Hit the leader first and they join the brawl without ceremony.
- Beat the leader and whatever is left of the crew gives up.
- A gang leader has less health than an arena rival. Open-country fights are meant to
  be quicker than the arena's.
- With nobody after them, the hero gets their health back over about twenty seconds.

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
