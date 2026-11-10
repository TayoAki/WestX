import { C, MOVES } from "./moves";
import { isFlying, isStunned, kitOf } from "./match";
import { makeRng, type Rng } from "./rng";
import { blankInput, type InputFrame, type Match } from "./types";
import { dist, distH } from "./vec";

// The AI plays through the same InputFrame as a person, so it obeys every rule
// the player does. It runs a simple plan (approach, string, shoot, steady...)
// and reacts to being attacked, comboed or called out.

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
  /** Fastest and slowest draw after the bell, in frames. */
  draw: [number, number];
  /** Chance to flinch and draw before the bell. */
  flinch: number;
  /** Chance to answer a steady opponent by holding steady too, which makes a standoff. */
  accept: number;
  /** Chance to go for the perfect reload. */
  reload: number;
  /** Frames of delay before it reacts. */
  react: number;
  /** Idle frames between plans. */
  pause: number;
}

export type Difficulty = "dummy" | "easy" | "normal" | "hard";

export const DIFFICULTY: Record<Difficulty, AIParams> = {
  dummy: { guard: 0, perfect: 0, slip: 0, aggression: 0, chase: 0, draw: [999, 999], flinch: 0, accept: 0, reload: 0, react: 0, pause: 0 },
  easy: { guard: 0.2, perfect: 0.0, slip: 0.1, aggression: 0.3, chase: 0.1, draw: [28, 46], flinch: 0.12, accept: 0.25, reload: 0, react: 18, pause: 80 },
  normal: { guard: 0.5, perfect: 0.1, slip: 0.3, aggression: 0.7, chase: 0.6, draw: [19, 30], flinch: 0.05, accept: 0.4, reload: 0.3, react: 10, pause: 18 },
  hard: { guard: 0.75, perfect: 0.3, slip: 0.5, aggression: 0.9, chase: 0.9, draw: [13, 20], flinch: 0.02, accept: 0.5, reload: 0.7, react: 5, pause: 6 },
};

type Plan =
  | "idle"
  | "approach"
  | "string"
  | "shoot"
  | "fan"
  | "steady"
  | "circle"
  | "retreat"
  | "guard"
  | "lariat"
  | "ult"
  | "awaken"
  | "airChase"
  /** Walk in behind the brace. Only the hunter can. */
  | "advance"
  /** Raise the brace, then discharge it through their guard. */
  | "clap";

