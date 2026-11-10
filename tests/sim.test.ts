import { describe, expect, it } from "vitest";
import { AI } from "../src/sim/ai";
import { createMatch, stepMatch } from "../src/sim/match";
import { C } from "../src/sim/moves";
import { blankInput, type InputFrame, type Match, type SimEvent } from "../src/sim/types";
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

/** A match past its intro, with the fighters `gap` metres apart. */
function fight(gap = 2, opts = {}): Match {
  const m = createMatch(7, opts);
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

const hits = (ev: SimEvent[]) => ev.filter((e) => e.type === "hit" && !e.blocked);
const has = (ev: SimEvent[], type: SimEvent["type"]) => ev.some((e) => e.type === type);

describe("match flow", () => {
  it("holds both fighters during the intro, then starts the fight", () => {
    const m = createMatch(1);
    const ev = run(m, C.INTRO_T, { my: 1, strike: true });
    expect(m.fighters[0].pos.z).toBe(-6);
    expect(ev.some((e) => e.type === "phase" && e.phase === "fight")).toBe(true);
  });

  it("ends with a knockout and declares the winner", () => {
    const m = fight();
    m.fighters[1].hp = 10;
    const ev = run(m, 30, tap("strike"));
    expect(has(ev, "ko")).toBe(true);
    expect(m.winner).toBe(0);
    run(m, C.KO_T + 5);
    expect(m.phase).toBe("done");
  });
});

describe("strike string", () => {
  it("lands four hits and blasts the target at least 30 m away", () => {
    const m = fight();
    const start = { ...m.fighters[1].pos };
    const ev = run(m, 200, (t) => ({ strike: t < 70 && t % 8 < 2 }));
    expect(hits(ev).length).toBe(4);
    expect(hits(ev).at(-1)).toMatchObject({ effect: "blast" });
    const travelled = distH(m.fighters[1].pos, start);
    expect(travelled).toBeGreaterThan(30);
    expect(travelled).toBeLessThan(60);
    expect(m.fighters[1].hp).toBeLessThan(C.HP - 100);
  });

  it("launches when the ender is pressed with up held", () => {
    const m = fight();
    let peak = 0;
    for (let t = 0; t < 120; t++) {
      stepMatch(m, [frame({ strike: t < 70 && t % 8 < 2, tilt: t > 20 ? 1 : 0 }, t), blankInput()]);
      peak = Math.max(peak, m.fighters[1].pos.y);
    }
    expect(peak).toBeGreaterThan(7);
  });

  it("slams a grounded target into a bounce when down is held", () => {
    const m = fight();
    const ev = run(m, 90, (t) => ({ strike: t < 70 && t % 8 < 2, tilt: t > 20 ? -1 : 0 }));
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
    const ev = hits(run(m, 80, tap("strike"))) as Extract<SimEvent, { type: "hit" }>[];
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
    // The attacker turns to face the target once free, so check at the moment of arrival.
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
  it("crosses 40 m in under half a second and costs meter", () => {
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

describe("meter", () => {
  it("fills while charging", () => {
    const m = fight(30);
    m.fighters[0].meter = 0;
    run(m, 120, { charge: true });
    expect(m.fighters[0].state).toBe("charge");
    expect(m.fighters[0].meter).toBeGreaterThan(55);
    expect(m.fighters[0].meter).toBeLessThan(70);
  });
});

describe("shots", () => {
  it("fires six rounds, then reloads", () => {
    const m = fight(20);
    const ev = run(m, 75, tap("shot", 6));
    expect(ev.filter((e) => e.type === "shot").length).toBe(6);
    expect(m.fighters[0].ammo).toBe(0);
    run(m, C.RELOAD + 2);
    expect(m.fighters[0].ammo).toBe(C.AMMO);
  });

  it("does not interrupt a fighter who is lining up a heavy shot", () => {
    const m = fight(20);
    m.fighters[1].meter = 50;
    m.fighters[1].ammo = 0;
    m.fighters[1].reload = 600;
    const ev = run(m, 30, (t) => ({ shot: t >= 14 && t < 16 }), { shot: true });
    expect(hits(ev).length).toBe(1);
    expect(m.fighters[1].state).toBe("free");
    expect(m.fighters[1].hp).toBeLessThan(C.HP);
  });

  it("damages a target standing in the open", () => {
    const m = fight(20);
    const ev = run(m, 30, (t) => ({ shot: t < 2 }));
    expect(hits(ev).length).toBe(1);
    expect(m.fighters[1].hp).toBe(C.HP - 14);
  });

  it("releases a heavy shot after a full hold, and it blasts the target", () => {
    const m = fight(20);
    m.fighters[0].meter = 50;
    const ev = run(m, 120, (t) => ({ shot: t < C.HEAVY_HOLD + 4 }));
    expect(ev.some((e) => e.type === "shot" && e.heavy)).toBe(true);
    expect(ev.some((e) => e.type === "hit" && e.effect === "blast" && e.projectile)).toBe(true);
  });

  it("does not release a heavy shot without the meter for it", () => {
    const m = fight(20);
    m.fighters[0].meter = 0;
    m.fighters[0].ammo = 0;
    m.fighters[0].reload = 600;
    const ev = run(m, 80, (t) => ({ shot: t < C.HEAVY_HOLD + 4 }));
    expect(ev.some((e) => e.type === "shot")).toBe(false);
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
  it("needs a full meter", () => {
    const m = fight(10);
    m.fighters[0].meter = 90;
    const ev = run(m, 40, (t) => ({ ult: t < 2 }));
    expect(has(ev, "ultStart")).toBe(false);
  });

  it("plays its sequence and deals its full damage", () => {
    const m = fight(10);
    m.fighters[0].meter = 100;
    const ev = run(m, 320, (t) => ({ ult: t < 2 }));
    expect(has(ev, "cineStart")).toBe(true);
    expect(has(ev, "cineEnd")).toBe(true);
    expect(ev.filter((e) => e.type === "cineHit").length).toBe(7);
    const expected = C.CINE_HITS.length * C.CINE_HIT_DMG + C.CINE_FINAL_DMG;
    expect(C.HP - m.fighters[1].hp).toBeCloseTo(expected, 5);
    expect(m.fighters[0].meter).toBeLessThan(40);
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

describe("clash", () => {
  it("locks two heavy shots together and the faster masher wins", () => {
    const m = fight(24);
    for (const f of m.fighters) {
      f.meter = 50;
      // Empty guns, so the opening tap does not interrupt either fighter's hold.
      f.ammo = 0;
      f.reload = 600;
    }
    const hold: Script = (t) => ({ shot: t < C.HEAVY_HOLD + 4 });
    const ev = run(m, 70, hold, hold);
    expect(has(ev, "clashStart")).toBe(true);
    expect(m.fighters[0].state).toBe("clash");
    const end = run(m, C.CLASH_T + 5, tap("strike", 4), tap("strike", 12));
    const result = end.find((e) => e.type === "clashEnd");
    expect(result).toMatchObject({ winner: 0 });
    expect(m.fighters[1].hp).toBe(C.HP - C.CLASH_DMG);
    expect(m.fighters[0].hp).toBe(C.HP);
    expect(m.clash).toBeNull();
  });
});

describe("props", () => {
  it("break when a blasted fighter flies through them", () => {
    const m = fight();
    m.props = [{ kind: "crate", pos: v3(0, 0, 12), radius: 0.75, height: 1.3, hp: 2, broken: false }];
    const ev = run(m, 200, (t) => ({ strike: t < 70 && t % 8 < 2 }));
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
});

describe("training mode", () => {
  it("never knocks the opponent out and refills their health after a combo", () => {
    const m = fight(2, { training: true });
    m.fighters[1].hp = 30;
    const ev = run(m, 300, (t) => ({ strike: t < 70 && t % 8 < 2 }));
    expect(has(ev, "ko")).toBe(false);
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

  it("plays whole matches to a knockout without breaking any invariant", () => {
    const lengths: number[] = [];
    const seenAll = new Set<string>();
    let finished = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { m, seen } = play(seed, 60 * 60 * 6);
      for (const s of seen) seenAll.add(s);
      if (m.phase === "done") {
        finished++;
        lengths.push(m.tick / 60);
      }
    }
    lengths.sort((x, y) => x - y);
    const median = lengths[Math.floor(lengths.length / 2)];
    console.log(
      `AI matches finished ${finished}/24, median ${median.toFixed(0)}s, range ${lengths[0].toFixed(0)}-${lengths.at(-1)!.toFixed(0)}s`,
    );
    console.log(`event types seen: ${[...seenAll].sort().join(", ")}`);
    expect(finished).toBe(24);
    // Every core mechanic should come up naturally in real play.
    for (const type of ["hit", "shot", "jump", "slipOut", "chase", "chaseCatch", "groundSlam", "lasso", "cineStart", "awaken", "clashStart", "propBreak", "guardBreak", "ko"]) {
      expect(seenAll.has(type), `expected the AI to produce "${type}"`).toBe(true);
    }
  });
});
