import { Camera } from "@babylonjs/core/Cameras/camera";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Match } from "../sim/types";
import { angleDiff } from "../sim/vec";
import type { Rig } from "./rig";

// The duel camera sits behind the player's shoulder and frames both fighters,
// pulling back as they separate. It needs no mouse: movement is relative to the
// opponent, so "forward" always means "toward them".

export type CameraMode = "duel" | "attract";

export class CameraRig {
  mode: CameraMode = "attract";
  private pos = new Vector3(0, 26, -52);
  private look = new Vector3(0, 1, 0);
  private yaw = 0;
  private fov = 0.95;
  private orbit = 0.6;
  private cinePhase = -1;
  private wantPos = new Vector3();
  private wantLook = new Vector3();

  constructor(private camera: TargetCamera) {}

  /** Starts a new shot from a high, wide establishing position. */
  establish(): void {
    this.pos.set(-18, 22, -46);
    this.look.set(0, 1, 0);
    this.yaw = 0;
    this.cinePhase = -1;
  }

  resize(aspect: number): void {
    // In portrait, fix the horizontal view so both fighters stay in frame.
    this.camera.fovMode = aspect < 1 ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
  }

  update(dt: number, m: Match, rigs: [Rig, Rig], shake: number, view: number): void {
    const me = rigs[view].root.position;
    const them = rigs[1 - view].root.position;
    const want = this.wantPos;
    const look = this.wantLook;
    let rate = 7;
    let lookRate = 11;
    let cut = false;
    let fov = 0.95;

    if (m.cine) {
      const a = rigs[m.cine.att].root.position;
      const d = rigs[m.cine.def].root.position;
      const dx = d.x - a.x;
      const dz = d.z - a.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      const rx = fz;
      const rz = -fx;
      const t = m.cine.t;
      const phase = t < 44 ? 0 : t < 100 ? 1 : t < 128 ? 2 : 3;
      cut = phase !== this.cinePhase;
      this.cinePhase = phase;
      rate = 2.5;
      lookRate = 6;
      if (phase === 0) {
        // Close on the shooter as the hat comes down.
        const push = 2.9 - (t / 44) * 0.6;
        want.set(a.x + fx * push + rx * 1.15, a.y + 1.25, a.z + fz * push + rz * 1.15);
        look.set(a.x, a.y + 1.55, a.z);
        fov = 0.8;
      } else if (phase === 1) {
        // Wide profile for the six shots.
        const side = sep * 0.75 + 4;
        want.set(a.x + dx * 0.5 + rx * side, a.y + 2.0, a.z + dz * 0.5 + rz * side);
        look.set(a.x + dx * 0.5, a.y + 1.2, a.z + dz * 0.5);
      } else if (phase === 2) {
        // Over the target's shoulder, looking back down the barrel.
        want.set(d.x + fx * 3.2 - rx * 1.3, d.y + 1.0, d.z + fz * 3.2 - rz * 1.3);
        look.set(a.x, a.y + 1.4, a.z);
        fov = 0.75;
      } else {
        want.set(d.x - fx * 1.5 + rx * 6.5, d.y + 1.5, d.z - fz * 1.5 + rz * 6.5);
        look.set(d.x, d.y + 1.1, d.z);
      }
    } else if (m.standoff) {
      // The standoff gets two shots: the classic wide profile, then low over the
      // player's holster, looking past the gun hand at the rival.
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      const rx = fz;
      const rz = -fx;
      const phase = m.standoff.t < 56 ? 10 : 11;
      cut = phase !== this.cinePhase;
      this.cinePhase = phase;
      this.yaw = Math.atan2(dx, dz);
      rate = 1.2;
      lookRate = 5;
      if (phase === 10) {
        const side = sep * 0.6 + 3 - (m.standoff.t / 56) * 0.8;
        want.set(me.x + dx * 0.5 + rx * side, me.y + 1.15, me.z + dz * 0.5 + rz * side);
        look.set(me.x + dx * 0.5, me.y + 1.0, me.z + dz * 0.5);
        fov = 0.85;
      } else {
        want.set(me.x - fx * 2.6 + rx * 1.05, me.y + 0.82, me.z - fz * 2.6 + rz * 1.05);
        look.set(them.x - rx * 0.9, them.y + 1.0, them.z - rz * 0.9);
        // A long lens flattens the distance, so the rival looms.
        fov = 0.55;
      }
    } else if (m.phase === "verdict") {
      // Low behind the beaten fighter, looking up at the one deciding.
      const loser = rigs[1 - m.winner].root.position;
      const winner = rigs[m.winner].root.position;
      const dx = winner.x - loser.x;
      const dz = winner.z - loser.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      cut = this.cinePhase !== 20;
      this.cinePhase = 20;
      want.set(loser.x - fx * 2.7 + fz * 1.5, loser.y + 0.8, loser.z - fz * 2.7 - fx * 1.5);
      look.set(loser.x + dx * 0.6, loser.y + 1.15, loser.z + dz * 0.6);
      rate = 1.5;
      lookRate = 5;
      fov = 0.8;
    } else if (this.mode === "attract") {
      this.cinePhase = -1;
      this.orbit += dt * 0.22;
      const mx = (me.x + them.x) / 2;
      const mz = (me.z + them.z) / 2;
      const my = (me.y + them.y) / 2;
      const sep = Vector3.Distance(me, them);
      const r = Math.min(46, 9 + sep * 0.8);
      want.set(mx + Math.cos(this.orbit) * r, my + 3.2 + sep * 0.1, mz + Math.sin(this.orbit) * r);
      look.set(mx, my + 1.2, mz);
      rate = 2.2;
      lookRate = 4;
    } else if (m.phase === "ko" || m.phase === "done") {
      this.cinePhase = -1;
      const loser = rigs[1 - m.winner].root.position;
      const winner = rigs[m.winner].root.position;
      if (m.phase === "ko" && m.phaseT < 85) {
        this.orbit += dt * 0.5;
        want.set(loser.x + Math.cos(this.orbit) * 7.5, Math.max(1.2, loser.y + 1.6), loser.z + Math.sin(this.orbit) * 7.5);
        look.set(loser.x, loser.y + 0.8, loser.z);
        rate = 4;
      } else {
        // Settle on the winner from the front.
        const f = m.fighters[m.winner];
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        want.set(winner.x + fx * 4.4 + fz * 1.4, winner.y + 1.5, winner.z + fz * 4.4 - fx * 1.4);
        look.set(winner.x, winner.y + 1.35, winner.z);
        rate = 3;
        fov = 0.8;
      }
    } else {
      this.cinePhase = -1;
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const dh = Math.hypot(dx, dz);
      // Turn toward the opponent smoothly so a slip behind you reads as a whip-pan, not a cut.
      if (dh > 0.6) this.yaw += angleDiff(Math.atan2(dx, dz), this.yaw) * (1 - Math.exp(-6.5 * dt));
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const sep = Vector3.Distance(me, them);
      // Up close the camera swings out to the side so the player does not hide the rival;
      // at range it settles back behind the shoulder. The swing stays under 45 degrees
      // so that "toward the rival" always reads as up the screen.
      const near = 1 - Math.min(1, Math.max(0, (sep - 2.5) / 13));
      const swing = 0.3 + 0.42 * near * near * (3 - 2 * near);
      const cs = Math.cos(swing);
      const sn = Math.sin(swing);
      const back = Math.min(30, Math.max(5.4, 4.6 + sep * 0.34));
      const height = 1.7 + 0.5 * near + sep * 0.1 + Math.max(0, them.y - me.y) * 0.12;
      // Right of forward is (fz, -fx).
      want.set(me.x - fx * cs * back + fz * sn * back, me.y + height, me.z - fz * cs * back - fx * sn * back);
      const k = 0.5 + 0.1 * (1 - near);
      look.set(me.x + (them.x - me.x) * k, me.y + 1.15 + (them.y - me.y) * k, me.z + (them.z - me.z) * k);
      const state = m.fighters[view].state;
      if (state === "chase" || state === "blasted" || state === "zip") fov = 1.1;
      if (m.phase === "intro") {
        rate = 2.4;
        lookRate = 5;
      }
    }

    want.y = Math.max(0.5, want.y);
    if (cut) {
      this.pos.copyFrom(want);
      this.look.copyFrom(look);
    } else {
      Vector3.LerpToRef(this.pos, want, 1 - Math.exp(-rate * dt), this.pos);
      Vector3.LerpToRef(this.look, look, 1 - Math.exp(-lookRate * dt), this.look);
    }
    this.fov += (fov - this.fov) * (1 - Math.exp(-8 * dt));

    const s = shake * shake * 0.5;
    const jx = (Math.random() - 0.5) * s;
    const jy = (Math.random() - 0.5) * s;
    const jz = (Math.random() - 0.5) * s;
    this.camera.position.set(this.pos.x + jx, this.pos.y + jy, this.pos.z + jz);
    this.camera.setTarget(new Vector3(this.look.x + jx * 0.5, this.look.y + jy * 0.5, this.look.z + jz * 0.5));
    this.camera.fov = this.fov;
  }
}
