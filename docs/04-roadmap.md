# WestX — Roadmap

## The honest frame

The games named as references were each built by hundreds to thousands of people over
many years. WestX cannot match their volume. It can aim for their feel in a small
space: prove the combat, finish one small region properly, then grow.

Each phase ends at a gate. If the gate fails, fix it before moving on.

## Decisions made

| Decision | Choice | Date |
|---|---|---|
| Platform | Browser | 10 Nov 2026 |
| Engine | Babylon.js | 10 Nov 2026 |
| Look | Cel-shaded anime rendering on a western world | 10 Nov 2026 |

## Phases

| # | Phase | Status | What gets built | Gate |
|---|---|---|---|---|
| 0 | **Setup** | Done | Project, build, tests | You can press Play |
| 1 | **Duel Box** | First playable built; waiting on a playtest | One arena, the hunter's full kit, a rival that fights back | The fight is fun for ten minutes with placeholder art |
| 2 | **The Posse** | Started: three classes, group fights and one open field are in. Swapping is not | Group fights, swapping between the three, a Titan prototype | Three classes feel different, and they are stronger together |
| 3 | **Vertical slice** | Not started | Gallows Reach: 1–2 km², one town, the bounty loop, horses, real character art | 30–45 minutes someone else can play and wants more of |
| 4 | **Production** | Not started | Second region, story, bounty roster, progression, music | Content-complete for early access |
| 5 | **Online** | Not started | Posse co-op, then Showdown duels | Stable three-player sessions |
| 6 | **Early access to 1.0** | Not started | Remaining regions, balance | — |

**Phase 1 matters most.** The combat feel is the riskiest and most valuable part of
the idea, and it is being tested before any open world, story or art exists. If it
isn't fun here, nothing built on top will save it.

### Phase 1: what exists

- Three playable classes: the lawman, the witch and the engineer, plus a quick outlaw as a rival
- The lawman's body is a real character model, the sheriff, moved by the game's own poses
- Open country: one field, three gangs camped in it, and a fight wherever you meet one
- Crowd fights: one swing hits everyone in reach, rabble fly further the more they are hurt, and they take turns
- Gang leaders who call the hero out to a standoff and a duel once their crew is beaten
- A follow camera and a compass that points at the nearest gang
- Area attacks: zones that mark the ground, go off after a warning, and can linger
- The engineer's sentry, and tesla that jumps from body to body
- Three conditions, each with a job: poison, shock and hex. Two on one fighter overload, and the burst catches the crowd
- The hunter's brace: walk behind it, deflect and return shots, catch a blow mid-combo, and discharge it as a blast or a guard-breaking thunderclap
- Short, heavy strike strings ending in a blast, a launch or a slam
- A six-round cylinder, a timed reload with a perfect window, and fanning the hammer
- Holding steady to build Nerve and reload, and the quickdraw from the holster
- The standoff: it opens every duel and starts again when both fighters hold steady
- Dead or alive: the winner shoots, or ropes the loser for a bigger bounty
- Dashes limited by charges: two for the hunter, three for the outlaw
- Guard, perfect guard and guard break
- Combo escapes on limited charges: the hunter catches, the outlaw vanishes
- Lariat: pull the rival in, or zip to them
- Awakening and the Last Word ultimate with its cinematic
- A rival AI on three difficulties, plus a training mode
- Breakable props, craters, a combo counter, synthesised sound
- Keyboard, gamepad and touch controls

### Phase 1: what is missing or unproven

- The art is placeholder, except the sheriff. The witch, the engineer, the outlaw, the
  crews and the whole landscape are still simple shapes.
- The animation is generated from key poses made for a stick figure. On the sheriff it
  reads as stiff, her coat is rigid, and a leg can pass through it. Real animation
  clips are the next step for her.
- Group fights have only been played by the AI. Whether a crowd is fun, fair and
  readable for a person is the main thing to find out.
- The open field is flat desert with props. There is no town, no terrain and nothing
  to do between camps but walk.
- The three classes never share a fight, so one class cannot yet set up another.
- Balance is rough. With the AI playing every class against every other in the arena,
  the lawman wins 18 of 32, the engineer 16 and the witch 14. In open country an AI
  hero clears the field in 5 runs of 9, and every loss is to a leader, not to a crew.
- The witch and engineer reuse the lawman's awakening and ultimate under their own names.
- The arena is open desert. A town street, powder barrels, dynamite and the horse
  are the next western pieces.
- There is no music.
- Balance is a first pass. AI-versus-AI duels last a little over a minute; the target
  for a person is two to four.
- Frame rate, sound, touch and gamepad have not been tried on real hardware.

## Who you need, and when

| Phase | Realistic team |
|---|---|
| 0–2 | You plus AI, with generated placeholder art |
| 3 | Add a character artist and animator, and an effects artist |
| 4 onward | Add an environment artist, a sound designer and a composer |

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope | Open world plus fighting game plus three classes is three games | Gates. One region. The cut list in the design doc. |
| Combat animation | The largest single cost, and generated poses only go so far | Prove the feel with placeholders, then spend on signature moves only |
| Feel can't be judged from the cloud | I can verify rules, not fun | Short loops: you play, report, I tune |
| Browser limits | Download size, memory and phone performance cap the world | Budgets fixed in the vertical slice |
| Two tones in one game | A grounded world and anime-speed fights can clash | The draw transition is a core feature, tested early in Phase 3 |
| Fast online combat | Duels at this speed are hard to sync | Solo first, co-op second, duels last |
| Too close to Bass X Machina | Legal and reputational | Original world, names, characters and designs throughout |

## What I need from you next

| # | Question | Why it matters |
|---|---|---|
| 1 | Do the three classes feel different from each other now, the engineer and the witch above all? Which is the most fun, and which the least? | This is the Phase 2 gate |
| 1b | In open country, is a crowd fun to fight, or a chore? Are two attackers at once too many, too few? | Crowd rules are tuned by the AI so far, not by a person |
| 2 | What device did you play on, and did it run smoothly? | I cannot measure frame rate here |
| 3 | More flight, or keep it grounded with air combos? | Sets how close this plays to each of your two references |
| 4 | Three fixed heroes, or a create-your-own character per class? | Changes how Phase 2 is built |
