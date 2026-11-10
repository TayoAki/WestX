import type { HitEffect, MoveId, StatusId, ZoneKind } from "./types";

// Every attack is data. Timings are in frames at 60 per second.
// Tuning a move means editing a row here; no other code changes.

export interface HitBox {
  /** First and last active frame, inclusive. */
  from: number;
  to: number;
  /** Horizontal reach in metres, measured between body centres. */
  range: number;
  damage: number;
  effect: HitEffect;
  /** Hit-stun in frames for `reel` and `stagger`. */
  stun: number;
  blockstun: number;
  guardDamage: number;
  /** Freeze frames on contact. */
  hitstop: number;
  /** 1 light, 2 medium, 3 heavy. Drives effects, shake and sound. */
  strength: number;
  /** Nerve the attacker gains on hit. */
  meter: number;
  /** Hits everything within `range` in every direction, not just in front. */
  aoe?: boolean;
  /** A condition the hit leaves behind. */
  status?: StatusId;
}

export interface MoveDef {
  id: MoveId;
  total: number;
  hits: HitBox[];
  /** Homing lunge toward the target between these frames, in metres per second. */
  lunge?: { from: number; to: number; speed: number };
  /** Frame a projectile leaves the barrel or hand. */
  fireAt?: number;
  /** Earliest frame the move can be cancelled after it connects. */
  cancelHit: number;
  /** Earliest frame the move can be cancelled after it misses. */
  cancelWhiff: number;
  /** Next move in the strike string, if any. */
  next?: MoveId | "ender";
  /** A connected launcher can be cancelled into a pursuit jump. */
  jumpCancel?: boolean;
  /** Frames of invulnerability from the first frame. */
  invuln?: number;
  /** The move fires a round at point-blank range. With an empty cylinder it lands as a weak pistol-whip. */
  round?: boolean;
  /** The move discharges the brace, which costs this much Nerve. Without it the blow lands with no blast. */
  nerve?: number;
}

const NEVER = 9999;

