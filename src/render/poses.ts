import { MOVES } from "../sim/moves";
import type { Fighter, Match } from "../sim/types";

// Procedural animation. There are no animation files: each state maps to a key
// pose (joint angles in radians) and the rig eases toward it. Fast easing on
// attacks gives the snap of hand-keyed anime poses.
//
// Conventions for a character facing +Z: limbs hang along -Y at zero rotation;
// negative X-rotation swings a limb forward; positive Z-rotation swings it to
// the character's right; a positive spine X-rotation leans forward.

export type Joint = "body" | "spine" | "head" | "shL" | "elL" | "shR" | "elR" | "hipL" | "knL" | "hipR" | "knR";
export const JOINTS: Joint[] = ["body", "spine", "head", "shL", "elL", "shR", "elR", "hipL", "knL", "hipR", "knR"];

type R3 = [number, number, number];
export type Pose = Record<Joint, R3> & { y: number };

const pose = (p: Partial<Record<Joint, R3>> & { y?: number }): Pose => {
  const out = { y: p.y ?? 0 } as Pose;
  for (const j of JOINTS) out[j] = p[j] ?? [0, 0, 0];
  return out;
};

/** Swaps left and right, for the off-hand version of a move. */
function mirror(p: Pose): Pose {
  const flip = (r: R3): R3 => [r[0], -r[1], -r[2]];
  return {
    y: p.y,
    body: flip(p.body),
    spine: flip(p.spine),
    head: flip(p.head),
    shL: flip(p.shR),
    elL: flip(p.elR),
    shR: flip(p.shL),
    elR: flip(p.elL),
    hipL: flip(p.hipR),
    knL: flip(p.knR),
    hipR: flip(p.hipL),
    knR: flip(p.knL),
  };
}

function blend(a: Pose, b: Pose, t: number): Pose {
  const out = { y: a.y + (b.y - a.y) * t } as Pose;
  for (const j of JOINTS) {
    out[j] = [a[j][0] + (b[j][0] - a[j][0]) * t, a[j][1] + (b[j][1] - a[j][1]) * t, a[j][2] + (b[j][2] - a[j][2]) * t];
  }
  return out;
}

const IDLE = pose({
  y: -0.05,
  spine: [0.1, -0.3, 0],
  head: [0, 0.3, 0],
  shR: [-0.35, 0, 0.25],
  elR: [-1.1, 0, 0],
  shL: [-0.15, 0, -0.3],
  elL: [-0.7, 0, 0],
  hipL: [-0.25, 0, -0.12],
  knL: [0.35, 0, 0],
  hipR: [0.2, 0, 0.12],
  knR: [0.4, 0, 0],
});

const JUMP = pose({
  spine: [0.1, 0, 0],
  shL: [0.3, 0, -0.5],
  shR: [0.3, 0, 0.5],
  elL: [-0.6, 0, 0],
  elR: [-0.6, 0, 0],
  hipL: [-0.9, 0, 0],
  knL: [1.4, 0, 0],
  hipR: [-0.2, 0, 0],
  knR: [0.8, 0, 0],
});

const FALL = pose({
  spine: [0.05, 0, 0],
  shL: [-0.4, 0, -1.0],
  shR: [-0.4, 0, 1.0],
  elL: [-0.3, 0, 0],
  elR: [-0.3, 0, 0],
  hipL: [-0.3, 0, -0.1],
  knL: [0.5, 0, 0],
  hipR: [0.1, 0, 0.1],
  knR: [0.6, 0, 0],
});

const S1_WIND = pose({
  y: -0.08,
  spine: [0.1, 0.6, 0],
  shR: [0.3, 0, 1.3],
  elR: [-1.6, 0, 0],
  shL: [-0.5, 0, -0.3],
  elL: [-1.2, 0, 0],
  hipL: [-0.4, 0, -0.1],
  knL: [0.5, 0, 0],
  hipR: [0.3, 0, 0.1],
  knR: [0.4, 0, 0],
});
const S1_HIT = pose({
  y: -0.1,
  spine: [0.22, -0.75, 0],
  head: [0, 0.5, 0],
  shR: [-1.45, 0, -0.25],
  elR: [-0.3, 0, 0],
  shL: [0.5, 0, -0.5],
  elL: [-1.0, 0, 0],
  hipL: [-0.6, 0, -0.1],
  knL: [0.6, 0, 0],
  hipR: [0.5, 0, 0.1],
  knR: [0.25, 0, 0],
});
const S2_WIND = mirror(S1_WIND);
const S2_HIT = mirror(S1_HIT);

