import { KITS, type Kit, type KitId } from "./kits";
import { C, dryEnder, MOVES, PROJ_HITS, TACKLE, type HitBox } from "./moves";
import { makeRng } from "./rng";
import {
  BUTTONS,
  blankInput,
  type Button,
  type Fighter,
  type FState,
  type InputFrame,
  type Match,
  type MatchOptions,
  type MoveId,
  type Projectile,
  type ProjKind,
  type Prop,
  type PropKind,
  type ShotKind,
  type SimEvent,
} from "./types";
import {
  add,
  angleDiff,
  assign,
  clamp,
  clone,
  dirOfYaw,
  dist,
  distH,
  len,
  lenH,
  norm,
  normH,
  rightOf,
  scale,
  segPointDist,
  sub,
  v3,
  yawOf,
  type V3,
} from "./vec";

// The whole duel as a pure step function: state + two inputs -> next state + events.
// Nothing here touches the browser, so the same code runs in tests and can run on a server.

const STUNNED: ReadonlySet<FState> = new Set<FState>([
  "hitstun",
  "stagger",
  "launched",
  "blasted",
  "slammed",
  "bounced",
  "pulled",
]);
const FLYING: ReadonlySet<FState> = new Set<FState>(["launched", "blasted", "slammed", "bounced"]);
const UNHITTABLE: ReadonlySet<FState> = new Set<FState>([
  "knockdown",
  "getup",
  "slip",
  "ko",
  "cine",
  "standoff",
  "burst",
  "downed",
  "tied",
]);
const NO_PUSH: ReadonlySet<FState> = new Set<FState>([
  "slip",
  "chase",
  "blasted",
  "ko",
  "cine",
  "zip",
  "pulled",
  "knockdown",
  "downed",
  "tied",
]);
/** States in which a fighter can work the cylinder during a reload. */
const CAN_RELOAD: ReadonlySet<FState> = new Set<FState>(["free", "attack", "guard", "blockstun", "steady", "step", "chase"]);

export const isStunned = (f: Fighter): boolean => STUNNED.has(f.state);
export const isFlying = (f: Fighter): boolean => FLYING.has(f.state);
const canBeHit = (f: Fighter): boolean => f.invuln <= 0 && !UNHITTABLE.has(f.state);
export const centerOf = (f: Fighter): V3 => v3(f.pos.x, f.pos.y + 0.95, f.pos.z);
export const kitOf = (f: Fighter): Kit => KITS[f.kit];

function createFighter(id: number, name: string, kit: KitId, pos: V3, yaw: number): Fighter {
  const buf = {} as Record<Button, number>;
  for (const b of BUTTONS) buf[b] = 0;
  const k = KITS[kit];
  return {
    id,
    name,
    kit,
    maxHp: k.hp,
    pos,
    vel: v3(),
    yaw,
    grounded: true,
    airJumps: k.airJumps,
    hp: k.hp,
    meter: 30,
    pips: k.pips,
    pipTimer: 0,
    dashes: k.dashes,
    dashTimer: 0,
    guardHp: C.GUARD_HP,
    awaken: 0,
    awakened: 0,
    comebackUsed: false,
    ammo: C.AMMO,
    reload: 0,
    reloadT: 0,
    reloadTried: false,
    hot: 0,
    shotCd: 0,
    shotHold: 0,
    shotPose: 0,
    enderLive: false,
    enderMult: 1,
    quickPower: 0,
    state: "free",
    t: 0,
    dur: 0,
    move: null,
    mf: 0,
    hitDone: [],
    moveHit: false,
    zipFlag: false,
    airHang: false,
    invuln: 0,
    guardT: 0,
    slowAcc: 0,
    timeScale: 1,
    stepDir: v3(0, 0, 1),
    anchor: v3(),
    hitsTaken: 0,
    buf,
    prev: blankInput(),
    combo: { hits: 0, damage: 0, chases: 0, launches: 0 },
  };
}

const PROP_SPECS: Record<PropKind, { radius: number; height: number; hp: number }> = {
  crate: { radius: 0.75, height: 1.3, hp: 2 },
  barrel: { radius: 0.55, height: 1.2, hp: 1 },
  cactus: { radius: 0.5, height: 2.6, hp: 2 },
  rock: { radius: 1.5, height: 3.4, hp: 8 },
};

