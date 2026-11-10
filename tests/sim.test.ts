import { describe, expect, it } from "vitest";
import { AI } from "../src/sim/ai";
import { createMatch, stepMatch } from "../src/sim/match";
import { C } from "../src/sim/moves";
import { blankInput, type InputFrame, type Match, type MatchOptions, type SimEvent } from "../src/sim/types";
import { dirOfYaw, distH, sub, v3 } from "../src/sim/vec";

type Partial1 = Partial<InputFrame>;
type Script = Partial1 | ((t: number) => Partial1);

const frame = (s: Script, t: number): InputFrame => ({ ...blankInput(), ...(typeof s === "function" ? s(t) : s) });

/** Runs `n` ticks with scripted inputs and returns every event raised. */
function run(m: Match, n: number, p0: Script = {}, p1: Script = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < n; t++) events.push(...stepMatch(m, [frame(p0, t), frame(p1, t)]));
  return events;
}

/** A match past its intro with no opening standoff, the fighters `gap` metres apart. */
function fight(gap = 2, opts: Partial<MatchOptions> = {}): Match {
  const m = createMatch(7, { opening: false, ...opts });
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
    expect(m.fighters[1].hp).toBeGreaterThan(C.HP - 20);
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
    expect(m.fighters[1].hp).toBe(C.HP);
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
    expect(m.fighters[1].pips).toBe(C.PIPS - 1);
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
  it("crosses 40 m in under half a second and costs Nerve", () => {
    const m = fight(40);
    m.fighters[0].meter = 100;
    let ticks = 0;
    for (; ticks < 60; ticks++) {
      stepMatch(m, [frame({ dash: ticks < 2 }, ticks), blankInput()]);
      if (distH(m.fighters[0].pos, m.fighters[1].pos) < 2.2) break;
    }
    expect(ticks).toBeLessThan(30);
    expect(m.fighters[0].meter).toBe(100 - C.CHASE_COST);
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
    expect(m.fighters[0].meter).toBe(100);
    expect(m.fighters[0].invuln).toBeGreaterThan(0);
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
    expect(m.fighters[1].hp).toBe(C.HP - C.BULLET_DMG);
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
    expect(m.fighters[1].hp).toBe(C.HP - C.STANDOFF_DMG);
    expect(m.fighters[0].hp).toBe(C.HP);
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
    expect(m.fighters[0].hp).toBe(C.HP);
    expect(m.fighters[1].hp).toBe(C.HP);
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
    expect(C.HP - m.fighters[1].hp).toBeCloseTo(expected, 5);
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
    expect(normal).toBeCloseTo(C.RUN, 0);
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
    expect(m.fighters[1].hp).toBe(C.HP);
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
        if (f.hp < 0 || f.hp > C.HP || f.meter < 0 || f.meter > C.METER + 1e-6) {
          throw new Error(`out-of-range value at tick ${m.tick}: hp ${f.hp} meter ${f.meter}`);
        }
        if (Math.hypot(f.pos.x, f.pos.z) > C.ARENA_R + 1e-3 || f.pos.y < 0 || f.pos.y > 80) {
          throw new Error(`fighter left the arena at tick ${m.tick}`);
        }
        if (f.pips < 0 || f.pips > C.PIPS) throw new Error("pips out of range");
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
      "verdictStart", "ko",
    ];
    for (const type of expected) expect(seenAll.has(type), `expected the AI to produce "${type}"`).toBe(true);
  });
});
