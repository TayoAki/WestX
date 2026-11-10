import { C, MOVES } from "./moves";
import { isFlying, isStunned } from "./match";
import { makeRng, type Rng } from "./rng";
import { blankInput, type InputFrame, type Match } from "./types";
import { dist, distH } from "./vec";

// The AI plays through the same InputFrame as a person, so it obeys every rule
// the player does. It runs a simple plan (approach, string, shoot, charge...)
// and reacts to being attacked or comboed.

export interface AIParams {
  /** Chance to raise guard against an incoming strike. */
  guard: number;
  /** Chance that a guard is timed as a perfect guard. */
  perfect: number;
  /** Chance per hit taken to slip out of a combo. */
  slip: number;
  /** How strongly it prefers closing in and attacking. 0..1 */
  aggression: number;
  /** Chance to chase after blasting the opponent away. */
  chase: number;
  /** Strike presses per second during a clash. */
  mash: number;
  /** Frames of delay before it reacts. */
  react: number;
  /** Idle frames between plans. */
  pause: number;
}

export type Difficulty = "dummy" | "easy" | "normal" | "hard";

export const DIFFICULTY: Record<Difficulty, AIParams> = {
  dummy: { guard: 0, perfect: 0, slip: 0, aggression: 0, chase: 0, mash: 0, react: 0, pause: 0 },
  easy: { guard: 0.2, perfect: 0.0, slip: 0.1, aggression: 0.3, chase: 0.1, mash: 4.5, react: 18, pause: 80 },
  normal: { guard: 0.5, perfect: 0.1, slip: 0.3, aggression: 0.7, chase: 0.6, mash: 7, react: 10, pause: 18 },
  hard: { guard: 0.75, perfect: 0.3, slip: 0.5, aggression: 0.9, chase: 0.9, mash: 9.5, react: 5, pause: 6 },
};

type Plan =
  | "idle"
  | "approach"
  | "string"
  | "shoot"
  | "heavy"
  | "charge"
  | "circle"
  | "retreat"
  | "guard"
  | "lariat"
  | "ult"
  | "awaken"
  | "airChase";

export class AI {
  private rng: Rng;
  private plan: Plan = "idle";
  private pt = 0;
  private pdur = 20;
  private side = 1;
  private presses = 0;
  private pressedMove: string | null = null;
  private ender = 0;
  private mashAcc = 0;
  private lastHitsTaken = 0;
  private slipAt = -1;
  private lastOppMoveKey = "";
  private guardAt = -1;
  private guardUntil = -1;
  private chaseRolled = false;
  private pursueRolled = false;

  constructor(
    private id: number,
    private p: AIParams,
    private isDummy: boolean,
    seed: number,
  ) {
    this.rng = makeRng(seed);
  }

  static create(id: number, difficulty: Difficulty, seed: number): AI {
    return new AI(id, DIFFICULTY[difficulty], difficulty === "dummy", seed);
  }

  private setPlan(plan: Plan, dur: number): void {
    this.plan = plan;
    this.pt = 0;
    this.pdur = dur;
    this.presses = 0;
    this.pressedMove = null;
    if (this.rng.chance(0.5)) this.side = -this.side;
  }