function createProps(m: Match): Prop[] {
  const props: Prop[] = [];
  const kinds: PropKind[] = ["crate", "barrel", "cactus", "rock", "crate", "barrel", "cactus"];
  let guard = 0;
  while (props.length < 30 && guard++ < 600) {
    const kind = kinds[m.rng.int(0, kinds.length - 1)];
    const spec = PROP_SPECS[kind];
    const r = m.rng.range(9, 62);
    const a = m.rng.range(0, Math.PI * 2);
    const pos = v3(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Keep the opening sightline between the two fighters clear.
    if (Math.abs(pos.x) < 4 && Math.abs(pos.z) < 14) continue;
    if (props.some((p) => distH(p.pos, pos) < p.radius + spec.radius + 2.5)) continue;
    props.push({ kind, pos, radius: spec.radius, height: spec.height, hp: spec.hp, broken: false });
  }
  return props;
}

export function createMatch(seed: number, opts: Partial<MatchOptions> = {}): Match {
  // By default the player is the heavy hunter and the rival is the quick outlaw.
  const kits: [KitId, KitId] = opts.kits ?? ["hunter", "outlaw"];
  const m: Match = {
    tick: 0,
    phase: "intro",
    phaseT: 0,
    fighters: [
      createFighter(0, "Hunter", kits[0], v3(0, 0, -6), 0),
      createFighter(1, "Rival", kits[1], v3(0, 0, 6), Math.PI),
    ],
    projectiles: [],
    nextProjId: 1,
    props: [],
    hitstop: 0,
    cine: null,
    standoff: null,
    standoffCd: 0,
    verdict: null,
    winner: -1,
    outcome: null,
    rng: makeRng(seed),
    events: [],
    opts: { training: false, opening: true, ...opts, kits },
  };
  m.props = createProps(m);
  return m;
}

// ---------------------------------------------------------------- helpers

function setState(f: Fighter, state: FState, dur = 0): void {
  f.state = state;
  f.t = 0;
  f.dur = dur;
  f.airHang = false;
  if (state !== "attack") f.move = null;
  if (state !== "free") f.shotHold = 0;
}

const toFree = (f: Fighter): void => setState(f, "free");

function stopH(f: Fighter): void {
  f.vel.x = 0;
  f.vel.z = 0;
}

const toTarget = (f: Fighter, o: Fighter): V3 => normH(sub(o.pos, f.pos), dirOfYaw(f.yaw));

function consume(f: Fighter, b: Button): boolean {
  if (f.buf[b] > 0) {
    f.buf[b] = 0;
    return true;
  }
  return false;
}

function startMove(f: Fighter, o: Fighter, id: MoveId): void {
  setState(f, "attack");
  f.move = id;
  f.mf = 0;
  f.hitDone = [];
  f.moveHit = false;
  f.enderLive = false;
  f.yaw = yawOf(toTarget(f, o));
  const inv = MOVES[id].invuln;
  if (inv) f.invuln = Math.max(f.invuln, inv);
}

function endCombo(m: Match, att: Fighter): void {
  if (att.combo.hits > 0) {
    m.events.push({ type: "comboEnd", att: att.id, hits: att.combo.hits, damage: Math.round(att.combo.damage) });
  }
  att.combo = { hits: 0, damage: 0, chases: 0, launches: 0 };
}

function dealDamage(m: Match, att: Fighter | null, def: Fighter, amount: number, lethal = true): number {
  if (m.opts.training && def.id === 1) lethal = false;
  const before = def.hp;
  def.hp = Math.max(lethal ? 0 : 1, def.hp - amount);
  const dealt = before - def.hp;
  if (def.awakened === 0) def.awaken = Math.min(100, def.awaken + dealt * C.AWAKEN_GAIN_TAKEN);
  if (!def.comebackUsed && def.hp > 0 && def.hp < def.maxHp * C.COMEBACK_AT) {
    def.comebackUsed = true;
    if (def.awakened === 0) def.awaken = 100;
  }
  if (att) {
    if (att.awakened === 0) att.awaken = Math.min(100, att.awaken + dealt * C.AWAKEN_GAIN_DEALT);
    att.combo.damage += dealt;
  }
  return dealt;
}

function setBlasted(def: Fighter, dir: V3, power = 1): void {
  setState(def, "blasted", C.BLAST_T);
  def.vel = v3(dir.x * C.BLAST_V * power, 5, dir.z * C.BLAST_V * power);
  def.grounded = false;
  def.pos.y = Math.max(def.pos.y, 0.05);
}

// ---------------------------------------------------------------- the cylinder

function startReload(m: Match, f: Fighter): void {
  if (f.reload > 0) return;
  f.reload = C.RELOAD;
  f.reloadT = 0;
  f.reloadTried = false;
  f.hot = 0;
  f.buf.shot = 0;
  m.events.push({ type: "reloadStart", id: f.id });
}

/** Spends one round and returns its damage multiplier. An empty cylinder starts a reload. */
function spendRound(m: Match, f: Fighter): number {
  f.ammo--;
  let mult = 1;
  if (f.hot > 0) {
    f.hot--;
    mult = C.HOT_DMG;
  }
  if (f.ammo <= 0) {
    f.ammo = 0;
    startReload(m, f);
  }
  return mult;
}

/**
 * Pressing shot while the cylinder is open tries for the perfect reload: hit the
 * window and it snaps shut early with hot rounds, miss and it takes longer.
 */
function workReload(m: Match, f: Fighter): void {
  if (f.reload <= 0 || f.buf.shot <= 0 || !CAN_RELOAD.has(f.state)) return;
  f.buf.shot = 0;
  if (f.reloadT < C.RELOAD_GRACE || f.reloadTried) return;
  f.reloadTried = true;
  if (f.reloadT >= C.RELOAD_PERFECT_FROM && f.reloadT <= C.RELOAD_PERFECT_TO) {
    f.reload = 0;
    f.ammo = C.AMMO;
    f.hot = C.HOT_ROUNDS;
    m.events.push({ type: "reloadEnd", id: f.id, perfect: true });
  } else {
    f.reload += C.RELOAD_FUMBLE;
    m.events.push({ type: "reloadFumble", id: f.id });
  }
}

// ---------------------------------------------------------------- winning

/** A fighter is out of health: they drop to their knees and the winner decides how it ends. */
function defeat(m: Match, loser: Fighter, dir: V3): void {
  if (m.phase !== "fight") return;
  const winner = m.fighters[1 - loser.id];
  m.winner = winner.id;
  m.projectiles = [];
  m.standoff = null;
  m.cine = null;
  endCombo(m, winner);
  setState(loser, "downed");
  loser.vel = v3(dir.x * 5, loser.grounded ? 0 : loser.vel.y, dir.z * 5);
  toFree(winner);
  stopH(winner);
  m.phase = "verdict";
  m.phaseT = 0;
  m.verdict = { t: 0, choice: null, at: 0 };
  m.events.push({ type: "verdictStart", winner: winner.id, pos: clone(loser.pos) });
  m.events.push({ type: "phase", phase: "verdict" });
}

function stepVerdict(m: Match, inputs: [InputFrame, InputFrame]): void {
  const v = m.verdict!;
  const w = m.fighters[m.winner];
  const l = m.fighters[1 - m.winner];
  v.t++;
  const dir = toTarget(w, l);
  w.yaw = yawOf(dir);
  stopH(w);
  l.vel.x *= 0.85;
  l.vel.z *= 0.85;

  // A winner who is far off arrives in one dash and stands over the loser.
  const gap = distH(w.pos, l.pos);
  if (v.choice === null && gap > 4.2) {
    if (w.state !== "chase") {
      setState(w, "chase");
      m.events.push({ type: "chase", id: w.id, pos: clone(w.pos) });
    }
    const stepLen = Math.min(kitOf(w).chaseSpeed * C.DT, gap - 3.8);
    w.pos.x += dir.x * stepLen;
    w.pos.z += dir.z * stepLen;
    w.pos.y = Math.max(0, w.pos.y + clamp(l.pos.y - w.pos.y, -stepLen, stepLen));
    w.grounded = w.pos.y <= 0.02;
    w.vel = v3();
    return;
  }
  if (w.state === "chase") toFree(w);

  if (v.choice === null) {
    const inp = inputs[m.winner];
    const shot = inp.shot && !w.prev.shot;
    const rope = inp.special && !w.prev.special;
    const timeUp = v.t >= C.VERDICT_T;
    if ((v.t > C.VERDICT_GRACE && (shot || rope)) || timeUp) {
      v.choice = rope && !timeUp ? "alive" : "dead";
      v.at = v.t;
      startMove(w, l, v.choice === "alive" ? "lariat" : "coup");
    }
    return;
  }

  w.mf++;
  if (v.t < v.at + C.VERDICT_ACT) return;
  const alive = v.choice === "alive";
  if (alive) {
    setState(l, "tied");
    l.vel = v3();
    m.events.push({ type: "lasso", owner: w.id, hit: true });
  } else {
    w.shotPose = 20;
    m.events.push({ type: "shot", owner: w.id, pos: add(centerOf(w), scale(dir, 0.8)), kind: "coup" });
    setState(l, "ko");
    l.vel = v3(dir.x * 22, 9, dir.z * 22);
    l.grounded = false;
    m.hitstop = 12;
  }
  m.verdict = null;
  m.outcome = alive ? "alive" : "dead";
  m.phase = "ko";
  m.phaseT = 0;
  m.events.push({ type: "ko", winner: w.id, pos: clone(l.pos), alive });
  m.events.push({ type: "phase", phase: "ko" });
}

// ---------------------------------------------------------------- hits

/** Applies one hit. `dir` is the horizontal direction from attacker to defender. */
function applyHit(m: Match, att: Fighter, def: Fighter, hb: HitBox, dir: V3, projectile: boolean, mult = 1): boolean {
  if (!canBeHit(def)) return false;
  const contact = scale(add(centerOf(att), centerOf(def)), 0.5);
  const pos = projectile ? centerOf(def) : contact;

  // Light shots cannot stop a chase dash, or a thunderclap once it is coming.
  if (projectile && hb.strength === 1 && (def.state === "chase" || def.move === "thunderclap")) return false;

  if (def.state === "guard" || def.state === "blockstun") {
    const perfect = def.state === "guard" && def.guardT <= C.PERFECT_WINDOW;
    if (perfect) {
      def.meter = Math.min(C.METER, def.meter + 12);
      if (!projectile) {
        setState(att, "parried", C.PARRY_STUN);
        att.vel = v3(-dir.x * 7, 0, -dir.z * 7);
      }
      m.hitstop = Math.max(m.hitstop, 10);
      m.events.push({ type: "hit", att: att.id, def: def.id, pos, strength: 2, effect: hb.effect, damage: 0, blocked: true, perfect: true, projectile });
      return true;
    }
    // The brace turns light shots aside: no chip, barely a dent in the guard, no break in stride.
    if (projectile && hb.strength === 1 && kitOf(def).deflect && def.state === "guard") {
      def.guardHp -= hb.guardDamage * 0.25;
      if (def.guardHp > 0) {
        m.events.push({ type: "deflect", id: def.id, pos, back: false });
        return true;
      }
    }
    const chip = dealDamage(m, att, def, hb.damage * mult * C.CHIP, false);
    def.guardHp -= hb.guardDamage;
    m.events.push({ type: "hit", att: att.id, def: def.id, pos, strength: hb.strength, effect: hb.effect, damage: chip, blocked: true, perfect: false, projectile });
    if (def.guardHp <= 0) {
      def.guardHp = C.GUARD_HP * 0.5;
      setState(def, "stagger", C.GUARD_BREAK_STUN);
      def.vel = v3(dir.x * 4, 0, dir.z * 4);
      m.hitstop = Math.max(m.hitstop, 12);
      m.events.push({ type: "guardBreak", id: def.id, pos: centerOf(def) });
    } else {
      setState(def, "blockstun", hb.blockstun);
      def.vel = v3(dir.x * 3.5, def.grounded ? 0 : def.vel.y, dir.z * 3.5);
      m.hitstop = Math.max(m.hitstop, Math.min(hb.hitstop, 4));
    }
    return true;
  }

  const scaling = Math.max(C.SCALE_MIN, 1 - C.SCALE_STEP * att.combo.hits);
  const dmg = hb.damage * mult * scaling * (att.awakened > 0 ? C.AWAKEN_DMG : 1);
  const dealt = dealDamage(m, att, def, dmg);
  att.combo.hits++;
  def.hitsTaken++;
  att.meter = Math.min(C.METER, att.meter + hb.meter);
  def.meter = Math.min(C.METER, def.meter + hb.meter * 0.5);

  let effect = hb.effect;
  if (effect === "launch" && att.combo.launches >= kitOf(att).maxLaunches) effect = "blast";

  if (def.hp <= 0) {
    m.hitstop = Math.max(m.hitstop, 14);
    m.events.push({ type: "hit", att: att.id, def: def.id, pos, strength: 3, effect, damage: dealt, blocked: false, perfect: false, projectile });
    defeat(m, def, dir);
    return true;
  }

  const airborne = !def.grounded || def.pos.y > 0.05;
  switch (effect) {
    case "reel": {
      // A light shot keeps a juggled target in the air instead of resetting it.
      if (projectile && isFlying(def)) {
        def.vel.y = Math.max(def.vel.y, 4.5);
        break;
      }
      setState(def, "hitstun", hb.stun);
      if (airborne) {
        def.airHang = true;
        def.vel = v3(dir.x * 1.5, 3.2, dir.z * 1.5);
        def.grounded = false;
      } else {
        def.vel = v3(dir.x * 5, 0, dir.z * 5);
      }
      break;
    }
    case "stagger":
      setState(def, "stagger", hb.stun);
      def.vel = v3(dir.x * 3, 0, dir.z * 3);
      break;
    case "launch":
      att.combo.launches++;
      setState(def, "launched");
      def.vel = v3(dir.x * 1.5, C.LAUNCH_V, dir.z * 1.5);
      def.grounded = false;
      def.pos.y = Math.max(def.pos.y, 0.05);
      break;
    case "blast":
      setBlasted(def, dir, projectile ? 0.6 : 1);
      break;
    case "slam":
      if (airborne) {
        setState(def, "slammed");
        def.vel = v3(dir.x * 5, -C.SLAM_V, dir.z * 5);
      } else {
        setState(def, "bounced");
        def.vel = v3(dir.x * 2, C.BOUNCE_V, dir.z * 2);
        def.grounded = false;
        def.pos.y = 0.05;
        m.events.push({ type: "groundSlam", id: def.id, pos: clone(def.pos) });
      }
      break;
  }

  m.hitstop = Math.max(m.hitstop, hb.hitstop);
  m.events.push({ type: "hit", att: att.id, def: def.id, pos, strength: hb.strength, effect, damage: dealt, blocked: false, perfect: false, projectile });
  return true;
}

function resolveStrikes(m: Match): void {
  for (let i = 0; i < 2; i++) {
    const f = m.fighters[i];
    const o = m.fighters[1 - i];
    if (f.state !== "attack" || !f.move) continue;
    const mv = MOVES[f.move];
    for (let h = 0; h < mv.hits.length; h++) {
      let hb = mv.hits[h];
      if (f.hitDone[h] || f.mf < hb.from || f.mf > hb.to) continue;
      const d = distH(f.pos, o.pos);
      if (d > hb.range || Math.abs(o.pos.y - f.pos.y) > 1.8) continue;
      const dir = toTarget(f, o);
      if (d > 0.8 && Math.abs(angleDiff(yawOf(dir), f.yaw)) > 1.75) continue;
      // An ender only sends them flying if a round, or the brace, went off behind it.
      let mult = 1;
      if (mv.round || mv.nerve) {
        if (f.enderLive) mult = f.enderMult;
        else hb = dryEnder(hb);
      }
      if (applyHit(m, f, o, hb, dir, false, mult)) {
        f.hitDone[h] = true;
        f.moveHit = true;
      }
    }
  }
}

// ---------------------------------------------------------------- actions

function spawnProjectile(
  m: Match,
  f: Fighter,
  o: Fighter,
  kind: ProjKind,
  speed: number,
  life: number,
  radius: number,
  damage = 0,
): V3 {
  const from = centerOf(f);
  const aim = norm(sub(centerOf(o), from), dirOfYaw(f.yaw));
  const pos = add(from, scale(aim, 0.8));
  m.projectiles.push({ id: m.nextProjId++, kind, owner: f.id, pos, prev: clone(pos), vel: scale(aim, speed), life, radius, damage });
  return pos;
}

function fireBullet(m: Match, f: Fighter, o: Fighter, kind: ShotKind): void {
  const mult = spendRound(m, f) * (kind === "fan" ? C.FAN_DMG : 1);
  f.shotCd = C.SHOT_CD;
  f.shotPose = 14;
  const pos = spawnProjectile(m, f, o, "bullet", C.BULLET_SPEED, C.BULLET_LIFE, 0.3, C.BULLET_DMG * mult);
  f.meter = Math.min(C.METER, f.meter + 1);
  m.events.push({ type: "shot", owner: f.id, pos, kind });
}

function doJump(m: Match, f: Fighter, o: Fighter, forced = false): void {
  let vy = 0;
  let double = false;
  if (f.grounded) vy = kitOf(f).jumpV;
  else if (f.airJumps > 0 || forced) {
    if (!forced) f.airJumps--;
    vy = C.DJUMP_V;
    double = true;
  } else return;
  // Pursuit: rise to meet an opponent we knocked into the air.
  if (isFlying(o) && f.combo.hits > 0) {
    const apex = o.pos.y + (o.vel.y > 0 ? (o.vel.y * o.vel.y) / (2 * C.GRAVITY) : 0);
    const need = apex - f.pos.y - 0.2;
    if (need > 2.2) vy = clamp(Math.sqrt(2 * C.GRAVITY * need), vy, 36);
  }
  f.vel.y = vy;
  f.grounded = false;
  f.pos.y = Math.max(f.pos.y, 0.02);
  m.events.push({ type: "jump", id: f.id, pos: clone(f.pos), double });
}

function startChase(m: Match, f: Fighter): void {
  f.dashes--;
  setState(f, "chase");
  f.vel = v3();
  m.events.push({ type: "chase", id: f.id, pos: clone(f.pos) });
}

/** Dash button: a homing chase when there is distance, otherwise a short evasive step. Either spends a dash charge. */
function startDash(m: Match, f: Fighter, o: Fighter, inp: InputFrame): boolean {
  if (f.dashes <= 0) return false;
  const fwd = toTarget(f, o);
  const hasDir = Math.hypot(inp.mx, inp.my) > 0.4;
  const evasive = hasDir && (Math.abs(inp.mx) > 0.4 || inp.my < -0.4);
  const d = dist(f.pos, o.pos);
  if (!evasive && d > 3.2) {
    startChase(m, f);
    return true;
  }
  f.dashes--;
  let dir: V3;
  if (hasDir) {
    const right = rightOf(fwd);
    dir = normH(v3(fwd.x * inp.my + right.x * inp.mx, 0, fwd.z * inp.my + right.z * inp.mx), fwd);
  } else {
    dir = d < 3.2 ? scale(fwd, -1) : fwd;
  }
  setState(f, "step");
  f.stepDir = dir;
  f.invuln = Math.max(f.invuln, C.STEP_INVULN);
  f.vel = v3(dir.x * C.STEP_SPEED, 0, dir.z * C.STEP_SPEED);
  m.events.push({ type: "step", id: f.id, pos: clone(f.pos) });
  return true;
}

function startBurst(m: Match, f: Fighter): void {
  setState(f, "burst", C.AWAKEN_BURST_T);
  f.vel = v3();
  f.invuln = Math.max(f.invuln, C.AWAKEN_BURST_T);
  f.awakened = C.AWAKEN_T;
  f.awaken = 0;
  m.events.push({ type: "awaken", id: f.id, pos: centerOf(f) });
}

function trySlip(m: Match, f: Fighter, o: Fighter): boolean {
  if (f.pips <= 0 || !consume(f, "guard")) return false;
  f.pips--;
  if (kitOf(f).breaker === "catch") {
    // The hunter does not vanish. He catches the blow, and the attacker is the one left open.
    toFree(f);
    f.vel = v3();
    f.invuln = 14;
    f.yaw = yawOf(toTarget(f, o));
    if (dist(f.pos, o.pos) < 4.5 && canBeHit(o)) {
      const dir = toTarget(f, o);
      setState(o, "parried", C.CATCH_STUN);
      o.vel = v3(dir.x * 6, 0, dir.z * 6);
    }
    m.hitstop = Math.max(m.hitstop, 10);
    m.events.push({ type: "armCatch", id: f.id, pos: centerOf(f) });
    endCombo(m, o);
    return true;
  }
  setState(f, "slip");
  f.vel = v3();
  f.invuln = C.SLIP_T + 8;
  m.events.push({ type: "slipOut", id: f.id, pos: centerOf(f) });
  endCombo(m, o);
  return true;
}

function finishSlip(m: Match, f: Fighter, o: Fighter): void {
  const back = dirOfYaw(o.yaw);
  f.pos = v3(o.pos.x - back.x * C.SLIP_BEHIND, o.pos.y, o.pos.z - back.z * C.SLIP_BEHIND);
  f.grounded = f.pos.y <= 0.02;
  f.vel = v3();
  f.yaw = yawOf(toTarget(f, o));
  toFree(f);
  m.events.push({ type: "slipIn", id: f.id, pos: centerOf(f) });
}

/** The lasso connected. Either the target is dragged in, or the thrower zips out to it. */
function rope(m: Match, att: Fighter, def: Fighter): void {
  const dir = toTarget(att, def);
  att.combo.hits++;
  def.hitsTaken++;
  att.moveHit = true;
  if (att.zipFlag) {
    setState(att, "zip", 12);
    att.anchor = v3(def.pos.x - dir.x * 1.6, def.pos.y, def.pos.z - dir.z * 1.6);
    setState(def, "stagger", C.ZIP_STUN + 12);
    def.vel = v3();
    def.airHang = !def.grounded;
  } else {
    setState(def, "pulled", C.PULL_T);
    def.vel = v3();
    def.grounded = false;
    def.anchor = v3(att.pos.x + dir.x * 1.7, att.pos.y, att.pos.z + dir.z * 1.7);
  }
  m.hitstop = Math.max(m.hitstop, 5);
  m.events.push({ type: "lasso", owner: att.id, hit: true });
}

function startCine(m: Match, att: Fighter, def: Fighter): void {
  m.cine = { att: att.id, def: def.id, t: 0 };
  setState(att, "cine");
  setState(def, "cine");
  att.vel = v3();
  def.vel = v3();
  // The sequence plays at a set distance, so the target is drawn in to face the shooter.
  const dir = toTarget(att, def);
  const gap = clamp(distH(att.pos, def.pos), 7, 10);
  def.pos = v3(att.pos.x + dir.x * gap, att.pos.y, att.pos.z + dir.z * gap);
  const over = lenH(def.pos) - (C.ARENA_R - 1);
  if (over > 0) {
    const out = normH(def.pos, dir);
    for (const f of [att, def]) {
      f.pos.x -= out.x * over;
      f.pos.z -= out.z * over;
    }
  }
  def.grounded = att.grounded;
  att.yaw = yawOf(dir);
  def.yaw = yawOf(scale(dir, -1));
  m.projectiles = [];
  m.events.push({ type: "cineStart", att: att.id, def: def.id });
}

function stepCine(m: Match): void {
  const cine = m.cine!;
  const att = m.fighters[cine.att];
  const def = m.fighters[cine.def];
  cine.t++;
  const boost = att.awakened > 0 ? C.AWAKEN_DMG : 1;
  if ((C.CINE_HITS as readonly number[]).includes(cine.t)) {
    dealDamage(m, att, def, C.CINE_HIT_DMG * boost, false);
    att.combo.hits++;
    m.events.push({ type: "cineHit", att: att.id, def: def.id, pos: centerOf(def), final: false });
  }
  if (cine.t === C.CINE_FINAL_AT) {
    dealDamage(m, att, def, C.CINE_FINAL_DMG * boost);
    att.combo.hits++;
    m.events.push({ type: "cineHit", att: att.id, def: def.id, pos: centerOf(def), final: true });
  }
  if (cine.t >= C.CINE_END) {
    m.cine = null;
    toFree(att);
    // The Last Word is six shots: it leaves the cylinder empty.
    att.ammo = 0;
    att.reload = 0;
    startReload(m, att);
    const dir = toTarget(att, def);
    m.events.push({ type: "cineEnd", att: att.id, def: def.id });
    if (def.hp <= 0) defeat(m, def, dir);
    else setBlasted(def, dir);
  }
}

// ---------------------------------------------------------------- the standoff

/** Both fighters freeze, hands over their holsters, and wait for the bell. */
function startStandoff(m: Match, opening: boolean): void {
  const [a, b] = m.fighters;
  m.standoff = {
    t: 0,
    bellAt: m.rng.int(C.STANDOFF_WAIT_MIN, C.STANDOFF_WAIT_MAX),
    lock: [0, 0],
    opening,
  };
  endCombo(m, a);
  endCombo(m, b);
  for (const f of m.fighters) {
    setState(f, "standoff");
    f.vel = v3();
    for (const btn of BUTTONS) f.buf[btn] = 0;
  }
  a.yaw = yawOf(toTarget(a, b));
  b.yaw = yawOf(toTarget(b, a));
  m.projectiles = [];
  m.events.push({ type: "standoffStart", opening });
}

function stepStandoff(m: Match, inputs: [InputFrame, InputFrame]): void {
  const s = m.standoff!;
  s.t++;
  if (s.t === s.bellAt) m.events.push({ type: "standoffBell" });

  const drew = [false, false];
  for (let i = 0; i < 2; i++) {
    const f = m.fighters[i];
    if (!inputs[i].shot || f.prev.shot) continue;
    if (s.t < s.bellAt) {
      // Too soon. The hand twitches, and it costs you the first instant after the bell.
      if (s.lock[i] === 0) {
        s.lock[i] = s.bellAt + C.FLINCH_LOCK;
        m.events.push({ type: "standoffFlinch", id: i });
      }
    } else if (s.t >= s.lock[i]) drew[i] = true;
  }

  if (!drew[0] && !drew[1] && s.t < s.bellAt + C.STANDOFF_WINDOW) return;
  // It is over one way or another. The draw itself must not also come out as an ordinary shot.
  for (const f of m.fighters) f.buf.shot = 0;

  if (!drew[0] && !drew[1]) {
    m.standoff = null;
    m.standoffCd = C.STANDOFF_CD;
    for (const f of m.fighters) toFree(f);
    m.events.push({ type: "standoffEnd", winner: -1, trade: false });
    return;
  }

  m.standoff = null;
  m.standoffCd = C.STANDOFF_CD;
  if (drew[0] && drew[1]) {
    // Both shots on the same instant: the bullets meet and nobody is hit.
    for (const f of m.fighters) {
      const o = m.fighters[1 - f.id];
      const dir = toTarget(f, o);
      f.shotPose = 20;
      m.events.push({ type: "shot", owner: f.id, pos: add(centerOf(f), scale(dir, 0.8)), kind: "quick" });
      setState(f, "parried", 30);
      f.vel = v3(-dir.x * 5, 0, -dir.z * 5);
    }
    m.hitstop = 10;
    m.events.push({ type: "standoffEnd", winner: -1, trade: true });
    return;
  }

  const w = m.fighters[drew[0] ? 0 : 1];
  const l = m.fighters[1 - w.id];
  const dir = toTarget(w, l);
  toFree(w);
  w.shotPose = 22;
  w.meter = Math.min(C.METER, w.meter + C.STANDOFF_NERVE);
  if (w.ammo > 0 && w.reload === 0) spendRound(m, w);
  m.events.push({ type: "shot", owner: w.id, pos: add(centerOf(w), scale(dir, 0.8)), kind: "quick" });
  // The shot that opens a duel wounds; it never ends it.
  const dealt = dealDamage(m, w, l, C.STANDOFF_DMG, !s.opening);
  w.combo.hits++;
  l.hitsTaken++;
  m.hitstop = 12;
  m.events.push({ type: "hit", att: w.id, def: l.id, pos: centerOf(l), strength: 3, effect: "blast", damage: dealt, blocked: false, perfect: false, projectile: true });
  m.events.push({ type: "standoffEnd", winner: w.id, trade: false });
  if (l.hp <= 0) defeat(m, l, dir);
  else setBlasted(l, dir, 0.75);
}

// ---------------------------------------------------------------- per-state logic

function handleShot(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  if (f.buf.shot > 0 && f.reload === 0 && f.ammo > 0 && f.shotCd <= 0) {
    f.buf.shot = 0;
    fireBullet(m, f, o, "bullet");
  }
  if (!inp.shot) {
    f.shotHold = 0;
    return;
  }
  // Keep the trigger held and the other hand comes across to fan the hammer.
  f.shotHold++;
  if (f.shotHold >= C.FAN_HOLD && f.ammo >= 2 && f.reload === 0) startMove(f, o, "fan");
}

function freeLogic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  const fwd = toTarget(f, o);
  f.yaw = yawOf(fwd);

  if (f.awaken >= 100 && f.awakened === 0 && consume(f, "awaken")) return startBurst(m, f);
  if (f.meter >= C.METER && consume(f, "ult")) {
    f.meter = 0;
    startMove(f, o, "lastWord");
    m.events.push({ type: "ultStart", id: f.id, pos: centerOf(f) });
    return;
  }
  if (f.meter >= C.LARIAT_COST && consume(f, "special")) {
    f.meter -= C.LARIAT_COST;
    f.zipFlag = inp.tilt < -0.5;
    startMove(f, o, "lariat");
    return;
  }
  if (inp.guard) {
    f.buf.guard = 0;
    setState(f, "guard");
    f.guardT = 0;
    stopH(f);
    return;
  }
  if (consume(f, "dash") && startDash(m, f, o, inp)) return;
  if (consume(f, "strike")) return startMove(f, o, kitOf(f).string[0]);
  if (inp.steady && f.grounded) {
    setState(f, "steady");
    stopH(f);
    return;
  }
  handleShot(m, f, o, inp);
  if (f.state !== "free") return;
  if (consume(f, "jump")) doJump(m, f, o);

  let mx = inp.mx;
  let my = inp.my;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  const k = kitOf(f);
  const speed = f.grounded ? k.run : k.airRun;
  const right = rightOf(fwd);
  f.vel.x = (fwd.x * my + right.x * mx) * speed;
  f.vel.z = (fwd.z * my + right.z * mx) * speed;
}

