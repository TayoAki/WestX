import type { MoveId } from "./types";

// A kit is what makes one fighter play differently from another: how they move,
// how much they can dash, how long their strings run and how they defend.
//
// The hunter is a wall. He walks, he is hard to move, and he ends things in a
// few heavy blows. The outlaw is the opposite: quick, slippery and light.

export type KitId = "hunter" | "outlaw";

export interface Kit {
  id: KitId;
  hp: number;
  run: number;
  airRun: number;
  jumpV: number;
  /** Extra jumps in the air. */
  airJumps: number;

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
  /** Charges for that escape. */
  pips: number;
}

export const KITS: Record<KitId, Kit> = {
  hunter: {
    id: "hunter",
    hp: 2000,
    run: 6.8,
    airRun: 6.2,
    jumpV: 13,
    airJumps: 0,
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
    pips: 3,
  },
  outlaw: {
    id: "outlaw",
    hp: 1800,
    run: 8.8,
    airRun: 7.6,
    jumpV: 14.5,
    airJumps: 1,
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
    pips: 4,
  },
};