// Two kits share this table. The hunter's string is short and heavy: a pistol-whip,
// a backhand with the brace, then the brace's blast. The outlaw's is longer and
// lighter: two pistol-whips and a spur kick, then a round at point-blank range.
export const MOVES: Record<MoveId, MoveDef> = {
  w1: {
    id: "w1",
    total: 22,
    lunge: { from: 1, to: 6, speed: 30 },
    hits: [
      { from: 6, to: 9, range: 2.4, damage: 34, effect: "reel", stun: 26, blockstun: 13, guardDamage: 9, hitstop: 6, strength: 2, meter: 5 },
    ],
    cancelHit: 10,
    cancelWhiff: 16,
    next: "a2",
  },
  a2: {
    id: "a2",
    total: 28,
    lunge: { from: 1, to: 7, speed: 20 },
    hits: [
      { from: 8, to: 11, range: 2.6, damage: 48, effect: "reel", stun: 30, blockstun: 16, guardDamage: 16, hitstop: 8, strength: 2, meter: 6 },
    ],
    cancelHit: 12,
    cancelWhiff: 20,
    next: "ender",
  },
  armBlast: {
    id: "armBlast",
    total: 44,
    nerve: 15,
    lunge: { from: 1, to: 10, speed: 18 },
    hits: [
      { from: 12, to: 15, range: 2.9, damage: 95, effect: "blast", stun: 0, blockstun: 22, guardDamage: 34, hitstop: 14, strength: 3, meter: 0 },
    ],
    cancelHit: 18,
    cancelWhiff: NEVER,
  },
  armLaunch: {
    id: "armLaunch",
    total: 42,
    nerve: 15,
    lunge: { from: 1, to: 8, speed: 18 },
    hits: [
      { from: 10, to: 13, range: 2.8, damage: 80, effect: "launch", stun: 0, blockstun: 20, guardDamage: 28, hitstop: 12, strength: 3, meter: 0 },
    ],
    cancelHit: 15,
    cancelWhiff: NEVER,
    jumpCancel: true,
  },
  armSlam: {
    id: "armSlam",
    total: 42,
    nerve: 15,
    lunge: { from: 1, to: 10, speed: 18 },
    hits: [
      { from: 12, to: 15, range: 2.9, damage: 88, effect: "slam", stun: 0, blockstun: 22, guardDamage: 34, hitstop: 14, strength: 3, meter: 0 },
    ],
    cancelHit: 18,
    cancelWhiff: NEVER,
  },
  /** From guard: the brace discharges at arm's length. Slow, and it goes straight through a guard. */
  thunderclap: {
    id: "thunderclap",
    total: 50,
    lunge: { from: 10, to: 15, speed: 14 },
    hits: [
      { from: 16, to: 19, range: 3.3, damage: 130, effect: "blast", stun: 0, blockstun: 26, guardDamage: 100, hitstop: 16, strength: 3, meter: 0 },
    ],
    cancelHit: 22,
    cancelWhiff: NEVER,
  },
  s1: {
    id: "s1",
    total: 20,
    lunge: { from: 1, to: 6, speed: 34 },
    hits: [
      { from: 5, to: 8, range: 2.3, damage: 22, effect: "reel", stun: 22, blockstun: 12, guardDamage: 7, hitstop: 4, strength: 1, meter: 4 },
    ],
    cancelHit: 9,
    cancelWhiff: 14,
    next: "s2",
  },
  s2: {
    id: "s2",
    total: 22,
    lunge: { from: 1, to: 5, speed: 22 },
    hits: [
      { from: 5, to: 8, range: 2.3, damage: 24, effect: "reel", stun: 22, blockstun: 12, guardDamage: 7, hitstop: 4, strength: 1, meter: 4 },
    ],
    cancelHit: 9,
    cancelWhiff: 15,
    next: "s3",
  },
  s3: {
    id: "s3",
    total: 26,
    lunge: { from: 1, to: 7, speed: 22 },
    hits: [
      { from: 7, to: 10, range: 2.5, damage: 30, effect: "reel", stun: 26, blockstun: 14, guardDamage: 9, hitstop: 5, strength: 2, meter: 5 },
    ],
    cancelHit: 11,
    cancelWhiff: 18,
    next: "ender",
  },
  /** Gut shot: barrel to the ribs, and they leave. */
  enderBlast: {
    id: "enderBlast",
    total: 38,
    round: true,
    lunge: { from: 1, to: 9, speed: 20 },
    hits: [
      { from: 10, to: 13, range: 2.7, damage: 60, effect: "blast", stun: 0, blockstun: 20, guardDamage: 22, hitstop: 10, strength: 3, meter: 8 },
    ],
    cancelHit: 15,
    cancelWhiff: NEVER,
  },
  /** Rising shot: an uppercut with the barrel, fired skyward. */
  enderLaunch: {
    id: "enderLaunch",
    total: 36,
    round: true,
    lunge: { from: 1, to: 7, speed: 20 },
    hits: [
      { from: 8, to: 11, range: 2.6, damage: 50, effect: "launch", stun: 0, blockstun: 18, guardDamage: 18, hitstop: 8, strength: 3, meter: 8 },
    ],
    cancelHit: 13,
    cancelWhiff: NEVER,
    jumpCancel: true,
  },
  /** Hammer drop: the butt of the gun overhead, then a round straight down. */
  enderSlam: {
    id: "enderSlam",
    total: 36,
    round: true,
    lunge: { from: 1, to: 9, speed: 20 },
    hits: [
      { from: 10, to: 13, range: 2.7, damage: 56, effect: "slam", stun: 0, blockstun: 20, guardDamage: 22, hitstop: 10, strength: 3, meter: 8 },
    ],
    cancelHit: 16,
    cancelWhiff: NEVER,
  },
  // The witch does not aim. Her pulses hit everything around her, so there is no getting behind her.
  h1: {
    id: "h1",
    total: 24,
    lunge: { from: 1, to: 6, speed: 12 },
    hits: [
      { from: 7, to: 10, range: 3.6, aoe: true, damage: 28, effect: "reel", stun: 24, blockstun: 12, guardDamage: 8, hitstop: 4, strength: 1, meter: 5 },
    ],
    cancelHit: 11,
    cancelWhiff: 16,
    next: "h2",
  },
  h2: {
    id: "h2",
    total: 26,
    lunge: { from: 1, to: 6, speed: 12 },
    hits: [
      { from: 8, to: 11, range: 3.8, aoe: true, damage: 34, effect: "reel", stun: 28, blockstun: 14, guardDamage: 10, hitstop: 5, strength: 2, meter: 6 },
    ],
    cancelHit: 12,
    cancelWhiff: 18,
    next: "ender",
  },
  novaBlast: {
    id: "novaBlast",
    total: 44,
    nerve: 15,
    hits: [
      { from: 12, to: 15, range: 4.6, aoe: true, damage: 88, effect: "blast", stun: 0, blockstun: 20, guardDamage: 26, hitstop: 12, strength: 3, meter: 0, status: "hex" },
    ],
    cancelHit: 18,
    cancelWhiff: NEVER,
  },
  novaLaunch: {
    id: "novaLaunch",
    total: 42,
    nerve: 15,
    hits: [
      { from: 10, to: 13, range: 4.4, aoe: true, damage: 74, effect: "launch", stun: 0, blockstun: 18, guardDamage: 22, hitstop: 10, strength: 3, meter: 0, status: "hex" },
    ],
    cancelHit: 15,
    cancelWhiff: NEVER,
    jumpCancel: true,
  },
  novaSlam: {
    id: "novaSlam",
    total: 42,
    nerve: 15,
    hits: [
      { from: 12, to: 15, range: 4.6, aoe: true, damage: 80, effect: "slam", stun: 0, blockstun: 20, guardDamage: 26, hitstop: 12, strength: 3, meter: 0, status: "hex" },
    ],
    cancelHit: 18,
    cancelWhiff: NEVER,
  },
  circle: {
    id: "circle",
    total: 34,
    hits: [],
    fireAt: 10,
    cancelHit: NEVER,
    cancelWhiff: NEVER,
  },
  // The engineer: a wrench, a steam gauntlet, then the prod that leaves them shocked.
  e1: {
    id: "e1",
    total: 22,
    lunge: { from: 1, to: 6, speed: 30 },
    hits: [
      { from: 6, to: 9, range: 2.4, damage: 28, effect: "reel", stun: 24, blockstun: 13, guardDamage: 8, hitstop: 5, strength: 1, meter: 5 },
    ],
    cancelHit: 10,
    cancelWhiff: 16,
    next: "e2",
  },
  e2: {
    id: "e2",
    total: 26,
    lunge: { from: 1, to: 7, speed: 20 },
    hits: [
      { from: 7, to: 10, range: 2.5, damage: 36, effect: "reel", stun: 28, blockstun: 15, guardDamage: 12, hitstop: 7, strength: 2, meter: 6 },
    ],
    cancelHit: 11,
    cancelWhiff: 19,
    next: "ender",
  },
  prodBlast: {
    id: "prodBlast",
    total: 42,
    nerve: 15,
    lunge: { from: 1, to: 9, speed: 18 },
    hits: [
      { from: 11, to: 14, range: 2.8, damage: 64, effect: "blast", stun: 0, blockstun: 20, guardDamage: 26, hitstop: 12, strength: 3, meter: 0, status: "shock" },
    ],
    cancelHit: 17,
    cancelWhiff: NEVER,
  },
  prodLaunch: {
    id: "prodLaunch",
    total: 40,
    nerve: 15,
    lunge: { from: 1, to: 8, speed: 18 },
    hits: [
      { from: 9, to: 12, range: 2.7, damage: 60, effect: "launch", stun: 0, blockstun: 18, guardDamage: 22, hitstop: 10, strength: 3, meter: 0, status: "shock" },
    ],
    cancelHit: 14,
    cancelWhiff: NEVER,
    jumpCancel: true,
  },
  prodSlam: {
    id: "prodSlam",
    total: 40,
    nerve: 15,
    lunge: { from: 1, to: 9, speed: 18 },
    hits: [
      { from: 11, to: 14, range: 2.8, damage: 66, effect: "slam", stun: 0, blockstun: 20, guardDamage: 26, hitstop: 12, strength: 3, meter: 0, status: "shock" },
    ],
    cancelHit: 17,
    cancelWhiff: NEVER,
  },
  sentry: {
    id: "sentry",
    total: 30,
    hits: [],
    fireAt: 12,
    cancelHit: NEVER,
    cancelWhiff: NEVER,
  },
  // Rabble swing slowly, so a crowd of them can be read and answered.
  g1: {
    id: "g1",
    total: 34,
    lunge: { from: 8, to: 14, speed: 18 },
    hits: [
      { from: 15, to: 18, range: 2.3, damage: 22, effect: "reel", stun: 12, blockstun: 10, guardDamage: 6, hitstop: 3, strength: 1, meter: 0 },
    ],
    cancelHit: 22,
    cancelWhiff: 9999,
    next: "g2",
  },
  g2: {
    id: "g2",
    total: 38,
    lunge: { from: 6, to: 12, speed: 16 },
    hits: [
      { from: 14, to: 17, range: 2.4, damage: 30, effect: "reel", stun: 16, blockstun: 12, guardDamage: 9, hitstop: 4, strength: 2, meter: 0 },
    ],
    cancelHit: 9999,
    cancelWhiff: 9999,
  },
  /** Out of the holster and fired in one motion. */
  quickdraw: {
    id: "quickdraw",
    total: 30,
    hits: [],
    fireAt: 3,
    cancelHit: NEVER,
    cancelWhiff: NEVER,
  },
  /** Fanning the hammer: the length depends on the rounds left, so the rules handle it directly. */
  fan: {
    id: "fan",
    total: NEVER,
    hits: [],
    cancelHit: NEVER,
    cancelWhiff: NEVER,
  },
  lariat: {
    id: "lariat",
    total: 46,
    hits: [],
    fireAt: 11,
    cancelHit: 12,
    cancelWhiff: NEVER,
  },
  lastWord: {
    id: "lastWord",
    total: 74,
    hits: [],
    fireAt: 24,
    cancelHit: NEVER,
    cancelWhiff: NEVER,
    invuln: 24,
  },
  /** The finishing shot after a "dead" verdict. */
  coup: {
    id: "coup",
    total: 50,
    hits: [],
    cancelHit: NEVER,
    cancelWhiff: NEVER,
  },
};

