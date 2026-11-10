import type { KitId } from "./kits";
import type { Rng } from "./rng";
import type { V3 } from "./vec";

/**
 * One tick of player intent. Movement is relative to the line between the two
 * fighters, not to the camera: `my` is toward the opponent, `mx` circles right.
 * `tilt` is the raw up/down the player is holding: up launches, down slams.
 */
export interface InputFrame {
  mx: number;
  my: number;
  tilt: number;
  strike: boolean;
  shot: boolean;
  dash: boolean;
  jump: boolean;
  guard: boolean;
  steady: boolean;
  special: boolean;
  ult: boolean;
  awaken: boolean;
}

export const BUTTONS = ["strike", "shot", "dash", "jump", "guard", "steady", "special", "ult", "awaken"] as const;
export type Button = (typeof BUTTONS)[number];

export const blankInput = (): InputFrame => ({
  mx: 0,
  my: 0,
  tilt: 0,
  strike: false,
  shot: false,
  dash: false,
  jump: false,
  guard: false,
  steady: false,
  special: false,
  ult: false,
  awaken: false,
});

export type FState =
  | "free"
  | "attack"
  | "step"
  | "chase"
  | "guard"
  | "blockstun"
  | "parried"
  | "hitstun"
  | "stagger"
  | "launched"
  | "blasted"
  | "slammed"
  | "bounced"
  | "knockdown"
  | "getup"
  /** Holstered and still: builds Nerve, tops up the cylinder, arms the quickdraw. */
  | "steady"
  | "slip"
  | "pulled"
  | "zip"
  | "burst"
  /** Frozen face to face, waiting for the bell. */
  | "standoff"
  | "cine"
  /** Beaten and on their knees, waiting for the winner's verdict. */
  | "downed"
  /** Roped and brought in alive. */
  | "tied"
  | "ko";

export type MoveId =
  // The hunter: a pistol-whip, a backhand with the brace, then the brace's blast.
  | "w1"
  | "a2"
  | "armBlast"
  | "armLaunch"
  | "armSlam"
  | "thunderclap"
  // The witch: two hex pulses around her, then a nova.
  | "h1"
  | "h2"
  | "novaBlast"
  | "novaLaunch"
  | "novaSlam"
  /** Laying a hex circle on the ground under the target. */
  | "circle"
  // The engineer: wrench, gauntlet, then the shock prod.
  | "e1"
  | "e2"
  | "prodBlast"
  | "prodLaunch"
  | "prodSlam"
  /** Lobbing a gas canister at the target's feet. */
  | "canister"
  // The outlaw.
  | "s1"
  | "s2"
  | "s3"
  | "enderBlast"
  | "enderLaunch"
  | "enderSlam"
  | "quickdraw"
  | "fan"
  | "lariat"
  | "lastWord"
  | "coup";

export type HitEffect = "reel" | "launch" | "blast" | "slam" | "stagger";

/**
 * Conditions a fighter can be put under.
 *  - poison: steady damage over time.
 *  - shock: a short stun when it lands, then slowed, with dashes that will not recharge.
 *  - hex: every hit hurts more.
 * Two different conditions on one fighter react: an overload.
 */
export const STATUSES = ["poison", "shock", "hex"] as const;
export type StatusId = (typeof STATUSES)[number];

export interface Combo {
  hits: number;
  damage: number;
  chases: number;
  launches: number;
}

export interface Fighter {
  id: number;
  name: string;
  kit: KitId;
  maxHp: number;
  pos: V3;
  vel: V3;
  yaw: number;
  grounded: boolean;
  airJumps: number;

  hp: number;
  /** Nerve. 0..100. Built by holding steady and by landing hits. */
  meter: number;
  /** Charges for breaking out of a combo. */
  pips: number;
  pipTimer: number;
  /** Dash charges left, and progress toward the next one. */
  dashes: number;
  dashTimer: number;
  guardHp: number;
  /** Frames left of each condition. */
  status: Record<StatusId, number>;
  /** Awakening gauge, 0..100. */
  awaken: number;
  /** Frames of awakening left. */
  awakened: number;
  /** True once low health has filled the awakening gauge. */
  comebackUsed: boolean;

