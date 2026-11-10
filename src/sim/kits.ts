import type { MoveId } from "./types";

// A kit is what makes one fighter play differently from another: how they move,
// how much they can dash, how long their strings run, what their buttons do.
//
// The three playable classes are built to need each other:
//   - The witch owns space. Her attacks are areas, not aims.
//   - The engineer owns conditions. Poison wears you down; shock stops you.
//   - The lawman is the balance: solid at every range, hard to move, no gimmicks.
// The outlaw is a rival-only kit: quick, slippery and light.

export type KitId = "hunter" | "witch" | "engineer" | "outlaw";

export interface Kit {
  id: KitId;
  hp: number;
  run: number;
  airRun: number;
  jumpV: number;
  /** Extra jumps in the air. */
  airJumps: number;
  /** How hard gravity pulls on the way down. Below 1 is a float. */
  fall: number;

  /** Dash charges, and the frames it takes to get one back. */
  dashes: number;
  dashRegen: number;
  /** Speed of the homing dash and how many frames it can last. Together they set its reach. */
  chaseSpeed: number;
  chaseFrames: number;
  /** The dash is a shoulder charge that hits whoever it reaches. */
  tackle: boolean;

  /** The strike string, in order. The last move flows into an ender. */
  string: MoveId[];
  enders: { blast: MoveId; launch: MoveId; slam: MoveId };
  /** Limits on how far one combo can be stretched. */
  maxChases: number;
  maxLaunches: number;

  /** Walking speed while guarding, as a share of run speed. Zero means rooted. */
  guardWalk: number;
  /** The guard turns light shots aside for nothing, and a perfectly timed one sends the shot back. */
  deflect: boolean;
  /** Strike from guard is a guard-breaking blast. */
  thunderclap: boolean;
  /** How this fighter gets out of a combo: vanish behind the attacker, or catch the blow and stay put. */
  breaker: "slip" | "catch";
  /** A caught attacker is shocked instead of thrown off. */
  catchShock: boolean;
  /** Charges for that escape. */
  pips: number;

  /**
   * What the shot button fires. A revolver and a rivet gun both use the six-round
   * cylinder; rivets carry poison. `none` is the witch, who throws homing bolts on a cooldown.
   */
  gun: "revolver" | "rivet" | "none";
  /** Holding the shot button: empty the cylinder, or lay a hex circle under the target. */
  hold: "fan" | "circle";
  /** Shot from holding steady: one hard bullet, a storm over the target, or a bolt that shocks. */
  quick: "quickdraw" | "storm" | "tesla";
  /** The special button: rope them in, hang them in the air, or gas the ground they stand on. */
  special: "lariat" | "knot" | "canister";
}

export const KITS: Record<KitId, Kit> = {
  hunter: {
    id: "hunter",
    hp: 2000,
    run: 6.8,
    airRun: 6.2,
    jumpV: 13,
    airJumps: 0,
    fall: 1,
    dashes: 2,
    dashRegen: 170,
    chaseSpeed: 72,
    chaseFrames: 16,
    tackle: true,
    string: ["w1", "a2"],
    enders: { blast: "armBlast", launch: "armLaunch", slam: "armSlam" },
    maxChases: 1,
    maxLaunches: 1,
    guardWalk: 0.5,
    deflect: true,
    thunderclap: true,
    breaker: "catch",
    catchShock: false,
    pips: 3,
    gun: "revolver",
    hold: "fan",
    quick: "quickdraw",
    special: "lariat",
  },
  witch: {
    id: "witch",
    hp: 1650,
    run: 6.4,
    airRun: 7.8,
    jumpV: 15,
    airJumps: 1,
    fall: 0.5,
    dashes: 3,
    dashRegen: 120,
    // A blink: very fast, very short.
    chaseSpeed: 120,
    chaseFrames: 9,
    tackle: false,
    string: ["h1", "h2"],
    enders: { blast: "novaBlast", launch: "novaLaunch", slam: "novaSlam" },
    maxChases: 1,
    maxLaunches: 1,
    guardWalk: 0,
    deflect: false,
    thunderclap: false,
    breaker: "slip",
    catchShock: false,
    pips: 3,
    gun: "none",
    hold: "circle",
    quick: "storm",
    special: "knot",
  },
  engineer: {
    id: "engineer",
    hp: 1700,
    run: 7.4,
    airRun: 7,
    jumpV: 13.5,
    airJumps: 1,
    fall: 1,
    dashes: 2,
    dashRegen: 150,
    chaseSpeed: 85,
    chaseFrames: 14,
    tackle: false,
    string: ["e1", "e2"],
    enders: { blast: "prodBlast", launch: "prodLaunch", slam: "prodSlam" },
    maxChases: 1,
    maxLaunches: 1,
    guardWalk: 0,
    deflect: false,
    thunderclap: false,
    breaker: "catch",
    catchShock: true,
    pips: 3,
    gun: "rivet",
    hold: "fan",
    quick: "tesla",
    special: "canister",
  },
  outlaw: {
    id: "outlaw",
    hp: 1800,
    run: 8.8,
    airRun: 7.6,
    jumpV: 14.5,
    airJumps: 1,
    fall: 1,
    dashes: 3,
    dashRegen: 100,
    chaseSpeed: 95,
    chaseFrames: 34,
    tackle: false,
    string: ["s1", "s2", "s3"],
    enders: { blast: "enderBlast", launch: "enderLaunch", slam: "enderSlam" },
    maxChases: 2,
    maxLaunches: 2,
    guardWalk: 0,
    deflect: false,
    thunderclap: false,
    breaker: "slip",
    catchShock: false,
    pips: 4,
    gun: "revolver",
    hold: "fan",
    quick: "quickdraw",
    special: "lariat",
  },
};