/** An ender with no round behind it: it connects, but nobody goes flying. */
export const dryEnder = (hb: HitBox): HitBox => ({
  ...hb,
  damage: hb.damage * 0.5,
  effect: "reel",
  stun: 24,
  hitstop: 5,
  strength: 2,
  guardDamage: hb.guardDamage * 0.5,
});

/** The hunter's dash is a shoulder charge. This is what it does to whoever it reaches. */
export const TACKLE: HitBox = { from: 0, to: 0, range: 0, damage: 40, effect: "stagger", stun: 28, blockstun: 16, guardDamage: 30, hitstop: 9, strength: 2, meter: 6 };

/** The Last Word does not stop for rabble. This is what it does to each one on its way through. */
export const ULT_GRAZE: HitBox = { from: 0, to: 0, range: 0, damage: 260, effect: "blast", stun: 0, blockstun: 20, guardDamage: 60, hitstop: 4, strength: 3, meter: 0 };

/** Hit data for projectiles, in the same shape as strike hitboxes. Damage is set per shot. */
export const PROJ_HITS: Record<"bullet" | "quick", HitBox> = {
  bullet: { from: 0, to: 0, range: 0, damage: 14, effect: "reel", stun: 9, blockstun: 5, guardDamage: 4, hitstop: 1, strength: 1, meter: 4 },
  quick: { from: 0, to: 0, range: 0, damage: 70, effect: "blast", stun: 0, blockstun: 20, guardDamage: 50, hitstop: 9, strength: 3, meter: 12 },
};

