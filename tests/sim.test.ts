import { describe, expect, it } from "vitest";
import { AI, Rabble } from "../src/sim/ai";
import { KITS } from "../src/sim/kits";
import { createMatch, isUp, kitOf, stepMatch } from "../src/sim/match";
import { BOLT_HIT, C, ZONES } from "../src/sim/moves";
import { blankInput, STATUSES, type Fighter, type InputFrame, type Match, type MatchOptions, type SimEvent } from "../src/sim/types";
import { dirOfYaw, distH, rightOf, sub, v3 } from "../src/sim/vec";

type Partial1 = Partial<InputFrame>;
type Script = Partial1 | ((t: number) => Partial1);

const frame = (s: Script, t: number): InputFrame => ({ ...blankInput(), ...(typeof s === "function" ? s(t) : s) });

/** Runs `n` ticks with scripted inputs and returns every event raised. */
function run(m: Match, n: number, p0: Script = {}, p1: Script = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < n; t++) events.push(...stepMatch(m, [frame(p0, t), frame(p1, t)]));
  return events;
}

const OUTLAW = KITS.outlaw;
const HUNTER = KITS.hunter;
/** Most rules are tested outlaw against outlaw; the hunter's own rules have their own section. */
const HP = OUTLAW.hp;

/** A match past its intro with no opening standoff, the fighters `gap` metres apart. */
function fight(gap = 2, opts: Partial<MatchOptions> = {}): Match {
  const m = createMatch(7, { opening: false, kits: ["outlaw", "outlaw"], ...opts });
  m.props = [];
  run(m, C.INTRO_T);
  expect(m.phase).toBe("fight");
  m.fighters[0].pos = v3(0, 0, -gap / 2);
  m.fighters[1].pos = v3(0, 0, gap / 2);
  return m;
}

/** Presses a button for two ticks out of every `period`. */
const tap =
  (button: keyof InputFrame, period = 8, extra: Partial1 = {}): Script =>
  (t) => ({ ...extra, [button]: t % period < 2 });

/** A four-press strike string, with `tilt` held for the ender. */
const string =
  (tilt = 0): Script =>
  (t) => ({ strike: t < 70 && t % 8 < 2, tilt: t > 20 ? tilt : 0 });

const hits = (ev: SimEvent[]) => ev.filter((e) => e.type === "hit" && !e.blocked) as Extract<SimEvent, { type: "hit" }>[];
const has = (ev: SimEvent[], type: SimEvent["type"]) => ev.some((e) => e.type === type);

describe("strike string", () => {
  it("lands four hits and the ender's round blasts the target at least 30 m away", () => {
    const m = fight();
    const start = { ...m.fighters[1].pos };
    const ev = run(m, 200, string());
    expect(hits(ev).length).toBe(4);
    expect(hits(ev).at(-1)).toMatchObject({ effect: "blast" });
    expect(has(ev, "enderShot")).toBe(true);
    const travelled = distH(m.fighters[1].pos, start);
    expect(travelled).toBeGreaterThan(30);
    expect(travelled).toBeLessThan(60);
    expect(m.fighters[0].ammo).toBe(C.AMMO - 1);
  });

  it("lands as a weak pistol-whip when the cylinder is empty", () => {
    const m = fight();
    m.fighters[0].ammo = 0;
    m.fighters[0].reload = 600;
    const start = { ...m.fighters[1].pos };
    const ev = run(m, 120, string());
    expect(hits(ev).length).toBe(4);
    expect(hits(ev).at(-1)).toMatchObject({ effect: "reel" });
    expect(has(ev, "dryFire")).toBe(true);
    expect(has(ev, "enderShot")).toBe(false);
    expect(distH(m.fighters[1].pos, start)).toBeLessThan(6);
  });

  it("launches when the ender is pressed with up held", () => {
    const m = fight();
    let peak = 0;
    for (let t = 0; t < 120; t++) {
      stepMatch(m, [frame(string(1), t), blankInput()]);
      peak = Math.max(peak, m.fighters[1].pos.y);
    }
    expect(peak).toBeGreaterThan(7);
  });

  it("slams a grounded target into a bounce when down is held", () => {
    const m = fight();
    const ev = run(m, 90, string(-1));
    expect(hits(ev).at(-1)).toMatchObject({ effect: "slam" });
    expect(has(ev, "groundSlam")).toBe(true);
  });

  it("continues in the air after a launcher and jump cancel, then spikes the target down", () => {
    const m = fight();
    let script: Script = (t) => ({ strike: t % 8 < 2, tilt: t > 20 ? 1 : 0 });
    const ev: SimEvent[] = [];
    for (let t = 0; t < 400; t++) {
      const def = m.fighters[1];
      const att = m.fighters[0];
      if (def.state === "launched" && att.grounded) script = () => ({ jump: t % 4 < 2 });
      if (!att.grounded && att.pos.y > 3) script = (k) => ({ strike: k % 8 < 2, tilt: -1 });
      ev.push(...stepMatch(m, [frame(script, t), blankInput()]));
      if (has(ev, "groundSlam")) break;
    }
    expect(has(ev, "groundSlam")).toBe(true);
    expect(hits(ev).length).toBeGreaterThanOrEqual(6);
  });

  it("scales damage down as the combo grows", () => {
    const m = fight();
    const ev = hits(run(m, 80, tap("strike")));
    expect(ev[0].damage).toBeCloseTo(22, 5);
    expect(ev[1].damage).toBeCloseTo(24 * 0.92, 5);
  });
});

describe("guard", () => {
  it("blocks strikes for chip damage only", () => {
    const m = fight();
    run(m, 10, {}, { guard: true });
    const ev = run(m, 40, tap("strike"), { guard: true });
    expect(ev.some((e) => e.type === "hit" && e.blocked)).toBe(true);
    expect(hits(ev).length).toBe(0);
    expect(m.fighters[1].hp).toBeGreaterThan(HP - 20);
    expect(m.fighters[1].guardHp).toBeLessThan(C.GUARD_HP);
  });

  it("breaks under sustained pressure", () => {
    const m = fight();
    run(m, 10, {}, { guard: true });
    const ev = run(m, 600, tap("strike"), { guard: true });
    expect(has(ev, "guardBreak")).toBe(true);
  });

  it("parries the attacker when raised just before the hit", () => {
    const m = fight();
    // s1 becomes active on its 5th frame; guard goes up two ticks before that.
    const ev = run(m, 12, (t) => ({ strike: t < 2 }), (t) => ({ guard: t >= 3 }));
    expect(ev.some((e) => e.type === "hit" && e.perfect)).toBe(true);
    expect(m.fighters[0].state).toBe("parried");
    expect(m.fighters[1].hp).toBe(HP);
  });
});

describe("slip", () => {
  it("spends a pip and reappears behind the attacker", () => {
    const m = fight();
    run(m, 8, tap("strike"));
    expect(m.fighters[1].state).toBe("hitstun");
    const ev = run(m, 20, tap("strike"), (t) => ({ guard: t < 2 }));
    expect(has(ev, "slipOut")).toBe(true);
    expect(has(ev, "slipIn")).toBe(true);
    expect(m.fighters[1].pips).toBe(OUTLAW.pips - 1);
  });

  it("puts the defender on the far side of where the attacker faces", () => {
    const m = fight();
    run(m, 8, tap("strike"));
    const att = m.fighters[0];
    for (let t = 0; t < 30; t++) {
      const ev = stepMatch(m, [blankInput(), frame({ guard: t < 2 }, t)]);
      if (has(ev, "slipIn")) break;
    }
    const facing = dirOfYaw(att.yaw);
    const toDef = sub(m.fighters[1].pos, att.pos);
    expect(Math.abs(distH(m.fighters[1].pos, att.pos) - C.SLIP_BEHIND)).toBeLessThan(0.3);
    expect(facing.x * toDef.x + facing.z * toDef.z).toBeLessThan(0);
  });

  it("does nothing with no pips left", () => {
    const m = fight();
    m.fighters[1].pips = 0;
    run(m, 8, tap("strike"));
    const ev = run(m, 12, {}, (t) => ({ guard: t < 2 }));
    expect(has(ev, "slipOut")).toBe(false);
  });

  it("regenerates a pip over time", () => {
    const m = fight(30);
    m.fighters[0].pips = 2;
    run(m, C.PIP_REGEN + 2);
    expect(m.fighters[0].pips).toBe(3);
  });
});

describe("chase and step", () => {
  it("crosses 40 m in under half a second and costs a dash charge", () => {
    const m = fight(40);
    let ticks = 0;
    for (; ticks < 60; ticks++) {
      stepMatch(m, [frame({ dash: ticks < 2 }, ticks), blankInput()]);
      if (distH(m.fighters[0].pos, m.fighters[1].pos) < 2.2) break;
    }
    expect(ticks).toBeLessThan(30);
    expect(m.fighters[0].dashes).toBe(OUTLAW.dashes - 1);
  });

  it("catches a blasted target mid-flight for a follow-up", () => {
    const m = fight();
    m.fighters[0].meter = 100;
    const ev: SimEvent[] = [];
    for (let t = 0; t < 200; t++) {
      const blasted = m.fighters[1].state === "blasted";
      ev.push(...stepMatch(m, [frame({ strike: !blasted && t % 8 < 2, dash: blasted && t % 6 < 2 }, t), blankInput()]));
      if (has(ev, "chaseCatch")) break;
    }
    expect(has(ev, "chaseCatch")).toBe(true);
    expect(m.fighters[1].state).toBe("hitstun");
    expect(distH(m.fighters[0].pos, m.fighters[1].pos)).toBeLessThan(2.5);
  });

  it("falls back to an evasive step with a direction held", () => {
    const m = fight(10);
    m.fighters[0].meter = 100;
    const ev = run(m, 4, { dash: true, mx: 1 });
    expect(has(ev, "step")).toBe(true);
    expect(m.fighters[0].dashes).toBe(OUTLAW.dashes - 1);
    expect(m.fighters[0].invuln).toBeGreaterThan(0);
  });

  it("runs out of dashes, then gets them back one at a time", () => {
    const m = fight(40);
    const ev = run(m, 90, tap("dash", 20, { mx: 1 }));
    expect(ev.filter((e) => e.type === "step").length).toBe(OUTLAW.dashes);
    expect(m.fighters[0].dashes).toBe(0);
    run(m, OUTLAW.dashRegen);
    expect(m.fighters[0].dashes).toBe(1);
  });
});

