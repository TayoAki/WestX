import type { HitEffect, MoveId } from "./types";

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
}

const NEVER = 9999;

// The hunter fights with the guns even up close: two pistol-whips and a spur kick,
// then an ender that puts a round into the target.
export const MOVES: Record<MoveId, MoveDef> = {
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

/** Hit data for projectiles, in the same shape as strike hitboxes. Damage is set per shot. */
export const PROJ_HITS: Record<"bullet" | "quick", HitBox> = {
  bullet: { from: 0, to: 0, range: 0, damage: 14, effect: "reel", stun: 9, blockstun: 5, guardDamage: 4, hitstop: 1, strength: 1, meter: 4 },
  quick: { from: 0, to: 0, range: 0, damage: 70, effect: "blast", stun: 0, blockstun: 20, guardDamage: 50, hitstop: 9, strength: 3, meter: 12 },
};

/** Tunable constants. Distances in metres, speeds in metres per second, times in frames. */
export const C = {
  DT: 1 / 60,
  GRAVITY: 34,
  RUN: 8.5,
  AIR_RUN: 7.5,
  JUMP_V: 14.5,
  DJUMP_V: 13.5,
  ARENA_R: 75,
  BODY_R: 0.55,

  HP: 2000,
  METER: 100,
  PIPS: 4,
  PIP_REGEN: 420,
  GUARD_HP: 100,
  GUARD_REGEN: 0.35,
  CHIP: 0.08,
  PERFECT_WINDOW: 6,
  PARRY_STUN: 38,
  GUARD_BREAK_STUN: 75,
  BUFFER: 9,

  CHASE_COST: 15,
  CHASE_SPEED: 95,
  CHASE_MAX: 34,
  CHASE_STOP: 1.7,
  MAX_CHASES: 2,
  MAX_LAUNCHES: 2,
  STEP_SPEED: 27,
  STEP_T: 11,
  STEP_INVULN: 8,
  STEP_CD: 26,

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