const S3_HIT = pose({
  y: -0.02,
  spine: [-0.35, 0, 0],
  shL: [-0.2, 0, -1.1],
  shR: [-0.2, 0, 1.1],
  elL: [-0.5, 0, 0],
  elR: [-0.5, 0, 0],
  hipR: [-1.5, 0, 0.15],
  knR: [0.05, 0, 0],
  hipL: [0.1, 0, -0.1],
  knL: [0.3, 0, 0],
});

const BLAST_WIND = pose({
  y: -0.18,
  spine: [0.45, 0.5, 0],
  shR: [0.9, 0, 0.3],
  shL: [0.9, 0, -0.3],
  elR: [-1.5, 0, 0],
  elL: [-1.5, 0, 0],
  hipL: [-0.5, 0, -0.1],
  knL: [0.9, 0, 0],
  hipR: [0.2, 0, 0.1],
  knR: [0.8, 0, 0],
});
const BLAST_HIT = pose({
  y: -0.16,
  spine: [0.4, -0.35, 0],
  head: [-0.3, 0.3, 0],
  shR: [-1.4, 0, -0.1],
  elR: [-0.1, 0, 0],
  shL: [0.7, 0, -0.4],
  elL: [-1.2, 0, 0],
  hipL: [-0.95, 0, -0.1],
  knL: [0.95, 0, 0],
  hipR: [0.75, 0, 0.1],
  knR: [0.1, 0, 0],
});

const LAUNCH_WIND = pose({
  y: -0.38,
  spine: [0.5, 0.3, 0],
  shR: [0.5, 0, 0.3],
  elR: [-1.4, 0, 0],
  shL: [-0.4, 0, -0.3],
  elL: [-1.2, 0, 0],
  hipL: [-1.0, 0, -0.1],
  knL: [1.6, 0, 0],
  hipR: [-0.8, 0, 0.1],
  knR: [1.6, 0, 0],
});
const LAUNCH_HIT = pose({
  y: 0.22,
  spine: [-0.18, -0.2, 0],
  head: [-0.4, 0, 0],
  shR: [-2.95, 0, 0.1],
  shL: [0.4, 0, -0.4],
  elL: [-0.8, 0, 0],
  hipL: [-1.25, 0, 0],
  knL: [1.5, 0, 0],
  hipR: [0.1, 0, 0],
  knR: [0.1, 0, 0],
});

const SLAM_WIND = pose({
  y: 0.1,
  spine: [-0.32, 0, 0],
  head: [-0.3, 0, 0],
  shL: [-2.9, 0, -0.2],
  shR: [-2.9, 0, 0.2],
  hipL: [-0.2, 0, -0.1],
  knL: [0.5, 0, 0],
  hipR: [0.1, 0, 0.1],
  knR: [0.6, 0, 0],
});
const SLAM_HIT = pose({
  y: -0.22,
  spine: [0.75, 0, 0],
  head: [-0.4, 0, 0],
  shL: [-0.85, 0, -0.1],
  shR: [-0.85, 0, 0.1],
  hipL: [-0.8, 0, -0.1],
  knL: [1.1, 0, 0],
  hipR: [-0.4, 0, 0.1],
  knR: [1.1, 0, 0],
});

const GUARD = pose({
  y: -0.12,
  spine: [0.25, 0, 0],
  shL: [-1.3, 0, 0.55],
  elL: [-1.9, 0, 0],
  shR: [-1.3, 0, -0.55],
  elR: [-1.9, 0, 0],
  hipL: [-0.4, 0, -0.12],
  knL: [0.6, 0, 0],
  hipR: [0.3, 0, 0.12],
  knR: [0.6, 0, 0],
});

