import { KITS, type Kit, type KitId } from "./kits";
import { BOLT_HIT, C, CHAIN_HIT, dryEnder, MOVES, PROJ_HITS, TACKLE, ULT_GRAZE, ZONES, type HitBox } from "./moves";
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
  type Rank,
  type ShotKind,
  type SimEvent,
  STATUSES,
  type StatusId,
  type Turret,
  type Zone,
  type ZoneKind,
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

// The whole fight as a pure step function: state + one input per fighter -> next state + events.
// Nothing here touches the browser, so the same code runs in tests and can run on a server.
//
// There are two kinds of fight. A duel is the arena: two fighters and one formal finish.
// The overworld is open country: one hero, gangs camped about, and a fight wherever they meet.
// A gang's crew is rabble, fought as a crowd. Its leader is a duel, called out on the spot.

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
/** Still in the fight: on their feet, or able to get back to them. */
export const isUp = (f: Fighter): boolean => f.hp > 0 && f.state !== "ko" && f.state !== "downed" && f.state !== "tied";
/** The fighter this one is facing, or null when there is nobody. */
export const targetOf = (m: Match, f: Fighter): Fighter | null => (f.target >= 0 ? m.fighters[f.target] : null);

/**
 * A stand-in for nobody: a point a few strides ahead of a fighter with no target,
 * so every move still has somewhere to aim. It cannot be hit and belongs to no side.
 */
function ahead(f: Fighter): Fighter {
  const d = dirOfYaw(f.yaw);
  return {
    ...f,
    id: -1,
    team: -1,
    pos: v3(f.pos.x + d.x * C.AIM_AHEAD, f.pos.y, f.pos.z + d.z * C.AIM_AHEAD),
    vel: v3(),
    state: "free",
    move: null,
    invuln: 1 << 20,
    awakened: 0,
    status: { poison: 0, shock: 0, hex: 0 },
    combo: { hits: 0, damage: 0, chases: 0, launches: 0 },
  };
}

const foe = (m: Match, f: Fighter): Fighter => targetOf(m, f) ?? ahead(f);
/** Whoever hit this fighter last. Escapes, and the blame for what follows a hit, go to them. */
const blameOf = (m: Match, f: Fighter): Fighter | null => (f.lastHitBy >= 0 ? m.fighters[f.lastHitBy] : targetOf(m, f));