  think(m: Match): InputFrame {
    const inp = blankInput();
    if (this.isDummy || m.phase !== "fight") return inp;
    const me = m.fighters[this.id];
    const op = m.fighters[1 - this.id];
    const p = this.p;
    const t = m.tick;

    if (m.clash) {
      this.mashAcc += p.mash / 60;
      if (this.mashAcc >= 1 && !me.prev.strike) {
        this.mashAcc -= 1;
        inp.strike = true;
      }
      return inp;
    }
    if (m.cine) return inp;

    // Being comboed: maybe slip out. Each new hit is a fresh roll.
    if (isStunned(me)) {
      if (me.hitsTaken !== this.lastHitsTaken) {
        this.lastHitsTaken = me.hitsTaken;
        const combo = op.combo.hits;
        const chance = p.slip * (combo >= 3 ? 1.5 : 0.5);
        if (me.pips > 0 && this.slipAt < t && this.rng.chance(chance)) this.slipAt = t + p.react;
      }
      if (this.slipAt === t) inp.guard = true;
      this.plan = "idle";
      this.pt = 0;
      this.pdur = this.rng.int(4, 14);
      return inp;
    }
    this.lastHitsTaken = me.hitsTaken;

    if (me.state === "knockdown") {
      if (me.t > C.QUICK_RISE_AT + p.react && !me.prev.jump) inp.jump = true;
      return inp;
    }

    const d = dist(me.pos, op.pos);
    const dh = distH(me.pos, op.pos);
    const dy = op.pos.y - me.pos.y;

    // Follow-ups on our own combo.
    if (me.combo.hits > 0 && isFlying(op)) {
      if (op.state === "blasted" && !this.chaseRolled) {
        this.chaseRolled = true;
        if (me.meter >= C.CHASE_COST && this.rng.chance(p.chase)) this.setPlan("airChase", 40);
      }
      if (op.state === "launched" && !this.pursueRolled) {
        this.pursueRolled = true;
        if (this.rng.chance(0.4 + p.aggression * 0.5)) this.setPlan("airChase", 50);
      }
    } else {
      this.chaseRolled = false;
      this.pursueRolled = false;
    }

    // React to an incoming strike with a guard, sometimes timed as a perfect guard.
    if (op.state === "attack" && op.move && MOVES[op.move].hits.length > 0 && dh < 4.2 && Math.abs(dy) < 2) {
      const key = `${op.move}:${m.tick - op.mf}`;
      if (key !== this.lastOppMoveKey) {
        this.lastOppMoveKey = key;
        if (me.state === "free" && this.rng.chance(p.guard)) {
          const active = MOVES[op.move].hits[0].from;
          const framesLeft = Math.max(0, active - op.mf);
          const perfect = this.rng.chance(p.perfect);
          this.guardAt = t + (perfect ? Math.max(0, framesLeft - 3) : Math.min(framesLeft, Math.floor(p.react / 3)));
          this.guardUntil = this.guardAt + this.rng.int(18, 34);
        }
      }
    }
    // A heavy shot or the ultimate is coming: step aside.
    for (const proj of m.projectiles) {
      if (proj.owner === this.id || proj.kind === "bullet") continue;
      if (dist(proj.pos, me.pos) < 14 && me.state === "free" && me.stepCd <= 0 && this.rng.chance(p.guard * 0.25)) {
        inp.dash = !me.prev.dash;
        inp.mx = this.side;
        return inp;
      }
    }
    // Answer a charging heavy shot with one of our own, which can end in a clash.
    if (op.shotHold === 12 && me.state === "free" && me.meter >= C.HEAVY_COST && dh > 14) {
      if (this.rng.chance(0.15 + p.aggression * 0.45)) this.setPlan("heavy", 80);
    }
    if (t >= this.guardAt && t < this.guardUntil) {
      inp.guard = true;
      return inp;
    }

    if (me.state !== "free" && me.state !== "attack" && me.state !== "charge" && me.state !== "guard") return inp;

    this.pt++;
    if (this.plan === "idle" && this.pt >= this.pdur) this.choose(m, dh, dy);

    switch (this.plan) {
      case "approach": {
        inp.my = 1;
        inp.mx = this.side * 0.25;
        if (dh > 12 && me.meter >= C.CHASE_COST + 10 && this.pt === 6 && this.rng.chance(0.3 + p.aggression * 0.4)) {
          inp.dash = true;
          inp.mx = 0;
        }
        if (dy > 2.2 && dh < 5 && !me.prev.jump && this.pt % 20 === 1) inp.jump = true;
        if (dh < 3 && Math.abs(dy) < 1.7) {
          this.setPlan("string", 70);
          this.ender = this.rng.chance(0.3) ? 1 : this.rng.chance(0.25) ? -1 : 0;
        } else if (this.pt >= this.pdur) this.setPlan("idle", this.rng.int(2, 10));
        break;
      }
      case "string": {
        // One press per move, like a person: start the string, then confirm each hit into the next.
        const inString = me.state === "attack" && (me.move === "s1" || me.move === "s2" || me.move === "s3");
        if (me.state === "free" && this.presses === 0) {
          inp.strike = true;
          this.presses = 1;
        } else if (inString && this.pressedMove !== me.move && me.mf >= 4 && !me.prev.strike) {
          inp.strike = true;
          this.pressedMove = me.move;
          this.presses++;
        }
        if (me.move === "s3" || this.presses >= 4) inp.tilt = this.ender;
        const dropped = me.state === "free" && this.presses >= 1 && this.pt > 12;
        const whiffing = me.state === "attack" && !me.moveHit && me.mf > 12 && dh > 4;
        if (this.pt >= this.pdur || dropped || whiffing) this.setPlan("idle", this.rng.int(4, 10 + p.pause));
        break;
      }
      case "airChase": {
        if (op.state === "blasted" || (isFlying(op) && d > 6)) {
          if (this.pt === 2 + Math.floor(p.react / 2)) inp.dash = true;
        } else if (op.state === "launched" && me.grounded) {
          if (!me.prev.jump && this.pt % 6 === 2) inp.jump = true;
        }
        if (isStunned(op) && dh < 3.2 && Math.abs(dy) < 1.8) {
          this.setPlan("string", 60);
          this.ender = this.rng.chance(0.5) ? -1 : 0;
        } else if (this.pt >= this.pdur || !isStunned(op)) this.setPlan("idle", this.rng.int(2, 8));
        break;
      }
      case "shoot": {
        inp.mx = this.side;
        inp.my = dh < 10 ? -0.4 : 0;
        if (this.pt % 12 === 1) inp.shot = true;
        if (this.pt >= this.pdur || me.reload > 0) this.setPlan("idle", this.rng.int(4, 12 + p.pause));
        break;
      }
      case "heavy": {
        inp.shot = this.pt < C.HEAVY_HOLD + 6;
        inp.mx = this.side * 0.5;
        if (this.pt >= C.HEAVY_HOLD + 30) this.setPlan("idle", this.rng.int(4, 12 + p.pause));
        break;
      }
      case "charge": {
        inp.charge = true;
        const threatened = dh < 9 || (op.state === "attack" && op.move === "lastWord");
        if (this.pt >= this.pdur || me.meter >= C.METER || threatened) this.setPlan("idle", 2);
        break;
      }
      case "circle": {
        inp.mx = this.side;
        inp.my = dh > 6 ? 0.3 : -0.1;
        if (this.pt >= this.pdur) this.setPlan("idle", 2);
        break;
      }
      case "retreat": {
        inp.my = -1;
        inp.mx = this.side * 0.5;
        if (this.pt === 3 && me.stepCd <= 0 && this.rng.chance(0.5)) inp.dash = true;
        if (this.pt >= this.pdur) this.setPlan("idle", 2);
        break;
      }
      case "guard": {
        inp.guard = true;
        if (this.pt >= this.pdur) this.setPlan("idle", 2);
        break;
      }
      case "lariat": {
        if (this.pt === 1) inp.special = true;
        if (me.state === "attack" && me.move === "lariat" && me.moveHit && this.pt % 6 === 0) inp.strike = true;
        if (this.pt >= this.pdur) {
          if (isStunned(op) && dh < 4) {
            this.setPlan("string", 60);
            this.ender = this.rng.chance(0.4) ? 1 : 0;
          } else this.setPlan("idle", this.rng.int(4, 10));
        }
        break;
      }
      case "ult": {
        if (this.pt === 1) inp.ult = true;
        if (this.pt >= this.pdur) this.setPlan("idle", 10);
        break;
      }
      case "awaken": {
        if (this.pt === 1) inp.awaken = true;
        if (this.pt >= this.pdur) this.setPlan("idle", 4);
        break;
      }
      default:
        // Idle: drift sideways so it never stands perfectly still.
        inp.mx = this.side * 0.4;
    }
    return inp;
  }