const HIT_A = pose({
  y: -0.03,
  spine: [-0.55, 0.3, 0],
  head: [-0.4, 0, 0],
  shL: [0.2, 0, -1.0],
  shR: [0.2, 0, 1.0],
  elL: [-0.4, 0, 0],
  elR: [-0.4, 0, 0],
  hipL: [-0.5, 0, 0],
  knL: [0.6, 0, 0],
  hipR: [0.3, 0, 0],
  knR: [0.5, 0, 0],
});
const HIT_B = mirror(HIT_A);

const STAGGER = pose({
  y: -0.1,
  spine: [0.5, 0, 0],
  head: [0.4, 0, 0],
  shL: [0.2, 0, -0.2],
  shR: [0.2, 0, 0.2],
  elL: [-0.2, 0, 0],
  elR: [-0.2, 0, 0],
  hipL: [-0.2, 0, -0.15],
  knL: [0.7, 0, 0],
  hipR: [0.1, 0, 0.15],
  knR: [0.7, 0, 0],
});

const TUMBLE = pose({
  shL: [-0.5, 0, -1.2],
  shR: [-0.5, 0, 1.2],
  elL: [-0.5, 0, 0],
  elR: [-0.5, 0, 0],
  hipL: [-0.4, 0, -0.3],
  knL: [0.6, 0, 0],
  hipR: [-0.4, 0, 0.3],
  knR: [0.6, 0, 0],
});

const FLUNG = pose({
  body: [-1.3, 0, 0],
  head: [0.5, 0, 0],
  shL: [-1.2, 0, -0.4],
  shR: [-1.2, 0, 0.4],
  hipL: [-0.9, 0, -0.15],
  knL: [0.3, 0, 0],
  hipR: [-0.7, 0, 0.15],
  knR: [0.5, 0, 0],
});

const DOWN = pose({
  y: -0.74,
  body: [-1.5, 0, 0],
  shL: [0, 0, -1.2],
  shR: [0, 0, 1.2],
  hipL: [0, 0, -0.25],
  hipR: [0, 0, 0.25],
  knL: [0.2, 0, 0],
  knR: [0.5, 0, 0],
});

const RISE = pose({
  y: -0.42,
  spine: [0.8, 0, 0],
  head: [-0.5, 0, 0],
  shL: [-0.6, 0, -0.3],
  shR: [-0.6, 0, 0.3],
  elL: [-0.6, 0, 0],
  elR: [-0.6, 0, 0],
  hipL: [-1.2, 0, -0.1],
  knL: [1.7, 0, 0],
  hipR: [-0.6, 0, 0.1],
  knR: [1.7, 0, 0],
});

const CHASE = pose({
  y: -0.2,
  body: [1.15, 0, 0],
  head: [-0.9, 0, 0],
  shL: [0.9, 0, -0.25],
  shR: [0.9, 0, 0.25],
  hipL: [0.3, 0, 0],
  knL: [0.2, 0, 0],
  hipR: [-0.5, 0, 0],
  knR: [1.0, 0, 0],
});

const LARIAT_WIND = pose({
  y: -0.05,
  spine: [-0.1, 0.4, 0],
  shR: [-2.9, 0, 0.3],
  elR: [-0.4, 0, 0],
  shL: [-0.3, 0, -0.4],
  elL: [-0.8, 0, 0],
  hipL: [-0.3, 0, -0.1],
  knL: [0.4, 0, 0],
  hipR: [0.2, 0, 0.1],
  knR: [0.4, 0, 0],
});
const LARIAT_THROW = pose({
  y: -0.1,
  spine: [0.3, -0.4, 0],
  head: [0, 0.3, 0],
  shR: [-1.5, 0, 0],
  shL: [0.5, 0, -0.4],
  elL: [-0.9, 0, 0],
  hipL: [-0.6, 0, -0.1],
  knL: [0.6, 0, 0],
  hipR: [0.5, 0, 0.1],
  knR: [0.2, 0, 0],
});
const LARIAT_YANK = pose({
  y: -0.12,
  spine: [-0.2, 0.5, 0],
  shR: [-0.6, 0, 0.2],
  elR: [-1.6, 0, 0],
  shL: [-0.6, 0, -0.2],
  elL: [-1.6, 0, 0],
  hipL: [0.3, 0, -0.1],
  knL: [0.3, 0, 0],
  hipR: [-0.5, 0, 0.1],
  knR: [0.6, 0, 0],
});

