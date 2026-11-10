# The overworld and the arena

A plan, written 10 November 2026. Nothing in it is built yet except where the table
near the end says so.

## The idea

Two modes, the way Pokémon has them.

- **The overworld** is for walking. It is a place with people in it and trouble you
  can see coming. Nobody fights here.
- **The arena** is for fighting. It is the side-on fighting game that already exists.

When a fight starts the game switches from one to the other, and when it ends you are
back where you stood.

## What Pokémon Legends: Arceus does, and what WestX takes

| Legends: Arceus | WestX |
|---|---|
| You set out from one village into large open areas, not one seamless world | One region and one town first. More regions later |
| Wild Pokémon are visible in the overworld, and you can avoid them | Every gang and bounty is on the map, walking a route or camped. You choose your fights |
| You bring a team and send one out to fight | You bring the posse: three classes, one fighting at a time |
| A battle starts on the spot, with no change of screen | See below |

**One difference.** Legends: Arceus does not cut to a battle screen: the fight happens
where you are standing. The older Pokémon games do cut. You asked for the switch, and
the fighting here needs it: the arena is a fast, side-on fighting game and the
overworld is a walk with the camera behind you. They are two different cameras and
two different sets of controls.

So the plan is a switch that does not feel like leaving. A short card, then the arena
built out of the ground you were standing on, with the same rocks and buildings around
it. Bosses can have stages of their own.

## The loop

| # | Step | What happens |
|---|---|---|
| 1 | **Walk** | The camera is behind you. You go where you point |
| 2 | **Spot** | Gangs patrol and camp. Each shows what it is and what it pays before you commit |
| 3 | **Engage** | How you meet decides who gets the drop (below) |
| 4 | **Switch** | A wanted card, about a second, and the arena closes in |
| 5 | **Fight** | The arena: standoff, strikes, shots, the lot |
| 6 | **Verdict** | Dead or alive, and the bounty that goes with it |
| 7 | **Back** | You are where you stood. The gang is gone. Your health is what the fight left you |
| 8 | **Town** | Heal, collect, take the next bounty off the board |

Steps 1 to 7 are a minute or two. Step 8 is what you do when you are hurt or paid.

## The overworld

- **Who is in it.** You, and later your posse walking behind you. Gangs on patrol.
  Camps. Lone bounties. A town.
- **No fighting.** The fight buttons do other jobs here: the dash is a sprint, and
  drawing your gun is how you call someone out from a distance.
- **Everyone has eyes.** A gang is unaware, then suspicious, then after you. They see
  in front of them and further in the open than behind a rock.
- **It waits for you.** The overworld stands still while you are in the arena.

## Getting the drop

How a fight starts is the one thing the overworld decides about it.

| How you met | What it gives |
|---|---|
| You reach them without being seen | You open with the draw already won: they start the fight wounded |
| You call them out, face to face | A standoff, as now. Best hand wins |
| They catch you unaware | They get the first blow: you start the fight wounded |
| They are after you and you outrun them | No fight. They go back to their route |

All four use rules that already exist. The standoff's opening shot already wounds
without killing; this only changes who takes it.

## The arena

Three kinds of fight, and the rules for all three are built.

| Kind | Who you face | Rules it uses |
|---|---|---|
| **Duel** | One named fighter | The arena duel as it stands |
| **Brawl** | A crew of four to six rabble, in a ring | The crowd rules: one swing hits everyone in reach, the hurt fly further, two attack at a time |
| **Gang** | The crew, then their leader | A brawl, then the leader calls you out for a duel |

Leaving a fight: back to the edge of the ring and hold there, and you are out. The gang
keeps its bounty and is on your heels.

## The posse is your team

This is the Pokémon team, and it is also rule 5 of [the blueprint](05-blueprint.md),
the one still unbuilt: swap, don't choose.

- Three classes travel together. In the overworld the other two walk behind you.
- In the arena one fights at a time, and a button tags the next one in.
- Each has their own health, and it carries from fight to fight until you rest.
- So a hurt lawman is a reason to lead with the witch, and one class's condition can
  be finished by another's.

## The town

- **Rest.** Everyone back to full health.
- **The board.** Bounties to take: who, where, what they pay.
- **The jail.** Where a bounty brought in alive is paid.

Shops and upgrades come after the loop is fun.

## What exists, and what is new

| Piece | State |
|---|---|
| The arena fight, watched side-on | Built |
| Crowd fights and gang leaders | Built, as the "Open country" mode. They become the brawl and gang kinds of arena fight |
| The follow camera and the compass to the nearest gang | Built |
| Two character models, the sheriff and the witch | Built |
| The world: a map, gangs that walk and see, how fights start, what is remembered between fights | New |
| The switch between the two modes, and the arena dressed from where you stood | New |
| Health that carries over, and a town that restores it | New |
| The posse walking with you, and tagging in a fight | New. Needs a model for the engineer |
| Models shipped as files beside the game, not inside it | New, and needed before a third model: two already make the game 10 MB |

## Build order

Each step ends with something you can play and judge.

| # | Step | What you can do at the end | Needs from you |
|---|---|---|---|
| 1 | **The loop**, with the art as it is | Walk a region, pick a fight, get the drop or lose it, fight in the arena, walk on hurt, heal in town | Play it, and say whether you want to do it again |
| 2 | **Bounties** | Take a job off the board, bring them in, get paid, unlock harder ones | Nothing |
| 3 | **The posse** | Walk as three, tag in a fight | An engineer model |
| 4 | **The look** | Hills and canyon, sky, shadows, a town with buildings, real animation clips | Models: outlaw, thug, gunhand, props, buildings. Clips exported from Tripo |
| 5 | **More** | A second region. Bosses on stages of their own | Decided after 1 to 4 |

Step 1 replaces "Open country" on the menu. The arena duel and training stay.

## Three decisions that are yours

| # | Question | What I would do |
|---|---|---|
| 1 | Is there any fighting in the overworld, or is it all in the arena? | All in the arena. The overworld decides who gets the drop and nothing more |
| 2 | Is the arena where you were standing, or a separate stage? | Where you were standing, after a short card. Separate stages for bosses only |
| 3 | Do you walk alone, or as the posse of three? | As the posse, but built third: the loop has to work with one first |

## Risks

| Risk | What I would do about it |
|---|---|
| Every switch breaks the flow | Keep it near one second, and let a button skip it |
| An overworld with nothing in it is a walk between menus | Keep the region small and full: something to see from anywhere you stand |
| Health that carries over can turn into a trudge back to town | Rest spots between camps, and the health you already get back when nobody is after you |
| I can check that the rules work, not that the loop is fun | Step 1 exists to be played by you before anything is built on it |

## Sources

- [Pokémon Legends: Arceus gameplay — Serebii](https://serebii.net/legendsarceus/gameplay.shtml)
- [Pokémon Legends: Arceus review — Shacknews](https://shacknews.com/article/128488/pokemon-legends-arceus-review-when-pokemon-ruled-the-earth)
- [Will Pokémon Legends: Arceus be fully open-world? — Gfinity](https://www.gfinityesports.com/article/is-it-open-world)