describe("the cylinder", () => {
  it("fires six rounds, then opens for a reload", () => {
    const m = fight(20);
    const ev = run(m, 62, tap("shot", 10));
    expect(ev.filter((e) => e.type === "shot").length).toBe(6);
    expect(m.fighters[0].ammo).toBe(0);
    expect(has(ev, "reloadStart")).toBe(true);
    run(m, C.RELOAD + 2);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
  });

  it("does not refill on its own while rounds remain", () => {
    const m = fight(20);
    run(m, 4, (t) => ({ shot: t < 2 }));
    run(m, 400);
    expect(m.fighters[0].ammo).toBe(C.AMMO - 1);
  });

  it("damages a target standing in the open", () => {
    const m = fight(20);
    const ev = run(m, 30, (t) => ({ shot: t < 2 }));
    expect(hits(ev).length).toBe(1);
    expect(m.fighters[1].hp).toBe(HP - C.BULLET_DMG);
  });

  const emptied = (): Match => {
    const m = fight(40);
    m.fighters[0].ammo = 1;
    run(m, 3, (t) => ({ shot: t < 2 }));
    expect(m.fighters[0].reload).toBeGreaterThan(0);
    return m;
  };

  it("snaps shut early with hot rounds when the timing is hit", () => {
    const m = emptied();
    run(m, C.RELOAD_PERFECT_FROM);
    const ev = run(m, 3, (t) => ({ shot: t < 2 }));
    expect(ev.some((e) => e.type === "reloadEnd" && e.perfect)).toBe(true);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
    expect(m.fighters[0].hot).toBe(C.HOT_ROUNDS);
  });

  it("takes longer when the timing is missed", () => {
    const m = emptied();
    run(m, C.RELOAD_GRACE + 2);
    const before = m.fighters[0].reload;
    const ev = run(m, 3, (t) => ({ shot: t < 2 }));
    expect(has(ev, "reloadFumble")).toBe(true);
    expect(m.fighters[0].reload).toBeGreaterThan(before);
    // Only one attempt per reload.
    run(m, C.RELOAD_PERFECT_FROM - C.RELOAD_GRACE, {});
    const again = run(m, 3, (t) => ({ shot: t < 2 }));
    expect(again.some((e) => e.type === "reloadEnd" && e.perfect)).toBe(false);
  });

  it("ignores presses in the first moments, so mashing on empty is not punished", () => {
    const m = emptied();
    const ev = run(m, C.RELOAD_GRACE - 4, tap("shot", 4));
    expect(has(ev, "reloadFumble")).toBe(false);
  });

  it("makes hot rounds hit harder", () => {
    const m = emptied();
    run(m, C.RELOAD_PERFECT_FROM);
    run(m, 3, (t) => ({ shot: t < 2 }));
    m.fighters[1].pos = v3(0, 0, -5);
    const ev = run(m, 30, (t) => ({ shot: t >= 12 && t < 14 }));
    expect(hits(ev)[0].damage).toBeCloseTo(C.BULLET_DMG * C.HOT_DMG, 5);
  });

  it("fans the hammer while the trigger is held, emptying the cylinder", () => {
    const m = fight(20);
    const ev = run(m, 80, { shot: true });
    expect(ev.filter((e) => e.type === "shot" && e.kind === "fan").length).toBe(C.AMMO - 1);
    expect(m.fighters[0].ammo).toBe(0);
    expect(hits(ev).length).toBeGreaterThanOrEqual(C.AMMO - 1);
  });
});

describe("holding steady", () => {
  it("builds Nerve and slides rounds back into the cylinder", () => {
    const m = fight(30);
    m.fighters[0].meter = 0;
    m.fighters[0].ammo = 2;
    const ev = run(m, 120, { steady: true });
    expect(m.fighters[0].state).toBe("steady");
    expect(m.fighters[0].meter).toBeGreaterThan(55);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
    expect(ev.filter((e) => e.type === "chamber").length).toBe(4);
  });

  it("cannot be done in the air", () => {
    const m = fight(30);
    run(m, 6, (t) => ({ jump: t < 2 }));
    run(m, 10, { steady: true });
    expect(m.fighters[0].state).toBe("free");
  });

  it("arms a quickdraw that hits far harder than an ordinary shot", () => {
    const m = fight(20);
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 30, (t) => ({ steady: true, shot: t < 2 }));
    expect(ev.some((e) => e.type === "shot" && e.kind === "quick")).toBe(true);
    const hit = hits(ev)[0];
    expect(hit.damage).toBeGreaterThanOrEqual(C.QUICK_DMG_MIN);
    expect(hit.effect).toBe("blast");
  });

  it("gives the quickdraw more power the longer the wait", () => {
    const damageAfter = (wait: number): number => {
      const m = fight(20);
      run(m, wait, { steady: true });
      return hits(run(m, 30, (t) => ({ steady: true, shot: t < 2 })))[0].damage;
    };
    expect(damageAfter(C.QUICK_FULL + 5)).toBeCloseTo(C.QUICK_DMG_MAX, 5);
    expect(damageAfter(C.QUICK_MIN + 2)).toBeLessThan(C.QUICK_DMG_MIN + 10);
  });

  it("fires an ordinary shot if the hand has not settled yet", () => {
    const m = fight(20);
    run(m, 6, { steady: true });
    const ev = run(m, 20, (t) => ({ steady: t < 2, shot: t < 2 }));
    expect(ev.some((e) => e.type === "shot" && e.kind === "bullet")).toBe(true);
    expect(ev.some((e) => e.type === "shot" && e.kind === "quick")).toBe(false);
  });
});

describe("standoff", () => {
  /** A match stopped at the first tick of its opening standoff. */
  const opening = (): Match => {
    const m = createMatch(11);
    m.props = [];
    run(m, C.INTRO_T);
    expect(m.standoff).not.toBeNull();
    expect(m.fighters[0].state).toBe("standoff");
    return m;
  };

  it("opens every duel", () => {
    const m = createMatch(3);
    const ev = run(m, C.INTRO_T);
    expect(ev.some((e) => e.type === "standoffStart" && e.opening)).toBe(true);
  });

  it("is won by whoever draws first after the bell", () => {
    const m = opening();
    const bell = m.standoff!.bellAt;
    const ev = run(m, bell + 40, (t) => ({ shot: t >= bell + 5 && t < bell + 7 }), (t) => ({ shot: t >= bell + 12 && t < bell + 14 }));
    expect(has(ev, "standoffBell")).toBe(true);
    expect(ev.find((e) => e.type === "standoffEnd")).toMatchObject({ winner: 0, trade: false });
    expect(m.fighters[1].hp).toBe(m.fighters[1].maxHp - C.STANDOFF_DMG);
    expect(m.fighters[0].hp).toBe(m.fighters[0].maxHp);
    expect(m.standoff).toBeNull();
  });

  it("punishes drawing before the bell", () => {
    const m = opening();
    const bell = m.standoff!.bellAt;
    // Player 0 flinches early, then presses again right on the bell: still locked out.
    const p0: Script = (t) => ({ shot: (t >= 10 && t < 12) || (t >= bell + 2 && t < bell + 4) });
    const p1: Script = (t) => ({ shot: t >= bell + 15 && t < bell + 17 });
    const ev = run(m, bell + 40, p0, p1);
    expect(ev.some((e) => e.type === "standoffFlinch" && e.id === 0)).toBe(true);
    expect(ev.find((e) => e.type === "standoffEnd")).toMatchObject({ winner: 1 });
  });

  it("ends with no shot if nobody draws", () => {
    const m = opening();
    const ev = run(m, C.STANDOFF_WAIT_MAX + C.STANDOFF_WINDOW + 5);
    expect(ev.find((e) => e.type === "standoffEnd")).toMatchObject({ winner: -1, trade: false });
    expect(m.fighters[0].state).toBe("free");
  });

  it("is a trade when both draw on the same instant", () => {
    const m = opening();
    const bell = m.standoff!.bellAt;
    const both: Script = (t) => ({ shot: t >= bell + 8 && t < bell + 10 });
    const ev = run(m, bell + 40, both, both);
    expect(ev.find((e) => e.type === "standoffEnd")).toMatchObject({ winner: -1, trade: true });
    expect(m.fighters[0].hp).toBe(m.fighters[0].maxHp);
    expect(m.fighters[1].hp).toBe(m.fighters[1].maxHp);
  });

  it("cannot end the match when it is the opening shot", () => {
    const m = opening();
    m.fighters[1].hp = 20;
    const bell = m.standoff!.bellAt;
    run(m, bell + 40, (t) => ({ shot: t >= bell + 5 && t < bell + 7 }));
    expect(m.phase).toBe("fight");
    expect(m.fighters[1].hp).toBe(1);
  });

  it("starts mid-fight when both fighters hold steady", () => {
    const m = fight(20);
    const ev = run(m, C.STANDOFF_MUTUAL + 5, { steady: true }, { steady: true });
    expect(ev.some((e) => e.type === "standoffStart" && !e.opening)).toBe(true);
    expect(m.standoff).not.toBeNull();
  });

  it("does not leave a stray shot behind", () => {
    const m = opening();
    const bell = m.standoff!.bellAt;
    const ev = run(m, bell + 60, (t) => ({ shot: t >= bell + 5 && t < bell + 7 }));
    expect(ev.filter((e) => e.type === "shot").length).toBe(1);
  });
});