/** Holstered and still. Nerve builds, rounds slide home, and the quickdraw arms. */
function steadyLogic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  stopH(f);
  f.yaw = yawOf(toTarget(f, o));
  if (f.t >= C.STEADY_STARTUP) {
    f.meter = Math.min(C.METER, f.meter + C.NERVE_RATE * (f.awakened > 0 ? 1.5 : 1));
  }
  if (f.reload === 0 && f.ammo < C.AMMO && f.t % C.STEADY_CHAMBER === 0) {
    f.ammo++;
    m.events.push({ type: "chamber", id: f.id });
  }
  if (f.buf.shot > 0 && f.reload === 0 && f.ammo > 0) {
    if (f.t >= C.QUICK_MIN) {
      f.buf.shot = 0;
      f.quickPower = clamp((f.t - C.QUICK_MIN) / (C.QUICK_FULL - C.QUICK_MIN), 0, 1);
      return startMove(f, o, "quickdraw");
    }
    // Not settled yet: it comes out as an ordinary shot.
    return toFree(f);
  }
  if (inp.guard) {
    f.buf.guard = 0;
    setState(f, "guard");
    f.guardT = 0;
  } else if (f.buf.dash > 0) {
    f.buf.dash = 0;
    toFree(f);
    startDash(m, f, o, inp);
  } else if (consume(f, "strike")) startMove(f, o, kitOf(f).string[0]);
  else if (!inp.steady) toFree(f);
}

