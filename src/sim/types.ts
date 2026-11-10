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
  charge: boolean;
  special: boolean;
  ult: boolean;
  awaken: boolean;
}

export const BUTTONS = ["strike", "shot", "dash", "jump", "guard", "charge", "special", "ult", "awaken"] as const;
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
  charge: false,
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
  | "charge"
  | "slip"
  | "pulled"
  | "zip"
  | "burst"
  | "clash"
  | "cine"
  | "ko";

export type MoveId =
  | "s1"
  | "s2"
  | "s3"
  | "enderBlast"
  | "enderLaunch"
  | "enderSlam"
  | "heavyShot"
  | "lariat"
  | "lastWord";

export type HitEffect = "reel" | "launch" | "blast" | "slam" | "stagger";

export interface Combo {
  hits: number;
  damage: number;
  chases: number;
  launches: number;
}

export interface Fighter {
  id: number;
  name: string;
  pos: V3;
  vel: V3;
  yaw: number;
  grounded: boolean;
  airJumps: number;

  hp: number;
  /** Grit for the hunter. 0..100. */
  meter: number;
  /** Slip charges. */
  pips: number;
  pipTimer: number;
  guardHp: number;
  /** Awakening gauge, 0..100. */
  awaken: number;
  /** Frames of awakening left. */
  awakened: number;
  /** True once low health has filled the awakening gauge. */
  comebackUsed: boolean;
  ammo: number;
  reload: number;
  sinceShot: number;
  shotCd: number;
  /** Frames the shot button has been held, for the heavy shot. */
  shotHold: number;
  /** Frames left of the shooting pose, for the renderer. */
  shotPose: number;

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
  stepCd: number;
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

export type ProjKind = "bullet" | "heavy" | "lasso" | "ult";

export interface Projectile {
  id: number;
  kind: ProjKind;
  owner: number;
  pos: V3;
  prev: V3;
  vel: V3;
  life: number;
  radius: number;
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

export interface Clash {
  t: number;
  power: [number, number];
  pos: V3;
}

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
  | { type: "shot"; owner: number; pos: V3; heavy: boolean }
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
  | { type: "clashStart"; pos: V3 }
  | { type: "clashEnd"; winner: number; pos: V3 }
  | { type: "comboEnd"; att: number; hits: number; damage: number }
  | { type: "ko"; winner: number; pos: V3 };

export interface MatchOptions {
  /** Training: the opponent's health refills and the player's meter stays topped up. */
  training: boolean;
}

export interface Match {
  tick: number;
  phase: "intro" | "fight" | "ko" | "done";
  phaseT: number;
  fighters: [Fighter, Fighter];
  projectiles: Projectile[];
  nextProjId: number;
  props: Prop[];
  /** Frames of freeze left after a hit. */
  hitstop: number;
  cine: Cine | null;
  clash: Clash | null;
  winner: number;
  rng: Rng;
  events: SimEvent[];
  opts: MatchOptions;
}