describe("lariat", () => {
  it("drags a distant target into striking range", () => {
    const m = fight(18);
    m.fighters[0].meter = 100;
    const ev = run(m, 50, (t) => ({ special: t < 2 }));
    expect(ev.some((e) => e.type === "lasso" && e.hit)).toBe(true);
    expect(distH(m.fighters[0].pos, m.fighters[1].pos)).toBeLessThan(2.5);
    expect(m.fighters[1].state).toBe("stagger");
    expect(m.fighters[0].meter).toBe(100 - C.LARIAT_COST);
  });

  it("zips the thrower to the target when down is held", () => {
    const m = fight(18);
    m.fighters[0].meter = 100;
    const before = { ...m.fighters[1].pos };
    run(m, 50, (t) => ({ special: t < 2, tilt: t < 4 ? -1 : 0 }));
    expect(distH(m.fighters[1].pos, before)).toBeLessThan(0.5);
    expect(distH(m.fighters[0].pos, m.fighters[1].pos)).toBeLessThan(2.5);
  });

  it("goes through a guard", () => {
    const m = fight(12);
    m.fighters[0].meter = 100;
    const ev = run(m, 50, (t) => ({ special: t < 2 }), { guard: true });
    expect(ev.some((e) => e.type === "lasso" && e.hit)).toBe(true);
  });
});

describe("ultimate", () => {
  it("needs full Nerve", () => {
    const m = fight(10);
    m.fighters[0].meter = 90;
    const ev = run(m, 40, (t) => ({ ult: t < 2 }));
    expect(has(ev, "ultStart")).toBe(false);
  });

  it("plays its sequence, deals its full damage and empties the cylinder", () => {
    const m = fight(10);
    m.fighters[0].meter = 100;
    const ev = run(m, 320, (t) => ({ ult: t < 2 }));
    expect(has(ev, "cineStart")).toBe(true);
    expect(has(ev, "cineEnd")).toBe(true);
    expect(ev.filter((e) => e.type === "cineHit").length).toBe(7);
    const expected = C.CINE_HITS.length * C.CINE_HIT_DMG + C.CINE_FINAL_DMG;
    expect(HP - m.fighters[1].hp).toBeCloseTo(expected, 5);
    expect(has(ev, "reloadStart")).toBe(true);
    expect(m.cine).toBeNull();
  });

  it("breaks a guard instead of starting the sequence", () => {
    const m = fight(10);
    m.fighters[0].meter = 100;
    const ev = run(m, 80, (t) => ({ ult: t < 2 }), { guard: true });
    expect(has(ev, "cineStart")).toBe(false);
    expect(has(ev, "guardBreak")).toBe(true);
  });
});

describe("awakening", () => {
  it("activates on a full gauge and slows the opponent", () => {
    const walk = (awakened: boolean): number => {
      const m = fight(40);
      if (awakened) {
        m.fighters[0].awaken = 100;
        run(m, C.AWAKEN_BURST_T + 2, (t) => ({ awaken: t < 2 }));
        expect(m.fighters[0].awakened).toBeGreaterThan(0);
      } else run(m, C.AWAKEN_BURST_T + 2);
      const z0 = m.fighters[1].pos.z;
      run(m, 60, {}, { my: 1 });
      return Math.abs(m.fighters[1].pos.z - z0);
    };
    const normal = walk(false);
    const slowed = walk(true);
    expect(normal).toBeCloseTo(OUTLAW.run, 0);
    expect(slowed / normal).toBeGreaterThan(0.6);
    expect(slowed / normal).toBeLessThan(0.72);
  });

  it("runs out", () => {
    const m = fight(40);
    m.fighters[0].awaken = 100;
    const ev = run(m, C.AWAKEN_T + 10, (t) => ({ awaken: t < 2 }));
    expect(has(ev, "awakenEnd")).toBe(true);
    expect(m.fighters[0].awakened).toBe(0);
  });
});

describe("dead or alive", () => {
  /** Beats fighter 1 and stops at the start of the verdict. */
  const beaten = (): Match => {
    const m = fight();
    m.fighters[1].hp = 10;
    const ev = run(m, 30, (t) => ({ strike: t < 2 }));
    expect(has(ev, "verdictStart")).toBe(true);
    expect(m.phase).toBe("verdict");
    expect(m.fighters[1].state).toBe("downed");
    expect(m.winner).toBe(0);
    return m;
  };

  it("drops the loser to their knees and waits for the winner", () => {
    const m = beaten();
    run(m, 60);
    expect(m.phase).toBe("verdict");
  });

  it("ends with a shot when the winner chooses dead", () => {
    const m = beaten();
    run(m, C.VERDICT_GRACE + 2);
    const ev = run(m, 40, (t) => ({ shot: t < 2 }));
    expect(ev.find((e) => e.type === "ko")).toMatchObject({ winner: 0, alive: false });
    expect(m.outcome).toBe("dead");
    expect(m.fighters[1].state).toBe("ko");
    run(m, C.KO_T + 5);
    expect(m.phase).toBe("done");
  });

  it("ropes the loser when the winner chooses alive", () => {
    const m = beaten();
    run(m, C.VERDICT_GRACE + 2);
    const ev = run(m, 40, (t) => ({ special: t < 2 }));
    expect(ev.find((e) => e.type === "ko")).toMatchObject({ winner: 0, alive: true });
    expect(m.outcome).toBe("alive");
    expect(m.fighters[1].state).toBe("tied");
  });

  it("ignores presses carried over from the last combo", () => {
    const m = beaten();
    const ev = run(m, C.VERDICT_GRACE - 2, tap("shot", 4));
    expect(has(ev, "ko")).toBe(false);
  });

  it("defaults to dead when the winner does not choose", () => {
    const m = beaten();
    const ev = run(m, C.VERDICT_T + C.VERDICT_ACT + 5);
    expect(ev.find((e) => e.type === "ko")).toMatchObject({ alive: false });
  });
});

describe("the hunter", () => {
  /** Hunter against outlaw, past the intro, `gap` metres apart. */
  const duel = (gap = 2): Match => fight(gap, { kits: ["hunter", "outlaw"] });
  /** Three presses: pistol-whip, backhand, ender. */
  const three =
    (tilt = 0): Script =>
    (t) => ({ strike: t < 50 && t % 9 < 2, tilt: t > 14 ? tilt : 0 });

  it("is heavier and slower than the outlaw", () => {
    const m = duel(40);
    expect(m.fighters[0].maxHp).toBeGreaterThan(m.fighters[1].maxHp);
    run(m, 60, { my: 1 }, { my: 1 });
    const walked = [20 + m.fighters[0].pos.z, 20 - m.fighters[1].pos.z];
    expect(walked[0]).toBeCloseTo(HUNTER.run, 0);
    expect(walked[0]).toBeLessThan(walked[1]);
  });

  it("ends a three-hit string with the brace, which spends Nerve and no round", () => {
    const m = duel();
    m.fighters[0].meter = 50;
    const start = { ...m.fighters[1].pos };
    const ev = run(m, 200, three());
    expect(hits(ev).length).toBe(3);
    expect(hits(ev).at(-1)).toMatchObject({ effect: "blast" });
    expect(ev.some((e) => e.type === "armBlast" && !e.big)).toBe(true);
    expect(distH(m.fighters[1].pos, start)).toBeGreaterThan(30);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
    expect(m.fighters[0].meter).toBeLessThan(50);
  });

  it("hits harder per blow than the outlaw", () => {
    const hunter = hits(run(duel(), 200, three()));
    const outlaw = hits(run(fight(), 200, string()));
    expect(hunter[0].damage).toBeGreaterThan(outlaw[0].damage);
    expect(hunter.reduce((a, h) => a + h.damage, 0)).toBeGreaterThan(outlaw.reduce((a, h) => a + h.damage, 0));
  });

  it("lands the ender as a plain blow when there is no Nerve for the brace", () => {
    const m = duel();
    m.fighters[0].meter = 0;
    const ev = run(m, 60, three());
    // Hits give a little Nerve back, but not enough for the blast.
    expect(hits(ev).at(-1)).toMatchObject({ effect: "reel" });
    expect(has(ev, "armBlast")).toBe(false);
  });

  it("has two dashes and no double jump", () => {
    const m = duel(40);
    expect(m.fighters[0].dashes).toBe(2);
    const ev = run(m, 40, tap("jump", 12));
    expect(ev.filter((e) => e.type === "jump").length).toBe(1);
  });

  it("dashes as a shoulder charge that staggers whoever it reaches", () => {
    const m = duel(12);
    const ev = run(m, 30, (t) => ({ dash: t < 2 }));
    expect(has(ev, "chase")).toBe(true);
    expect(hits(ev).length).toBe(1);
    expect(m.fighters[1].state).toBe("stagger");
    expect(m.fighters[0].dashes).toBe(1);
  });

  it("cannot reach a rival on the far side of the arena in one dash", () => {
    const m = duel(40);
    run(m, 40, (t) => ({ dash: t < 2 }));
    expect(distH(m.fighters[0].pos, m.fighters[1].pos)).toBeGreaterThan(15);
    expect(m.fighters[0].state).toBe("free");
  });

  it("walks forward behind the brace", () => {
    const m = duel(40);
    run(m, 10, { guard: true });
    const z0 = m.fighters[0].pos.z;
    run(m, 60, { guard: true, my: 1 });
    expect(m.fighters[0].state).toBe("guard");
    expect(m.fighters[0].pos.z - z0).toBeCloseTo(HUNTER.run * HUNTER.guardWalk, 0);
  });

  it("turns bullets aside without a scratch or a break in stride", () => {
    const m = duel(20);
    run(m, 10, { guard: true });
    const ev = run(m, 60, { guard: true, my: 1 }, tap("shot", 12));
    expect(ev.filter((e) => e.type === "deflect" && !e.back).length).toBeGreaterThanOrEqual(3);
    expect(m.fighters[0].hp).toBe(m.fighters[0].maxHp);
    expect(m.fighters[0].state).toBe("guard");
  });

  it("sends a shot back at the shooter when the brace comes up at the last moment", () => {
    const m = duel(20);
    // The bullet covers 20 m in about 13 ticks; the brace goes up just before it lands.
    const ev = run(m, 40, (t) => ({ guard: t >= 9 }), (t) => ({ shot: t < 2 }));
    expect(ev.some((e) => e.type === "deflect" && e.back)).toBe(true);
    expect(hits(ev).length).toBe(1);
    expect(hits(ev)[0]).toMatchObject({ att: 0, def: 1 });
    expect(m.fighters[1].hp).toBe(m.fighters[1].maxHp - C.BULLET_DMG);
  });

  it("catches a blow mid-combo instead of vanishing, and leaves the attacker open", () => {
    const m = fight(2, { kits: ["outlaw", "hunter"] });
    run(m, 8, tap("strike"));
    expect(m.fighters[1].state).toBe("hitstun");
    const before = { ...m.fighters[1].pos };
    const ev = run(m, 6, {}, (t) => ({ guard: t < 2 }));
    expect(has(ev, "armCatch")).toBe(true);
    expect(has(ev, "slipOut")).toBe(false);
    expect(distH(m.fighters[1].pos, before)).toBeLessThan(1);
    expect(m.fighters[0].state).toBe("parried");
    expect(m.fighters[1].pips).toBe(HUNTER.pips - 1);
  });

  it("breaks a guard with the thunderclap, struck from behind the brace", () => {
    const m = duel(2.4);
    m.fighters[0].meter = 60;
    run(m, 8, { guard: true }, { guard: true });
    const ev = run(m, 60, (t) => ({ guard: true, strike: t < 2 }), { guard: true });
    expect(ev.some((e) => e.type === "armBlast" && e.big)).toBe(true);
    expect(has(ev, "guardBreak")).toBe(true);
    expect(m.fighters[0].meter).toBeLessThan(60 - C.CLAP_COST + 1);
  });

  it("gets one launch and one chase per combo", () => {
    expect(HUNTER.maxLaunches).toBe(1);
    expect(HUNTER.maxChases).toBe(1);
    expect(OUTLAW.maxLaunches).toBeGreaterThan(HUNTER.maxLaunches);
  });
});