  /** Rounds in the cylinder. */
  ammo: number;
  /** Frames of reload left. Above zero means the cylinder is open. */
  reload: number;
  /** Frames since the reload began, for the timing window. */
  reloadT: number;
  /** One attempt at the perfect reload per reload. */
  reloadTried: boolean;
  /** Hot rounds left after a perfect reload. They hit harder. */
  hot: number;
  shotCd: number;
  /** Frames the shot button has been held, for fanning the hammer. */
  shotHold: number;
  /** Frames left of the shooting pose, for the renderer. */
  shotPose: number;
  /** True when the current ender had a round behind it. */
  enderLive: boolean;
  /** Damage multiplier for that round. */
  enderMult: number;
  /** How long the fighter held steady before the quickdraw, 0..1. */
  quickPower: number;

  state: FState;
  /** Frames spent in the current state. */
  t: number;
  /** Planned length of the current state, where it has one. */
  dur: number;
  move: MoveId | null;
  /** Frame within the current move. */
  mf: number;
  hitDone: boolean[];
  moveHit: boolean;
  /** For lariat: pull yourself to the target instead of the target to you. */
  zipFlag: boolean;
  /** True while a hit-stunned fighter is hanging in the air. */
  airHang: boolean;

  invuln: number;
  /** Frames since guard was raised, for the perfect-guard window. */
  guardT: number;
  /** Fractional clock used when an awakened opponent slows this fighter. */
  slowAcc: number;
  /** Time scale applied to this fighter's motion this tick. */
  timeScale: number;
  stepDir: V3;
  /** Anchor point for pull and zip motion. */
  anchor: V3;
  /** Counts hits taken; lets the AI and tests notice a new hit. */
  hitsTaken: number;

  buf: Record<Button, number>;
  prev: InputFrame;
  /** The combo this fighter is currently dealing. */
  combo: Combo;
}

export type ProjKind = "bullet" | "quick" | "lasso" | "ult" | "bolt";

export interface Projectile {
  id: number;
  kind: ProjKind;
  owner: number;
  pos: V3;
  prev: V3;
  vel: V3;
  life: number;
  radius: number;
  damage: number;
  /** A condition the shot carries. */
  status?: StatusId;
  /** How sharply it can turn toward its target each tick, in radians. Zero flies straight. */
  homing: number;
}

export type ZoneKind = "hex" | "storm" | "gas";

/** An area on the ground that hurts anyone but its owner: the witch's circles, the engineer's gas. */
export interface Zone {
  id: number;
  kind: ZoneKind;
  owner: number;
  pos: V3;
  radius: number;
  /** Frames until it goes off. The area is marked on the ground meanwhile. */
  fuse: number;
  /** Frames it lingers after going off. */
  life: number;
  /** Damage when it goes off. */
  burst: number;
  /** While it lingers, it hurts this often and this much. */
  every: number;
  tick: number;
  status: StatusId | null;
}

export type PropKind = "crate" | "barrel" | "cactus" | "rock";

export interface Prop {
  kind: PropKind;
  pos: V3;
  radius: number;
  height: number;
  hp: number;
  broken: boolean;
}

export interface Cine {
  att: number;
  def: number;
  t: number;
}

export interface Standoff {
  t: number;
  /** Frame the bell tolls. Drawing before it is a flinch. */
  bellAt: number;
  /** Earliest frame each fighter may draw. A flinch pushes it past the bell. */
  lock: [number, number];
  /** The standoff that opens the duel; its shot cannot end the match. */
  opening: boolean;
}

export interface Verdict {
  t: number;
  choice: "dead" | "alive" | null;
  /** Frame the choice was made. */
  at: number;
}

export type ShotKind = "bullet" | "fan" | "quick" | "coup" | "bolt" | "rivet" | "tesla";