const PULLED = pose({
  body: [0.6, 0, 0],
  head: [-0.5, 0, 0],
  shL: [-1.6, 0, -0.2],
  shR: [-1.6, 0, 0.2],
  hipL: [0.4, 0, 0],
  knL: [0.4, 0, 0],
  hipR: [0.6, 0, 0],
  knR: [0.2, 0, 0],
});

const ULT_READY = pose({
  y: -0.05,
  spine: [0.05, -0.2, 0],
  head: [0.45, 0.2, 0],
  shR: [-0.4, 0, 0.2],
  elR: [-2.2, 0, 0],
  shL: [0.2, 0, -0.4],
  elL: [-0.3, 0, 0],
  hipL: [-0.2, 0, -0.15],
  knL: [0.2, 0, 0],
  hipR: [0.15, 0, 0.15],
  knR: [0.2, 0, 0],
});
const AIM = pose({
  y: -0.05,
  spine: [0.05, -0.35, 0],
  head: [0, 0.3, 0],
  shR: [-1.5, 0, -0.05],
  shL: [0.2, 0, -0.3],
  elL: [-0.5, 0, 0],
  hipL: [-0.25, 0, -0.15],
  knL: [0.3, 0, 0],
  hipR: [0.2, 0, 0.15],
  knR: [0.3, 0, 0],
});

const BURST = pose({
  y: 0.15,
  spine: [-0.45, 0, 0],
  head: [-0.5, 0, 0],
  shL: [0.3, 0, -1.5],
  shR: [0.3, 0, 1.5],
  elL: [-0.5, 0, 0],
  elR: [-0.5, 0, 0],
  hipL: [-0.1, 0, -0.3],
  knL: [0.3, 0, 0],
  hipR: [-0.1, 0, 0.3],
  knR: [0.3, 0, 0],
});

// Holstered and still: feet planted, hat brim down, gun hand hovering.
const STEADY = pose({
  spine: [0.02, 0, 0],
  head: [0.32, 0, 0],
  shR: [0.05, 0, 0.42],
  elR: [-0.55, 0, 0],
  shL: [0.05, 0, -0.28],
  elL: [-0.25, 0, 0],
  hipL: [0, 0, -0.16],
  knL: [0.05, 0, 0],
  hipR: [0, 0, 0.16],
  knR: [0.05, 0, 0],
});

// The quickdraw fires from the hip.
const HIPFIRE = pose({
  y: -0.04,
  spine: [-0.12, -0.25, 0],
  head: [0.1, 0.25, 0],
  shR: [-0.75, 0, 0.12],
  elR: [-0.85, 0, 0],
  shL: [0.15, 0, -0.5],
  elL: [-0.3, 0, 0],
  hipL: [-0.2, 0, -0.18],
  knL: [0.25, 0, 0],
  hipR: [0.15, 0, 0.18],
  knR: [0.2, 0, 0],
});

// Fanning the hammer: gun at the hip, the off hand slapping across it.
const FAN = pose({
  y: -0.1,
  spine: [0.18, -0.15, 0],
  head: [-0.1, 0.15, 0],
  shR: [-0.8, 0, 0.05],
  elR: [-0.8, 0, 0],
  shL: [-0.95, 0, 0.55],
  elL: [-1.2, 0, 0],
  hipL: [-0.4, 0, -0.2],
  knL: [0.5, 0, 0],
  hipR: [0.25, 0, 0.2],
  knR: [0.45, 0, 0],
});

// Beaten: on both knees, head down.
const DOWNED = pose({
  y: -0.47,
  spine: [0.55, 0, 0],
  head: [0.55, 0, 0],
  shL: [0.25, 0, -0.25],
  elL: [-0.2, 0, 0],
  shR: [0.25, 0, 0.25],
  elR: [-0.2, 0, 0],
  hipL: [-0.15, 0, -0.12],
  knL: [1.65, 0, 0],
  hipR: [-0.15, 0, 0.12],
  knR: [1.65, 0, 0],
});