function fanLogic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  f.mf++;
  stopH(f);
  f.yaw = yawOf(toTarget(f, o));
  if (!f.grounded) f.vel.y = clamp(f.vel.y, -1.5, 3);
  // `dur` is zero while firing and becomes the end frame once the burst is over.
  if (f.dur > 0) {
    if (f.mf >= f.dur) toFree(f);
    return;
  }
  if (f.mf >= 3 && (f.mf - 3) % C.FAN_GAP === 0 && f.ammo > 0 && f.reload === 0) fireBullet(m, f, o, "fan");
  if (f.ammo === 0 || f.reload > 0 || (!inp.shot && f.mf >= 8)) f.dur = f.mf + C.FAN_RECOVER;
}

function attackLogic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  if (f.move === "fan") return fanLogic(m, f, o, inp);
  const mv = MOVES[f.move!];
  f.mf++;

  stopH(f);
  if (mv.lunge && f.mf >= mv.lunge.from && f.mf <= mv.lunge.to) {
    const to = sub(o.pos, f.pos);
    const dh = lenH(to);
    const maxStep = mv.lunge.speed * C.DT;
    if (dh < 7) {
      const dir = normH(to, dirOfYaw(f.yaw));
      const stepLen = Math.min(maxStep, Math.max(0, dh - 1.35));
      f.pos.x += dir.x * stepLen;
      f.pos.z += dir.z * stepLen;
      f.yaw = yawOf(dir);
      // In the air, track the target's height too so strings stay connected.
      if (!f.grounded) f.pos.y = Math.max(0, f.pos.y + clamp(o.pos.y - f.pos.y, -maxStep, maxStep));
    } else {
      const dir = dirOfYaw(f.yaw);
      f.pos.x += dir.x * maxStep * 0.5;
      f.pos.z += dir.z * maxStep * 0.5;
    }
  }
  if (!f.grounded) f.vel.y = clamp(f.vel.y, -1.5, 3);

  // An ender pulls the trigger as it lands. No round, no blast.
  if (mv.round && f.mf === mv.hits[0].from) {
    const pos = add(centerOf(f), scale(dirOfYaw(f.yaw), 0.9));
    if (f.ammo > 0 && f.reload === 0) {
      f.enderMult = spendRound(m, f);
      f.enderLive = true;
      m.events.push({ type: "enderShot", id: f.id, pos, dir: dirOfYaw(f.yaw) });
    } else {
      f.enderLive = false;
      m.events.push({ type: "dryFire", id: f.id, pos });
    }
  }
  // The hunter's ender discharges the brace. No Nerve, no blast.
  if (mv.nerve && f.mf === mv.hits[0].from) {
    f.enderLive = f.meter >= mv.nerve;
    f.enderMult = 1;
    if (f.enderLive) {
      f.meter -= mv.nerve;
      m.events.push({ type: "armBlast", id: f.id, pos: add(centerOf(f), scale(dirOfYaw(f.yaw), 1.1)), dir: dirOfYaw(f.yaw), big: false });
    }
  }
  if (f.move === "thunderclap" && f.mf === mv.hits[0].from) {
    m.events.push({ type: "armBlast", id: f.id, pos: add(centerOf(f), scale(dirOfYaw(f.yaw), 1.3)), dir: dirOfYaw(f.yaw), big: true });
  }

  if (mv.fireAt === f.mf) {
    if (f.move === "quickdraw") {
      const mult = spendRound(m, f);
      const dmg = (C.QUICK_DMG_MIN + (C.QUICK_DMG_MAX - C.QUICK_DMG_MIN) * f.quickPower) * mult;
      const pos = spawnProjectile(m, f, o, "quick", C.QUICK_SPEED, C.QUICK_LIFE, 0.5, dmg);
      f.shotPose = 20;
      m.events.push({ type: "shot", owner: f.id, pos, kind: "quick" });
    } else if (f.move === "lariat") spawnProjectile(m, f, o, "lasso", C.LASSO_SPEED, C.LASSO_LIFE, 0.5);
    else if (f.move === "lastWord") spawnProjectile(m, f, o, "ult", C.ULT_SPEED, C.ULT_LIFE, 0.9);
  }

  const canCancel = f.mf >= (f.moveHit ? mv.cancelHit : mv.cancelWhiff);
  if (canCancel) {
    if (mv.next && consume(f, "strike")) {
      const e = kitOf(f).enders;
      const nextId: MoveId = mv.next === "ender" ? (inp.tilt > 0.5 ? e.launch : inp.tilt < -0.5 ? e.slam : e.blast) : mv.next;
      return startMove(f, o, nextId);
    }
    if (f.moveHit) {
      if (mv.jumpCancel && consume(f, "jump")) {
        toFree(f);
        return doJump(m, f, o, true);
      }
      if (f.meter >= C.METER && consume(f, "ult")) {
        f.meter = 0;
        startMove(f, o, "lastWord");
        m.events.push({ type: "ultStart", id: f.id, pos: centerOf(f) });
        return;
      }
      if (f.move !== "lariat" && f.meter >= C.LARIAT_COST && consume(f, "special")) {
        f.meter -= C.LARIAT_COST;
        f.zipFlag = inp.tilt < -0.5;
        return startMove(f, o, "lariat");
      }
      if (f.buf.dash > 0) {
        const move = f.move;
        f.buf.dash = 0;
        toFree(f);
        if (startDash(m, f, o, inp)) return;
        // No Nerve and step on cooldown: stay in the move.
        setState(f, "attack");
        f.move = move;
      }
      if (f.move === "lariat" && consume(f, "strike")) return startMove(f, o, kitOf(f).string[0]);
    }
  }
  if (f.mf >= mv.total) toFree(f);
}

