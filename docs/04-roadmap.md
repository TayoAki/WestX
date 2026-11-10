# WestX — Roadmap

## The honest frame

The games you named as references were each built by hundreds to thousands of people
over many years. WestX cannot match their volume. It can match their quality in a
small space, and that is the plan: prove the combat, finish one small region to final
quality, then grow.

Each phase ends at a gate. If the gate fails, fix it before moving on.

## Phases

Durations assume one person working part-time with AI help. A small team shortens them.

| # | Phase | Rough duration | What gets built | Gate |
|---|---|---|---|---|
| 0 | **Setup** | 1–2 weeks | Decisions below, engine installed, project in the repo, build working | You can press Play |
| 1 | **Duel Box** | 6–10 weeks | A flat grey arena. The hunter with every universal verb, one special, one ultimate. A dummy opponent that fights back. No art. | The fight is fun for ten minutes with grey mannequins |
| 2 | **The Posse** | 8–12 weeks | Witch and engineer kits. Tag and assist. One Named duelist AI. One Titan prototype. | Three classes feel different, and a Named duel is worth replaying |
| 3 | **Vertical slice** | 3–5 months | Gallows Reach: about 4 km², one town, the bounty loop start to finish, horses, one Titan, a visual quality pass | 30–45 minutes someone else can play and wants more of |
| 4 | **Production** | 12–18 months | Second region, story, bounty roster, progression, audio | Content-complete for early access |
| 5 | **Online** | 4–6 months, overlapping | Posse co-op, then Showdown PvP | Stable three-player sessions |
| 6 | **Early access to 1.0** | Ongoing | Remaining regions, balance, console versions | — |

**Phase 1 matters most.** The combat feel is the riskiest and most valuable part of
the idea, and it can be tested without an open world, a story or any art. If it isn't
fun there, nothing built on top will save it.

**Phase 3 is the product you show people.** It is what a trailer, a demo, a
crowdfunding page or a publisher pitch is made from.

## Who you need, and when

| Phase | Realistic team |
|---|---|
| 0–2 | You plus AI, using free and marketplace assets |
| 3 | Add a contract animator and an effects artist |
| 4 onward | Add an environment artist, a sound designer and a composer |

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope | Open world plus fighting game plus three classes is three games | Gates. One region. The cut list in the design doc. |
| Combat animation | The largest single cost, and free assets don't cover it | Prove the feel with placeholders, then spend on signature moves only |
| Two tones in one game | Realism and anime speed can clash | The draw transition is a core feature, tested in Phase 1 |
| Fast online combat | PvP at this speed is hard | Solo first, co-op second, PvP last, online-safe code from day one |
| Performance | Open world plus destruction plus effects is heavy | Budgets fixed in the vertical slice |
| Unreal Engine 6, early access late 2027 | Possible migration mid-project | Rules in data and the ability system |
| Too close to Bass X Machina | Legal and reputational | Original world, names, characters and designs throughout |

## Decisions I need from you

These change what gets built next. My recommendation is first in each row.

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| 1 | Engine | Unreal Engine 5.8 | Godot 4.7, if no strong PC or you want me building most of it |
| 2 | Your setup | Tell me your PC specs, weekly hours and whether there's a budget for assets | — |
| 3 | Online | Solo first, built to go online later | Online from day one: much slower start |
| 4 | Look | Realistic world with stylized effects | Fully cel-shaded anime look |
| 5 | Heroes | Three fixed heroes | Create-your-own character per class |

Once 1 and 2 are settled, the next step is Phase 0: create the project in this repo
and start the Duel Box.