// Roped: arms pinned, toppled onto one side.
const TIED = pose({
  y: -0.72,
  body: [0, 0, 1.45],
  spine: [0.2, 0, 0],
  head: [0.2, 0, 0],
  shL: [0, 0, 0.12],
  elL: [-0.5, 0, 0],
  shR: [0, 0, -0.12],
  elR: [-0.5, 0, 0],
  hipL: [-0.5, 0, 0],
  knL: [1.0, 0, 0],
  hipR: [-0.5, 0, 0],
  knR: [1.0, 0, 0],
});

// The finishing shot: arm out straight, aimed down at the kneeling loser.
const COUP = pose({
  spine: [0.08, -0.3, 0],
  head: [0.25, 0.3, 0],
  shR: [-1.2, 0, -0.05],
  shL: [0.1, 0, -0.2],
  elL: [-0.2, 0, 0],
  hipL: [-0.1, 0, -0.14],
  hipR: [0.1, 0, 0.14],
});

// The hunter's guard: the brace held out in front like a shield, the gun low behind it.
const BRACE_GUARD = pose({
  y: -0.1,
  spine: [0.18, 0.4, 0],
  head: [0, -0.35, 0],
  shL: [-1.45, 0, 0.3],
  elL: [-1.35, 0, 0],
  shR: [-0.25, 0, 0.3],
  elR: [-0.8, 0, 0],
  hipL: [-0.4, 0, -0.14],
  knL: [0.55, 0, 0],
  hipR: [0.3, 0, 0.14],
  knR: [0.55, 0, 0],
});

const VICTORY = pose({
  spine: [0, 0.15, 0],
  head: [0.2, 0, 0],
  shR: [-2.3, 0, -0.5],
  elR: [-1.9, 0, 0],
  shL: [0.1, 0, -0.15],
  elL: [-0.15, 0, 0],
  hipL: [-0.05, 0, -0.1],
  hipR: [0.05, 0, 0.12],
});

const PARRIED = pose({
  spine: [-0.4, 0, 0],
  head: [-0.3, 0, 0],
  shL: [-2.0, 0, -0.8],
  shR: [-2.0, 0, 0.8],
  hipL: [0.3, 0, 0],
  knL: [0.4, 0, 0],
  hipR: [-0.4, 0, 0],
  knR: [0.6, 0, 0],
});

// The witch gathers her arms in, then throws them wide as the pulse goes out.
const PULSE_WIND = pose({
  y: -0.1,
  spine: [0.22, 0, 0],
  head: [0.2, 0, 0],
  shL: [-1.0, 0, 0.7],
  elL: [-1.6, 0, 0],
  shR: [-1.0, 0, -0.7],
  elR: [-1.6, 0, 0],
  hipL: [-0.2, 0, -0.1],
  knL: [0.4, 0, 0],
  hipR: [0.1, 0, 0.1],
  knR: [0.4, 0, 0],
});
// Chanting: arms raised to the sky, head back.
const CHANT = pose({
  y: 0.04,
  spine: [-0.12, 0, 0],
  head: [-0.35, 0, 0],
  shL: [-2.5, 0, -0.5],
  elL: [-0.3, 0, 0],
  shR: [-2.5, 0, 0.5],
  elR: [-0.3, 0, 0],
  hipL: [0, 0, -0.12],
  hipR: [0, 0, 0.12],
});

// The hunter's arm strikes mirror the outlaw's gun-hand ones onto the brace.
const ARM_WIND = { ...mirror(S1_WIND), y: -0.2 };
const ARM_HIT = mirror(BLAST_HIT);
const ARM_LAUNCH_WIND = mirror(LAUNCH_WIND);
const ARM_LAUNCH_HIT = mirror(LAUNCH_HIT);
// The thunderclap winds up low and long, so you can see it coming.
const CLAP_WIND = pose({ ...mirror(S1_WIND), y: -0.32, spine: [0.45, -0.9, 0], head: [-0.2, 0.7, 0] });