describe("conditions", () => {
  /** Engineer against outlaw: the engineer has both poison and shock. */
  const duel = (gap = 2): Match => fight(gap, { kits: ["engineer", "outlaw"] });

  it("poison wears health down over time and then wears off", () => {
    const m = duel(20);
    m.fighters[0].ammo = 1;
    const ev = run(m, 30, (t) => ({ shot: t < 2 }));
    expect(ev.some((e) => e.type === "status" && e.kind === "poison")).toBe(true);
    const after = m.fighters[1].hp;
    run(m, C.POISON_T);
    expect(m.fighters[1].status.poison).toBe(0);
    const ticks = Math.floor(C.POISON_T / C.POISON_EVERY);
    expect(after - m.fighters[1].hp).toBeGreaterThanOrEqual((ticks - 2) * C.POISON_DMG);
    expect(after - m.fighters[1].hp).toBeLessThanOrEqual(ticks * C.POISON_DMG);
  });

  it("shock stops a fighter where they stand, slows them, and holds their dashes", () => {
    const m = duel(20);
    m.fighters[1].dashes = 0;
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 12, (t) => ({ steady: true, shot: t < 2 }));
    expect(ev.some((e) => e.type === "shot" && e.kind === "tesla")).toBe(true);
    expect(m.fighters[1].status.shock).toBeGreaterThan(0);
    run(m, 100);
    expect(m.fighters[1].dashes).toBe(0);
    const z0 = m.fighters[1].pos.z;
    run(m, 30, {}, { my: -1 });
    expect(Math.abs(m.fighters[1].pos.z - z0)).toBeLessThan(OUTLAW.run * 0.5 * 0.8);
  });

  it("stuns with shock only once until it has worn off", () => {
    const m = duel(2);
    m.fighters[0].meter = 100;
    // The first application lands on a free fighter and staggers them.
    m.fighters[1].status.shock = 0;
    run(m, 80, (t) => ({ strike: t < 40 && t % 9 < 2 }));
    expect(m.fighters[1].status.shock).toBeGreaterThan(0);
  });

  it("makes two different conditions react in an overload", () => {
    const m = duel(20);
    m.fighters[1].status.poison = 200;
    const before = m.fighters[1].hp;
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 12, (t) => ({ steady: true, shot: t < 2 }));
    expect(has(ev, "overload")).toBe(true);
    expect(before - m.fighters[1].hp).toBeGreaterThanOrEqual(C.OVERLOAD_DMG + C.TESLA_DMG_MIN);
    for (const k of STATUSES) expect(m.fighters[1].status[k]).toBe(0);
  });

  it("hex makes every hit hurt more", () => {
    const plain = hits(run(fight(), 12, (t) => ({ strike: t < 2 })))[0].damage;
    const m = fight();
    m.fighters[1].status.hex = 200;
    const hexed = hits(run(m, 12, (t) => ({ strike: t < 2 })))[0].damage;
    expect(hexed).toBeCloseTo(plain * C.HEX_DMG, 5);
  });
});

describe("the witch", () => {
  const duel = (gap = 2): Match => fight(gap, { kits: ["witch", "outlaw"] });

  it("is the lightest of the three and floats down", () => {
    expect(KITS.witch.hp).toBeLessThan(KITS.engineer.hp);
    expect(KITS.engineer.hp).toBeLessThan(KITS.hunter.hp);
    const air = (kits: MatchOptions["kits"]): number => {
      const m = fight(30, { kits });
      run(m, 3, (t) => ({ jump: t < 2 }));
      let ticks = 0;
      while (!m.fighters[0].grounded && ticks++ < 300) run(m, 1);
      return ticks;
    };
    expect(air(["witch", "outlaw"])).toBeGreaterThan(air(["hunter", "outlaw"]) * 1.2);
  });

  it("hits everything around her, even a rival standing behind", () => {
    const m = duel(2);
    // Put the rival directly behind her; her facing snaps to the target, so turn her away by hand mid-pulse.
    const ev: SimEvent[] = [];
    for (let t = 0; t < 14; t++) {
      ev.push(...stepMatch(m, [frame({ strike: t < 2 }, t), blankInput()]));
      m.fighters[0].yaw += Math.PI;
    }
    expect(hits(ev).length).toBe(1);
  });

  it("throws bolts that bend toward a moving target", () => {
    const m = duel(16);
    const ev = run(m, 90, (t) => ({ shot: t < 2 }), { mx: 1 });
    expect(ev.some((e) => e.type === "shot" && e.kind === "bolt")).toBe(true);
    expect(hits(ev).length).toBe(1);
    expect(hits(ev)[0].damage).toBe(BOLT_HIT.damage);
  });

  it("draws a circle under the target that goes off after a warning, then lingers", () => {
    const m = duel(14);
    m.fighters[0].meter = 60;
    // Hold off the bolt she would otherwise throw as the cast begins, so only the circle is measured.
    m.fighters[0].shotCd = 9999;
    const ev = run(m, 12 + ZONES.hex.fuse + 14, { shot: true });
    const spawn = ev.find((e) => e.type === "zoneSpawn");
    expect(spawn).toMatchObject({ kind: "hex" });
    expect(has(ev, "zoneErupt")).toBe(true);
    expect(hits(ev).length).toBe(1);
    expect(m.fighters[1].status.hex).toBeGreaterThan(0);
    expect(m.fighters[0].meter).toBeLessThan(60);
    expect(m.zones.length).toBe(1);
    run(m, ZONES.hex.life + 5);
    expect(m.zones.length).toBe(0);
  });

  it("gives a fighter who moves time to walk out of a circle", () => {
    const m = duel(14);
    m.fighters[0].meter = 60;
    m.fighters[0].shotCd = 9999;
    const ev = run(m, 12 + ZONES.hex.fuse + 14, { shot: true }, (t) => ({ mx: t > 14 ? 1 : 0 }));
    expect(has(ev, "zoneErupt")).toBe(true);
    expect(hits(ev).length).toBe(0);
  });

  it("cannot be blocked while a circle lingers under you", () => {
    const m = duel(14);
    m.fighters[0].meter = 60;
    m.fighters[0].shotCd = 9999;
    run(m, 12 + ZONES.hex.fuse + 2, { shot: true }, { guard: true });
    const hp = m.fighters[1].hp;
    run(m, ZONES.hex.every * 3, {}, { guard: true });
    expect(m.fighters[1].hp).toBeLessThan(hp);
  });

  it("calls a storm from holding steady, stronger the longer she chants", () => {
    const burst = (wait: number): number => {
      const m = duel(14);
      run(m, wait, { steady: true });
      const ev = run(m, 40, (t) => ({ steady: true, shot: t < 2 }));
      expect(ev.find((e) => e.type === "zoneSpawn")).toMatchObject({ kind: "storm" });
      return hits(ev)[0].damage;
    };
    expect(burst(C.QUICK_FULL + 5)).toBeGreaterThan(burst(C.QUICK_MIN + 2) * 1.5);
  });

  it("hangs a roped target in the air and hexes them", () => {
    const m = duel(14);
    m.fighters[0].meter = 100;
    const ev = run(m, 60, (t) => ({ special: t < 2 }));
    expect(ev.some((e) => e.type === "lasso" && e.hit)).toBe(true);
    expect(m.fighters[1].pos.y).toBeGreaterThan(1.5);
    expect(distH(m.fighters[0].pos, m.fighters[1].pos)).toBeGreaterThan(10);
    expect(m.fighters[1].status.hex).toBeGreaterThan(0);
  });

  it("has no cylinder to empty or reload", () => {
    const m = duel(16);
    const ev = run(m, 300, tap("shot", 10));
    expect(has(ev, "reloadStart")).toBe(false);
    expect(ev.filter((e) => e.type === "shot").length).toBeGreaterThan(4);
  });
});

