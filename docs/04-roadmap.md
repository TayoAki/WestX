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
| 2 | **The Posse** | Not started | Witch and engineer kits, tag and assist, a Titan prototype | Three classes feel different, and a duel is worth replaying |
| 3 | **Vertical slice** | Not started | Gallows Reach: 1–2 km², one town, the bounty loop, horses, real character art | 30–45 minutes someone else can play and wants more of |
| 4 | **Production** | Not started | Second region, story, bounty roster, progression, music | Content-complete for early access |
| 5 | **Online** | Not started | Posse co-op, then Showdown duels | Stable three-player sessions |
| 6 | **Early access to 1.0** | Not started | Remaining regions, balance | — |

**Phase 1 matters most.** The combat feel is the riskiest and most valuable part of
the idea, and it is being tested before any open world, story or art exists. If it
isn't fun here, nothing built on top will save it.

### Phase 1: what exists

- Strike strings with three enders: blast away, launch, slam
- Light shots with six rounds and a reload, and a charged heavy shot
- Charge, chase dash, evasive step, jump and double jump
- Guard, perfect guard and guard break
- Slip, with four charges that refill over time
- Lariat: pull the rival in, or zip to them
- Awakening and the Last Word ultimate with its cinematic
- Clash when two heavy shots meet
- A rival AI on three difficulties, plus a training mode
- Breakable props, craters, a combo counter, synthesised sound
- Keyboard, gamepad and touch controls

### Phase 1: what is missing or unproven

- The art is placeholder and the animation is generated from key poses.
- Only the hunter exists. Both fighters use the same kit.
- There is no music.
- Balance is a first pass. AI-versus-AI duels last about a minute; the target for a
  person is two to four.
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
| 1 | Does the fight feel right? What feels slow, floaty, unfair or confusing? | This is the Phase 1 gate |
| 2 | What device did you play on, and did it run smoothly? | I cannot measure frame rate here |
| 3 | More flight, or keep it grounded with air combos? | Sets how close this plays to each of your two references |
| 4 | Three fixed heroes, or a create-your-own character per class? | Changes how Phase 2 is built |