function chaseLogic(m: Match, f: Fighter, o: Fighter): void {
  const k = kitOf(f);
  const d3 = sub(o.pos, f.pos);
  let L = len(d3);
  if (L > C.CHASE_STOP) {
    const stepLen = Math.min(k.chaseSpeed * C.DT, L - C.CHASE_STOP);
    const dir = scale(d3, 1 / L);
    f.pos = add(f.pos, scale(dir, stepLen));
    f.pos.y = Math.max(0, f.pos.y);
    f.grounded = f.pos.y <= 0.02;
    f.yaw = yawOf(normH(d3, dirOfYaw(f.yaw)));
    L -= stepLen;
  }
  const arrived = L <= C.CHASE_STOP + 0.2;
  if (!arrived && f.t < k.chaseFrames) return;
  if (arrived && isFlying(o)) {
    // Catching an opponent mid-flight holds them in place for a follow-up.
    if (f.combo.hits > 0 && f.combo.chases < k.maxChases) {
      f.combo.chases++;
      setState(o, "hitstun", 32);
      o.vel = v3();
      o.airHang = o.pos.y > 0.05;
      m.events.push({ type: "chaseCatch", id: f.id, pos: centerOf(o) });
    }
  } else if (arrived && k.tackle) {
    // The hunter's dash is a shoulder charge: it hits whoever it reaches.
    applyHit(m, f, o, TACKLE, toTarget(f, o), false);
    if (f.state !== "chase") return;
  }
  toFree(f);
  f.vel = v3();
}