describe("the engineer", () => {
  const duel = (gap = 2): Match => fight(gap, { kits: ["engineer", "outlaw"] });

  it("fires rivets that poison", () => {
    const m = duel(20);
    const ev = run(m, 30, (t) => ({ shot: t < 2 }));
    expect(ev.some((e) => e.type === "shot" && e.kind === "rivet")).toBe(true);
    expect(hits(ev)[0].damage).toBe(C.RIVET_DMG);
    expect(m.fighters[1].status.poison).toBeGreaterThan(0);
  });

  it("ends a string with the prod, which shocks", () => {
    const m = duel();
    m.fighters[0].meter = 60;
    const ev = run(m, 120, (t) => ({ strike: t < 50 && t % 9 < 2 }));
    expect(hits(ev).length).toBe(3);
    expect(ev.some((e) => e.type === "status" && e.kind === "shock")).toBe(true);
  });

  it("sets up an overload alone: poison first, then shock", () => {
    const m = duel(2);
    m.fighters[0].meter = 60;
    m.fighters[1].status.poison = 250;
    const ev = run(m, 120, (t) => ({ strike: t < 50 && t % 9 < 2 }));
    expect(has(ev, "overload")).toBe(true);
  });

  it("sets a sentry down that picks its own target and poisons them", () => {
    const m = duel(14);
    m.fighters[0].meter = 60;
    let ev = run(m, 20, (t) => ({ special: t < 2 }));
    expect(ev.filter((e) => e.type === "turretUp").length).toBe(1);
    expect(m.turrets.length).toBe(1);
    expect(m.zones.length).toBe(0);
    // It stands in front of her, between her and whoever she is facing.
    expect(distH(m.turrets[0].pos, m.fighters[0].pos)).toBeCloseTo(C.TURRET_AHEAD, 3);
    expect(m.turrets[0].pos.z).toBeGreaterThan(m.fighters[0].pos.z);
    const hp = m.fighters[1].hp;
    // She does nothing more. The machine does the shooting.
    ev = run(m, 150);
    expect(ev.filter((e) => e.type === "shot" && e.kind === "sentry").length).toBeGreaterThanOrEqual(4);
    expect(hits(ev).every((e) => e.att === 0 && e.projectile)).toBe(true);
    expect(m.fighters[1].status.poison).toBeGreaterThan(0);
    expect(m.fighters[1].hp).toBeLessThan(hp);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
  });

  it("has one sentry at a time, and it runs down", () => {
    const m = duel(40);
    m.fighters[0].meter = 100;
    run(m, 40, (t) => ({ special: t < 2 }));
    const first = m.turrets[0].id;
    let ev = run(m, 40, (t) => ({ special: t < 2, mx: 1 }));
    expect(m.turrets.length).toBe(1);
    expect(m.turrets[0].id).not.toBe(first);
    expect(ev.find((e) => e.type === "turretDown")).toMatchObject({ id: first });
    ev = run(m, C.TURRET_LIFE);
    expect(m.turrets.length).toBe(0);
    expect(ev.filter((e) => e.type === "turretDown").length).toBe(1);
  });

  it("throws tesla that has nobody to jump to in a duel", () => {
    const m = duel(12);
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 30, (t) => ({ steady: true, shot: t < 2 }));
    expect(hits(ev).length).toBe(1);
    expect(has(ev, "arc")).toBe(false);
  });

  it("shocks an attacker who is caught mid-combo", () => {
    const m = fight(2, { kits: ["outlaw", "engineer"] });
    run(m, 8, tap("strike"));
    expect(m.fighters[1].state).toBe("hitstun");
    const ev = run(m, 6, {}, (t) => ({ guard: t < 2 }));
    expect(has(ev, "armCatch")).toBe(true);
    expect(m.fighters[0].status.shock).toBeGreaterThan(0);
    expect(m.fighters[0].state).toBe("stagger");
  });
});

describe("every class against every other", () => {
  const classes = ["hunter", "witch", "engineer"] as const;

  it("plays to a finish with no broken state, and nobody is unbeatable", () => {
    const wins: Record<string, number> = { hunter: 0, witch: 0, engineer: 0 };
    const seen = new Set<string>();
    let games = 0;
    for (const a of classes) {
      for (const b of classes) {
        if (a === b) continue;
        for (let seed = 1; seed <= 8; seed++) {
          const m = createMatch(seed * 13 + 1, { kits: [a, b] });
          const ai0 = AI.create(0, "normal", seed * 31 + 1);
          const ai1 = AI.create(1, "normal", seed * 17 + 5);
          while (m.phase !== "done" && m.tick < 60 * 60 * 6) {
            for (const e of stepMatch(m, [ai0.think(m), ai1.think(m)])) seen.add(e.type);
            for (const f of m.fighters) {
              if (![f.pos.x, f.pos.y, f.pos.z, f.hp, f.meter].every(Number.isFinite)) throw new Error(`non-finite state in ${a} v ${b}`);
              if (f.hp < 0 || f.hp > f.maxHp) throw new Error(`hp out of range in ${a} v ${b}`);
              if (Math.hypot(f.pos.x, f.pos.z) > C.ARENA_R + 1e-3) throw new Error(`left the arena in ${a} v ${b}`);
            }
          }
          expect(m.phase, `${a} v ${b} seed ${seed} did not finish`).toBe("done");
          wins[m.fighters[m.winner].kit]++;
          games++;
        }
      }
    }
    console.log(`class round-robin over ${games} duels: ${JSON.stringify(wins)}`);
    for (const type of ["zoneSpawn", "zoneErupt", "status", "overload"]) expect(seen.has(type), `expected "${type}"`).toBe(true);
    // Each class plays 32 duels. None should win almost all or almost none of them.
    for (const c of classes) {
      expect(wins[c], `${c} wins`).toBeGreaterThan(4);
      expect(wins[c], `${c} wins`).toBeLessThan(28);
    }
  });
});

describe("props", () => {
  it("break when a blasted fighter flies through them", () => {
    const m = fight();
    m.props = [{ kind: "crate", pos: v3(0, 0, 12), radius: 0.75, height: 1.3, hp: 2, broken: false }];
    const ev = run(m, 200, string());
    expect(has(ev, "propBreak")).toBe(true);
    expect(m.props[0].broken).toBe(true);
  });

  it("stop a fighter who walks into them", () => {
    const m = fight(40);
    m.props = [{ kind: "rock", pos: v3(0, 0, -10), radius: 1.5, height: 3.4, hp: 8, broken: false }];
    run(m, 240, { my: 1 });
    expect(m.props[0].broken).toBe(false);
    expect(distH(m.fighters[0].pos, m.props[0].pos)).toBeGreaterThanOrEqual(1.5 + C.BODY_R - 1e-6);
  });

  it("stop a bullet but not a quickdraw", () => {
    const crate = () => [{ kind: "crate" as const, pos: v3(0, 0, 0), radius: 0.75, height: 1.3, hp: 2, broken: false }];
    const a = fight(20);
    a.props = crate();
    expect(hits(run(a, 30, (t) => ({ shot: t < 2 }))).length).toBe(0);
    const b = fight(20);
    b.props = crate();
    run(b, C.QUICK_MIN + 2, { steady: true });
    expect(hits(run(b, 30, (t) => ({ steady: true, shot: t < 2 }))).length).toBe(1);
  });
});

describe("training mode", () => {
  it("skips the opening standoff, never beats the opponent, and refills their health", () => {
    const m = createMatch(7, { training: true });
    m.props = [];
    run(m, C.INTRO_T);
    expect(m.standoff).toBeNull();
    m.fighters[0].pos = v3(0, 0, -1);
    m.fighters[1].pos = v3(0, 0, 1);
    m.fighters[1].hp = 30;
    const ev = run(m, 300, string());
    expect(has(ev, "verdictStart")).toBe(false);
    expect(m.fighters[1].hp).toBe(m.fighters[1].maxHp);
  });
});