export type SimEvent =
  | { type: "phase"; phase: Match["phase"] }
  | {
      type: "hit";
      att: number;
      def: number;
      pos: V3;
      strength: number;
      effect: HitEffect;
      damage: number;
      blocked: boolean;
      perfect: boolean;
      projectile: boolean;
    }
  | { type: "shot"; owner: number; pos: V3; kind: ShotKind }
  /** A string ender fired its round at point-blank range. */
  | { type: "enderShot"; id: number; pos: V3; dir: V3 }
  /** The hunter's brace discharged. `big` is the thunderclap. */
  | { type: "armBlast"; id: number; pos: V3; dir: V3; big: boolean }
  /** The brace turned a shot aside. `back` means it was sent back at the shooter. */
  | { type: "deflect"; id: number; pos: V3; back: boolean }
  /** The hunter caught a blow mid-combo. */
  | { type: "armCatch"; id: number; pos: V3 }
  | { type: "zoneSpawn"; id: number; kind: ZoneKind; owner: number; pos: V3; radius: number; fuse: number; life: number }
  | { type: "zoneErupt"; id: number; kind: ZoneKind; pos: V3; radius: number }
  | { type: "zoneEnd"; id: number }
  /** A condition took hold of a fighter. */
  | { type: "status"; id: number; kind: StatusId; pos: V3 }
  /** Two conditions met on one fighter. */
  | { type: "overload"; id: number; pos: V3 }
  | { type: "dryFire"; id: number; pos: V3 }
  /** A round slid into the cylinder while holding steady. */
  | { type: "chamber"; id: number }
  | { type: "reloadStart"; id: number }
  | { type: "reloadEnd"; id: number; perfect: boolean }
  | { type: "reloadFumble"; id: number }
  | { type: "lasso"; owner: number; hit: boolean }
  | { type: "slipOut"; id: number; pos: V3 }
  | { type: "slipIn"; id: number; pos: V3 }
  | { type: "chase"; id: number; pos: V3 }
  | { type: "chaseCatch"; id: number; pos: V3 }
  | { type: "step"; id: number; pos: V3 }
  | { type: "jump"; id: number; pos: V3; double: boolean }
  | { type: "land"; id: number; pos: V3; hard: boolean }
  | { type: "groundSlam"; id: number; pos: V3 }
  | { type: "wallHit"; id: number; pos: V3 }
  | { type: "propBreak"; index: number; pos: V3; dir: V3 }
  | { type: "guardBreak"; id: number; pos: V3 }
  | { type: "awaken"; id: number; pos: V3 }
  | { type: "awakenEnd"; id: number }
  | { type: "ultStart"; id: number; pos: V3 }
  | { type: "cineStart"; att: number; def: number }
  | { type: "cineHit"; att: number; def: number; pos: V3; final: boolean }
  | { type: "cineEnd"; att: number; def: number }
  | { type: "standoffStart"; opening: boolean }
  | { type: "standoffBell" }
  | { type: "standoffFlinch"; id: number }
  /** `winner` is -1 when nobody drew in time or both drew on the same frame (`trade`). */
  | { type: "standoffEnd"; winner: number; trade: boolean }
  | { type: "verdictStart"; winner: number; pos: V3 }
  | { type: "comboEnd"; att: number; hits: number; damage: number }
  | { type: "ko"; winner: number; pos: V3; alive: boolean };

export interface MatchOptions {
  /** Training: the opponent's health refills and the player's Nerve stays topped up. */
  training: boolean;
  /** Open the duel with a standoff. */
  opening: boolean;
  /** Which kit each fighter uses. */
  kits: [KitId, KitId];
}

export interface Match {
  tick: number;
  phase: "intro" | "fight" | "verdict" | "ko" | "done";
  phaseT: number;
  fighters: [Fighter, Fighter];
  projectiles: Projectile[];
  nextProjId: number;
  props: Prop[];
  zones: Zone[];
  nextZoneId: number;
  /** Frames of freeze left after a hit. */
  hitstop: number;
  cine: Cine | null;
  standoff: Standoff | null;
  /** Frames before another standoff can begin. */
  standoffCd: number;
  verdict: Verdict | null;
  winner: number;
  /** How the loser was brought in. */
  outcome: "dead" | "alive" | null;
  rng: Rng;
  events: SimEvent[];
  opts: MatchOptions;
}