function stunLogic(m: Match, f: Fighter, o: Fighter): void {
  if (trySlip(m, f, o)) return;
  switch (f.state) {
    case "hitstun":
    case "stagger":
      if (f.grounded) {
        f.vel.x *= 0.82;
        f.vel.z *= 0.82;
      }
      if (f.t >= f.dur) toFree(f);
      break;
    case "launched":
      if (f.grounded && f.t > 3) knockDown(m, f, false);
      break;
    case "blasted": {
      const sp = lenH(f.vel);
      const ns = Math.max(0, sp - C.BLAST_DECEL * C.DT);
      if (sp > 1e-3) {
        f.vel.x *= ns / sp;
        f.vel.z *= ns / sp;
      }
      if (ns < 6 || f.t >= f.dur) {
        if (f.grounded) knockDown(m, f, false);
        else setState(f, "launched");
      }
      break;
    }
    case "slammed":
      if (f.grounded) {
        m.events.push({ type: "groundSlam", id: f.id, pos: clone(f.pos) });
        dealDamage(m, o, f, 20, false);
        setState(f, "bounced");
        f.vel = v3(f.vel.x * 0.3, C.BOUNCE_V, f.vel.z * 0.3);
        f.grounded = false;
        f.pos.y = 0.05;
      }
      break;
    case "bounced":
      if (f.grounded && f.t > 6) knockDown(m, f, true);
      break;
    case "pulled": {
      const left = Math.max(1, f.dur - f.t + 1);
      f.pos = add(f.pos, scale(sub(f.anchor, f.pos), 1 / left));
      f.pos.y = Math.max(0, f.pos.y);
      if (f.t >= f.dur) {
        const air = f.pos.y > 0.3;
        setState(f, "stagger", C.PULL_STUN);
        f.vel = v3();
        f.airHang = air;
        f.grounded = !air;
      }
      break;
    }
  }
}

function guardLogic(f: Fighter, o: Fighter, inp: InputFrame): void {
  const k = kitOf(f);
  const fwd = toTarget(f, o);
  f.guardT++;
  f.yaw = yawOf(fwd);
  if (!f.grounded) {
    f.vel.x *= 0.9;
    f.vel.z *= 0.9;
  } else if (k.guardWalk > 0) {
    // The hunter advances behind the brace.
    let mx = inp.mx;
    let my = inp.my;
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    const right = rightOf(fwd);
    const speed = k.run * k.guardWalk;
    f.vel.x = (fwd.x * my + right.x * mx) * speed;
    f.vel.z = (fwd.z * my + right.z * mx) * speed;
  } else stopH(f);
  // Strike from behind the brace is the thunderclap.
  if (k.thunderclap && f.meter >= C.CLAP_COST && consume(f, "strike")) {
    f.meter -= C.CLAP_COST;
    return startMove(f, o, "thunderclap");
  }
  if (!inp.guard && f.t >= 4) toFree(f);
}