describe("AI versus AI", () => {
  const play = (seed: number, maxTicks: number) => {
    const m = createMatch(seed);
    const a = AI.create(0, "normal", seed * 31 + 1);
    const b = AI.create(1, "hard", seed * 17 + 5);
    const seen = new Set<string>();
    while (m.phase !== "done" && m.tick < maxTicks) {
      for (const e of stepMatch(m, [a.think(m), b.think(m)])) seen.add(e.type);
      for (const f of m.fighters) {
        if (![f.pos.x, f.pos.y, f.pos.z, f.vel.x, f.vel.y, f.vel.z, f.hp, f.meter].every(Number.isFinite)) {
          throw new Error(`non-finite state at tick ${m.tick} in state ${f.state}`);
        }
        if (f.hp < 0 || f.hp > f.maxHp || f.meter < 0 || f.meter > C.METER + 1e-6) {
          throw new Error(`out-of-range value at tick ${m.tick}: hp ${f.hp} meter ${f.meter}`);
        }
        if (Math.hypot(f.pos.x, f.pos.z) > C.ARENA_R + 1e-3 || f.pos.y < 0 || f.pos.y > 80) {
          throw new Error(`fighter left the arena at tick ${m.tick}`);
        }
        if (f.pips < 0 || f.pips > kitOf(f).pips) throw new Error("pips out of range");
        if (f.dashes < 0 || f.dashes > kitOf(f).dashes) throw new Error("dashes out of range");
        if (f.ammo < 0 || f.ammo > C.AMMO) throw new Error(`ammo out of range: ${f.ammo}`);
      }
    }
    return { m, seen };
  };

  it("is deterministic for a given seed", () => {
    const a = play(42, 3000).m;
    const b = play(42, 3000).m;
    expect(JSON.stringify(a.fighters)).toBe(JSON.stringify(b.fighters));
    expect(a.tick).toBe(b.tick);
  });

  it("plays whole matches to a verdict without breaking any invariant", () => {
    const lengths: number[] = [];
    const seenAll = new Set<string>();
    const outcomes = { dead: 0, alive: 0 };
    let finished = 0;
    let standoffs = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { m, seen } = play(seed, 60 * 60 * 6);
      for (const s of seen) seenAll.add(s);
      if (m.phase === "done") {
        finished++;
        lengths.push(m.tick / 60);
        if (m.outcome) outcomes[m.outcome]++;
      }
      if (seen.has("standoffEnd")) standoffs++;
    }
    lengths.sort((x, y) => x - y);
    const median = lengths[Math.floor(lengths.length / 2)];
    console.log(
      `AI matches finished ${finished}/24, median ${median.toFixed(0)}s, range ${lengths[0].toFixed(0)}-${lengths.at(-1)!.toFixed(0)}s, dead ${outcomes.dead} alive ${outcomes.alive}`,
    );
    console.log(`event types seen: ${[...seenAll].sort().join(", ")}`);
    expect(finished).toBe(24);
    expect(standoffs).toBe(24);
    expect(outcomes.dead).toBeGreaterThan(0);
    expect(outcomes.alive).toBeGreaterThan(0);
    // Every core mechanic should come up naturally in real play.
    const expected = [
      "hit", "shot", "enderShot", "chamber", "reloadStart", "reloadEnd", "jump", "slipOut", "chase", "chaseCatch",
      "groundSlam", "lasso", "cineStart", "awaken", "standoffStart", "standoffBell", "standoffEnd", "propBreak", "guardBreak",
      "verdictStart", "ko", "armBlast", "deflect", "armCatch",
    ];
    for (const type of expected) expect(seenAll.has(type), `expected the AI to produce "${type}"`).toBe(true);
  });
});

// ------------------------------------------------------------------ open country

/** The overworld past its intro: one gang unless told otherwise, and no scenery in the way. */
function roam(opts: Partial<MatchOptions> = {}): Match {
  const m = createMatch(11, { mode: "roam", kits: ["hunter", "outlaw"], gangs: 1, ...opts });
  m.props = [];
  run(m, C.INTRO_T);
  expect(m.phase).toBe("fight");
  return m;
}
const crewOf = (m: Match, gang = 0): Fighter[] => m.fighters.filter((f) => f.gang === gang && f.rank === "rabble");
const leaderOf = (m: Match, gang = 0): Fighter => m.fighters.find((f) => f.gang === gang && f.rank === "named")!;
const events = <T extends SimEvent["type"]>(ev: SimEvent[], type: T) => ev.filter((e) => e.type === type) as Extract<SimEvent, { type: T }>[];

/** Stands the hero at the origin facing +z, and lines fighters up in front of them at the given distances. */
function lineUp(m: Match, who: Fighter[], at: number[], side: number[] = []): void {
  const h = m.fighters[0];
  h.pos = v3();
  h.yaw = 0;
  who.forEach((f, i) => {
    f.pos = v3(side[i] ?? 0, 0, at[i]);
    f.yaw = Math.PI;
    f.awake = true;
  });
  // Everyone else is somewhere it cannot matter.
  let far = 0;
  for (const f of m.fighters) if (f.id !== 0 && !who.includes(f)) f.pos = v3(60 + 3 * far++, 0, -60);
}

describe("the overworld", () => {
  it("starts with one hero in open country and three gangs asleep at their camps", () => {
    const m = createMatch(3, { mode: "roam", kits: ["witch", "outlaw"] });
    expect(m.radius).toBe(C.FIELD_R);
    const hero = m.fighters[0];
    expect(hero).toMatchObject({ rank: "hero", kit: "witch", team: 0, target: -1, awake: true });
    expect(m.fighters.filter((f) => f.rank === "hero").length).toBe(1);
    const leaders = m.fighters.filter((f) => f.rank === "named");
    expect(leaders.length).toBe(3);
    // Nobody leads a gang with the hero's own class.
    expect(leaders.map((f) => f.kit)).not.toContain("witch");
    for (const l of leaders) {
      expect(Math.hypot(l.pos.x, l.pos.z)).toBeCloseTo(C.CAMP_R, 3);
      const crew = crewOf(m, l.gang);
      expect(crew.length).toBeGreaterThanOrEqual(4);
      expect(crew.some((f) => f.kit === "gunhand")).toBe(true);
      for (const f of [l, ...crew]) {
        expect(f.awake).toBe(false);
        expect(f.team).toBe(1);
        expect(distH(f.pos, l.pos)).toBeLessThan(11);
      }
    }
    m.fighters.forEach((f, i) => expect(f.id).toBe(i));
  });

  it("is the arena, unchanged, when no mode is asked for", () => {
    const m = createMatch(3);
    expect(m.opts.mode).toBe("duel");
    expect(m.radius).toBe(C.ARENA_R);
    expect(m.fighters.map((f) => [f.rank, f.team, f.target])).toEqual([
      ["hero", 0, 1],
      ["named", 1, 0],
    ]);
  });

  it("lets the hero run where the camera points and face the way they go, with nobody to fight", () => {
    const m = roam();
    const h = m.fighters[0];
    run(m, 60, { my: 1, yaw: Math.PI / 2 });
    expect(h.pos.x).toBeCloseTo(HUNTER.run, 0);
    expect(Math.abs(h.pos.z)).toBeLessThan(0.01);
    expect(h.yaw).toBeCloseTo(Math.PI / 2, 5);
    // Right of a camera looking down +z is +x.
    const x = h.pos.x;
    run(m, 30, { mx: 1, yaw: 0 });
    expect(h.pos.x).toBeGreaterThan(x + 3);
    expect(h.target).toBe(-1);
  });

  it("turns the dash into a way to cover ground when there is nobody to chase", () => {
    const m = roam();
    const h = m.fighters[0];
    run(m, 40, (t) => ({ dash: t < 2, my: 1, yaw: Math.PI }));
    expect(h.dashes).toBe(HUNTER.dashes - 1);
    expect(h.pos.z).toBeLessThan(-15);
    expect(h.state).toBe("free");
  });

  it("leaves a camp asleep while the hero keeps their distance, and wakes its crew when they come close", () => {
    const m = roam();
    const h = m.fighters[0];
    const crew = crewOf(m);
    const first = crew[0];
    const d = dirOfYaw(first.yaw);
    h.pos = v3(first.pos.x + d.x * (C.ALERT_R + 6), 0, first.pos.z + d.z * (C.ALERT_R + 6));
    let ev = run(m, 30);
    expect(has(ev, "alert")).toBe(false);
    expect(crew.every((f) => !f.awake)).toBe(true);
    expect(h.target).toBe(-1);

    h.pos = v3(first.pos.x + d.x * (C.ALERT_R - 6), 0, first.pos.z + d.z * (C.ALERT_R - 6));
    ev = run(m, 3);
    expect(events(ev, "alert").length).toBe(1);
    expect(crew.every((f) => f.awake)).toBe(true);
    // The leader lets the crew handle it.
    expect(leaderOf(m).awake).toBe(false);
    // The hero is now facing the nearest of them, without having asked.
    const nearest = [...crew].sort((a, b) => distH(h.pos, a.pos) - distH(h.pos, b.pos))[0];
    expect(h.target).toBe(nearest.id);
    expect(crew.every((f) => f.target === 0)).toBe(true);
  });

  it("lets the hero pick out a sleeping camp from range, and move on to the next of them", () => {
    const m = roam();
    const h = m.fighters[0];
    const crew = crewOf(m);
    lineUp(m, crew.slice(0, 2), [22, 24], [0, 4]);
    for (const f of crew) f.awake = false;
    run(m, 4);
    expect(h.target).toBe(-1);
    run(m, 4, (t) => ({ swap: t < 2 }));
    expect(h.target).toBe(crew[0].id);
    expect(crew[0].awake).toBe(false);
    run(m, 4, (t) => ({ swap: t < 2 }));
    expect(h.target).toBe(crew[1].id);
    // The first shot is the hero's, and it wakes the lot.
    const ev = run(m, 40, (t) => ({ shot: t < 2 }));
    expect(hits(ev)[0]).toMatchObject({ att: 0, def: crew[1].id, projectile: true });
    expect(crew.every((f) => f.awake)).toBe(true);
  });

  it("lets a crew go when the hero leaves their camp far behind", () => {
    const m = roam();
    const h = m.fighters[0];
    const crew = crewOf(m);
    for (const f of crew) f.awake = true;
    run(m, 2);
    expect(crew[0].target).toBe(0);
    const home = leaderOf(m).home;
    h.pos = v3(-home.x * 0.5, 0, -home.z * 0.5);
    run(m, 2);
    expect(crew.every((f) => !f.awake && f.target === -1)).toBe(true);
    expect(h.target).toBe(-1);
  });
});