/** Tesla jumping to the next body. Damage is a share of the shot that started it. */
export const CHAIN_HIT: HitBox = { from: 0, to: 0, range: 0, damage: 0, effect: "stagger", stun: 24, blockstun: 12, guardDamage: 20, hitstop: 3, strength: 2, meter: 4, status: "shock" };

/** A homing hex bolt, the witch's basic shot. */
export const BOLT_HIT: HitBox = { from: 0, to: 0, range: 0, damage: 42, effect: "reel", stun: 16, blockstun: 8, guardDamage: 8, hitstop: 3, strength: 1, meter: 5 };

export interface ZoneDef {
  radius: number;
  fuse: number;
  life: number;
  burst: number;
  /** What going off does to anyone caught in it. */
  effect: HitEffect;
  stun: number;
  every: number;
  tick: number;
  status: StatusId | null;
}

/** Areas. The fuse is the warning: the ground is marked before anything happens. */
export const ZONES: Record<ZoneKind, ZoneDef> = {
  // The witch's circle: goes off under you, then lingers and keeps you hexed.
  hex: { radius: 4.2, fuse: 34, life: 150, burst: 80, effect: "stagger", stun: 40, every: 30, tick: 12, status: "hex" },
  // Her storm: a bigger area, one hard strike, nothing left behind. Its damage scales with how long she chanted.
  storm: { radius: 6, fuse: 20, life: 14, burst: 125, effect: "blast", stun: 0, every: 0, tick: 0, status: "hex" },
};