function knockDown(m: Match, f: Fighter, quiet: boolean): void {
  setState(f, "knockdown", C.KNOCKDOWN_T);
  if (!quiet) m.events.push({ type: "land", id: f.id, pos: clone(f.pos), hard: true });
}

function logic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  f.t++;
  if (f.invuln > 0) f.invuln--;
  if (f.shotCd > 0) f.shotCd--;
  if (f.shotPose > 0) f.shotPose--;
  workReload(m, f);

  switch (f.state) {
    case "free":
      freeLogic(m, f, o, inp);
      break;
    case "attack":
      attackLogic(m, f, o, inp);
      break;
    case "steady":
      steadyLogic(m, f, o, inp);
      break;
    case "step":
      if (f.t >= C.STEP_T) {
        toFree(f);
        stopH(f);
      }
      break;
    case "chase":
      chaseLogic(m, f, o);
      break;
    case "guard":
      guardLogic(f, o, inp);
      break;
    case "blockstun":
      f.vel.x *= 0.8;
      f.vel.z *= 0.8;
      if (f.t >= f.dur) {
        if (inp.guard) {
          setState(f, "guard");
          f.guardT = C.PERFECT_WINDOW + 1;
        } else toFree(f);
      }
      break;
    case "parried":
      f.vel.x *= 0.85;
      f.vel.z *= 0.85;
      if (f.t >= f.dur) toFree(f);
      break;
    case "slip":
      if (f.t >= C.SLIP_T) finishSlip(m, f, o);
      break;
    case "zip": {
      const left = Math.max(1, f.dur - f.t + 1);
      f.pos = add(f.pos, scale(sub(f.anchor, f.pos), 1 / left));
      f.pos.y = Math.max(0, f.pos.y);
      f.grounded = f.pos.y <= 0.02;
      if (f.t >= f.dur) {
        toFree(f);
        f.vel = v3();
      }
      break;
    }
    case "burst":
      if (f.t === 6 && dist(f.pos, o.pos) <= 7 && canBeHit(o)) {
        setBlasted(o, toTarget(f, o), 0.6);
        endCombo(m, o);
      }
      if (f.t >= f.dur) toFree(f);
      break;
    case "knockdown":
      f.vel.x *= 0.88;
      f.vel.z *= 0.88;
      if (f.t >= f.dur || (f.t >= C.QUICK_RISE_AT && (consume(f, "jump") || consume(f, "guard")))) {
        setState(f, "getup", C.GETUP_T);
        stopH(f);
      }
      break;
    case "getup":
      if (f.t >= f.dur) {
        toFree(f);
        f.invuln = Math.max(f.invuln, 12);
      }
      break;
    case "ko":
    case "downed":
    case "tied":
      if (f.grounded) {
        f.vel.x *= 0.88;
        f.vel.z *= 0.88;
      }
      break;
    case "standoff":
    case "cine":
      break;
    default:
      stunLogic(m, f, o);
  }

  for (const b of BUTTONS) if (f.buf[b] > 0) f.buf[b]--;
}

function gravityScale(f: Fighter): number {
  switch (f.state) {
    case "attack":
      return 0.15;
    case "hitstun":
    case "stagger":
      return f.airHang ? 0.3 : 1;
    case "guard":
    case "blockstun":
      return 0.5;
    case "chase":
    case "step":
    case "pulled":
    case "zip":
    case "burst":
    case "slip":
    case "standoff":
    case "cine":
      return 0;
    case "blasted":
      return f.t < 24 ? 0.2 : 1;
    default:
      return 1;
  }
}

function physics(m: Match, f: Fighter): void {
  if (f.state === "slip" || f.state === "cine" || f.state === "standoff") return;
  const dt = C.DT * f.timeScale;
  if (f.grounded && f.vel.y > 0.01) f.grounded = false;
  const gs = gravityScale(f);
  if (!f.grounded) {
    if (gs === 0) f.vel.y = 0;
    else f.vel.y -= C.GRAVITY * gs * dt;
  }
  f.pos.x += f.vel.x * dt;
  f.pos.y += f.vel.y * dt;
  f.pos.z += f.vel.z * dt;
  if (f.pos.y <= 0) {
    f.pos.y = 0;
    if (!f.grounded && f.vel.y <= 0) {
      const hard = f.vel.y < -22;
      f.grounded = true;
      f.airJumps = kitOf(f).airJumps;
      if (f.state === "free" || f.state === "attack" || f.state === "guard") {
        m.events.push({ type: "land", id: f.id, pos: clone(f.pos), hard });
      }
    }
    if (f.vel.y < 0) f.vel.y = 0;
  }
}

// ---------------------------------------------------------------- world

function updateProjectiles(m: Match): void {
  const keep: Projectile[] = [];
  for (const p of m.projectiles) {
    assign(p.prev, p.pos);
    p.pos = add(p.pos, scale(p.vel, C.DT));
    p.life--;
    const att = m.fighters[p.owner];
    const def = m.fighters[1 - p.owner];
    let alive = p.life > 0 && lenH(p.pos) < C.ARENA_R + 20 && p.pos.y > -0.5;

    if (alive && canBeHit(def) && segPointDist(p.prev, p.pos, centerOf(def)) <= p.radius + 0.7) {
      const dir = normH(p.vel, dirOfYaw(att.yaw));
      if (p.kind === "bullet" || p.kind === "quick") {
        if (kitOf(def).deflect && def.state === "guard" && def.guardT <= C.PERFECT_WINDOW) {
          // Caught on the brace at the perfect moment: the shot goes back where it came from.
          const speed = len(p.vel);
          p.owner = def.id;
          p.vel = scale(norm(sub(centerOf(att), p.pos), scale(dir, -1)), speed);
          p.life = C.BULLET_LIFE;
          assign(p.prev, p.pos);
          def.meter = Math.min(C.METER, def.meter + 8);
          m.hitstop = Math.max(m.hitstop, 6);
          m.events.push({ type: "deflect", id: def.id, pos: clone(p.pos), back: true });
        } else if (applyHit(m, att, def, { ...PROJ_HITS[p.kind], damage: p.damage }, dir, true)) alive = false;
      } else if (p.kind === "lasso") {
        rope(m, att, def);
        alive = false;
      } else if (p.kind === "ult") {
        alive = false;
        if (def.state === "guard" || def.state === "blockstun") {
          dealDamage(m, att, def, 40, false);
          def.guardHp = C.GUARD_HP * 0.5;
          setState(def, "stagger", C.GUARD_BREAK_STUN);
          def.vel = v3(dir.x * 6, 0, dir.z * 6);
          m.hitstop = Math.max(m.hitstop, 12);
          m.events.push({ type: "guardBreak", id: def.id, pos: centerOf(def) });
        } else {
          startCine(m, att, def);
          return;
        }
      }
    }

    if (alive && p.kind !== "lasso") {
      for (let i = 0; i < m.props.length; i++) {
        const prop = m.props[i];
        if (prop.broken || p.pos.y > prop.height) continue;
        if (segPointDist(p.prev, p.pos, v3(prop.pos.x, p.pos.y, prop.pos.z)) > prop.radius + p.radius) continue;
        // A bullet stops in what it hits. A quickdraw or the Last Word goes straight through.
        prop.hp -= p.kind === "bullet" ? 1 : 10;
        if (prop.hp <= 0) {
          prop.broken = true;
          m.events.push({ type: "propBreak", index: i, pos: clone(prop.pos), dir: norm(p.vel, v3(0, 0, 1)) });
        }
        if (p.kind === "bullet") alive = false;
        break;
      }
    }

    if (!alive && p.kind === "lasso" && att.state === "attack" && !att.moveHit) {
      m.events.push({ type: "lasso", owner: p.owner, hit: false });
    }
    if (alive) keep.push(p);
    if (m.phase !== "fight") break;
  }
  m.projectiles = m.phase === "fight" ? keep : [];
}