describe("a crowd fight", () => {
  it("lets one swing hit everyone in reach", () => {
    const m = roam();
    const crew = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, crew.slice(0, 3), [1.6, 1.7, 1.7], [0, 1.1, -1.1]);
    const ev = run(m, 12, (t) => ({ strike: t < 2 }));
    const struck = hits(ev).map((e) => e.def).sort();
    expect(struck).toEqual(crew.slice(0, 3).map((f) => f.id).sort());
    // One swing, three hits: the count runs up the way it does in a brawl.
    expect(m.fighters[0].combo.hits).toBe(3);
  });

  it("does not let a swing through a crowd hit softer with each body", () => {
    const m = roam();
    const crew = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, crew.slice(0, 3), [1.6, 1.7, 1.7], [0, 1.1, -1.1]);
    const dealt = hits(run(m, 12, (t) => ({ strike: t < 2 }))).map((e) => e.damage);
    expect(new Set(dealt).size).toBe(1);
  });

  it("makes rabble take turns: nobody swings without one, only a few have one, and everyone gets one", () => {
    const m = roam({ gangs: 3 });
    const crew = crewOf(m, 2);
    expect(crew.length).toBe(6);
    lineUp(m, crew, [2, 2, 2, 2, 2, 2], [0, 1.2, -1.2, 2.4, -2.4, 3.6]);
    const before = new Map(crew.map((f) => [f.id, f.state]));
    const had = new Set<number>();
    const hp = m.fighters[0].hp;
    for (let t = 0; t < 1200; t++) {
      const inputs: InputFrame[] = [];
      inputs[0] = blankInput();
      for (const f of crew) inputs[f.id] = frame({ strike: t % 6 < 2, my: 0.2 }, t);
      stepMatch(m, inputs);
      expect(crew.filter((f) => f.turn > 0).length).toBeLessThanOrEqual(C.RABBLE_TURNS);
      for (const f of crew) {
        if (f.turn > 0) had.add(f.id);
        if (f.state === "attack" && before.get(f.id) !== "attack") expect(f.turn, `fighter ${f.id} swung out of turn`).toBeGreaterThan(0);
        before.set(f.id, f.state);
      }
    }
    expect(had.size).toBe(crew.length);
    // They do connect, and it is nothing like six at once.
    expect(m.fighters[0].hp).toBeLessThan(hp);
    expect(m.fighters[0].hp).toBeGreaterThan(0);
  });

  it("sends a hurt one flying further than a fresh one, off the same hit", () => {
    const flown = (hp: number): number => {
      const m = roam();
      const thug = crewOf(m).find((f) => f.kit === "thug")!;
      lineUp(m, [thug], [1.6]);
      thug.hp = hp;
      const start = { ...thug.pos };
      const ev = run(m, 60, (t) => ({ strike: t < 2 }));
      expect(hits(ev).length).toBe(1);
      expect(isUp(thug)).toBe(true);
      return distH(thug.pos, start);
    };
    const fresh = flown(KITS.thug.hp);
    const hurt = flown(KITS.thug.hp * 0.55);
    expect(hurt).toBeGreaterThan(fresh * 2);
  });

  it("throws a finished one clean out of the fight, with no verdict", () => {
    const m = roam();
    const thug = crewOf(m).find((f) => f.kit === "thug")!;
    lineUp(m, [thug], [1.6]);
    thug.hp = 10;
    const start = { ...thug.pos };
    const ev = run(m, 90, (t) => ({ strike: t < 2 }));
    expect(events(ev, "down")).toEqual([expect.objectContaining({ id: thug.id, by: 0 })]);
    expect(has(ev, "verdictStart")).toBe(false);
    expect(thug.state).toBe("ko");
    expect(isUp(thug)).toBe(false);
    expect(m.phase).toBe("fight");
    expect(distH(thug.pos, start)).toBeGreaterThan(12);
    // And the hero is no longer facing someone who is not there.
    expect(m.fighters[0].target).not.toBe(thug.id);
  });

  it("bowls a flying body through its own side", () => {
    const m = roam();
    const [a, b] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [a, b], [1.6, 4.2]);
    a.hp = 10;
    const ev = run(m, 40, (t) => ({ strike: t < 2 }));
    expect(a.state).toBe("ko");
    // The swing never reached the second one. The first one did.
    expect(hits(ev).map((e) => e.def)).toEqual([a.id, b.id]);
    expect(b.hp).toBe(KITS.thug.hp - C.BOWL_DMG);
    expect(b.hitsTaken).toBe(1);
  });

  it("burns the crowd around an overload", () => {
    const m = roam({ kits: ["engineer", "outlaw"] });
    const [x, y, z] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [x, y, z], [8, 10, 10], [0, 2, -2]);
    x.status.shock = 200;
    // One rivet: its poison meets the shock.
    const ev = run(m, 30, (t) => ({ shot: t < 2 }));
    expect(events(ev, "overload")).toEqual([expect.objectContaining({ id: x.id })]);
    for (const f of [y, z]) expect(f.hp).toBe(KITS.thug.hp - C.OVERLOAD_DMG * C.OVERLOAD_SPLASH);
  });

  it("makes the engineer's tesla jump from body to body, and no further than it can reach", () => {
    const m = roam({ kits: ["engineer", "outlaw"], gangs: 3 });
    const [x, y, z, far] = crewOf(m, 2).filter((f) => f.kit === "thug");
    lineUp(m, [x, y, z, far], [8, 10, 12, 30], [0, 3, -3, 0]);
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 40, (t) => ({ steady: true, shot: t < 2 }));
    expect(events(ev, "arc").length).toBe(2);
    expect(hits(ev).map((e) => e.def)).toEqual([x.id, y.id, z.id]);
    for (const f of [x, y, z]) expect(f.status.shock).toBeGreaterThan(0);
    // Each jump carries less than the shot that started it.
    expect(hits(ev)[1].damage).toBeCloseTo(hits(ev)[0].damage * C.CHAIN_DMG, 5);
    expect(far.hp).toBe(far.maxHp);
    expect(far.status.shock).toBe(0);
  });

  it("lets a sentry pick off whoever in the crowd is nearest to it", () => {
    const m = roam({ kits: ["engineer", "outlaw"] });
    const [x, y] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [x, y], [15, 9], [6, -5]);
    m.fighters[0].meter = 60;
    const ev = run(m, 20 + C.TURRET_GAP * 3, (t) => ({ special: t < 2 }));
    expect(m.turrets.length).toBe(1);
    const shot = hits(ev).filter((e) => e.projectile);
    expect(shot.length).toBeGreaterThan(0);
    expect(shot.every((e) => e.def === y.id)).toBe(true);
    expect(y.status.poison).toBeGreaterThan(0);
  });

  it("catches everyone standing in a circle", () => {
    const m = roam({ kits: ["witch", "outlaw"] });
    const [x, y, z] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [x, y, z], [9, 10.5, 10.5], [0, 1.5, -1.5]);
    m.fighters[0].meter = 60;
    const ev = run(m, C.FAN_HOLD + 80, { shot: true });
    expect(has(ev, "zoneErupt")).toBe(true);
    for (const f of [x, y, z]) {
      expect(f.hp).toBeLessThan(KITS.thug.hp);
      expect(f.hitsTaken).toBeGreaterThan(0);
    }
  });

  it("sends a quickdraw clean through a line of rabble", () => {
    const m = roam();
    const [x, y, z] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [x, y, z], [7, 10, 13]);
    run(m, C.QUICK_MIN + 2, { steady: true });
    const ev = run(m, 40, (t) => ({ steady: true, shot: t < 2 }));
    expect(hits(ev).filter((e) => e.projectile).map((e) => e.def)).toEqual([x.id, y.id, z.id]);
  });

  it("stops an ordinary bullet in the first body it meets", () => {
    const m = roam();
    const [x, y] = crewOf(m).filter((f) => f.kit === "thug");
    lineUp(m, [x, y], [7, 10]);
    const ev = run(m, 40, (t) => ({ shot: t < 2 }));
    expect(hits(ev).map((e) => e.def)).toEqual([x.id]);
  });

  it("does not stop the Last Word for rabble, but stops it for their leader", () => {
    const m = roam();
    const thug = crewOf(m).find((f) => f.kit === "thug")!;
    const boss = leaderOf(m);
    lineUp(m, [thug, boss], [6, 14]);
    m.fighters[0].meter = C.METER;
    const ev = run(m, 60, (t) => ({ ult: t < 2 }));
    expect(hits(ev).map((e) => e.def)).toEqual([thug.id]);
    expect(events(ev, "cineStart")).toEqual([expect.objectContaining({ att: 0, def: boss.id })]);
  });

  it("lets a gunhand's bullet be sent back off the brace", () => {
    const m = roam();
    const gun = crewOf(m).find((f) => f.kit === "gunhand")!;
    lineUp(m, [gun], [9]);
    gun.turn = 100;
    const ev: SimEvent[] = [];
    let raise = -1;
    for (let t = 0; t < 80 && !has(ev, "down") && gun.hp === gun.maxHp; t++) {
      const bullet = m.projectiles.find((p) => p.owner === gun.id);
      if (bullet && raise < 0 && distH(bullet.pos, m.fighters[0].pos) < 3.2) raise = t;
      const inputs: InputFrame[] = [frame({ guard: raise >= 0 }, t)];
      inputs[gun.id] = frame({ shot: t < 2 }, t);
      ev.push(...stepMatch(m, inputs));
    }
    expect(events(ev, "deflect").some((e) => e.back)).toBe(true);
    expect(gun.hp).toBeLessThan(gun.maxHp);
  });
});