function runPose(phase: number, amount: number): Pose {
  const s = Math.sin(phase);
  const run = pose({
    y: -0.03,
    spine: [0.42, s * 0.15, 0],
    head: [-0.3, 0, 0],
    shL: [0.8 * s, 0, -0.15],
    elL: [-1.2, 0, 0],
    shR: [-0.8 * s, 0, 0.15],
    elR: [-1.2, 0, 0],
    hipL: [-0.9 * s, 0, 0],
    knL: [0.4 + 0.8 * Math.max(0, Math.sin(phase + 1.2)), 0, 0],
    hipR: [0.9 * s, 0, 0],
    knR: [0.4 + 0.8 * Math.max(0, Math.sin(phase + Math.PI + 1.2)), 0, 0],
  });
  return blend(IDLE, run, amount);
}

/** Wind-up into a held hit pose, then ease back out. */
function strike(wind: Pose, hit: Pose, mf: number, activeFrom: number, total: number): Pose {
  if (mf < activeFrom - 1) return wind;
  if (mf < total - 8) return hit;
  return blend(hit, IDLE, (mf - (total - 8)) / 8);
}

export interface PoseResult {
  pose: Pose;
  /** Easing rate per second. Higher is snappier. */
  rate: number;
  /** Extra whole-body rotation applied directly, for spins and tumbles. */
  spin: R3;
  hidden: boolean;
  /** Guns on the hips instead of in the hands. */
  holstered: boolean;
}

export interface RigClock {
  /** Run-cycle phase in radians. */
  phase: number;
  /** Seconds since the rig was created. */
  time: number;
  /** Accumulated tumble angle. */
  tumble: number;
  /** 1 right after a recoil-worthy shot, decaying to 0. */
  recoil: number;
  /** Seconds left of a snapped-up brace, after a deflect or a catch. */
  brace: number;
}