function collideWorld(m: Match): void {
  const [a, b] = m.fighters;
  // Fighters push each other apart unless one is passing through.
  if (!NO_PUSH.has(a.state) && !NO_PUSH.has(b.state) && Math.abs(a.pos.y - b.pos.y) < 1.6) {
    const d = distH(a.pos, b.pos);
    const min = C.BODY_R * 2;
    if (d < min) {
      const dir = normH(sub(b.pos, a.pos), dirOfYaw(a.yaw));
      const push = (min - d) / 2;
      a.pos.x -= dir.x * push;
      a.pos.z -= dir.z * push;
      b.pos.x += dir.x * push;
      b.pos.z += dir.z * push;
    }
  }

  for (const f of m.fighters) {
    const o = m.fighters[1 - f.id];
    const smashing = (f.state === "blasted" || f.state === "ko") && lenH(f.vel) > 8;
    const passing = smashing || f.state === "chase";
    for (let i = 0; i < m.props.length; i++) {
      const prop = m.props[i];
      if (prop.broken || f.pos.y > prop.height - 0.2) continue;
      const d = distH(f.pos, prop.pos);
      const min = C.BODY_R + prop.radius;
      if (d >= min) continue;
      if (passing) {
        prop.broken = true;
        const dir = smashing ? normH(f.vel, dirOfYaw(f.yaw)) : dirOfYaw(f.yaw);
        m.events.push({ type: "propBreak", index: i, pos: clone(prop.pos), dir });
        if (smashing) {
          f.vel.x *= 0.88;
          f.vel.z *= 0.88;
          if (f.state === "blasted") dealDamage(m, o, f, 10, false);
        }
      } else if (f.state !== "slip" && f.state !== "cine") {
        const dir = normH(sub(f.pos, prop.pos), dirOfYaw(f.yaw + Math.PI));
        f.pos.x = prop.pos.x + dir.x * min;
        f.pos.z = prop.pos.z + dir.z * min;
      }
    }

    const r = lenH(f.pos);
    if (r > C.ARENA_R) {
      f.pos.x *= C.ARENA_R / r;
      f.pos.z *= C.ARENA_R / r;
      if (f.state === "blasted") {
        stopH(f);
        setState(f, "launched");
        m.events.push({ type: "wallHit", id: f.id, pos: centerOf(f) });
      }
    }
  }
}

function upkeep(m: Match): void {
  for (const f of m.fighters) {
    const o = m.fighters[1 - f.id];
    const k = kitOf(f);
    if (f.pips < k.pips) {
      f.pipTimer += f.awakened > 0 ? 2 : 1;
      if (f.pipTimer >= C.PIP_REGEN) {
        f.pips++;
        f.pipTimer = 0;
      }
    }
    // Dashes come back one at a time. Running dry is a real cost.
    if (f.dashes < k.dashes) {
      f.dashTimer += f.awakened > 0 ? 2 : 1;
      if (f.dashTimer >= k.dashRegen) {
        f.dashes++;
        f.dashTimer = 0;
      }
    }
    if (f.state !== "guard" && f.state !== "blockstun") {
      f.guardHp = Math.min(C.GUARD_HP, f.guardHp + C.GUARD_REGEN);
    }
    if (f.reload > 0) {
      f.reload--;
      f.reloadT++;
      if (f.reload === 0) {
        f.ammo = C.AMMO;
        m.events.push({ type: "reloadEnd", id: f.id, perfect: false });
      }
    }
    if (f.awakened > 0) {
      f.awakened--;
      if (f.awakened === 0) m.events.push({ type: "awakenEnd", id: f.id });
    }
    if (f.combo.hits > 0 && !isStunned(o) && o.state !== "cine") {
      endCombo(m, f);
      if (m.opts.training && o.id === 1 && m.phase === "fight") o.hp = o.maxHp;
    }
    if (m.opts.training && f.id === 0) {
      f.meter = Math.min(C.METER, f.meter + 0.6);
      f.awaken = Math.min(100, f.awaken + 0.15);
    }
  }

  // Two gunfighters who both stop and hold steady have agreed to a standoff.
  if (m.standoffCd > 0) m.standoffCd--;
  const [a, b] = m.fighters;
  if (
    m.phase === "fight" &&
    !m.standoff &&
    m.standoffCd === 0 &&
    a.state === "steady" &&
    b.state === "steady" &&
    a.t >= C.STANDOFF_MUTUAL &&
    b.t >= C.STANDOFF_MUTUAL
  ) {
    startStandoff(m, false);
  }
}

function rememberInputs(m: Match, inputs: [InputFrame, InputFrame]): void {
  for (let i = 0; i < 2; i++) m.fighters[i].prev = { ...inputs[i] };
}

// ---------------------------------------------------------------- step

/** Advances the match by one tick (1/60 s) and returns what happened. */
export function stepMatch(m: Match, inputs: [InputFrame, InputFrame]): SimEvent[] {
  m.events = [];
  if (m.phase === "done") return m.events;
  m.tick++;

  // Presses are buffered every tick, so one made during a freeze still comes out afterward.
  for (let i = 0; i < 2; i++) {
    const f = m.fighters[i];
    for (const b of BUTTONS) if (inputs[i][b] && !f.prev[b]) f.buf[b] = C.BUFFER;
  }

  if (m.phase === "intro") {
    m.phaseT++;
    for (const f of m.fighters) for (const b of BUTTONS) f.buf[b] = 0;
    if (m.phaseT >= C.INTRO_T) {
      m.phase = "fight";
      m.phaseT = 0;
      m.events.push({ type: "phase", phase: "fight" });
      if (m.opts.opening && !m.opts.training) startStandoff(m, true);
    }
    rememberInputs(m, inputs);
    return m.events;
  }

  if (m.hitstop > 0) {
    m.hitstop--;
    rememberInputs(m, inputs);
    return m.events;
  }

  if (m.cine) {
    stepCine(m);
    rememberInputs(m, inputs);
    return m.events;
  }
  if (m.standoff) {
    stepStandoff(m, inputs);
    rememberInputs(m, inputs);
    return m.events;
  }

  const blank = blankInput();
  if (m.phase === "verdict") {
    stepVerdict(m, inputs);
    for (const f of m.fighters) {
      f.timeScale = 1;
      physics(m, f);
    }
    collideWorld(m);
    rememberInputs(m, inputs);
    return m.events;
  }

  const order = m.tick & 1 ? [0, 1] : [1, 0];
  for (const i of order) {
    const f = m.fighters[i];
    const o = m.fighters[1 - i];
    const inp = m.phase === "fight" ? inputs[i] : blank;
    // An awakened opponent slows this fighter: motion is scaled and logic skips ticks.
    f.timeScale = o.awakened > 0 && f.awakened === 0 ? C.AWAKEN_SLOW : 1;
    f.slowAcc += f.timeScale;
    if (f.slowAcc >= 0.999) {
      f.slowAcc -= 1;
      logic(m, f, o, inp);
    }
    physics(m, f);
  }

  if (m.phase === "fight") {
    updateProjectiles(m);
    if (m.phase === "fight" && !m.cine) resolveStrikes(m);
  }
  collideWorld(m);
  upkeep(m);

  if (m.phase === "ko") {
    m.phaseT++;
    if (m.phaseT >= C.KO_T) {
      m.phase = "done";
      m.events.push({ type: "phase", phase: "done" });
    }
  }

  rememberInputs(m, inputs);
  return m.events;
}