function createFighter(id: number, name: string, kit: KitId, pos: V3, yaw: number, rank: Rank, team: number, gang = -1): Fighter {
  const buf = {} as Record<Button, number>;
  for (const b of BUTTONS) buf[b] = 0;
  const k = KITS[kit];
  return {
    id,
    name,
    kit,
    rank,
    team,
    gang,
    // A gang stands at its camp until trouble comes to it.
    awake: gang < 0,
    home: clone(pos),
    target: -1,
    lastHitBy: -1,
    turn: 0,
    waited: 0,
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
    status: { poison: 0, shock: 0, hex: 0 },
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
    hitIds: [],
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
  const roam = m.opts.mode === "roam";
  const want = roam ? 70 : 30;
  const tries = roam ? 2400 : 600;
  const far = roam ? m.radius - 8 : 62;
  let guard = 0;
  while (props.length < want && guard++ < tries) {
    const kind = kinds[m.rng.int(0, kinds.length - 1)];
    const spec = PROP_SPECS[kind];
    const r = m.rng.range(9, far);
    const a = m.rng.range(0, Math.PI * 2);
    const pos = v3(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Keep the opening sightline between the two fighters clear.
    if (!roam && Math.abs(pos.x) < 4 && Math.abs(pos.z) < 14) continue;
    // A camp stays clear, so a gang has room to fight.
    if (roam && m.fighters.some((f) => f.rank === "named" && distH(f.home, pos) < 12)) continue;
    if (props.some((p) => distH(p.pos, pos) < p.radius + spec.radius + 2.5)) continue;
    props.push({ kind, pos, radius: spec.radius, height: spec.height, hp: spec.hp, broken: false });
  }
  return props;
}

const LEADER_NAMES: Record<KitId, string> = {
  outlaw: "Red Marrow",
  witch: "Widow Sable",
  engineer: "Tinker Voss",
  hunter: "Marshal Pike",
  thug: "Thug",
  gunhand: "Gunhand",
};

/** The overworld: the hero in the middle of open country, and gangs camped around them. */
function populate(m: Match): void {
  const heroKit = m.opts.kits[0];
  const hero = createFighter(0, "Hero", heroKit, v3(), 0, "hero", 0);
  m.fighters.push(hero);
  // Each gang is led by a class the hero is not, starting with the outlaw.
  const leaders = (["outlaw", "witch", "engineer", "hunter"] as KitId[]).filter((k) => k !== heroKit);
  const turn = m.rng.range(0, Math.PI * 2);
  for (let g = 0; g < m.opts.gangs; g++) {
    const a = turn + (g * Math.PI * 2) / m.opts.gangs;
    const home = v3(Math.sin(a) * C.CAMP_R, 0, Math.cos(a) * C.CAMP_R);
    const inward = normH(scale(home, -1), v3(0, 0, 1));
    const side = rightOf(inward);
    const face = yawOf(inward);
    const kit = leaders[g % leaders.length];
    const boss = createFighter(m.fighters.length, LEADER_NAMES[kit], kit, home, face, "named", 1, g);
    boss.maxHp = Math.round(boss.maxHp * C.LEADER_HP);
    boss.hp = boss.maxHp;
    m.fighters.push(boss);
    // The crew stand in a loose line between their leader and whoever is coming.
    const crew = 4 + (g % 3);
    for (let i = 0; i < crew; i++) {
      const spread = (i - (crew - 1) / 2) * 2.4;
      const depth = 4.5 + (i % 2) * 2.2;
      const pos = v3(home.x + inward.x * depth + side.x * spread, 0, home.z + inward.z * depth + side.z * spread);
      const crewKit: KitId = i % 3 === 2 ? "gunhand" : "thug";
      m.fighters.push(createFighter(m.fighters.length, LEADER_NAMES[crewKit], crewKit, pos, face, "rabble", 1, g));
    }
  }
}

export function createMatch(seed: number, opts: Partial<MatchOptions> = {}): Match {
  // By default the player is the heavy hunter and the rival is the quick outlaw.
  const kits: [KitId, KitId] = opts.kits ?? ["hunter", "outlaw"];
  const mode = opts.mode ?? "duel";
  const m: Match = {
    tick: 0,
    phase: "intro",
    phaseT: 0,
    fighters: [],
    radius: mode === "roam" ? C.FIELD_R : C.ARENA_R,
    projectiles: [],
    nextProjId: 1,
    props: [],
    zones: [],
    nextZoneId: 1,
    turrets: [],
    nextTurretId: 1,
    hitstop: 0,
    cine: null,
    standoff: null,
    callout: -1,
    calloutT: 0,
    standoffCd: 0,
    verdict: null,
    winner: -1,
    loser: -1,
    bounty: 0,
    outcome: null,
    rng: makeRng(seed),
    events: [],
    opts: { training: false, opening: true, ...opts, kits, mode, gangs: opts.gangs ?? 3 },
  };
  if (mode === "roam") populate(m);
  else {
    const a = createFighter(0, "Hunter", kits[0], v3(0, 0, -6), 0, "hero", 0);
    const b = createFighter(1, "Rival", kits[1], v3(0, 0, 6), Math.PI, "named", 1);
    a.target = 1;
    b.target = 0;
    m.fighters.push(a, b);
  }
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

/** Where the stick points on the ground: around the target, or as the camera sees it when there is none. */
function steer(f: Fighter, o: Fighter, inp: InputFrame): V3 {
  let mx = inp.mx;
  let my = inp.my;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  const fwd = o.id < 0 ? dirOfYaw(inp.yaw) : toTarget(f, o);
  const right = rightOf(fwd);
  return v3(fwd.x * my + right.x * mx, 0, fwd.z * my + right.z * mx);
}

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
  f.hitIds = [];
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

// ---------------------------------------------------------------- conditions and areas

/** Puts a fighter under a condition. A second, different condition reacts with the first. */
function applyStatus(m: Match, f: Fighter, kind: StatusId): void {
  if (m.phase !== "fight" || f.hp <= 0) return;
  const fresh = f.status[kind] === 0;
  f.status[kind] = kind === "poison" ? C.POISON_T : kind === "shock" ? C.SHOCK_T : C.HEX_T;
  if (!fresh) return;
  m.events.push({ type: "status", id: f.id, kind, pos: centerOf(f) });
  if (STATUSES.filter((k) => f.status[k] > 0).length >= 2) return overload(m, f);
  // Shock stops you where you stand, the first time it lands.
  if (kind === "shock" && canBeHit(f) && !isStunned(f)) {
    setState(f, "stagger", C.SHOCK_STUN);
    f.vel = v3();
  }
}

/** Two conditions burn off together in one burst. This is what the classes set up for each other. */
function overload(m: Match, f: Fighter): void {
  const o = blameOf(m, f);
  for (const k of STATUSES) f.status[k] = 0;
  dealDamage(m, o, f, C.OVERLOAD_DMG);
  if (o) o.combo.hits++;
  f.hitsTaken++;
  m.hitstop = Math.max(m.hitstop, f.rank === "rabble" ? C.RABBLE_HITSTOP : 12);
  m.events.push({ type: "overload", id: f.id, pos: centerOf(f) });
  const dir = o ? toTarget(o, f) : dirOfYaw(f.yaw + Math.PI);
  // In a crowd the burst catches whoever is standing close.
  for (const g of m.fighters) {
    if (g === f || g.team !== f.team || !isUp(g) || !canBeHit(g) || distH(g.pos, f.pos) > C.OVERLOAD_R) continue;
    const away = normH(sub(g.pos, f.pos), dir);
    g.lastHitBy = f.lastHitBy;
    g.hitsTaken++;
    if (o) o.combo.hits++;
    dealDamage(m, o, g, C.OVERLOAD_DMG * C.OVERLOAD_SPLASH);
    if (g.hp <= 0) defeat(m, g, away);
    else if (!isFlying(g)) setBlasted(g, away, g.rank === "rabble" ? C.RABBLE_BLAST : 0.5);
  }
  if (f.hp <= 0) return defeat(m, f, dir);
  if (canBeHit(f) && !isFlying(f)) setBlasted(f, dir, 0.5);
}

/** Marks an area on the ground. It goes off after its fuse, and some kinds linger. */
function spawnZone(m: Match, f: Fighter, kind: ZoneKind, at: V3, power = 1): void {
  const d = ZONES[kind];
  const pos = v3(at.x, 0, at.z);
  const r = lenH(pos);
  if (r > m.radius - 1) {
    pos.x *= (m.radius - 1) / r;
    pos.z *= (m.radius - 1) / r;
  }
  const z: Zone = { id: m.nextZoneId++, kind, owner: f.id, pos, radius: d.radius, fuse: d.fuse, life: d.life, burst: d.burst * power, every: d.every, tick: d.tick, status: d.status };
  m.zones.push(z);
  m.events.push({ type: "zoneSpawn", id: z.id, kind, owner: f.id, pos: clone(pos), radius: z.radius, fuse: z.fuse, life: z.life });
}

const inZone = (z: Zone, f: Fighter): boolean => distH(z.pos, f.pos) <= z.radius + C.BODY_R * 0.5 && f.pos.y < 4;

function clearZones(m: Match): void {
  for (const z of m.zones) m.events.push({ type: "zoneEnd", id: z.id });
  m.zones = [];
}

function updateZones(m: Match): void {
  for (const z of m.zones) {
    if (m.phase !== "fight") return;
    const att = m.fighters[z.owner];
    if (z.fuse > 0) {
      z.fuse--;
      if (z.fuse > 0) continue;
      m.events.push({ type: "zoneErupt", id: z.id, kind: z.kind, pos: clone(z.pos), radius: z.radius });
      const d = ZONES[z.kind];
      const hb: HitBox = { from: 0, to: 0, range: 0, damage: z.burst, effect: d.effect, stun: d.stun, blockstun: 16, guardDamage: 30, hitstop: z.kind === "storm" ? 10 : 5, strength: 3, meter: 6, status: z.status ?? undefined };
      for (const def of m.fighters) {
        if (def.team === att.team || !inZone(z, def)) continue;
        applyHit(m, att, def, hb, normH(sub(def.pos, z.pos), toTarget(att, def)), true);
        if (m.phase !== "fight") return;
      }
      continue;
    }
    z.life--;
    if (z.every <= 0 || z.life <= 0 || z.life % z.every !== 0) continue;
    for (const def of m.fighters) {
      if (def.team === att.team || def.hp <= 0 || !inZone(z, def)) continue;
      // A lingering area ignores a guard. You cannot block the ground you are standing on.
      def.lastHitBy = att.id;
      rouse(m, def);
      dealDamage(m, att, def, z.tick * (def.status.hex > 0 ? C.HEX_DMG : 1));
      if (z.status) applyStatus(m, def, z.status);
      if (def.hp <= 0) defeat(m, def, normH(sub(def.pos, z.pos), toTarget(att, def)));
      if (m.phase !== "fight") return;
    }
  }
  if (m.phase !== "fight") return;
  const spent = m.zones.filter((z) => z.fuse <= 0 && z.life <= 0);
  if (spent.length === 0) return;
  for (const z of spent) m.events.push({ type: "zoneEnd", id: z.id });
  m.zones = m.zones.filter((z) => z.fuse > 0 || z.life > 0);
}

// ---------------------------------------------------------------- machines

/** The engineer sets a sentry down a stride ahead. One at a time: a new one replaces the old. */
function setSentry(m: Match, f: Fighter): void {
  for (const t of m.turrets) if (t.owner === f.id) m.events.push({ type: "turretDown", id: t.id, pos: clone(t.pos) });
  m.turrets = m.turrets.filter((t) => t.owner !== f.id);
  const d = dirOfYaw(f.yaw);
  const pos = v3(f.pos.x + d.x * C.TURRET_AHEAD, 0, f.pos.z + d.z * C.TURRET_AHEAD);
  const r = lenH(pos);
  if (r > m.radius - 1) {
    pos.x *= (m.radius - 1) / r;
    pos.z *= (m.radius - 1) / r;
  }
  const t: Turret = { id: m.nextTurretId++, owner: f.id, pos, yaw: f.yaw, life: C.TURRET_LIFE, cd: C.TURRET_GAP };
  m.turrets.push(t);
  m.events.push({ type: "turretUp", id: t.id, owner: f.id, pos: clone(pos) });
}

function clearTurrets(m: Match): void {
  for (const t of m.turrets) m.events.push({ type: "turretDown", id: t.id, pos: clone(t.pos) });
  m.turrets = [];
}

/** A sentry picks its own target, the nearest enemy in range, and fires poisoned rivets at it. */
function updateTurrets(m: Match): void {
  for (const t of m.turrets) {
    t.life--;
    if (t.cd > 0) t.cd--;
    if (t.life <= 0 || t.cd > 0) continue;
    const owner = m.fighters[t.owner];
    let aim: Fighter | null = null;
    for (const g of m.fighters) {
      if (g.team === owner.team || !isUp(g) || !canBeHit(g)) continue;
      const d = distH(g.pos, t.pos);
      if (d <= C.TURRET_R && (!aim || d < distH(aim.pos, t.pos))) aim = g;
    }
    if (!aim) continue;
    const from = v3(t.pos.x, C.TURRET_H, t.pos.z);
    const dir = norm(sub(centerOf(aim), from), dirOfYaw(t.yaw));
    t.yaw = yawOf(normH(dir, dirOfYaw(t.yaw)));
    t.cd = C.TURRET_GAP;
    const pos = add(from, scale(dir, 0.6));
    // Its rivets are the engineer's own: their hits, their combo, their blame.
    m.projectiles.push({ id: m.nextProjId++, kind: "bullet", owner: owner.id, pos, prev: clone(pos), vel: scale(dir, C.BULLET_SPEED), life: C.BULLET_LIFE, radius: 0.3, damage: C.TURRET_DMG, status: "poison", homing: 0, target: aim.id, hit: [] });
    m.events.push({ type: "shot", owner: owner.id, pos, kind: "sentry" });
  }
  if (!m.turrets.some((t) => t.life <= 0)) return;
  for (const t of m.turrets) if (t.life <= 0) m.events.push({ type: "turretDown", id: t.id, pos: clone(t.pos) });
  m.turrets = m.turrets.filter((t) => t.life > 0);
}

/** Tesla does not stop at one body: it jumps to the nearest one it has not touched, a few times over. */
function chain(m: Match, att: Fighter, first: Fighter, damage: number): void {
  const done = [first.id];
  let from = first;
  for (let n = 0; n < C.CHAIN_JUMPS && m.phase === "fight"; n++) {
    let next: Fighter | null = null;
    for (const g of m.fighters) {
      if (g.team === att.team || done.includes(g.id) || !isUp(g) || !canBeHit(g)) continue;
      const d = dist(g.pos, from.pos);
      if (d <= C.CHAIN_R && (!next || d < dist(next.pos, from.pos))) next = g;
    }
    if (!next) return;
    done.push(next.id);
    m.events.push({ type: "arc", from: centerOf(from), to: centerOf(next) });
    applyHit(m, att, next, { ...CHAIN_HIT, damage: damage * C.CHAIN_DMG }, normH(sub(next.pos, from.pos), dirOfYaw(att.yaw)), true);
    from = next;
  }
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

/** Trouble has found this fighter's gang. The crew are all up; a leader only joins in if it was them who got hit. */
function rouse(m: Match, f: Fighter): void {
  if (f.gang < 0) return;
  if (f.rank === "named") f.awake = true;
  let fresh = false;
  for (const g of m.fighters) {
    if (g.gang !== f.gang || g.rank !== "rabble" || g.awake || !isUp(g)) continue;
    g.awake = true;
    fresh = true;
  }
  if (fresh) m.events.push({ type: "alert", gang: f.gang, pos: centerOf(f) });
}

/** One of the rabble is finished. They do not get a verdict: they get thrown out of the fight. */
function dropRabble(m: Match, f: Fighter, dir: V3): void {
  if (f.state === "ko") return;
  const by = blameOf(m, f);
  f.hp = 0;
  f.turn = 0;
  for (const k of STATUSES) f.status[k] = 0;
  setState(f, "ko");
  f.vel = v3(dir.x * C.RABBLE_KO_V, 11, dir.z * C.RABBLE_KO_V);
  f.grounded = false;
  f.pos.y = Math.max(f.pos.y, 0.05);
  m.events.push({ type: "down", id: f.id, by: by ? by.id : -1, pos: centerOf(f) });
}

/**
 * A fighter is out of health. Rabble are simply out. A hero or a leader drops to their
 * knees, and the one who beat them decides how it ends.
 */
function defeat(m: Match, loser: Fighter, dir: V3): void {
  if (loser.rank === "rabble") return dropRabble(m, loser, dir);
  if (m.phase !== "fight") return;
  const winner = blameOf(m, loser) ?? m.fighters.find((g) => g.team !== loser.team)!;
  m.winner = winner.id;
  m.loser = loser.id;
  m.projectiles = [];
  m.standoff = null;
  m.cine = null;
  m.callout = -1;
  clearZones(m);
  clearTurrets(m);
  for (const f of m.fighters) for (const k of STATUSES) f.status[k] = 0;
  endCombo(m, winner);
  if (winner.rank === "rabble") {
    // Run down by a crew. Nobody stops to ask how the hero would like to go.
    setState(loser, "ko");
    loser.vel = v3(dir.x * 12, 7, dir.z * 12);
    loser.grounded = false;
    m.outcome = "dead";
    m.phase = "ko";
    m.phaseT = 0;
    m.events.push({ type: "ko", winner: winner.id, loser: loser.id, pos: clone(loser.pos), alive: false, bounty: 0 });
    m.events.push({ type: "phase", phase: "ko" });
    return;
  }
  for (const g of m.fighters) {
    if (g === winner || g === loser || !isUp(g)) continue;
    // Everyone else holds still while it is settled, and a beaten leader's crew lose their nerve.
    stopH(g);
    if (g.rank !== "rabble" || g.gang < 0 || g.gang !== loser.gang) continue;
    g.hp = 0;
    g.awake = false;
    g.turn = 0;
    setState(g, "downed");
    m.events.push({ type: "down", id: g.id, by: winner.id, pos: centerOf(g) });
  }
  setState(loser, "downed");
  loser.vel = v3(dir.x * 5, loser.grounded ? 0 : loser.vel.y, dir.z * 5);
  toFree(winner);
  stopH(winner);
  m.phase = "verdict";
  m.phaseT = 0;
  m.verdict = { winner: winner.id, loser: loser.id, t: 0, choice: null, at: 0 };
  m.events.push({ type: "verdictStart", winner: winner.id, pos: clone(loser.pos) });
  m.events.push({ type: "phase", phase: "verdict" });
}

function stepVerdict(m: Match, inputs: readonly InputFrame[]): void {
  const v = m.verdict!;
  const w = m.fighters[v.winner];
  const l = m.fighters[v.loser];
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
    const stepLen = Math.min(Math.max(kitOf(w).chaseSpeed, 60) * C.DT, gap - 3.8);
    w.pos.x += dir.x * stepLen;
    w.pos.z += dir.z * stepLen;
    w.pos.y = Math.max(0, w.pos.y + clamp(l.pos.y - w.pos.y, -stepLen, stepLen));
    w.grounded = w.pos.y <= 0.02;
    w.vel = v3();
    return;
  }
  if (w.state === "chase") toFree(w);

  if (v.choice === null) {
    const inp = inputs[v.winner] ?? blankInput();
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
  // Only the hero collects.
  const paid = w.rank === "hero" ? (alive ? C.BOUNTY_ALIVE : C.BOUNTY_DEAD) : 0;
  m.bounty += paid;
  m.verdict = null;
  m.outcome = alive ? "alive" : "dead";
  m.events.push({ type: "ko", winner: w.id, loser: l.id, pos: clone(l.pos), alive, bounty: paid });
  // In open country the day is not over while another gang's leader is still standing.
  if (m.opts.mode === "roam" && w.rank === "hero" && m.fighters.some((g) => g.rank === "named" && g.team !== w.team && isUp(g))) {
    m.phase = "fight";
    m.phaseT = 0;
    m.events.push({ type: "phase", phase: "fight" });
    return;
  }
  m.phase = "ko";
  m.phaseT = 0;
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

  def.lastHitBy = att.id;
  rouse(m, def);
  // A crowd fight should not stutter: hits on or by rabble barely freeze it.
  const crowd = att.rank === "rabble" || def.rank === "rabble";
  const stop = crowd ? Math.min(hb.hitstop, C.RABBLE_HITSTOP) : hb.hitstop;
  const power = kitOf(att).power;

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
    const chip = dealDamage(m, att, def, hb.damage * mult * power * C.CHIP, false);
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
      m.hitstop = Math.max(m.hitstop, Math.min(stop, 4));
    }
    return true;
  }

  // A long combo on one fighter hits softer as it goes. A swing through a crowd does not.
  const scaling = def.rank === "rabble" ? 1 : Math.max(C.SCALE_MIN, 1 - C.SCALE_STEP * att.combo.hits);
  const dmg = hb.damage * mult * power * scaling * (att.awakened > 0 ? C.AWAKEN_DMG : 1) * (def.status.hex > 0 ? C.HEX_DMG : 1);
  const dealt = dealDamage(m, att, def, dmg);
  att.combo.hits++;
  def.hitsTaken++;
  att.meter = Math.min(C.METER, att.meter + hb.meter);
  def.meter = Math.min(C.METER, def.meter + hb.meter * 0.5);

  // Rabble fly further the more they have been hurt, and a solid hit on a hurt one takes them off their feet.
  const rabble = def.rank === "rabble";
  const hurt = rabble ? 1 - def.hp / def.maxHp : 0;
  const fly = 1 + C.SMASH * hurt;
  let effect = hb.effect;
  if (effect === "launch" && !rabble && att.combo.launches >= kitOf(att).maxLaunches) effect = "blast";
  if (rabble && hurt >= C.SMASH_TUMBLE && hb.strength >= 2 && (effect === "reel" || effect === "stagger")) effect = "blast";

  if (def.hp <= 0) {
    m.hitstop = Math.max(m.hitstop, rabble ? C.RABBLE_HITSTOP + 2 : 14);
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
        def.vel = v3(dir.x * 5 * fly, 0, dir.z * 5 * fly);
      }
      break;
    }
    case "stagger":
      setState(def, "stagger", hb.stun);
      def.vel = v3(dir.x * 3 * fly, 0, dir.z * 3 * fly);
      break;
    case "launch":
      att.combo.launches++;
      setState(def, "launched");
      def.vel = v3(dir.x * 1.5, C.LAUNCH_V, dir.z * 1.5);
      def.grounded = false;
      def.pos.y = Math.max(def.pos.y, 0.05);
      break;
    case "blast":
      setBlasted(def, dir, (projectile ? 0.6 : 1) * (rabble ? C.RABBLE_BLAST * fly : 1));
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

  m.hitstop = Math.max(m.hitstop, stop);
  m.events.push({ type: "hit", att: att.id, def: def.id, pos, strength: hb.strength, effect, damage: dealt, blocked: false, perfect: false, projectile });
  if (hb.status) applyStatus(m, def, hb.status);
  return true;
}

/** One swing hits every enemy in its reach, once each. */
function resolveStrikes(m: Match): void {
  for (const f of m.fighters) {
    if (f.state !== "attack" || !f.move) continue;
    const mv = MOVES[f.move];
    for (let h = 0; h < mv.hits.length; h++) {
      const base = mv.hits[h];
      if (f.mf < base.from || f.mf > base.to) continue;
      for (const o of m.fighters) {
        const key = h * 1000 + o.id;
        if (o.team === f.team || f.hitIds.includes(key)) continue;
        const d = distH(f.pos, o.pos);
        if (d > base.range || Math.abs(o.pos.y - f.pos.y) > (base.aoe ? 2.6 : 1.8)) continue;
        const dir = toTarget(f, o);
        if (!base.aoe && d > 0.8 && Math.abs(angleDiff(yawOf(dir), f.yaw)) > 1.75) continue;
        // An ender only sends them flying if a round, or the brace, went off behind it.
        let hb = base;
        let mult = 1;
        if (mv.round || mv.nerve) {
          if (f.enderLive) mult = f.enderMult;
          else hb = dryEnder(hb);
        }
        if (applyHit(m, f, o, hb, dir, false, mult)) {
          f.hitIds.push(key);
          f.moveHit = true;
        }
        if (m.phase !== "fight") return;
        if (f.state !== "attack") break;
      }
      if (f.state !== "attack") break;
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
  extra: { status?: StatusId; homing?: number } = {},
): V3 {
  const from = centerOf(f);
  const aim = norm(sub(centerOf(o), from), dirOfYaw(f.yaw));
  const pos = add(from, scale(aim, 0.8));
  m.projectiles.push({ id: m.nextProjId++, kind, owner: f.id, pos, prev: clone(pos), vel: scale(aim, speed), life, radius, damage, status: extra.status, homing: extra.homing ?? 0, target: o.id, hit: [] });
  return pos;
}

function fireBullet(m: Match, f: Fighter, o: Fighter, fan: boolean): void {
  // The engineer's rivets hit softer than a bullet, and every one is poisoned.
  const rivet = kitOf(f).gun === "rivet";
  const mult = spendRound(m, f) * (fan ? C.FAN_DMG : 1);
  f.shotCd = C.SHOT_CD;
  f.shotPose = 14;
  const dmg = (rivet ? C.RIVET_DMG : C.BULLET_DMG) * mult;
  const pos = spawnProjectile(m, f, o, "bullet", C.BULLET_SPEED, C.BULLET_LIFE, 0.3, dmg, { status: rivet ? "poison" : undefined });
  f.meter = Math.min(C.METER, f.meter + 1);
  const kind: ShotKind = fan ? "fan" : rivet ? "rivet" : "bullet";
  m.events.push({ type: "shot", owner: f.id, pos, kind });
}

/** The witch's shot: a slow bolt that bends toward its target. No ammunition, a short wait between casts. */
function fireBolt(m: Match, f: Fighter, o: Fighter): void {
  if (m.projectiles.filter((p) => p.kind === "bolt" && p.owner === f.id).length >= 3) return;
  f.shotCd = C.BOLT_CD;
  f.shotPose = 16;
  const pos = spawnProjectile(m, f, o, "bolt", C.BOLT_SPEED, C.BOLT_LIFE, 0.5, BOLT_HIT.damage, { homing: C.BOLT_TURN });
  f.meter = Math.min(C.METER, f.meter + 1);
  m.events.push({ type: "shot", owner: f.id, pos, kind: "bolt" });
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
  if (o.id < 0) {
    // Nobody to chase or to dodge: the dash covers ground, the way the stick points.
    const way = steer(f, o, inp);
    if (lenH(way) > 0.2) f.yaw = yawOf(way);
    startChase(m, f);
    return true;
  }
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
      if (kitOf(f).catchShock && o.status.shock === 0) {
        // The engineer's plating bites back.
        applyStatus(m, o, "shock");
      } else {
        const dir = toTarget(f, o);
        setState(o, "parried", C.CATCH_STUN);
        o.vel = v3(dir.x * 6, 0, dir.z * 6);
      }
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
  def.lastHitBy = att.id;
  rouse(m, def);
  att.combo.hits++;
  def.hitsTaken++;
  att.moveHit = true;
  if (kitOf(att).special === "knot") {
    setState(def, "stagger", C.KNOT_STUN);
    def.airHang = true;
    def.grounded = false;
    def.pos.y = Math.max(def.pos.y, 0.05);
    def.vel = v3(0, 9, 0);
    m.hitstop = Math.max(m.hitstop, 5);
    m.events.push({ type: "lasso", owner: att.id, hit: true });
    applyStatus(m, def, "hex");
    return;
  }
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
  const over = lenH(def.pos) - (m.radius - 1);
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
  def.lastHitBy = att.id;
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
    if (kitOf(att).gun !== "none") {
      att.ammo = 0;
      att.reload = 0;
      startReload(m, att);
    }
    const dir = toTarget(att, def);
    m.events.push({ type: "cineEnd", att: att.id, def: def.id });
    if (def.hp <= 0) defeat(m, def, dir);
    else setBlasted(def, dir);
  }
}

// ---------------------------------------------------------------- the standoff

/** Two fighters freeze, hands over their holsters, and wait for the bell. */
function startStandoff(m: Match, ids: [number, number], opening: boolean): void {
  const a = m.fighters[ids[0]];
  const b = m.fighters[ids[1]];
  m.standoff = {
    ids,
    t: 0,
    bellAt: m.rng.int(C.STANDOFF_WAIT_MIN, C.STANDOFF_WAIT_MAX),
    lock: [0, 0],
    opening,
  };
  endCombo(m, a);
  endCombo(m, b);
  for (const f of [a, b]) {
    setState(f, "standoff");
    f.vel = v3();
    for (const btn of BUTTONS) f.buf[btn] = 0;
  }
  a.target = b.id;
  b.target = a.id;
  a.yaw = yawOf(toTarget(a, b));
  b.yaw = yawOf(toTarget(b, a));
  m.projectiles = [];
  m.events.push({ type: "standoffStart", opening });
}

function stepStandoff(m: Match, inputs: readonly InputFrame[]): void {
  const s = m.standoff!;
  const pair = [m.fighters[s.ids[0]], m.fighters[s.ids[1]]];
  s.t++;
  if (s.t === s.bellAt) m.events.push({ type: "standoffBell" });

  const drew = [false, false];
  for (let i = 0; i < 2; i++) {
    const f = pair[i];
    const inp = inputs[f.id];
    if (!inp || !inp.shot || f.prev.shot) continue;
    if (s.t < s.bellAt) {
      // Too soon. The hand twitches, and it costs you the first instant after the bell.
      if (s.lock[i] === 0) {
        s.lock[i] = s.bellAt + C.FLINCH_LOCK;
        m.events.push({ type: "standoffFlinch", id: f.id });
      }
    } else if (s.t >= s.lock[i]) drew[i] = true;
  }

  if (!drew[0] && !drew[1] && s.t < s.bellAt + C.STANDOFF_WINDOW) return;
  // It is over one way or another. The draw itself must not also come out as an ordinary shot.
  for (const f of pair) f.buf.shot = 0;

  if (!drew[0] && !drew[1]) {
    m.standoff = null;
    m.standoffCd = C.STANDOFF_CD;
    for (const f of pair) toFree(f);
    m.events.push({ type: "standoffEnd", winner: -1, trade: false });
    return;
  }

  m.standoff = null;
  m.standoffCd = C.STANDOFF_CD;
  if (drew[0] && drew[1]) {
    // Both shots on the same instant: the bullets meet and nobody is hit.
    for (let i = 0; i < 2; i++) {
      const f = pair[i];
      const dir = toTarget(f, pair[1 - i]);
      f.shotPose = 20;
      m.events.push({ type: "shot", owner: f.id, pos: add(centerOf(f), scale(dir, 0.8)), kind: "quick" });
      setState(f, "parried", 30);
      f.vel = v3(-dir.x * 5, 0, -dir.z * 5);
    }
    m.hitstop = 10;
    m.events.push({ type: "standoffEnd", winner: -1, trade: true });
    return;
  }

  const w = pair[drew[0] ? 0 : 1];
  const l = pair[drew[0] ? 1 : 0];
  const dir = toTarget(w, l);
  toFree(w);
  w.shotPose = 22;
  w.meter = Math.min(C.METER, w.meter + C.STANDOFF_NERVE);
  if (w.ammo > 0 && w.reload === 0 && kitOf(w).gun !== "none") spendRound(m, w);
  m.events.push({ type: "shot", owner: w.id, pos: add(centerOf(w), scale(dir, 0.8)), kind: "quick" });
  // The shot that opens a duel wounds; it never ends it.
  l.lastHitBy = w.id;
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
  const k = kitOf(f);
  if (k.gun === "none") {
    if (f.buf.shot > 0 && f.shotCd <= 0) {
      f.buf.shot = 0;
      fireBolt(m, f, o);
    }
  } else if (f.buf.shot > 0 && f.reload === 0 && f.ammo > 0 && f.shotCd <= 0) {
    f.buf.shot = 0;
    fireBullet(m, f, o, false);
  }
  if (!inp.shot) {
    f.shotHold = 0;
    return;
  }
  f.shotHold++;
  if (f.shotHold < C.FAN_HOLD) return;
  if (k.hold === "circle") {
    // The witch holds the cast and draws a circle under her target.
    if (f.meter >= C.CIRCLE_COST) {
      f.meter -= C.CIRCLE_COST;
      startMove(f, o, "circle");
    }
  } else if (f.ammo >= 2 && f.reload === 0) {
    // Keep the trigger held and the other hand comes across to fan the hammer.
    startMove(f, o, "fan");
  }
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
    startMove(f, o, kitOf(f).special === "sentry" ? "sentry" : "lariat");
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

  const k = kitOf(f);
  const speed = (f.grounded ? k.run : k.airRun) * (f.status.shock > 0 ? C.SHOCK_SLOW : 1);
  const way = steer(f, o, inp);
  f.vel.x = way.x * speed;
  f.vel.z = way.z * speed;
  // With nobody to face, face the way you are going.
  if (o.id < 0 && lenH(way) > 0.2) f.yaw = yawOf(way);
}

/** Holstered and still. Nerve builds, rounds slide home, and the quickdraw arms. */
function steadyLogic(m: Match, f: Fighter, o: Fighter, inp: InputFrame): void {
  stopH(f);
  f.yaw = yawOf(toTarget(f, o));
  if (f.t >= C.STEADY_STARTUP) {
    f.meter = Math.min(C.METER, f.meter + C.NERVE_RATE * (f.awakened > 0 ? 1.5 : 1));
  }
  const hasGun = kitOf(f).gun !== "none";
  if (hasGun && f.reload === 0 && f.ammo < C.AMMO && f.t % C.STEADY_CHAMBER === 0) {
    f.ammo++;
    m.events.push({ type: "chamber", id: f.id });
  }
  if (f.buf.shot > 0 && (!hasGun || (f.reload === 0 && f.ammo > 0))) {
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
  if (f.mf >= 3 && (f.mf - 3) % C.FAN_GAP === 0 && f.ammo > 0 && f.reload === 0) fireBullet(m, f, o, true);
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
      const quick = kitOf(f).quick;
      f.shotPose = 20;
      if (quick === "storm") {
        // The witch's answer to the quickdraw: the sky comes down on wherever they are standing.
        spawnZone(m, f, "storm", o.pos, 0.7 + 0.6 * f.quickPower);
      } else {
        const mult = spendRound(m, f);
        const tesla = quick === "tesla";
        const lo = tesla ? C.TESLA_DMG_MIN : C.QUICK_DMG_MIN;
        const hi = tesla ? C.TESLA_DMG_MAX : C.QUICK_DMG_MAX;
        const pos = spawnProjectile(m, f, o, "quick", C.QUICK_SPEED, C.QUICK_LIFE, 0.5, (lo + (hi - lo) * f.quickPower) * mult, { status: tesla ? "shock" : undefined });
        m.events.push({ type: "shot", owner: f.id, pos, kind: tesla ? "tesla" : "quick" });
      }
    } else if (f.move === "circle") spawnZone(m, f, "hex", o.pos);
    else if (f.move === "sentry") setSentry(m, f);
    else if (f.move === "lariat") spawnProjectile(m, f, o, "lasso", C.LASSO_SPEED, C.LASSO_LIFE, 0.5);
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
        return startMove(f, o, kitOf(f).special === "sentry" ? "sentry" : "lariat");
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
    // The hunter's dash is a shoulder charge: it hits whoever it reaches, and anyone standing with them.
    for (const g of m.fighters) {
      if (g.team === f.team || (g !== o && dist(f.pos, g.pos) > C.TACKLE_R)) continue;
      applyHit(m, f, g, TACKLE, toTarget(f, g), false);
      if (m.phase !== "fight" || f.state !== "chase") break;
    }
    if (f.state !== "chase") return;
  }
  toFree(f);
  f.vel = v3();
}

function stunLogic(m: Match, f: Fighter, o: Fighter): void {
  // The way out of a combo is aimed at whoever is doing the hitting, not at whoever we were facing.
  const by = blameOf(m, f) ?? o;
  if (trySlip(m, f, by)) return;
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
        dealDamage(m, by.id < 0 ? null : by, f, 20, false);
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
    const way = steer(f, o, inp);
    const speed = k.run * k.guardWalk;
    f.vel.x = way.x * speed;
    f.vel.z = way.z * speed;
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
      if (f.t >= C.SLIP_T) finishSlip(m, f, blameOf(m, f) ?? o);
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
      // The burst throws back everyone standing close.
      if (f.t === 6) {
        for (const g of m.fighters) {
          if (g.team === f.team || dist(f.pos, g.pos) > 7 || !canBeHit(g)) continue;
          setBlasted(g, toTarget(f, g), 0.6);
          endCombo(m, g);
        }
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
    else f.vel.y -= C.GRAVITY * gs * dt * (f.vel.y < 0 && f.state === "free" ? kitOf(f).fall : 1);
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
    const att = m.fighters[p.owner];
    const aim = p.target >= 0 ? m.fighters[p.target] : null;
    if (p.homing > 0 && aim && isUp(aim)) {
      // Bend toward the target, a little each tick.
      const sp = len(p.vel);
      const cur = scale(p.vel, 1 / sp);
      const want = norm(sub(centerOf(aim), p.pos), cur);
      const angle = Math.acos(clamp(cur.x * want.x + cur.y * want.y + cur.z * want.z, -1, 1));
      const t = angle < 1e-4 ? 1 : Math.min(1, p.homing / angle);
      p.vel = scale(norm(add(scale(cur, 1 - t), scale(want, t)), cur), sp);
    }
    assign(p.prev, p.pos);
    p.pos = add(p.pos, scale(p.vel, C.DT));
    p.life--;
    let alive = p.life > 0 && lenH(p.pos) < m.radius + 20 && p.pos.y > -0.5;

    // It hits the first enemy in its path, whoever it was aimed at.
    for (const def of m.fighters) {
      if (!alive || m.phase !== "fight") break;
      if (def.team === att.team || p.hit.includes(def.id) || !canBeHit(def)) continue;
      if (segPointDist(p.prev, p.pos, centerOf(def)) > p.radius + 0.7) continue;
      const dir = normH(p.vel, dirOfYaw(att.yaw));
      if (p.kind === "bullet" || p.kind === "quick" || p.kind === "bolt") {
        const hb: HitBox = p.kind === "bolt" ? { ...BOLT_HIT, damage: p.damage } : { ...PROJ_HITS[p.kind], damage: p.damage, status: p.status };
        if (kitOf(def).deflect && def.state === "guard" && def.guardT <= C.PERFECT_WINDOW) {
          // Caught on the brace at the perfect moment: the shot goes back where it came from.
          const speed = len(p.vel);
          p.owner = def.id;
          p.target = att.id;
          p.hit = [];
          p.vel = scale(norm(sub(centerOf(att), p.pos), scale(dir, -1)), speed);
          p.life = C.BULLET_LIFE;
          assign(p.prev, p.pos);
          def.meter = Math.min(C.METER, def.meter + 8);
          m.hitstop = Math.max(m.hitstop, 6);
          m.events.push({ type: "deflect", id: def.id, pos: clone(p.pos), back: true });
          break;
        }
        if (applyHit(m, att, def, hb, dir, true)) {
          if (p.kind === "quick" && p.status === "shock") {
            chain(m, att, def, p.damage);
            alive = false;
          }
          // A quickdraw goes clean through rabble and keeps going.
          else if (p.kind === "quick" && def.rank === "rabble") p.hit.push(def.id);
          else alive = false;
        }
      } else if (p.kind === "lasso") {
        rope(m, att, def);
        alive = false;
      } else if (p.kind === "ult") {
        if (def.rank === "rabble") {
          // The Last Word does not stop for rabble.
          p.hit.push(def.id);
          applyHit(m, att, def, ULT_GRAZE, dir, true);
          continue;
        }
        alive = false;
        if (def.state === "guard" || def.state === "blockstun") {
          def.lastHitBy = att.id;
          dealDamage(m, att, def, 40, false);
          def.guardHp = C.GUARD_HP * 0.5;
          setState(def, "stagger", C.GUARD_BREAK_STUN);
          def.vel = v3(dir.x * 6, 0, dir.z * 6);
          m.hitstop = Math.max(m.hitstop, 12);
          m.events.push({ type: "guardBreak", id: def.id, pos: centerOf(def) });
        } else {
          rouse(m, def);
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
        const small = p.kind === "bullet" || p.kind === "bolt";
        prop.hp -= small ? 1 : 10;
        if (prop.hp <= 0) {
          prop.broken = true;
          m.events.push({ type: "propBreak", index: i, pos: clone(prop.pos), dir: norm(p.vel, v3(0, 0, 1)) });
        }
        if (small) alive = false;
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

/** A body sent flying takes its own side's rabble down with it. */
function bowl(m: Match, a: Fighter, b: Fighter): boolean {
  if (a.team !== b.team || b.rank !== "rabble" || m.phase !== "fight") return false;
  if ((a.state !== "blasted" && a.state !== "ko") || lenH(a.vel) < C.BOWL_SPEED) return false;
  if (!canBeHit(b) || isFlying(b)) return false;
  const dir = normH(a.vel, dirOfYaw(a.yaw));
  const by = blameOf(m, a);
  b.lastHitBy = a.lastHitBy;
  b.hitsTaken++;
  if (by) by.combo.hits++;
  const dealt = dealDamage(m, by, b, C.BOWL_DMG);
  a.vel.x *= 0.8;
  a.vel.z *= 0.8;
  m.events.push({ type: "hit", att: by ? by.id : a.id, def: b.id, pos: centerOf(b), strength: 2, effect: "blast", damage: dealt, blocked: false, perfect: false, projectile: false });
  if (b.hp <= 0) defeat(m, b, dir);
  else setBlasted(b, dir, C.BOWL_POWER);
  return true;
}

function collideWorld(m: Match): void {
  // Fighters push each other apart unless one is passing through.
  const fs = m.fighters;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    for (let j = i + 1; j < fs.length; j++) {
      const b = fs[j];
      if (Math.abs(a.pos.y - b.pos.y) >= 1.6) continue;
      const d = distH(a.pos, b.pos);
      const min = C.BODY_R * 2;
      if (d >= min) continue;
      if (bowl(m, a, b) || bowl(m, b, a)) continue;
      if (NO_PUSH.has(a.state) || NO_PUSH.has(b.state)) continue;
      const dir = normH(sub(b.pos, a.pos), dirOfYaw(a.yaw));
      const push = (min - d) / 2;
      a.pos.x -= dir.x * push;
      a.pos.z -= dir.z * push;
      b.pos.x += dir.x * push;
      b.pos.z += dir.z * push;
    }
  }

  for (const f of m.fighters) {
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
          if (f.state === "blasted") dealDamage(m, blameOf(m, f), f, 10, false);
        }
      } else if (f.state !== "slip" && f.state !== "cine") {
        const dir = normH(sub(f.pos, prop.pos), dirOfYaw(f.yaw + Math.PI));
        f.pos.x = prop.pos.x + dir.x * min;
        f.pos.z = prop.pos.z + dir.z * min;
      }
    }

    const r = lenH(f.pos);
    if (r > m.radius) {
      f.pos.x *= m.radius / r;
      f.pos.z *= m.radius / r;
      if (f.state === "blasted") {
        stopH(f);
        setState(f, "launched");
        m.events.push({ type: "wallHit", id: f.id, pos: centerOf(f) });
      }
    }
  }
}

// ---------------------------------------------------------------- the overworld

/** Who each fighter is facing. A duel has no choice to make; open country does. */
function retarget(m: Match): void {
  if (m.opts.mode !== "roam") return;
  const hero = m.fighters[0];
  // The gangs only have eyes for the hero.
  for (const f of m.fighters) {
    if (f.team !== hero.team) f.target = f.awake && isUp(f) && isUp(hero) ? hero.id : -1;
  }
  const cur = targetOf(m, hero);
  const asked = hero.buf.swap > 0;
  hero.buf.swap = 0;
  const held = cur !== null && isUp(cur) && distH(hero.pos, cur.pos) <= C.UNLOCK_R;
  if (held && !asked) return;
  // Trouble picks itself: the nearest enemy who is up and looking for a fight.
  // Asking for a target reaches further, to anyone in range, so the hero can open on a camp.
  const near = m.fighters
    .filter((g) => g.team !== hero.team && isUp(g) && (asked || g.awake) && distH(hero.pos, g.pos) <= C.LOCK_R)
    .sort((a, b) => distH(hero.pos, a.pos) - distH(hero.pos, b.pos) || a.id - b.id);
  if (near.length === 0) hero.target = held ? cur.id : -1;
  // Asking again while facing the only one there, and they have not noticed: let them be.
  else if (asked && held && near.length === 1 && near[0] === cur && !cur.awake) hero.target = -1;
  else hero.target = near[asked && cur ? (near.indexOf(cur) + 1) % near.length : 0].id;
}

/** Crews notice a hero who comes close, and give up on one who gets far from their camp. */
function watch(m: Match): void {
  const hero = m.fighters[0];
  if (!isUp(hero)) return;
  for (const f of m.fighters) {
    if (f.rank !== "rabble" || !isUp(f)) continue;
    const gap = distH(f.pos, hero.pos);
    if (!f.awake) {
      if (gap <= C.ALERT_R) rouse(m, f);
    } else if (gap > C.ALERT_R && distH(f.home, hero.pos) > C.LEASH_R) {
      f.awake = false;
      f.turn = 0;
    }
  }
}

/**
 * Rabble take turns. Only a few may attack at once, and turns are handed out a beat apart;
 * the rest wait, and the one who has waited longest goes next.
 */
function passTurns(m: Match): void {
  let active = 0;
  let newest = 0;
  let next: Fighter | null = null;
  for (const f of m.fighters) {
    if (f.rank !== "rabble" || !f.awake || !isUp(f)) continue;
    if (f.turn > 0) {
      f.turn--;
      if (f.turn > 0) active++;
      newest = Math.max(newest, f.turn);
      continue;
    }
    f.waited++;
    const o = targetOf(m, f);
    if (!o || distH(f.pos, o.pos) > C.TURN_R || f.state !== "free") continue;
    if (!next || f.waited > next.waited) next = f;
  }
  if (next && active < C.RABBLE_TURNS && newest <= C.RABBLE_TURN_T - C.RABBLE_TURN_GAP) {
    next.turn = C.RABBLE_TURN_T;
    next.waited = 0;
  }
}

/** With nobody after them, the hero gets their wind back. */
function rest(m: Match): void {
  const hero = m.fighters[0];
  if (!isUp(hero) || hero.hp >= hero.maxHp) return;
  if (m.fighters.some((g) => g.team !== hero.team && g.awake && isUp(g))) return;
  hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * C.REST_REGEN);
}

/** When a crew is beaten and their leader has not been touched, the leader steps out to settle it one on one. */
function stepCallout(m: Match): void {
  const hero = m.fighters[0];
  if (m.callout < 0) {
    for (const l of m.fighters) {
      if (l.rank !== "named" || l.gang < 0 || l.awake || !isUp(l)) continue;
      if (m.fighters.some((g) => g.gang === l.gang && g.rank === "rabble" && isUp(g))) continue;
      m.callout = l.id;
      m.calloutT = 0;
      m.events.push({ type: "callOut", id: l.id, pos: centerOf(l) });
      break;
    }
    return;
  }
  const l = m.fighters[m.callout];
  if (l.awake || !isUp(l) || !isUp(hero)) {
    m.callout = -1;
    return;
  }
  // Nothing touches them on the way in.
  m.calloutT++;
  l.invuln = Math.max(l.invuln, 2);
  const dir = toTarget(l, hero);
  l.yaw = yawOf(dir);
  const gap = distH(l.pos, hero.pos);
  if (gap > C.CALLOUT_GAP) {
    if (l.state !== "chase") {
      setState(l, "chase");
      m.events.push({ type: "chase", id: l.id, pos: clone(l.pos) });
    }
    const stepLen = Math.min(C.CALLOUT_SPEED * C.DT, gap - C.CALLOUT_GAP);
    l.pos.x += dir.x * stepLen;
    l.pos.z += dir.z * stepLen;
    l.vel = v3();
    return;
  }
  if (l.state === "chase") toFree(l);
  // The bell waits for a hero who is on their feet, and not for long for one who keeps swinging.
  const settled = hero.state === "free" || hero.state === "steady" || hero.state === "guard";
  const able = !isStunned(hero) && hero.state !== "knockdown" && hero.state !== "getup" && hero.state !== "slip";
  if (!hero.grounded || !(settled || (able && m.calloutT > C.CALLOUT_WAIT))) return;
  m.callout = -1;
  l.awake = true;
  startStandoff(m, [hero.id, l.id], true);
}

function upkeep(m: Match): void {
  for (const f of m.fighters) {
    const k = kitOf(f);
    if (f.pips < k.pips) {
      f.pipTimer += f.awakened > 0 ? 2 : 1;
      if (f.pipTimer >= C.PIP_REGEN) {
        f.pips++;
        f.pipTimer = 0;
      }
    }
    if (m.phase === "fight") {
      for (const st of STATUSES) if (f.status[st] > 0) f.status[st]--;
      if (f.status.poison > 0 && f.status.poison % C.POISON_EVERY === 0 && f.hp > 0) {
        const by = blameOf(m, f);
        dealDamage(m, by, f, C.POISON_DMG);
        if (f.hp <= 0) defeat(m, f, by ? toTarget(by, f) : dirOfYaw(f.yaw + Math.PI));
      }
    }
    // Dashes come back one at a time. Running dry is a real cost, and shock stops the clock.
    if (f.dashes < k.dashes && f.status.shock === 0) {
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
    // A combo lasts for as long as anyone on the other side is still reeling.
    if (f.combo.hits > 0 && !m.fighters.some((g) => g.team !== f.team && (isStunned(g) || g.state === "cine"))) {
      endCombo(m, f);
      if (m.opts.training && f.id === 0 && m.phase === "fight") m.fighters[1].hp = m.fighters[1].maxHp;
    }
    if (m.opts.training && f.id === 0) {
      f.meter = Math.min(C.METER, f.meter + 0.6);
      f.awaken = Math.min(100, f.awaken + 0.15);
    }
  }

  // Two gunfighters who both stop and hold steady have agreed to a standoff.
  if (m.standoffCd > 0) m.standoffCd--;
  if (m.phase === "fight" && !m.standoff && m.standoffCd === 0) {
    for (const a of m.fighters) {
      const b = targetOf(m, a);
      if (!b || b.id < a.id || b.target !== a.id || a.rank === "rabble" || b.rank === "rabble") continue;
      if (a.state !== "steady" || b.state !== "steady" || a.t < C.STANDOFF_MUTUAL || b.t < C.STANDOFF_MUTUAL) continue;
      startStandoff(m, [a.id, b.id], false);
      break;
    }
  }

  if (m.opts.mode === "roam" && m.phase === "fight" && !m.standoff) {
    watch(m);
    passTurns(m);
    stepCallout(m);
    rest(m);
  }
}

function rememberInputs(m: Match, inputs: readonly InputFrame[]): void {
  for (const f of m.fighters) f.prev = { ...(inputs[f.id] ?? BLANK) };
}

const BLANK: Readonly<InputFrame> = blankInput();

/** An awakened enemy slows this fighter: in a duel wherever they are, in open country when they are close. */
function slowed(m: Match, f: Fighter): boolean {
  if (f.awakened > 0) return false;
  const duel = m.opts.mode === "duel";
  return m.fighters.some((g) => g.team !== f.team && g.awakened > 0 && isUp(g) && (duel || distH(f.pos, g.pos) <= C.UNLOCK_R));
}

// ---------------------------------------------------------------- step

/**
 * Advances the match by one tick (1/60 s) and returns what happened.
 * `inputs` is indexed by fighter id. A fighter with no entry does nothing.
 */
export function stepMatch(m: Match, inputs: readonly InputFrame[]): SimEvent[] {
  m.events = [];
  if (m.phase === "done") return m.events;
  m.tick++;

  // Presses are buffered every tick, so one made during a freeze still comes out afterward.
  for (const f of m.fighters) {
    const inp = inputs[f.id];
    if (!inp) continue;
    for (const b of BUTTONS) if (inp[b] && !f.prev[b]) f.buf[b] = C.BUFFER;
  }

  if (m.phase === "intro") {
    m.phaseT++;
    for (const f of m.fighters) for (const b of BUTTONS) f.buf[b] = 0;
    if (m.phaseT >= C.INTRO_T) {
      m.phase = "fight";
      m.phaseT = 0;
      m.events.push({ type: "phase", phase: "fight" });
      if (m.opts.mode === "duel" && m.opts.opening && !m.opts.training) startStandoff(m, [0, 1], true);
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

  if (m.phase === "fight") retarget(m);
  const n = m.fighters.length;
  for (let k = 0; k < n; k++) {
    // Who goes first alternates, so nobody wins every tie.
    const f = m.fighters[m.tick & 1 ? k : n - 1 - k];
    // A leader striding in to call the hero out is not theirs to move.
    if (f.id === m.callout) continue;
    const o = foe(m, f);
    let inp = m.phase === "fight" ? (inputs[f.id] ?? BLANK) : BLANK;
    // Rabble wait their turn: without one, a crew member cannot swing or shoot.
    if (f.rank === "rabble" && f.turn <= 0) {
      f.buf.strike = 0;
      f.buf.shot = 0;
      if (inp.shot || inp.strike) inp = { ...inp, shot: false, strike: false };
    }
    // An awakened opponent slows this fighter: motion is scaled and logic skips ticks.
    f.timeScale = slowed(m, f) ? C.AWAKEN_SLOW : 1;
    f.slowAcc += f.timeScale;
    if (f.slowAcc >= 0.999) {
      f.slowAcc -= 1;
      logic(m, f, o, inp);
    }
    physics(m, f);
  }

  if (m.phase === "fight") {
    updateProjectiles(m);
    if (m.phase === "fight" && !m.cine) updateTurrets(m);
    if (m.phase === "fight" && !m.cine) updateZones(m);
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