  private choose(m: Match, dh: number, dy: number): void {
    const me = m.fighters[this.id];
    const op = m.fighters[1 - this.id];
    const p = this.p;
    const r = this.rng;

    if (me.awaken >= 100 && me.awakened === 0 && r.chance(0.5)) return this.setPlan("awaken", 30);
    if (me.meter >= C.METER && dh < 34 && (isStunned(op) || r.chance(0.35))) return this.setPlan("ult", 80);

    const options: [Plan, number, number][] = [];
    const a = p.aggression;
    if (dh > 18) {
      options.push(["approach", 3 * a, 90], ["shoot", 1.5, r.int(40, 80)], ["circle", 0.6, r.int(30, 60)]);
      if (me.meter < 70) options.push(["charge", 2.2, r.int(50, 110)]);
      if (me.meter >= C.HEAVY_COST) options.push(["heavy", 0.8, 80]);
      if (me.meter >= C.LARIAT_COST && dh < 25) options.push(["lariat", 1.2 * a, 50]);
    } else if (dh > 5) {
      options.push(["approach", 3.5 * a, 70], ["shoot", 1.5, r.int(30, 60)], ["circle", 1, r.int(25, 50)]);
      if (me.meter >= C.LARIAT_COST) options.push(["lariat", 1.6 * a, 50]);
      if (me.meter >= C.HEAVY_COST) options.push(["heavy", 0.6, 80]);
      if (me.meter < 40) options.push(["charge", 0.8, r.int(40, 70)]);
    } else {
      if (Math.abs(dy) < 1.7) options.push(["approach", 5 * a, 40]);
      options.push(["circle", 1, r.int(20, 40)], ["retreat", 1 - a * 0.6, r.int(25, 45)], ["guard", 0.8, r.int(20, 40)]);
      if (dy > 2) options.push(["approach", 3, 50]);
    }
    let total = 0;
    for (const o of options) total += o[1];
    let roll = r.next() * total;
    for (const o of options) {
      roll -= o[1];
      if (roll <= 0) return this.setPlan(o[0], o[2]);
    }
    this.setPlan("circle", 30);
  }
}