describe("a gang and its leader", () => {
  /** Puts a whole crew in front of the hero on its last legs. One swing finishes them. */
  const beatCrew = (m: Match, gang = 0): SimEvent[] => {
    const crew = crewOf(m, gang);
    lineUp(m, crew, crew.map(() => 1.7), crew.map((_, i) => (i - (crew.length - 1) / 2) * 0.9));
    const boss = leaderOf(m, gang);
    boss.pos = v3(0, 0, 30);
    for (const f of crew) f.hp = 5;
    return run(m, 10, (t) => ({ strike: t < 2 }));
  };

  it("calls the hero out to a standoff once the crew is beaten and the leader has not been touched", () => {
    const m = roam();
    const boss = leaderOf(m);
    let ev = beatCrew(m);
    expect(events(ev, "down").length).toBe(crewOf(m).length);
    expect(events(ev, "callOut")).toEqual([expect.objectContaining({ id: boss.id })]);
    ev = [];
    for (let t = 0; t < 200 && !m.standoff; t++) ev.push(...run(m, 1));
    expect(events(ev, "standoffStart")).toEqual([expect.objectContaining({ opening: true })]);
    expect(m.standoff!.ids).toEqual([0, boss.id]);
    expect(distH(boss.pos, m.fighters[0].pos)).toBeLessThanOrEqual(C.CALLOUT_GAP + 0.01);
    expect(boss.awake).toBe(true);
    expect(m.fighters[0].target).toBe(boss.id);
    expect(boss.target).toBe(0);

    // The hero wins the draw. It wounds the leader; it does not end them. Then it is a duel.
    const bell = m.standoff!.bellAt - m.standoff!.t;
    run(m, bell + 6);
    ev = run(m, 4, (t) => ({ shot: t < 2 }));
    expect(events(ev, "standoffEnd")).toEqual([expect.objectContaining({ winner: 0 })]);
    expect(boss.hp).toBe(boss.maxHp - C.STANDOFF_DMG);
    expect(m.phase).toBe("fight");
    expect(m.standoff).toBeNull();
  });

  it("brings the leader into the fight without ceremony if the hero goes for them first", () => {
    const m = roam();
    const boss = leaderOf(m);
    const crew = crewOf(m);
    const d = dirOfYaw(boss.yaw);
    const h = m.fighters[0];
    h.pos = v3(boss.pos.x - d.x * 1.6, 0, boss.pos.z - d.z * 1.6);
    h.yaw = boss.yaw;
    for (const f of crew) f.pos = v3(boss.pos.x + rightOf(d).x * 30, 0, boss.pos.z + rightOf(d).z * 30);
    const ev = run(m, 14, (t) => ({ strike: t < 2 }));
    expect(hits(ev)[0]).toMatchObject({ att: 0, def: boss.id });
    expect(boss.awake).toBe(true);
    expect(crew.every((f) => f.awake)).toBe(true);
    run(m, 2);
    expect(boss.target).toBe(0);
    expect(has(run(m, 200), "callOut")).toBe(false);
  });

  it("pays for a leader brought in, makes their crew give up, and lets the day go on", () => {
    const m = roam({ gangs: 2 });
    const h = m.fighters[0];
    const [first, second] = [leaderOf(m, 0), leaderOf(m, 1)];
    const finish = (boss: Fighter, how: "shot" | "special"): SimEvent[] => {
      lineUp(m, [boss], [1.6]);
      boss.hp = 5;
      const ev = run(m, 14, (t) => ({ strike: t < 2 }));
      expect(m.phase).toBe("verdict");
      expect(m.verdict).toMatchObject({ winner: 0, loser: boss.id });
      while (m.verdict!.t <= C.VERDICT_GRACE) ev.push(...run(m, 1));
      ev.push(...run(m, 60, (t) => ({ [how]: t < 2 })));
      return ev;
    };

    let ev = finish(first, "special");
    // The crew were never touched. They have seen enough.
    expect(events(ev, "down").map((e) => e.id).sort()).toEqual(crewOf(m, 0).map((f) => f.id).sort());
    expect(crewOf(m, 0).every((f) => f.state === "downed" && !isUp(f))).toBe(true);
    expect(events(ev, "ko")).toEqual([expect.objectContaining({ winner: 0, loser: first.id, alive: true, bounty: C.BOUNTY_ALIVE })]);
    expect(first.state).toBe("tied");
    expect(m.bounty).toBe(C.BOUNTY_ALIVE);
    expect(m.phase).toBe("fight");
    expect(h.target).not.toBe(first.id);
    // The other gang is where it was.
    expect(crewOf(m, 1).every((f) => isUp(f) && !f.awake)).toBe(true);

    ev = finish(second, "shot");
    expect(events(ev, "ko")).toEqual([expect.objectContaining({ loser: second.id, alive: false, bounty: C.BOUNTY_DEAD })]);
    expect(m.bounty).toBe(C.BOUNTY_ALIVE + C.BOUNTY_DEAD);
    expect(m.phase).toBe("ko");
    run(m, C.KO_T + 2);
    expect(m.phase).toBe("done");
    expect(isUp(h)).toBe(true);
  });

  it("gives a hero run down by a crew no verdict at all", () => {
    const m = roam();
    const thug = crewOf(m).find((f) => f.kit === "thug")!;
    lineUp(m, [thug], [1.8]);
    m.fighters[0].hp = 5;
    const ev: SimEvent[] = [];
    for (let t = 0; t < 120 && m.phase === "fight"; t++) {
      const inputs: InputFrame[] = [blankInput()];
      inputs[thug.id] = frame({ strike: t % 6 < 2 }, t);
      ev.push(...stepMatch(m, inputs));
    }
    expect(has(ev, "verdictStart")).toBe(false);
    expect(events(ev, "ko")).toEqual([expect.objectContaining({ winner: thug.id, loser: 0, alive: false, bounty: 0 })]);
    expect(m.phase).toBe("ko");
    expect(m.fighters[0].state).toBe("ko");
  });
});

describe("AI in open country", () => {
  const play = (kit: "hunter" | "witch" | "engineer", seed: number, level: "normal" | "hard" = "normal") => {
    const m = createMatch(seed, { mode: "roam", kits: [kit, "outlaw"] });
    const minds = m.fighters.map((f) => (f.rank === "rabble" ? new Rabble(f.id, seed * 7 + f.id) : AI.create(f.id, f.rank === "hero" ? "hard" : level, seed * 31 + f.id)));
    const seen = new Set<string>();
    while (m.phase !== "done" && m.tick < 60 * 60 * 12) {
      for (const e of stepMatch(m, minds.map((ai) => ai.think(m)))) seen.add(e.type);
      for (const f of m.fighters) {
        if (![f.pos.x, f.pos.y, f.pos.z, f.vel.x, f.vel.y, f.vel.z, f.hp, f.meter].every(Number.isFinite)) throw new Error(`non-finite state at tick ${m.tick} in ${f.name} (${f.state})`);
        if (f.hp < 0 || f.hp > f.maxHp) throw new Error(`hp out of range at tick ${m.tick}: ${f.hp}`);
        if (Math.hypot(f.pos.x, f.pos.z) > m.radius + 1e-3 || f.pos.y < 0 || f.pos.y > 80) throw new Error(`left the field at tick ${m.tick}`);
        if (f.target >= 0 && m.fighters[f.target].team === f.team) throw new Error(`facing their own side at tick ${m.tick}`);
      }
      if (m.fighters.filter((f) => f.rank === "rabble" && f.turn > 0).length > C.RABBLE_TURNS * 3) throw new Error("too many rabble with a turn");
    }
    return { m, seen };
  };

  it("plays the whole field through with every class, and breaks nothing", () => {
    const all = new Set<string>();
    const tally: string[] = [];
    for (const kit of ["hunter", "witch", "engineer"] as const) {
      for (const seed of [2, 5, 9]) {
        const { m, seen } = play(kit, seed);
        for (const t of seen) all.add(t);
        expect(m.phase, `${kit} seed ${seed} did not finish`).toBe("done");
        const hero = m.fighters[0];
        const leaders = m.fighters.filter((f) => f.rank === "named");
        // It ends one of two ways: the hero is down, or every leader is.
        expect(isUp(hero) ? leaders.every((f) => !isUp(f)) : true).toBe(true);
        const down = m.fighters.filter((f) => f.rank === "rabble" && !isUp(f)).length;
        tally.push(`${kit}#${seed}: ${isUp(hero) ? "cleared" : `lost to ${m.fighters[m.winner].name}`} in ${Math.round(m.tick / 60)}s, ${leaders.filter((f) => !isUp(f)).length}/3 leaders, ${down} rabble, $${m.bounty}`);
      }
    }
    console.log(`open country, AI hero:\n  ${tally.join("\n  ")}`);
    for (const type of ["alert", "down", "callOut", "standoffStart", "verdictStart", "ko", "hit", "turretUp"]) expect(all.has(type), `expected "${type}"`).toBe(true);
  }, 120_000);

  it("is deterministic for a given seed", () => {
    const a = play("hunter", 4).m;
    const b = play("hunter", 4).m;
    expect(a.tick).toBe(b.tick);
    expect(a.bounty).toBe(b.bounty);
    expect(a.fighters.map((f) => [f.hp, f.state])).toEqual(b.fighters.map((f) => [f.hp, f.state]));
  }, 60_000);
});