/** Chooses the key pose for a fighter's current state. */
export function choosePose(f: Fighter, m: Match, clock: RigClock, speed: number): PoseResult {
  const res: PoseResult = { pose: IDLE, rate: 16, spin: [0, 0, 0], hidden: false, holstered: false };
  const t = clock.time;

  switch (f.state) {
    case "free": {
      if (m.phase !== "fight" && m.phase !== "intro" && m.winner === f.id) {
        res.pose = m.phase === "verdict" ? AIM : VICTORY;
        res.rate = 6;
        res.holstered = m.phase !== "verdict";
        break;
      }
      if (m.phase === "intro") {
        res.pose = STEADY;
        res.holstered = true;
        res.rate = 8;
        break;
      }
      if (!f.grounded) res.pose = f.vel.y > 2 ? JUMP : FALL;
      else res.pose = runPose(clock.phase, Math.min(1, speed / 5));
      if (clock.brace > 0 && f.kit === "hunter") {
        res.pose = BRACE_GUARD;
        res.rate = 50;
        break;
      }
      if (f.shotPose > 0) {
        // Fire from the hip without breaking stride: only the gun arm and torso change.
        const base = res.pose;
        const kick = f.shotPose > 10 ? -0.35 : 0;
        res.pose = { ...base, shR: [AIM.shR[0] + kick, AIM.shR[1], AIM.shR[2]], elR: AIM.elR, spine: [base.spine[0], -0.35, 0], head: [base.head[0], 0.3, 0] };
        res.rate = 34;
      }
      break;
    }
    case "attack": {
      const mv = f.move ? MOVES[f.move] : null;
      res.rate = 34;
      const from = mv && mv.hits.length ? mv.hits[0].from : 6;
      switch (f.move) {
        case "s1":
        case "w1":
        case "e1":
        case "g1":
          res.pose = strike(S1_WIND, S1_HIT, f.mf, from, mv!.total);
          break;
        case "a2":
        case "e2":
        case "g2":
          res.pose = strike(S2_WIND, S2_HIT, f.mf, from, mv!.total);
          break;
        case "h1":
        case "h2":
        case "novaBlast":
          res.pose = strike(PULSE_WIND, BURST, f.mf, from, mv!.total);
          break;
        case "novaLaunch":
          res.pose = strike(PULSE_WIND, CHANT, f.mf, from, mv!.total);
          break;
        case "novaSlam":
          res.pose = strike(SLAM_WIND, SLAM_HIT, f.mf, from, mv!.total);
          break;
        case "circle":
          // Arms up to draw it, then down to set it.
          res.pose = f.mf < mv!.fireAt! ? CHANT : SLAM_HIT;
          break;
        case "sentry":
          // Down on one knee to set it, then up.
          res.pose = f.mf < mv!.fireAt! ? SLAM_WIND : SLAM_HIT;
          break;
        case "prodBlast":
          res.pose = strike(BLAST_WIND, BLAST_HIT, f.mf, from, mv!.total);
          break;
        case "prodLaunch":
          res.pose = strike(LAUNCH_WIND, LAUNCH_HIT, f.mf, from, mv!.total);
          break;
        case "prodSlam":
          res.pose = strike(SLAM_WIND, SLAM_HIT, f.mf, from, mv!.total);
          break;
        case "armBlast":
          res.pose = strike(ARM_WIND, ARM_HIT, f.mf, from, mv!.total);
          break;
        case "armLaunch":
          res.pose = strike(ARM_LAUNCH_WIND, ARM_LAUNCH_HIT, f.mf, from, mv!.total);
          break;
        case "armSlam":
          res.pose = strike(SLAM_WIND, SLAM_HIT, f.mf, from, mv!.total);
          break;
        case "thunderclap":
          res.pose = strike(CLAP_WIND, ARM_HIT, f.mf, from, mv!.total);
          // A slow, deliberate wind-up, then a snap.
          res.rate = f.mf < from - 1 ? 14 : 44;
          break;
        case "s2":
          res.pose = strike(S2_WIND, S2_HIT, f.mf, from, mv!.total);
          break;
        case "s3": {
          res.pose = f.mf < mv!.total - 8 ? S3_HIT : blend(S3_HIT, IDLE, (f.mf - (mv!.total - 8)) / 8);
          // One full spin, landing on the hit frame.
          const k = Math.min(1, Math.max(0, (f.mf - 1) / (from + 2)));
          res.spin = [0, k * Math.PI * 2, 0];
          break;
        }
        case "enderBlast":
          res.pose = strike(BLAST_WIND, BLAST_HIT, f.mf, from, mv!.total);
          break;
        case "enderLaunch":
          res.pose = strike(LAUNCH_WIND, LAUNCH_HIT, f.mf, from, mv!.total);
          break;
        case "enderSlam":
          res.pose = strike(SLAM_WIND, SLAM_HIT, f.mf, from, mv!.total);
          break;
        case "quickdraw":
          res.pose = { ...HIPFIRE, shR: [HIPFIRE.shR[0] - (f.mf > mv!.fireAt! && f.mf < mv!.fireAt! + 8 ? 0.45 : 0), 0, HIPFIRE.shR[2]] };
          res.rate = 60;
          break;
        case "fan":
          // The off hand whips back and forth across the hammer.
          res.pose = { ...FAN, elL: [FAN.elL[0] + Math.sin(f.mf * 1.26) * 0.5, 0, 0], shR: [FAN.shR[0] - (f.mf % 5 < 2 ? 0.18 : 0), 0, FAN.shR[2]] };
          res.rate = 50;
          break;
        case "coup":
          res.pose = { ...COUP, shR: [COUP.shR[0] - 0.6 * clock.recoil, 0, COUP.shR[2]] };
          res.rate = 9;
          break;
        case "lariat":
          if (f.mf < mv!.fireAt!) {
            res.pose = { ...LARIAT_WIND, shR: [LARIAT_WIND.shR[0], 0, 0.3 + 0.45 * Math.sin(f.mf * 1.3)] };
          } else res.pose = f.moveHit && !f.zipFlag ? LARIAT_YANK : LARIAT_THROW;
          break;
        case "lastWord":
          res.pose = f.mf < mv!.fireAt! ? ULT_READY : { ...AIM, shR: [AIM.shR[0] - 0.5 * clock.recoil, 0, AIM.shR[2]] };
          res.rate = f.mf < mv!.fireAt! ? 12 : 40;
          break;
      }
      break;
    }
    case "step":
      res.pose = { ...FALL, y: -0.2, spine: [0.3, 0, 0] };
      res.rate = 30;
      break;
    case "chase":
    case "zip":
      res.pose = CHASE;
      res.rate = 40;
      break;
    case "guard":
      if (f.kit === "hunter") {
        // Walking behind the brace: the legs keep their stride, the arms hold the wall.
        const legs = runPose(clock.phase, Math.min(1, speed / 3) * 0.7);
        res.pose = { ...BRACE_GUARD, hipL: legs.hipL, knL: legs.knL, hipR: legs.hipR, knR: legs.knR };
        if (speed < 0.5) res.pose = BRACE_GUARD;
      } else res.pose = GUARD;
      res.rate = 34;
      break;
    case "blockstun":
      res.pose = f.kit === "hunter" ? { ...BRACE_GUARD, spine: [-0.05, 0.4, 0], y: -0.16 } : { ...GUARD, spine: [-0.1, 0, 0], y: -0.16 };
      res.rate = 34;
      break;
    case "parried":
      res.pose = PARRIED;
      res.rate = 30;
      break;
    case "hitstun":
      res.pose = f.hitsTaken % 2 === 0 ? HIT_A : HIT_B;
      res.rate = 40;
      break;
    case "stagger":
      res.pose = { ...STAGGER, spine: [0.5 + Math.sin(t * 5) * 0.1, 0, Math.sin(t * 6) * 0.2] };
      res.rate = 14;
      break;
    case "launched":
      res.pose = TUMBLE;
      res.spin = [-clock.tumble, 0, 0];
      res.rate = 26;
      break;
    case "blasted":
      res.pose = FLUNG;
      res.spin = [0, 0, clock.tumble * 0.8];
      res.rate = 40;
      break;
    case "slammed":
      res.pose = { ...FLUNG, body: [-2.7, 0, 0] };
      res.rate = 40;
      break;
    case "bounced":
      res.pose = TUMBLE;
      res.spin = [-1.5 - clock.tumble * 0.5, 0, 0];
      res.rate = 26;
      break;
    case "knockdown":
      res.pose = DOWN;
      res.rate = 22;
      break;
    case "getup":
      res.pose = f.t < 7 ? RISE : IDLE;
      res.rate = 16;
      break;
    case "steady":
      res.pose = f.kit === "witch" ? { ...CHANT, y: 0.04 + Math.sin(t * 2.2) * 0.03 } : { ...STEADY, spine: [0.02, Math.sin(t * 1.3) * 0.03, 0] };
      res.rate = 12;
      res.holstered = true;
      break;
    case "standoff":
      // Dead still, except for the fingers.
      res.pose = { ...STEADY, elR: [STEADY.elR[0] + Math.sin(t * 19) * 0.035, 0, 0] };
      res.rate = 10;
      res.holstered = true;
      break;
    case "downed":
      res.pose = { ...DOWNED, spine: [0.55 + Math.sin(t * 3) * 0.05, 0, 0] };
      res.rate = 9;
      break;
    case "tied":
      res.pose = TIED;
      res.rate = 10;
      res.holstered = true;
      break;
    case "slip":
      res.hidden = true;
      break;
    case "pulled":
      res.pose = PULLED;
      res.rate = 30;
      break;
    case "burst":
      res.pose = BURST;
      res.rate = 30;
      break;
    case "cine": {
      const cine = m.cine;
      if (cine && cine.att === f.id) {
        res.pose = cine.t < 30 ? ULT_READY : { ...AIM, shR: [AIM.shR[0] - 0.7 * clock.recoil, 0, AIM.shR[2]] };
        res.rate = 30;
      } else {
        res.pose = clock.recoil > 0.5 ? (f.hitsTaken % 2 === 0 ? HIT_A : HIT_B) : STAGGER;
        res.rate = 36;
      }
      break;
    }
    case "ko":
      if (f.grounded) {
        res.pose = DOWN;
        res.rate = 14;
      } else {
        res.pose = FLUNG;
        res.spin = [0, 0, clock.tumble * 0.5];
        res.rate = 30;
      }
      break;
  }
  return res;
}