/** Tunable constants. Distances in metres, speeds in metres per second, times in frames. */
export const C = {
  DT: 1 / 60,
  GRAVITY: 34,
  DJUMP_V: 13.5,
  /** The arena, for a duel. */
  ARENA_R: 75,
  /** The open field, for the overworld. */
  FIELD_R: 110,
  /** The hero locks onto enemies inside this range, and lets go of one that gets further than the second. */
  LOCK_R: 26,
  UNLOCK_R: 40,
  /** A gang notices a hero who comes this close. */
  ALERT_R: 20,
  /** At most this many rabble attack one hero at a time. The rest circle. */
  RABBLE_TURNS: 2,
  RABBLE_TURN_T: 150,
  /** Turns are handed out at least this far apart, so a crew comes in waves and not all at once. */
  RABBLE_TURN_GAP: 50,
  /** With nobody after them the hero gets their wind back: this share of their health each tick. */
  REST_REGEN: 0.0008,
  /** An overload also burns anyone standing this close to it. */
  OVERLOAD_R: 4.5,
  OVERLOAD_SPLASH: 0.6,
  /** With nobody to face, moves aim at a point this far ahead. */
  AIM_AHEAD: 12,
  /** How far from the middle of the field the gangs camp. */
  CAMP_R: 48,
  /** A gang leader in open country has this share of a duellist's health: these are quicker fights than the arena's. */
  LEADER_HP: 0.6,
  /** A crew gives up the chase when the hero is this far from their camp. */
  LEASH_R: 58,
  /** Rabble only get a turn to attack from inside this range. */
  TURN_R: 18,
  /** A leader calling the hero out strides in to this distance, at this speed. */
  CALLOUT_GAP: 12,
  CALLOUT_SPEED: 40,
  CALLOUT_WAIT: 120,
  /**
   * Crowd fights. Rabble fly further the more they have been hurt (1 + SMASH at no health),
   * and under SMASH_TUMBLE of their health any solid hit takes them off their feet.
   */
  SMASH: 1.2,
  SMASH_TUMBLE: 0.5,
  /** A blast throws rabble this share of the way it throws a duellist, before SMASH. */
  RABBLE_BLAST: 0.3,
  /** The hit that finishes one of the rabble throws them out of the fight at this speed. */
  RABBLE_KO_V: 30,
  /** Hits on or by rabble freeze the fight for no longer than this. */
  RABBLE_HITSTOP: 3,
  /** A body flying faster than this bowls over its own side's rabble. */
  BOWL_SPEED: 12,
  BOWL_DMG: 15,
  BOWL_POWER: 0.18,
  /** The shoulder charge also hits anyone this close to where it lands. */
  TACKLE_R: 2.6,
  BODY_R: 0.55,

  METER: 100,
  PIP_REGEN: 420,
  GUARD_HP: 100,
  GUARD_REGEN: 0.35,
  CHIP: 0.08,
  PERFECT_WINDOW: 6,
  PARRY_STUN: 38,
  GUARD_BREAK_STUN: 75,
  BUFFER: 9,

  CHASE_STOP: 1.7,
  STEP_SPEED: 27,
  STEP_T: 11,
  STEP_INVULN: 8,
  /** Nerve the thunderclap costs. */
  CLAP_COST: 25,
  /** How long a caught attacker is left open. */
  CATCH_STUN: 28,

  // The cylinder.
  AMMO: 6,
  SHOT_CD: 9,
  BULLET_DMG: 14,
  BULLET_SPEED: 90,
  BULLET_LIFE: 42,
  /** A full reload takes this long unless the timing is hit. */
  RELOAD: 84,
  /** Presses this early in a reload are ignored, so mashing on empty does not fumble. */
  RELOAD_GRACE: 14,
  RELOAD_PERFECT_FROM: 30,
  RELOAD_PERFECT_TO: 41,
  RELOAD_FUMBLE: 26,
  HOT_ROUNDS: 2,
  HOT_DMG: 1.5,
  /** Hold the shot button this long to start fanning the hammer. */
  FAN_HOLD: 12,
  FAN_GAP: 5,
  FAN_DMG: 0.8,
  FAN_RECOVER: 16,

  // Conditions.
  POISON_T: 300,
  POISON_EVERY: 20,
  POISON_DMG: 5,
  SHOCK_T: 180,
  /** The stun when shock first lands. It will not stun again until it has worn off. */
  SHOCK_STUN: 24,
  SHOCK_SLOW: 0.72,
  HEX_T: 300,
  HEX_DMG: 1.2,
  /** Two different conditions on one fighter burn off together. */
  OVERLOAD_DMG: 100,

  // The witch's bolts and circles, and the engineer's rivets, tesla and sentry.
  BOLT_SPEED: 32,
  BOLT_LIFE: 170,
  BOLT_TURN: 0.06,
  BOLT_CD: 26,
  CIRCLE_COST: 20,
  RIVET_DMG: 8,
  TESLA_DMG_MIN: 40,
  TESLA_DMG_MAX: 75,
  /** Tesla jumps to this many more bodies, each within this reach of the last, for this share of its damage. */
  CHAIN_JUMPS: 3,
  CHAIN_R: 7,
  CHAIN_DMG: 0.5,
  /** The sentry: how long it runs, how often and how far it shoots, and what a rivet from it does. */
  TURRET_LIFE: 480,
  TURRET_GAP: 26,
  TURRET_R: 22,
  TURRET_DMG: 5,
  /** Where it is set down, ahead of the engineer, and how high its barrel sits. */
  TURRET_AHEAD: 2.2,
  TURRET_H: 1,
  KNOT_STUN: 70,

  // Holding steady.
  STEADY_STARTUP: 8,
  NERVE_RATE: 0.55,
  /** One round slides into the cylinder this often while steady. */
  STEADY_CHAMBER: 10,
  /** Frames steady before the quickdraw is armed, and before it reaches full power. */
  QUICK_MIN: 18,
  QUICK_FULL: 75,
  QUICK_DMG_MIN: 70,
  QUICK_DMG_MAX: 130,
  QUICK_SPEED: 160,
  QUICK_LIFE: 24,

  // The standoff.
  /** Both fighters steady this long, and it becomes a standoff. */
  STANDOFF_MUTUAL: 36,
  STANDOFF_WAIT_MIN: 80,
  STANDOFF_WAIT_MAX: 170,
  /** After the bell, the standoff ends unresolved if nobody draws in this time. */
  STANDOFF_WINDOW: 100,
  /** Drawing before the bell locks you out for this long after it. */
  FLINCH_LOCK: 22,
  STANDOFF_DMG: 170,
  STANDOFF_NERVE: 25,
  STANDOFF_CD: 300,

  LARIAT_COST: 25,
  LASSO_SPEED: 100,
  LASSO_LIFE: 16,
  PULL_T: 16,
  PULL_STUN: 48,
  ZIP_STUN: 34,

  ULT_SPEED: 130,
  ULT_LIFE: 26,
  CINE_HITS: [46, 60, 72, 82, 90, 96],
  CINE_HIT_DMG: 42,
  CINE_FINAL_AT: 130,
  CINE_FINAL_DMG: 120,
  CINE_END: 150,

  AWAKEN_T: 600,
  AWAKEN_BURST_T: 26,
  AWAKEN_SLOW: 2 / 3,
  AWAKEN_DMG: 1.2,
  AWAKEN_GAIN_TAKEN: 0.09,
  AWAKEN_GAIN_DEALT: 0.04,
  /** Falling below this share of health fills the awakening gauge once per match. */
  COMEBACK_AT: 0.3,

  SLIP_T: 9,
  SLIP_BEHIND: 2.1,

  LAUNCH_V: 24,
  BLAST_V: 62,
  BLAST_DECEL: 46,
  BLAST_T: 80,
  SLAM_V: 48,
  BOUNCE_V: 9,

  KNOCKDOWN_T: 40,
  QUICK_RISE_AT: 14,
  GETUP_T: 14,

  // Dead or alive.
  /** The winner has this long to choose before it defaults to "dead". */
  VERDICT_T: 240,
  /** Presses this early are ignored, so the last combo's mashing does not choose for you. */
  VERDICT_GRACE: 24,
  /** Frames from the choice to the shot or the rope landing. */
  VERDICT_ACT: 14,
  BOUNTY_DEAD: 500,
  BOUNTY_ALIVE: 1000,

  INTRO_T: 90,
  KO_T: 170,
  SCALE_STEP: 0.08,
  SCALE_MIN: 0.35,
} as const;
