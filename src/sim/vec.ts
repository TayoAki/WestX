// Minimal vector math for the simulation. The sim never imports the renderer,
// so it can run headless in tests and, later, on a server.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const clone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const assign = (a: V3, b: V3): void => {
  a.x = b.x;
  a.y = b.y;
  a.z = b.z;
};
export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const lenH = (a: V3): number => Math.hypot(a.x, a.z);
export const dist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distH = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Unit vector on the ground plane, or `fallback` when `a` has no horizontal length. */
export function normH(a: V3, fallback: V3): V3 {
  const l = Math.hypot(a.x, a.z);
  if (l < 1e-4) return v3(fallback.x, 0, fallback.z);
  return v3(a.x / l, 0, a.z / l);
}

export function norm(a: V3, fallback: V3): V3 {
  const l = len(a);
  if (l < 1e-4) return clone(fallback);
  return v3(a.x / l, a.y / l, a.z / l);
}

/** Yaw (rotation about Y) for a body whose forward axis is +Z. */
export const yawOf = (dir: V3): number => Math.atan2(dir.x, dir.z);
export const dirOfYaw = (yaw: number): V3 => v3(Math.sin(yaw), 0, Math.cos(yaw));
/** Right-hand side of a ground-plane forward vector (left-handed, Y up). */
export const rightOf = (fwd: V3): V3 => v3(fwd.z, 0, -fwd.x);

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Shortest distance from point `p` to segment `a`-`b`. */
export function segPointDist(a: V3, b: V3, p: V3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (l2 > 1e-8) {
    t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  }
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

/** Smallest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