export class AI {
  private rng: Rng;
  private plan: Plan = "idle";
  private pt = 0;
  private pdur = 20;
  private side = 1;
  private presses = 0;
  private pressedMove: string | null = null;
  private ender = 0;
  private lastHitsTaken = 0;
  private slipAt = -1;
  private lastOppMoveKey = "";
  private guardAt = -1;
  private guardUntil = -1;
  private chaseRolled = false;
  private pursueRolled = false;
  /** Frame of the current standoff on which this AI will draw. */
  private drawAt = -1;
  private wasStandoff = false;
  private verdictAt = -1;
  private verdictAlive = false;
  private quickAt = -1;
  private steadyRolled = false;
  private reloadRolled = false;
  private reloadGo = false;
  private clapRolled = false;
  private shotRolled = false;

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
    this.quickAt = -1;
    if (this.rng.chance(0.5)) this.side = -this.side;
  }

  think(m: Match): InputFrame {
    const inp = blankInput();
    if (this.isDummy) return inp;
    const me = m.fighters[this.id];
    const op = m.fighters[1 - this.id];
    const p = this.p;
    const t = m.tick;

    // Dead or alive: the winner takes a moment, then decides.
    if (m.phase === "verdict" && m.verdict) {
      if (m.winner !== this.id || m.verdict.choice) return inp;
      if (this.verdictAt < 0) {
        this.verdictAt = m.verdict.t + this.rng.int(40, 100);
        this.verdictAlive = this.rng.chance(0.5);
      }
      if (m.verdict.t >= this.verdictAt && !me.prev.shot && !me.prev.special) {
        if (this.verdictAlive) inp.special = true;
        else inp.shot = true;
      }
      return inp;
    }
    if (m.phase !== "fight") return inp;

    // The standoff: wait for the bell, then draw after a human-sized reaction time.
    if (m.standoff) {
      const s = m.standoff;
      if (!this.wasStandoff) {
        this.wasStandoff = true;
        const flinch = this.rng.chance(p.flinch);
        this.drawAt = flinch ? this.rng.int(20, Math.max(21, s.bellAt - 4)) : s.bellAt + this.rng.int(p.draw[0], p.draw[1]);
      }
      // After a flinch, try again once the lockout has passed.
      if (s.lock[this.id] > 0 && this.drawAt < s.lock[this.id]) this.drawAt = s.lock[this.id] + this.rng.int(4, 14);
      if (s.t >= this.drawAt && !me.prev.shot) inp.shot = true;
      return inp;
    }
    this.wasStandoff = false;
    if (m.cine) return inp;

    // Working the cylinder: decide once per reload whether to go for the timing.
    if (me.reload > 0) {
      if (!this.reloadRolled) {
        this.reloadRolled = true;
        this.reloadGo = this.rng.chance(p.reload);
      }
      if (this.reloadGo && !me.reloadTried && me.reloadT >= C.RELOAD_PERFECT_FROM + 2 && !me.prev.shot && !isStunned(me)) {
        inp.shot = true;
        return inp;
      }
    } else this.reloadRolled = false;

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
        if (me.dashes > 0 && this.rng.chance(p.chase)) this.setPlan("airChase", 40);
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
    // The Last Word is coming: step aside.
    for (const proj of m.projectiles) {
      if (proj.owner === this.id || proj.kind !== "ult") continue;
      if (dist(proj.pos, me.pos) < 16 && me.state === "free" && me.dashes > 0 && this.rng.chance(p.guard * 0.3)) {
        inp.dash = !me.prev.dash;
        inp.mx = this.side;
        return inp;
      }
    }

    // The opponent has stopped and holstered. Either rush them, shoot them out of it,
    // or stop too and let it become a standoff.
    if (op.state === "steady" && op.t === 14 + p.react && !this.steadyRolled && (me.state === "free" || me.state === "steady")) {
      this.steadyRolled = true;
      if (m.standoffCd === 0 && me.grounded && dh > 5 && this.rng.chance(p.accept)) this.setPlan("steady", 140);
      else if (dh > 7 && me.ammo > 0 && this.rng.chance(0.6)) this.setPlan("shoot", 40);
      else if (this.rng.chance(p.aggression)) this.setPlan("approach", 70);
    }
    if (op.state !== "steady") this.steadyRolled = false;

    const kit = kitOf(me);
    // Being shot at from range: the hunter raises the brace and walks in.
    const underFire = m.projectiles.some((pr) => pr.owner !== this.id && (pr.kind === "bullet" || pr.kind === "quick"));
    if (kit.deflect && underFire && dh > 5 && me.state === "free" && this.plan !== "advance") {
      if (!this.shotRolled) {
        this.shotRolled = true;
        if (this.rng.chance(0.25 + p.guard * 0.6)) this.setPlan("advance", 150);
      }
    } else if (!underFire) this.shotRolled = false;
    // They are turtling up close: go through the guard.
    if (kit.thunderclap && op.state === "guard" && dh < 3.6 && me.meter >= C.CLAP_COST && me.state === "free") {
      if (!this.clapRolled) {
        this.clapRolled = true;
        if (this.rng.chance(0.25 + p.aggression * 0.45)) this.setPlan("clap", 30);
      }
    } else if (op.state !== "guard") this.clapRolled = false;
    // A rival hiding behind a guard at range: the rope goes straight through it.
    if (!kit.thunderclap && op.state === "guard" && op.t === 20 && dh > 5 && dh < 24 && me.meter >= C.LARIAT_COST && me.state === "free") {
      if (this.rng.chance(0.3 + p.aggression * 0.5)) this.setPlan("lariat", 50);
    }

    if (t >= this.guardAt && t < this.guardUntil && this.plan !== "advance" && this.plan !== "clap") {
      inp.guard = true;
      return inp;
    }

    if (me.state !== "free" && me.state !== "attack" && me.state !== "steady" && me.state !== "guard" && me.state !== "blockstun") return inp;

    this.pt++;
    if (this.plan === "idle" && this.pt >= this.pdur) this.choose(m, dh, dy);

    switch (this.plan) {
      case "approach": {
        inp.my = 1;
        inp.mx = this.side * 0.25;
        if (dh > 9 && me.dashes > 0 && this.pt === 6 && this.rng.chance(0.3 + p.aggression * 0.4)) {
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
        const inString = me.state === "attack" && me.move !== null && kit.string.includes(me.move);
        const last = kit.string[kit.string.length - 1];
        if (me.state === "free" && this.presses === 0) {
          inp.strike = true;
          this.presses = 1;
        } else if (inString && this.pressedMove !== me.move && me.mf >= 4 && !me.prev.strike) {
          inp.strike = true;
          this.pressedMove = me.move;
          this.presses++;
        }
        if (me.move === last || this.presses > kit.string.length) inp.tilt = this.ender;
        const dropped = me.state === "free" && this.presses >= 1 && this.pt > 12;
        const whiffing = me.state === "attack" && !me.moveHit && me.mf > 12 && dh > 4;
        if (this.pt >= this.pdur || dropped || whiffing) this.setPlan("idle", this.rng.int(4, 10 + p.pause));
        break;
      }
      case "advance": {
        // Shield up, walking forward. Bullets ring off the brace.
        inp.guard = true;
        inp.my = 1;
        inp.mx = this.side * 0.15;
        if (dh < 3.2 && Math.abs(dy) < 1.7) {
          this.setPlan("string", 70);
          this.ender = this.rng.chance(0.3) ? 1 : this.rng.chance(0.25) ? -1 : 0;
        } else if (this.pt >= this.pdur || me.guardHp < 25) this.setPlan("idle", this.rng.int(2, 10));
        break;
      }
      case "clap": {
        inp.guard = true;
        if (this.pt >= 5 && me.state === "guard" && !me.prev.strike) inp.strike = true;
        if (this.pt >= this.pdur || me.state === "attack") this.setPlan("idle", this.rng.int(6, 14));
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
      case "fan": {
        // Hold the trigger and let the other hand do the work.
        inp.shot = true;
        if (this.pt >= this.pdur || me.reload > 0 || (this.pt > 16 && me.state === "free")) {
          this.setPlan("idle", this.rng.int(6, 14 + p.pause));
        }
        break;
      }
      case "steady": {
        inp.steady = true;
        // Decide once how long to wait before the quickdraw, if at all.
        if (this.quickAt < 0) this.quickAt = this.rng.chance(0.45 + p.aggression * 0.3) ? this.rng.int(C.QUICK_MIN + 6, 80) : 9999;
        const armed = me.state === "steady" && me.t >= C.QUICK_MIN && me.ammo > 0 && me.reload === 0;
        const rushed = dh < 8 && op.state !== "steady";
        if (armed && (me.t >= this.quickAt || rushed) && !me.prev.shot && op.state !== "steady") {
          inp.shot = true;
          this.setPlan("idle", this.rng.int(6, 16));
        } else if (this.pt >= this.pdur || (rushed && !armed) || (me.meter >= C.METER && me.ammo >= C.AMMO && op.state !== "steady")) {
          this.setPlan("idle", 2);
        }
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
        if (this.pt === 3 && me.dashes > 1 && this.rng.chance(0.5)) inp.dash = true;
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
    const loaded = me.reload === 0 && me.ammo > 0;
    const wantsSteady = me.grounded && (me.meter < 70 || me.ammo < 3);
    const kit = kitOf(me);
    if (kit.deflect && dh > 7 && op.ammo > 0) options.push(["advance", 2.2, r.int(90, 160)]);
    if (dh > 18) {
      options.push(["approach", 3 * a, 90], ["circle", 0.6, r.int(30, 60)]);
      if (loaded) options.push(["shoot", 1.5, r.int(40, 80)]);
      if (wantsSteady) options.push(["steady", 2.4, r.int(50, 110)]);
      else if (me.grounded) options.push(["steady", 0.7, r.int(40, 80)]);
      if (loaded && me.ammo >= 4) options.push(["fan", 0.7, 60]);
      if (me.meter >= C.LARIAT_COST && dh < 25) options.push(["lariat", 1.2 * a, 50]);
    } else if (dh > 5) {
      options.push(["approach", 3.5 * a, 70], ["circle", 1, r.int(25, 50)]);
      if (loaded) options.push(["shoot", 1.5, r.int(30, 60)]);
      if (me.meter >= C.LARIAT_COST) options.push(["lariat", 1.6 * a, 50]);
      if (loaded && me.ammo >= 3) options.push(["fan", 0.8, 60]);
      if (wantsSteady) options.push(["steady", 1.0, r.int(40, 70)]);
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
